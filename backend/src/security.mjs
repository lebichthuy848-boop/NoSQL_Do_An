import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const SCRYPT_OPTIONS = Object.freeze({ N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
const HASH_BYTES = 64;

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function validateEmail(value) {
  const email = normalizeEmail(value);
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function passwordError(value) {
  if (typeof value !== "string" || value.length < 12 || value.length > 256) {
    return "Password must contain 12–256 characters";
  }
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/[0-9]/.test(value)) {
    return "Password must include lowercase, uppercase, and numeric characters";
  }
  return null;
}

export async function hashPassword(password, salt = randomBytes(16)) {
  const derived = await scryptAsync(password, salt, HASH_BYTES, SCRYPT_OPTIONS);
  return {
    password_hash: Buffer.from(derived).toString("base64url"),
    password_salt: Buffer.from(salt).toString("base64url"),
    password_scheme: "scrypt-32768-8-1",
  };
}

export async function verifyPassword(password, storedHash, storedSalt) {
  if (typeof password !== "string" || typeof storedHash !== "string" || typeof storedSalt !== "string") return false;
  let salt;
  let expected;
  try {
    salt = Buffer.from(storedSalt, "base64url");
    expected = Buffer.from(storedHash, "base64url");
  } catch {
    return false;
  }
  if (salt.length !== 16 || expected.length !== HASH_BYTES) return false;
  const actual = Buffer.from(await scryptAsync(password, salt, HASH_BYTES, SCRYPT_OPTIONS));
  return timingSafeEqual(actual, expected);
}

export function newOpaqueToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function tokenDigest(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function newId() {
  return randomBytes(18).toString("base64url");
}

export function userSafe(user) {
  if (!user) return null;
  return {
    id: user._key,
    email: user.email,
    displayName: user.display_name,
    role: user.role,
    status: user.status,
    createdAt: user.created_at,
  };
}

export function sessionCookie(name, token, { maxAge, secure = false }) {
  const parts = [`${name}=${token}`, "Path=/api/v1", "HttpOnly", "SameSite=Strict", `Max-Age=${maxAge}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(name, secure = false) {
  return sessionCookie(name, "", { maxAge: 0, secure });
}

export function cookieValue(header, name) {
  if (!header) return null;
  for (const item of header.split(";")) {
    const splitAt = item.indexOf("=");
    if (splitAt < 0) continue;
    if (item.slice(0, splitAt).trim() === name) return item.slice(splitAt + 1).trim();
  }
  return null;
}

export function stripSecrets(user) {
  if (!user) return null;
  const { password_hash, password_salt, password_scheme, ...safe } = user;
  return safe;
}
