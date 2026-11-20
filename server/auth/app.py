"""Run: python server/auth/app.py (Python >= 3.10, standard library only)."""
import json
import os
import secrets
import smtplib
import ssl
import threading
import time
from collections import deque
from email.message import EmailMessage
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, urlsplit

from database import Database, DatabaseError
from security import email_address, hash_password, login_identifier, token_hash, validate_password, verify_password


def load_env():
    path = Path(__file__).with_name('.env')
    if path.exists():
        for line in path.read_text(encoding='utf-8-sig').splitlines():
            if line.strip() and not line.lstrip().startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                os.environ.setdefault(key.strip(), value.strip())


class APIError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


def public_user(user):
    return {
        'id': user['_key'],
        'name': user['name'],
        'email': user.get('email'),
        'username': user.get('username'),
        'role': user.get('role', 'user'),
    }


class RateLimiter:
    def __init__(self):
        self.events, self.lock = {}, threading.Lock()

    def check(self, key, limit, seconds=900):
        now = time.monotonic()
        with self.lock:
            self.events = {k: v for k, v in self.events.items() if v and v[-1] > now - seconds}
            queue = self.events.setdefault(key, deque())
            while queue and queue[0] <= now - seconds:
                queue.popleft()
            if len(queue) >= limit:
                raise APIError(429, 'Bạn thao tác quá nhiều. Vui lòng thử lại sau 15 phút.')
            queue.append(now)


