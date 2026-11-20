"""Behavior tests with a transactional fake adapter; never touches a live DB."""
import copy
import io
import json
import os
import threading
import time
import unittest
from contextlib import contextmanager, redirect_stdout
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from unittest.mock import patch

from app import APIError, AuthService, Handler, RateLimiter
from database import DatabaseError
from security import email_address, hash_password, login_identifier, token_hash, validate_password, verify_password


class MemoryDatabase:
    def __init__(self):
        self.tables = {name: {} for name in ('auth_users', 'auth_sessions', 'auth_password_resets')}
        self.lock = threading.RLock()

    @contextmanager
    def transaction(self):
        with self.lock:
            snapshot = copy.deepcopy(self.tables)
            try:
                yield 'test-transaction'
            except Exception:
                self.tables = snapshot
                raise

    def request(self, method, path, data=None, transaction=None):
        parts = path.split('/')
        table = self.tables[parts[1]]
        if method == 'POST':
            if data['_key'] in table or (parts[1] == 'auth_users' and any(u['email'] == data['email'] for u in table.values())):
                raise DatabaseError(1210)
            table[data['_key']] = copy.deepcopy(data)
        elif method == 'PATCH':
            table[parts[2]].update(data)
        return {}

    def query(self, query, variables=None, transaction=None):
        v = variables or {}
        if 'IN auth_users' in query:
            users = list(self.tables['auth_users'].values())
            if 'email' in v:
                users = [u for u in users if u.get('email') == v['email']]
            elif 'identifier' in v:
                users = ([self.tables['auth_users'][v['identifier']]]
                         if 'u._key == @identifier' in query and v['identifier'] in self.tables['auth_users']
                         else [u for u in users if u.get('email') == v['identifier']])
            else:
                users = [u for u in users if u['_key'] == v['id']]
            return copy.deepcopy(users)
        name = 'auth_sessions' if 'IN auth_sessions' in query else 'auth_password_resets'
        table = self.tables[name]
        if 'id' in v:
            rows = [r for r in table.values() if r['userId'] == v['id']]
        elif ' OR ' in query:
            rows = [r for r in table.values() if r['_key'] == v['key'] or r['expiresAt'] <= v['now']]
        else:
            rows = [r for r in table.values() if r['_key'] == v['key'] and ('now' not in v or r['expiresAt'] > v['now'])]
        if 'REMOVE ' in query:
            for row in rows:
                del table[row['_key']]
            return []
        if 'DOCUMENT(' in query:
            return [copy.deepcopy(self.tables['auth_users'][r['userId']]) for r in rows if r['userId'] in self.tables['auth_users']]
        return copy.deepcopy(rows)


