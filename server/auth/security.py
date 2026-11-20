"""Password hashing and validation; no plaintext passwords/tokens in storage."""
import hashlib
import hmac
import re
import secrets


def email_address(value):
    if not isinstance(value, str):
        raise ValueError('Email không hợp lệ.')
    value = value.strip().lower()
    if len(value) > 254 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', value):
        raise ValueError('Email không hợp lệ.')
    return value


def login_identifier(value):
    if not isinstance(value, str):
        raise ValueError('Tên đăng nhập hoặc email không hợp lệ.')
    value = value.strip().lower()
    if '@' in value:
        return email_address(value)
    if not re.fullmatch(r'[a-z0-9_.-]{3,32}', value):
        raise ValueError('Tên đăng nhập hoặc email không hợp lệ.')
    return value


def validate_password(value):
    if not isinstance(value, str) or not 10 <= len(value) <= 128:
        raise ValueError('Mật khẩu cần từ 10 đến 128 ký tự.')
    if not re.search(r'[a-z]', value) or not re.search(r'[A-Z]', value) or not re.search(r'[0-9]', value):
        raise ValueError('Mật khẩu cần có chữ thường, chữ hoa và số.')
    return value


def hash_password(password):
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
    return f'scrypt$16384$8$1${salt}${digest}'


def verify_password(password, encoded):
    try:
        algorithm, n, r, p, salt, digest = encoded.split('$')
        if algorithm != 'scrypt' or (n, r, p) != ('16384', '8', '1'):
            return False
        actual = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p)).hex()
        return hmac.compare_digest(actual, digest)
    except (ValueError, TypeError, AttributeError):
        return False


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()