class AuthService:
    ADMIN_COLLECTIONS = {
        'careers': 'careers', 'skills': 'skills', 'providers': 'providers', 'courses': 'courses',
        'teaches': 'teaches', 'requires_skill': 'requires_skill', 'prerequisite': 'skill_prerequisite',
    }
    ADMIN_FIELDS = {
        'careers': {'name', 'description', 'career_group', 'isco_group'},
        'skills': {'name', 'description', 'skill_type', 'reuse_level'},
        'providers': {'name', 'official_website', 'description'},
        'courses': {'title', 'canonical_url', 'provider_name', 'resource_type', 'language'},
        'teaches': {'_from', '_to', 'evidence_scope', 'mapping_audit_limit'},
        'requires_skill': {'_from', '_to', 'requirement_type'},
        'prerequisite': {'_from', '_to', 'relation_type', 'evidence_url'},
    }
    ADMIN_REQUIRED = {
        'careers': {'name'}, 'skills': {'name'}, 'providers': {'name'}, 'courses': {'title'},
        'teaches': {'_from', '_to'}, 'requires_skill': {'_from', '_to'}, 'prerequisite': {'_from', '_to'},
    }
    ADMIN_EDGE_TYPES = {
        'teaches': ('courses', 'skills'), 'requires_skill': ('careers', 'skills'),
        'prerequisite': ('skills', 'skills'),
    }
    ADMIN_EXPORT_COLLECTIONS = {
        'careers', 'completed', 'course_entry_skill', 'course_offers', 'course_prerequisite_evidence',
        'course_url_access_observations', 'courses', 'data_sources', 'esco_group_broader',
        'esco_skill_broader', 'esco_skill_group', 'esco_skill_knowledge', 'has_skill', 'learning_plans',
        'offered_by', 'prerequisite', 'providers', 'requires_skill', 'skill_assessments', 'skill_groups',
        'skill_prerequisite', 'skills', 'targets_career', 'teaches', 'users',
    }

    def __init__(self, db):
        self.db = db
        self.dummy_hash = hash_password(secrets.token_urlsafe(24))

    def session(self, key):
        rows = self.db.query('FOR s IN auth_sessions FILTER s._key == @key AND s.expiresAt > @now '
                             'LET u = DOCUMENT("auth_users", s.userId) FILTER u != null RETURN u',
                             {'key': token_hash(key), 'now': time.time()})
        return rows[0] if rows else None

    def register(self, data):
        email = email_address(data.get('email'))
        password = validate_password(data.get('password'))
        name = data.get('name')
        if not isinstance(name, str) or not 2 <= len(name.strip()) <= 80:
            raise ValueError('Họ tên cần từ 2 đến 80 ký tự.')
        user = {'_key': secrets.token_hex(16), 'email': email, 'name': name.strip(), 'role': 'user',
                'passwordHash': hash_password(password), 'createdAt': time.time()}
        with self.db.transaction() as trx:
            if self.db.query('FOR u IN auth_users FILTER u.email == @email LIMIT 1 RETURN u._key', {'email': email}, trx):
                raise APIError(409, 'Email này đã được đăng ký. Hãy đăng nhập hoặc lấy lại mật khẩu.')
            try:
                self.db.request('POST', 'document/auth_users', user, trx)
            except DatabaseError as error:
                if error.number == 1210:
                    raise APIError(409, 'Email này đã được đăng ký.') from None
                raise
        return {'message': 'Đăng ký thành công. Bạn có thể đăng nhập ngay.'}

    def login(self, data, old_session):
        identifier = login_identifier(data.get('email'))
        password = data.get('password')
        if not isinstance(password, str) or len(password) > 128:
            raise APIError(401, 'Tên đăng nhập/email hoặc mật khẩu không đúng.')
        # Verification is kept in the transaction so a concurrent reset cannot be bypassed.
        with self.db.transaction() as trx:
            if '@' in identifier:
                rows = self.db.query('FOR u IN auth_users FILTER u.email == @identifier LIMIT 1 RETURN u',
                                     {'identifier': identifier}, trx)
            else:
                rows = self.db.query('FOR u IN auth_users FILTER u._key == @identifier LIMIT 1 RETURN u',
                                     {'identifier': identifier}, trx)
            user = rows[0] if rows else None
            valid = verify_password(password, user['passwordHash'] if user else self.dummy_hash)
            if not user or not valid:
                raise APIError(401, 'Tên đăng nhập/email hoặc mật khẩu không đúng.')
            if user.get('isActive') is False or user.get('status') == 'blocked':
                raise APIError(403, 'Tài khoản đã bị khóa. Hãy liên hệ quản trị viên.')
            self.db.query('FOR s IN auth_sessions FILTER s._key == @key OR s.expiresAt <= @now REMOVE s IN auth_sessions',
                          {'key': token_hash(old_session), 'now': time.time()}, trx)
            raw = secrets.token_urlsafe(32)
            self.db.request('POST', 'document/auth_sessions', {
                '_key': token_hash(raw), 'userId': user['_key'], 'createdAt': time.time(), 'expiresAt': time.time() + 604800}, trx)
        return {'user': public_user(user)}, raw

    def logout(self, raw):
        self.db.query('FOR s IN auth_sessions FILTER s._key == @key REMOVE s IN auth_sessions', {'key': token_hash(raw)})
        return {'message': 'Đã đăng xuất.'}

    def forgot(self, data):
        email = email_address(data.get('email'))
        raw = secrets.token_urlsafe(32)
        key = token_hash(raw)
        with self.db.transaction() as trx:
            users = self.db.query('FOR u IN auth_users FILTER u.email == @email LIMIT 1 RETURN u', {'email': email}, trx)
            if users:
                self.db.request('POST', 'document/auth_password_resets', {
                    '_key': key, 'userId': users[0]['_key'], 'createdAt': time.time(), 'expiresAt': time.time() + 900}, trx)
        if users:
            try:
                self.send_reset(email, raw)
            except Exception as e:
                self.db.query('FOR r IN auth_password_resets FILTER r._key == @key REMOVE r IN auth_password_resets', {'key': key})
                # Same response for all emails; never reveal account existence or tokens.
                print(f'[SMTP ERROR] Không gửi được email đặt lại mật khẩu: {type(e).__name__}: {e}', flush=True)
        return {'message': 'Nếu email đã được đăng ký, bạn sẽ nhận được liên kết đặt lại mật khẩu có hiệu lực 15 phút. Kiểm tra cả thư rác.'}

    @staticmethod
    def send_reset(email, raw):
        link = os.environ['APP_ORIGIN'].rstrip('/') + '/reset-password#token=' + raw
        if os.environ.get('MAIL_MODE', 'smtp') == 'console':
            print('[LOCAL DEVELOPMENT] Reset password: ' + link, flush=True)
            return
        message = EmailMessage()
        message['Subject'] = 'SkillGraph — Đặt lại mật khẩu'
        message['From'] = os.environ['SMTP_FROM']
        message['To'] = email
        message.set_content('Bạn đã yêu cầu đặt lại mật khẩu SkillGraph.\n\n' + link +
                            '\n\nLiên kết dùng một lần, hết hạn sau 15 phút. Nếu không yêu cầu, hãy bỏ qua email này.')
        security = os.environ.get('SMTP_SECURITY', 'starttls')
        client = smtplib.SMTP_SSL if security == 'ssl' else smtplib.SMTP
        with client(os.environ['SMTP_HOST'], int(os.environ.get('SMTP_PORT', '587')), timeout=15,
                    **({'context': ssl.create_default_context()} if security == 'ssl' else {})) as smtp:
            if security == 'starttls':
                smtp.starttls(context=ssl.create_default_context())
            if os.environ.get('SMTP_USERNAME'):
                smtp.login(os.environ['SMTP_USERNAME'], os.environ['SMTP_PASSWORD'])
            smtp.send_message(message)

    def reset(self, data):
        raw = data.get('token')
        if not isinstance(raw, str) or not 32 <= len(raw) <= 128:
            raise APIError(400, 'Liên kết không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu liên kết mới.')
        password_hash = hash_password(validate_password(data.get('password')))
        with self.db.transaction() as trx:
            rows = self.db.query('FOR r IN auth_password_resets FILTER r._key == @key AND r.expiresAt > @now RETURN r',
                                 {'key': token_hash(raw), 'now': time.time()}, trx)
            if not rows:
                raise APIError(400, 'Liên kết không hợp lệ, đã được sử dụng hoặc đã hết hạn.')
            user_id = rows[0]['userId']
            users = self.db.query('FOR u IN auth_users FILTER u._key == @id RETURN u._key', {'id': user_id}, trx)
            if not users:
                raise APIError(400, 'Tài khoản không còn tồn tại.')
            self.db.request('PATCH', 'document/auth_users/' + user_id,
                            {'passwordHash': password_hash, 'passwordChangedAt': time.time()}, trx)
            self.db.query('FOR r IN auth_password_resets FILTER r.userId == @id REMOVE r IN auth_password_resets', {'id': user_id}, trx)
            self.db.query('FOR s IN auth_sessions FILTER s.userId == @id REMOVE s IN auth_sessions', {'id': user_id}, trx)
        return {'message': 'Đổi mật khẩu thành công. Hãy đăng nhập bằng mật khẩu mới.'}

    def admin_catalog(self):
        # Only expose the public SkillGraph catalog. Authentication collections and
        # user records are intentionally excluded from this read-only endpoint.
        available = self.db.request('GET', 'collection').get('result', [])
        names = {item.get('name') for item in available}
        requested = {
            'careers': ('careers',),
            'skills': ('skills',),
            'providers': ('providers',),
            'courses': ('courses',),
            'teaches': ('teaches',),
            'offered_by': ('offered_by',),
            'requires_skill': ('requires_skill',),
            'prerequisite': ('skill_prerequisite', 'prerequisite'),
        }
        collections = {}
        for key, candidates in requested.items():
            collection = next((name for name in candidates if name in names), None)
            collections[key] = (self.db.query('FOR doc IN @@collection RETURN doc', {'@collection': collection})
                                if collection else [])
        return {'source': 'arangodb', 'database': self.db.name, 'fetchedAt': time.time(),
                'collections': collections}

    def admin_users(self):
        users = self.db.query(
            "FOR u IN auth_users SORT u.createdAt DESC RETURN {"
            "id: u._key, name: u.name, email: u.email, username: u.username, "
            "role: (u.role == null ? 'user' : u.role), createdAt: u.createdAt, "
            "isActive: (u.isActive == false || u.status == 'blocked' ? false : true)}"
        )
        return {'database': self.db.name, 'users': users}

    def admin_export(self):
        available = self.db.request('GET', 'collection').get('result', [])
        names = {item.get('name') for item in available}
        collections = {}
        exportable = self.ADMIN_EXPORT_COLLECTIONS & names
        if 'skill_prerequisite' in exportable:
            exportable = set(exportable) - {'prerequisite'}
        for name in sorted(exportable):
            collections[name] = self.db.query('FOR doc IN @@collection RETURN doc', {'@collection': name})
        return {'source': 'arangodb', 'database': self.db.name, 'exportedAt': time.time(), 'collections': collections}

    def _document(self, collection, key):
        rows = self.db.query('RETURN DOCUMENT(@id)', {'id': f'{collection}/{key}'})
        return rows[0] if rows and rows[0] else None

    def _validate_edge(self, collection, data, key=None):
        expected = self.ADMIN_EDGE_TYPES.get(collection)
        if not expected:
            return
        source, target = expected
        for field, expected_collection in (('_from', source), ('_to', target)):
            ref = data.get(field)
            if not isinstance(ref, str) or '/' not in ref or ref.split('/', 1)[0] != expected_collection:
                raise APIError(400, f'{field} phải trỏ đến collection {expected_collection}.')
            exists = self.db.query('RETURN DOCUMENT(@id) != null', {'id': ref})
            if not exists or not exists[0]:
                raise APIError(400, f'Không tìm thấy endpoint {ref}.')
        physical = self.ADMIN_COLLECTIONS[collection]
        duplicates = self.db.query(
            'FOR e IN @@collection FILTER e._from == @from AND e._to == @to AND e._key != @key LIMIT 1 RETURN e._key',
            {'@collection': physical, 'from': data['_from'], 'to': data['_to'], 'key': key or ''},
        )
        if duplicates:
            raise APIError(409, 'Quan hệ giữa hai đối tượng này đã tồn tại.')
        if collection == 'prerequisite':
            edges = self.db.query(
                'FOR e IN @@collection FILTER e._key != @key RETURN {_from: e._from, _to: e._to}',
                {'@collection': physical, 'key': key or ''},
            )
            graph = {}
            for edge in edges:
                graph.setdefault(edge['_from'], []).append(edge['_to'])
            seen, stack = set(), [data['_to']]
            while stack:
                current = stack.pop()
                if current == data['_from']:
                    raise APIError(409, 'Quan hệ này sẽ tạo vòng lặp trong đồ thị tiên quyết.')
                if current in seen:
                    continue
                seen.add(current)
                stack.extend(graph.get(current, []))

    def _ensure_vertex_unreferenced(self, collection, key):
        ref = f'{collection}/{key}'
        collections = self.db.request('GET', 'collection').get('result', [])
        for item in collections:
            if item.get('type') != 3:
                continue
            edge_collection = item.get('name')
            found = self.db.query(
                'FOR e IN @@collection FILTER e._from == @ref OR e._to == @ref LIMIT 1 RETURN e._key',
                {'@collection': edge_collection, 'ref': ref},
            )
            if found:
                raise APIError(409, f'Không thể xóa vì bản ghi còn được tham chiếu trong {edge_collection}.')

    def admin_record(self, data, actor):
        action = data.get('action')
        collection = data.get('collection')
        if collection not in self.ADMIN_COLLECTIONS:
            raise APIError(400, 'Collection không được phép chỉnh sửa từ Admin.')
        physical = self.ADMIN_COLLECTIONS[collection]
        key = data.get('key')
        if action == 'review':
            status, reason = data.get('status'), data.get('reason', '').strip()
            if collection not in ('courses', 'teaches') or status not in ('pending', 'approved', 'rejected'):
                raise APIError(400, 'Trạng thái duyệt không hợp lệ.')
            if status == 'rejected' and len(reason) < 5:
                raise APIError(400, 'Từ chối cần ghi lý do ít nhất 5 ký tự.')
            before = self._document(physical, key)
            if not before:
                raise APIError(404, 'Không tìm thấy bản ghi cần duyệt.')
            changes = {'review_status': status, 'reviewedAt': time.time(), 'reviewedBy': actor}
            if reason:
                changes['review_reason'] = reason[:500]
            if collection == 'courses':
                changes['recommendation_eligible'] = status == 'approved'
            self.db.request('PATCH', f'document/{quote(physical, safe="")}/{quote(key, safe="")}', changes)
            return {'record': self._document(physical, key), 'before': before}
        if action == 'delete':
            reason = data.get('reason', '').strip()
            if len(reason) < 5:
                raise APIError(400, 'Xóa cần ghi lý do ít nhất 5 ký tự.')
            before = self._document(physical, key)
            if not before:
                raise APIError(404, 'Không tìm thấy bản ghi cần xóa.')
            if collection in ('careers', 'skills', 'courses', 'providers'):
                self._ensure_vertex_unreferenced(collection, key)
            self.db.request('DELETE', f'document/{quote(physical, safe="")}/{quote(key, safe="")}')
            return {'deleted': True, 'before': before}
        fields = self.ADMIN_FIELDS[collection]
        changes = data.get('data')
        if action not in ('create', 'update') or not isinstance(changes, dict) or not changes:
            raise APIError(400, 'Thao tác bản ghi không hợp lệ.')
        if set(changes) - fields:
            raise APIError(400, 'Bản ghi chứa trường không được phép chỉnh sửa.')
        for value in changes.values():
            if isinstance(value, str) and len(value) > 10000:
                raise APIError(400, 'Một trường nội dung vượt quá 10.000 ký tự.')
        if collection in ('teaches', 'requires_skill') and 'evidence_scope' in changes and changes['evidence_scope'] not in ('direct_topic', 'partial'):
            raise APIError(400, 'Phạm vi bằng chứng không hợp lệ.')
        if collection == 'requires_skill' and 'requirement_type' in changes and changes['requirement_type'] not in ('essential', 'optional'):
            raise APIError(400, 'Mức yêu cầu phải là essential hoặc optional.')
        if action == 'create':
            if not self.ADMIN_REQUIRED[collection].issubset(changes):
                raise APIError(400, 'Thiếu trường bắt buộc cho collection này.')
            record = {**changes, '_key': secrets.token_hex(12), 'createdAt': time.time(), 'updatedAt': time.time()}
            self._validate_edge(collection, record)
            if collection == 'courses':
                record.setdefault('recommendation_eligible', False)
                record.setdefault('review_status', 'pending')
            created = self.db.request('POST', f'document/{quote(physical, safe="")}', record)['new']
            return {'record': self._document(physical, created['_key']), 'before': None}
        before = self._document(physical, key)
        if not before:
            raise APIError(404, 'Không tìm thấy bản ghi cần cập nhật.')
        merged = {**before, **changes}
        if collection in self.ADMIN_EDGE_TYPES:
            self._validate_edge(collection, merged, key)
        changes = {**changes, 'updatedAt': time.time()}
        self.db.request('PATCH', f'document/{quote(physical, safe="")}/{quote(key, safe="")}', changes)
        return {'record': self._document(physical, key), 'before': before}

    def admin_user_action(self, data, actor):
        action = data.get('action')
        user_id = data.get('userId')
        if action == 'create':
            email = email_address(data.get('email'))
            password = validate_password(data.get('password'))
            name = data.get('name')
            role = data.get('role', 'user')
            if not isinstance(name, str) or not 2 <= len(name.strip()) <= 80:
                raise APIError(400, 'Họ tên cần từ 2 đến 80 ký tự.')
            if role not in ('user', 'admin'):
                raise APIError(400, 'Vai trò không hợp lệ.')
            user = {'_key': secrets.token_hex(16), 'email': email, 'name': name.strip(), 'role': role,
                    'passwordHash': hash_password(password), 'createdAt': time.time(), 'isActive': True}
            with self.db.transaction() as trx:
                if self.db.query('FOR u IN auth_users FILTER u.email == @email LIMIT 1 RETURN u._key', {'email': email}, trx):
                    raise APIError(409, 'Email này đã được đăng ký.')
                self.db.request('POST', 'document/auth_users', user, trx)
            return {'message': 'Đã tạo tài khoản.', 'user': public_user(user)}
        if action not in ('role', 'active', 'reset', 'delete') or not isinstance(user_id, str):
            raise APIError(400, 'Thao tác người dùng không hợp lệ.')
        with self.db.transaction() as trx:
            rows = self.db.query('FOR u IN auth_users FILTER u._key == @id RETURN u', {'id': user_id}, trx)
            if not rows:
                raise APIError(404, 'Không tìm thấy tài khoản.')
            target = rows[0]
            if action == 'role':
                role = data.get('role')
                if role not in ('user', 'admin'):
                    raise APIError(400, 'Vai trò không hợp lệ.')
                if user_id == actor:
                    raise APIError(409, 'Bạn không thể tự đổi vai trò của mình.')
                if target.get('role') == 'admin' and role != 'admin':
                    count = self.db.query('FOR u IN auth_users FILTER u.role == "admin" AND u.isActive != false AND u.status != "blocked" COLLECT WITH COUNT INTO n RETURN n', {}, trx)[0]
                    if count <= 1:
                        raise APIError(409, 'Không thể hạ vai trò của Admin cuối cùng.')
                self.db.request('PATCH', f'document/auth_users/{quote(user_id, safe="")}', {'role': role, 'updatedAt': time.time()}, trx)
                return {'message': 'Đã cập nhật vai trò.'}
            if action == 'active':
                active = data.get('isActive')
                if not isinstance(active, bool):
                    raise APIError(400, 'Trạng thái tài khoản không hợp lệ.')
                if user_id == actor and not active:
                    raise APIError(409, 'Bạn không thể khóa tài khoản đang sử dụng.')
                if target.get('role') == 'admin' and not active:
                    count = self.db.query('FOR u IN auth_users FILTER u.role == "admin" AND u.isActive != false AND u.status != "blocked" COLLECT WITH COUNT INTO n RETURN n', {}, trx)[0]
                    if count <= 1:
                        raise APIError(409, 'Không thể khóa Admin cuối cùng.')
                self.db.request('PATCH', f'document/auth_users/{quote(user_id, safe="")}', {'isActive': active, 'status': 'active' if active else 'blocked', 'updatedAt': time.time()}, trx)
                if not active:
                    self.db.query('FOR s IN auth_sessions FILTER s.userId == @id REMOVE s IN auth_sessions', {'id': user_id}, trx)
                return {'message': 'Đã cập nhật trạng thái tài khoản.'}
            if action == 'delete':
                if user_id == actor:
                    raise APIError(409, 'Bạn không thể xóa tài khoản đang sử dụng.')
                if target.get('role') == 'admin':
                    count = self.db.query('FOR u IN auth_users FILTER u.role == "admin" AND u.isActive != false AND u.status != "blocked" COLLECT WITH COUNT INTO n RETURN n', {}, trx)[0]
                    if count <= 1:
                        raise APIError(409, 'Không thể xóa Admin cuối cùng.')
                self.db.query('FOR s IN auth_sessions FILTER s.userId == @id REMOVE s IN auth_sessions', {'id': user_id}, trx)
                self.db.query('FOR r IN auth_password_resets FILTER r.userId == @id REMOVE r IN auth_password_resets', {'id': user_id}, trx)
                self.db.request('DELETE', f'document/auth_users/{quote(user_id, safe="")}', None, trx)
                return {'message': 'Đã xóa tài khoản.'}
            email = target.get('email')
            if not email:
                raise APIError(400, 'Tài khoản chưa có email để nhận liên kết đặt lại mật khẩu.')
            raw, token_key = secrets.token_urlsafe(32), None
            token_key = token_hash(raw)
            self.db.request('POST', 'document/auth_password_resets', {'_key': token_key, 'userId': user_id,
                            'createdAt': time.time(), 'expiresAt': time.time() + 900}, trx)
        try:
            self.send_reset(email, raw)
        except Exception:
            self.db.query('FOR r IN auth_password_resets FILTER r._key == @key REMOVE r IN auth_password_resets', {'key': token_key})
            raise APIError(503, 'Không gửi được email đặt lại mật khẩu. Kiểm tra cấu hình SMTP.') from None
        message = ('Đã tạo liên kết đặt lại mật khẩu; xem terminal đang chạy Auth API để lấy link.'
                   if os.environ.get('MAIL_MODE', 'smtp') == 'console'
                   else 'Đã gửi liên kết đặt lại mật khẩu qua email.')
        return {'message': message}

    def admin_update_account(self, actor, data):
        name = data.get('name')
        if not isinstance(name, str) or not 2 <= len(name.strip()) <= 80:
            raise APIError(400, 'Tên hiển thị cần từ 2 đến 80 ký tự.')
        self.db.request('PATCH', f'document/auth_users/{quote(actor, safe="")}', {'name': name.strip(), 'updatedAt': time.time()})
        rows = self.db.query('FOR u IN auth_users FILTER u._key == @id RETURN u', {'id': actor})
        return {'user': public_user(rows[0])}