class SecurityTests(unittest.TestCase):
    def test_password_hash_is_salted_and_verifiable(self):
        first = hash_password('GoodPassword123')
        self.assertNotEqual(first, hash_password('GoodPassword123'))
        self.assertTrue(verify_password('GoodPassword123', first))
        self.assertFalse(verify_password('WrongPassword123', first))
        self.assertFalse(verify_password('anything', 'broken'))
        self.assertNotIn('GoodPassword123', first)

    def test_password_policy(self):
        for password in ('short', 'lowercase123456', 'UPPERCASE123456', 'NoDigitsHere', 'A1' + 'b' * 127, None):
            with self.subTest(password=password), self.assertRaises(ValueError):
                validate_password(password)

    def test_email_normalization(self):
        self.assertEqual(email_address('  An@Example.COM '), 'an@example.com')
        for email in ('bad', 'a@', 'x y@example.com', None):
            with self.assertRaises(ValueError):
                email_address(email)

    def test_login_identifier_supports_username_and_email(self):
        self.assertEqual(login_identifier(' ADMIN '), 'admin')
        self.assertEqual(login_identifier(' An@Example.COM '), 'an@example.com')
        for identifier in ('a', 'admin name', '../admin', None):
            with self.assertRaises(ValueError):
                login_identifier(identifier)

    def test_rate_limit(self):
        limiter = RateLimiter()
        limiter.check('email', 2)
        limiter.check('email', 2)
        with self.assertRaises(APIError) as error:
            limiter.check('email', 2)
        self.assertEqual(error.exception.status, 429)


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.db = MemoryDatabase()
        self.service = AuthService(self.db)
        self.data = {'name': 'Nguyễn An', 'email': 'An@Example.com', 'password': 'GoodPassword123'}
        self.service.register(self.data)

    def login(self):
        return self.service.login(self.data, '')[1]

    def reset_token(self):
        with patch.object(self.service, 'send_reset') as send:
            self.service.forgot({'email': self.data['email']})
        return send.call_args.args[1]

    def test_register_normalizes_and_prevents_duplicates(self):
        user = next(iter(self.db.tables['auth_users'].values()))
        self.assertEqual(user['email'], 'an@example.com')
        self.assertNotIn('password', user)
        with self.assertRaises(APIError) as error:
            self.service.register({**self.data, 'email': 'an@example.com'})
        self.assertEqual(error.exception.status, 409)

    def test_register_rejects_blank_name(self):
        with self.assertRaises(ValueError):
            self.service.register({**self.data, 'name': '  '})

    def test_login_session_logout(self):
        raw = self.login()
        self.assertIn(token_hash(raw), self.db.tables['auth_sessions'])
        self.assertNotIn(raw, json.dumps(self.db.tables))
        self.assertEqual(self.service.session(raw)['name'], self.data['name'])
        self.service.logout(raw)
        self.assertIsNone(self.service.session(raw))

    def test_admin_can_login_by_username(self):
        self.db.tables['auth_users']['admin'] = {
            '_key': 'admin', 'username': 'admin', 'name': 'Quản trị viên', 'role': 'admin',
            'passwordHash': hash_password('123456'), 'createdAt': time.time(),
        }
        body, raw = self.service.login({'email': 'admin', 'password': '123456'}, '')
        self.assertEqual(body['user']['role'], 'admin')
        self.assertEqual(body['user']['username'], 'admin')
        self.assertIsNone(body['user']['email'])
        self.assertIsNotNone(self.service.session(raw))

    def test_wrong_password_and_unknown_account(self):
        for data in ({**self.data, 'password': 'bad'}, {**self.data, 'email': 'nobody@example.com'}):
            with self.assertRaises(APIError) as error:
                self.service.login(data, '')
            self.assertEqual(error.exception.status, 401)

    def test_session_expiry_and_rotation(self):
        old = self.login()
        new = self.service.login(self.data, old)[1]
        self.assertIsNone(self.service.session(old))
        self.db.tables['auth_sessions'][token_hash(new)]['expiresAt'] = time.time() - 1
        self.assertIsNone(self.service.session(new))

    def test_forgot_response_does_not_reveal_account(self):
        with patch.object(self.service, 'send_reset'):
            known = self.service.forgot({'email': self.data['email']})
            unknown = self.service.forgot({'email': 'nobody@example.com'})
        self.assertEqual(known, unknown)

    def test_reset_revokes_all_sessions_and_tokens(self):
        sessions = [self.login(), self.login()]
        first, second = self.reset_token(), self.reset_token()
        self.assertNotIn(first, json.dumps(self.db.tables))
        self.service.reset({'token': first, 'password': 'NewPassword123'})
        self.assertEqual(self.db.tables['auth_password_resets'], {})
        for session in sessions:
            self.assertIsNone(self.service.session(session))
        for raw in (first, second):
            with self.assertRaises(APIError):
                self.service.reset({'token': raw, 'password': 'AnotherPassword123'})
        with self.assertRaises(APIError):
            self.login()
        self.service.login({**self.data, 'password': 'NewPassword123'}, '')

    def test_expired_and_invalid_reset(self):
        raw = self.reset_token()
        self.db.tables['auth_password_resets'][token_hash(raw)]['expiresAt'] = time.time() - 1
        for token in (raw, 'bad', 'x' * 43):
            with self.assertRaises(APIError):
                self.service.reset({'token': token, 'password': 'NewPassword123'})
        self.login()

    def test_reset_rollback_on_write_failure(self):
        raw = self.reset_token()
        session = self.login()
        original_query = self.db.query
        def fail(query, variables=None, transaction=None):
            if 'REMOVE s IN auth_sessions' in query:
                raise DatabaseError()
            return original_query(query, variables, transaction)
        with patch.object(self.db, 'query', side_effect=fail), self.assertRaises(DatabaseError):
            self.service.reset({'token': raw, 'password': 'NewPassword123'})
        self.assertIsNotNone(self.service.session(session))
        self.assertIn(token_hash(raw), self.db.tables['auth_password_resets'])
        self.login()

    def test_mail_failure_removes_token(self):
        with patch.object(self.service, 'send_reset', side_effect=OSError()), redirect_stdout(io.StringIO()):
            self.service.forgot({'email': self.data['email']})
        self.assertEqual(self.db.tables['auth_password_resets'], {})

    def test_concurrent_token_use_only_succeeds_once(self):
        raw = self.reset_token()
        outcomes = []
        def reset():
            try:
                self.service.reset({'token': raw, 'password': 'NewPassword123'})
                outcomes.append('ok')
            except APIError:
                outcomes.append('rejected')
        threads = [threading.Thread(target=reset) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertCountEqual(outcomes, ['ok', 'rejected'])


class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = patch.dict(os.environ, {'APP_ORIGIN': 'http://localhost:5174', 'AUTH_COOKIE_SECURE': 'true'})
        cls.env.start()
        cls.db = MemoryDatabase()
        cls.service = AuthService(cls.db)
        class TestHandler(Handler):
            pass
        TestHandler.service, TestHandler.limiter = cls.service, RateLimiter()
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), TestHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.env.stop()

    def request(self, method, path, data=None, extra=None):
        connection = HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)
        headers = {'Origin': 'http://localhost:5174', 'X-SkillGraph-Client': 'web', 'Content-Type': 'application/json'}
        headers.update(extra or {})
        connection.request(method, '/api/auth/' + path, None if data is None else json.dumps(data), headers)
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), json.loads(response.read())
        connection.close()
        return result

    def test_http_full_login_cookie_me_logout(self):
        data = {'name': 'HTTP Test', 'email': 'http@example.com', 'password': 'GoodPassword123'}
        self.assertEqual(self.request('POST', 'register', data)[0], 201)
        status, headers, body = self.request('POST', 'login', data)
        self.assertEqual(status, 200)
        self.assertNotIn('passwordHash', json.dumps(body))
        cookie = headers['Set-Cookie']
        for attribute in ('HttpOnly', 'SameSite=Lax', 'Secure', 'Path=/api/auth'):
            self.assertIn(attribute, cookie)
        session = {'Cookie': cookie.split(';')[0]}
        self.assertEqual(self.request('GET', 'me', extra=session)[0], 200)
        self.assertEqual(self.request('POST', 'logout', {}, session)[0], 200)
        self.assertEqual(self.request('GET', 'me', extra=session)[0], 401)

    def test_csrf_origin_and_header(self):
        self.assertEqual(self.request('POST', 'register', {}, {'Origin': 'https://evil.example'})[0], 403)
        self.assertEqual(self.request('POST', 'register', {}, {'X-SkillGraph-Client': ''})[0], 403)

    def test_validation_and_not_found(self):
        self.assertEqual(self.request('POST', 'register', [1, 2])[0], 400)
        self.assertEqual(self.request('POST', 'register', {}, {'Content-Type': 'text/plain'})[0], 415)
        self.assertEqual(self.request('GET', 'missing')[0], 404)
        self.assertEqual(self.request('GET', 'me')[0], 401)

    def test_database_unavailable_is_safe(self):
        with patch.object(self.db, 'query', side_effect=DatabaseError(1203)):
            status, headers, body = self.request('GET', 'me', extra={'Cookie': 'sg_session=some-token'})
        self.assertEqual(status, 503)
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertNotIn('1203', json.dumps(body))


if __name__ == '__main__':
    unittest.main()
