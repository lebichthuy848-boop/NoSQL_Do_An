"""Small ArangoDB HTTP adapter. Never creates collections or indexes."""
import base64
import json
import os
from contextlib import contextmanager
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


class DatabaseError(Exception):
    def __init__(self, number=0):
        self.number = number


class Database:
    def __init__(self):
        self.url = os.environ.get('ARANGO_URL', 'http://127.0.0.1:8529').rstrip('/')
        self.name = os.environ.get('ARANGO_DATABASE', 'skillgraph')
        credentials = os.environ.get('ARANGO_USERNAME', 'skillgraph_auth') + ':' + os.environ.get('ARANGO_PASSWORD', '')
        self.authorization = 'Basic ' + base64.b64encode(credentials.encode()).decode()

    def request(self, method, path, data=None, transaction=None):
        headers = {'Authorization': self.authorization, 'Content-Type': 'application/json'}
        if transaction:
            headers['x-arango-trx-id'] = transaction
        request = Request(self.url + '/_db/' + quote(self.name, safe='') + '/_api/' + path,
                          data=None if data is None else json.dumps(data).encode(), headers=headers, method=method)
        try:
            with urlopen(request, timeout=15) as response:
                return json.load(response)
        except HTTPError as error:
            try:
                number = json.load(error).get('errorNum', 0)
            except (ValueError, AttributeError):
                number = 0
            raise DatabaseError(number) from None
        except (URLError, TimeoutError, OSError, ValueError):
            raise DatabaseError() from None

    def query(self, query, variables=None, transaction=None):
        result = self.request('POST', 'cursor', {'query': query, 'bindVars': variables or {}, 'batchSize': 1000}, transaction)
        rows = result['result']
        while result.get('hasMore'):
            result = self.request('PUT', 'cursor/' + result['id'], {}, transaction)
            rows.extend(result['result'])
        return rows

    @contextmanager
    def transaction(self):
        # Exclusive writes serialize authentication changes, including reset-token reuse.
        identifier = self.request('POST', 'transaction/begin', {
            'collections': {'exclusive': ['auth_users', 'auth_sessions', 'auth_password_resets']},
            'lockTimeout': 10, 'waitForSync': True})['result']['id']
        try:
            yield identifier
            self.request('PUT', 'transaction/' + identifier, {})
        except Exception:
            try:
                self.request('DELETE', 'transaction/' + identifier)
            except DatabaseError:
                pass
            raise