class Handler(BaseHTTPRequestHandler):
    service = None
    limiter = RateLimiter()

    def setup(self):
        super().setup()
        self.connection.settimeout(30)

    def log_message(self, format, *args):
        # Do not log request bodies, reset links, cookies or user email.
        pass

    def respond(self, status, body, cookie=None):
        payload = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        if cookie is not None:
            secure = '; Secure' if os.environ.get('AUTH_COOKIE_SECURE') == 'true' else ''
            self.send_header('Set-Cookie', f'sg_session={cookie}; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age={604800 if cookie else 0}{secure}')
        self.end_headers()
        self.wfile.write(payload)

    def session_cookie(self):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get('Cookie', ''))
            return cookie['sg_session'].value if 'sg_session' in cookie else ''
        except Exception:
            return ''

    def do_GET(self):
        try:
            path = urlsplit(self.path).path
            if path == '/api/auth/me':
                user = self.service.session(self.session_cookie()) if self.session_cookie() else None
                if not user:
                    self.respond(401, {'message': 'Vui lòng đăng nhập.'}, '')
                    return
                self.respond(200, {'user': public_user(user)})
                return
            if path == '/api/auth/admin/catalog':
                user = self.service.session(self.session_cookie()) if self.session_cookie() else None
                if not user:
                    self.respond(401, {'message': 'Vui lòng đăng nhập.'}, '')
                    return
                if user.get('role') != 'admin':
                    self.respond(403, {'message': 'Bạn không có quyền quản trị.'})
                    return
                self.respond(200, self.service.admin_catalog())
                return
            if path == '/api/auth/admin/users':
                user = self.service.session(self.session_cookie()) if self.session_cookie() else None
                if not user:
                    self.respond(401, {'message': 'Vui lòng đăng nhập.'}, '')
                    return
                if user.get('role') != 'admin':
                    self.respond(403, {'message': 'Bạn không có quyền quản trị.'})
                    return
                self.respond(200, self.service.admin_users())
                return
            if path == '/api/auth/admin/export':
                user = self.service.session(self.session_cookie()) if self.session_cookie() else None
                if not user:
                    self.respond(401, {'message': 'Vui lòng đăng nhập.'}, '')
                    return
                if user.get('role') != 'admin':
                    self.respond(403, {'message': 'Bạn không có quyền quản trị.'})
                    return
                self.respond(200, self.service.admin_export())
                return
            raise APIError(404, 'Không tìm thấy API.')
        except DatabaseError:
            self.respond(503, {'message': 'Chưa kết nối được database xác thực. Kiểm tra cấu hình và các collection ArangoDB.'})
        except APIError as error:
            self.respond(error.status, {'message': error.message})

    def do_POST(self):
        try:
            if self.headers.get('Origin') != os.environ['APP_ORIGIN'] or self.headers.get('X-SkillGraph-Client') != 'web':
                raise APIError(403, 'Nguồn yêu cầu không hợp lệ. Kiểm tra APP_ORIGIN.')
            path = urlsplit(self.path).path
            routes = {'/api/auth/register': self.service.register, '/api/auth/forgot-password': self.service.forgot,
                      '/api/auth/reset-password': self.service.reset}
            admin_routes = ('/api/auth/admin/records', '/api/auth/admin/users', '/api/auth/admin/account')
            if path not in routes and path not in ('/api/auth/login', '/api/auth/logout', *admin_routes):
                raise APIError(404, 'Không tìm thấy API.')
            if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                raise APIError(415, 'Yêu cầu phải dùng application/json.')
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= (65536 if path in admin_routes else 8192):
                raise APIError(413, 'Nội dung yêu cầu quá lớn hoặc trống.')
            self.limiter.check(('ip', self.client_address[0]), 120)
            self.limiter.check((path, self.client_address[0]), 10 if path.endswith('forgot-password') else 30)
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError('Dữ liệu không hợp lệ.')
            if path.endswith('login'):
                identifier = login_identifier(data.get('email'))
                self.limiter.check((path, token_hash(identifier)), 15)
            elif path.endswith('forgot-password'):
                email = email_address(data.get('email'))
                self.limiter.check((path, token_hash(email)), 5)
            if path == '/api/auth/login':
                body, cookie = self.service.login(data, self.session_cookie())
                self.respond(200, body, cookie)
            elif path == '/api/auth/logout':
                self.respond(200, self.service.logout(self.session_cookie()), '')
            elif path in admin_routes:
                user = self.service.session(self.session_cookie()) if self.session_cookie() else None
                if not user:
                    raise APIError(401, 'Vui lòng đăng nhập.')
                if user.get('role') != 'admin':
                    raise APIError(403, 'Bạn không có quyền quản trị.')
                if path == '/api/auth/admin/records':
                    body = self.service.admin_record(data, user['_key'])
                elif path == '/api/auth/admin/users':
                    body = self.service.admin_user_action(data, user['_key'])
                else:
                    body = self.service.admin_update_account(user['_key'], data)
                self.respond(200, body)
            else:
                self.respond(201 if path.endswith('register') else 200, routes[path](data),
                             '' if path.endswith('reset-password') else None)
        except APIError as error:
            self.respond(error.status, {'message': error.message})
        except (json.JSONDecodeError, UnicodeError):
            self.respond(400, {'message': 'Dữ liệu không hợp lệ.'})
        except ValueError as error:
            self.respond(400, {'message': str(error) if not str(error).startswith('invalid literal') else 'Dữ liệu không hợp lệ.'})
        except DatabaseError:
            self.respond(503, {'message': 'Database xác thực chưa sẵn sàng. Kiểm tra kết nối, collection và quyền truy cập ArangoDB.'})
        except Exception:
            self.respond(500, {'message': 'Máy chủ gặp lỗi. Vui lòng thử lại sau.'})


def main():
    load_env()
    os.environ.setdefault('APP_ORIGIN', 'http://localhost:5174')
    origin = urlsplit(os.environ['APP_ORIGIN'])
    if origin.scheme not in ('http', 'https') or not origin.netloc or origin.path or origin.query or origin.fragment:
        raise SystemExit('APP_ORIGIN phải có dạng http://localhost:5174, không có dấu / ở cuối.')
    if origin.scheme == 'https' and os.environ.get('AUTH_COOKIE_SECURE') != 'true':
        raise SystemExit('HTTPS yêu cầu AUTH_COOKIE_SECURE=true.')
    if os.environ.get('MAIL_MODE', 'smtp') not in ('smtp', 'console'):
        raise SystemExit('MAIL_MODE phải là smtp hoặc console.')
    if os.environ.get('SMTP_SECURITY', 'starttls') not in ('starttls', 'ssl'):
        raise SystemExit('SMTP_SECURITY phải là starttls hoặc ssl.')
    Handler.service = AuthService(Database())
    host, port = os.environ.get('AUTH_HOST', '127.0.0.1'), int(os.environ.get('AUTH_PORT', '8001'))
    print(f'Auth API: http://{host}:{port} — không tự thay đổi schema database.', flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == '__main__':
    main()
