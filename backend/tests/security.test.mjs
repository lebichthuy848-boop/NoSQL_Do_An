import test from "node:test";
import assert from "node:assert/strict";
import {
  clearSessionCookie,
  cookieValue,
  hashPassword,
  newOpaqueToken,
  passwordError,
  sessionCookie,
  tokenDigest,
  userSafe,
  verifyPassword,
} from "../src/security.mjs";

test("passwords use salted scrypt and verify without storing raw input", async () => {
  const password = "Correct-Horse-42!";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.equal(first.password_scheme, "scrypt-32768-8-1");
  assert.notEqual(first.password_salt, second.password_salt);
  assert.notEqual(first.password_hash, password);
  assert.equal(await verifyPassword(password, first.password_hash, first.password_salt), true);
  assert.equal(await verifyPassword("incorrect", first.password_hash, first.password_salt), false);
});

test("password policy rejects weak or oversized credentials", () => {
  assert.equal(passwordError("short"), "Password must contain 12–256 characters");
  assert.match(passwordError("alllowercase123"), /uppercase/);
  assert.match(passwordError("UPPERCASE12345"), /lowercase/);
  assert.match(passwordError(`Aa1${"x".repeat(254)}`), /12–256/);
  assert.equal(passwordError("Strong-Password-42!"), null);
});

test("session tokens are opaque and only their digest should be persisted", () => {
  const one = newOpaqueToken();
  const two = newOpaqueToken();
  assert.notEqual(one, two);
  assert.match(one, /^[A-Za-z0-9_-]{40,50}$/);
  assert.notEqual(tokenDigest(one), one);
  assert.equal(tokenDigest(one), tokenDigest(one));
});

test("session cookies have HttpOnly and SameSite flags and can be cleared", () => {
  const cookie = sessionCookie("sg_session", "opaque", { maxAge: 3600, secure: true });
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.equal(cookieValue(`theme=dark; ${cookie}`, "sg_session"), "opaque");
  assert.match(clearSessionCookie("sg_session", true), /Max-Age=0/);
});

test("safe user projection never exposes password fields", () => {
  const user = userSafe({ _key: "u1", email: "user@example.test", display_name: "User", role: "user", status: "active", password_hash: "hash", password_salt: "salt" });
  assert.equal(user.id, "u1");
  assert.equal(Object.hasOwn(user, "password_hash"), false);
  assert.equal(Object.hasOwn(user, "password_salt"), false);
});
