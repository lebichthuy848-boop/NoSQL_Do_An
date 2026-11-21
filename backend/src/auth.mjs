import { HttpError } from "./errors.mjs";
import {
  hashPassword,
  newId,
  newOpaqueToken,
  normalizeEmail,
  passwordError,
  tokenDigest,
  userSafe,
  validateEmail,
  verifyPassword,
} from "./security.mjs";

const nowIso = () => new Date().toISOString();
const profileDefaults = (userKey) => ({
  _key: userKey,
  career_key: null,
  skill_keys: [],
  saved_resource_keys: [],
  planned_resource_keys: [],
  viewed_resource_keys: [],
  completed_resource_keys: [],
  notes: {},
  created_at: nowIso(),
  updated_at: nowIso(),
});

export class AuthService {
  constructor({ db, config, sendResetEmail = null }) {
    this.db = db;
    this.config = config;
    this.sendResetEmail = sendResetEmail;
  }

  async findUserByEmail(email) {
    const rows = await this.db.query(
      "FOR user IN app_users FILTER user.email_normalized == @email LIMIT 1 RETURN user",
      { email },
    );
    return rows[0] || null;
  }

  async findUserByKey(key) {
    const rows = await this.db.query("FOR user IN app_users FILTER user._key == @key LIMIT 1 RETURN user", { key });
    return rows[0] || null;
  }

  async createUser({ email, password, displayName, role = "user", status = "active", actor = null, isTest = false }) {
    const normalizedEmail = validateEmail(email);
    if (!normalizedEmail) throw new HttpError(400, "VALIDATION_ERROR", "A valid email address is required");
    const passwordProblem = passwordError(password);
    if (passwordProblem) throw new HttpError(400, "VALIDATION_ERROR", passwordProblem);
    const name = typeof displayName === "string" ? displayName.trim() : "";
    if (!name || name.length > 120) throw new HttpError(400, "VALIDATION_ERROR", "displayName must contain 1–120 characters");
    if (!new Set(["user", "admin"]).has(role)) throw new HttpError(400, "VALIDATION_ERROR", "role must be user or admin");
    if (!new Set(["active", "locked", "disabled"]).has(status)) throw new HttpError(400, "VALIDATION_ERROR", "Invalid account status");

    if (await this.findUserByEmail(normalizedEmail)) throw new HttpError(409, "EMAIL_EXISTS", "An account with this email already exists");
    const credentials = await hashPassword(password);
    const user = {
      _key: newId(),
      email: normalizedEmail,
      email_normalized: normalizedEmail,
      display_name: name,
      role,
      status,
      ...(isTest ? { is_test: true, test_scenario: "backend_http_integration" } : {}),
      ...credentials,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    const profile = profileDefaults(user._key);
    const auditEvent = {
      _key: newId(),
      actor_key: actor || null,
      event_type: "user.created",
      metadata: { targetUserKey: user._key, role },
      created_at: nowIso(),
    };
    try {
      const rows = await this.db.query("INSERT @user INTO app_users LET createdUser = NEW INSERT @profile INTO app_profiles INSERT @audit INTO app_audit_log RETURN createdUser", { user, profile, audit: auditEvent });
      return rows[0];
    } catch (error) {
      if (error?.status === 409) throw new HttpError(409, "EMAIL_EXISTS", "An account with this email already exists");
      throw error;
    }
  }

  async ensureProfile(userKey) {
    const rows = await this.db.query(
      "UPSERT { _key: @key } INSERT @profile UPDATE {} IN app_profiles RETURN NEW",
      { key: userKey, profile: profileDefaults(userKey) },
    );
    return rows[0];
  }

  async login({ email, password, ip }) {
    const normalizedEmail = normalizeEmail(email);
    if (typeof password !== "string" || password.length > 256) throw new HttpError(400, "VALIDATION_ERROR", "Email and password are required");
    const user = await this.findUserByEmail(normalizedEmail);
    const passwordOk = user
      ? await verifyPassword(password, user.password_hash, user.password_salt)
      : (await hashPassword(password), false);
    if (!user || !passwordOk || user.status !== "active") {
      await this.audit(user?._key || null, "auth.login_failed", { ip: String(ip || "").slice(0, 64) });
      throw new HttpError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
    }
    const token = newOpaqueToken();
    const expiresAt = new Date(Date.now() + this.config.sessionTtlSeconds * 1000).toISOString();
    const session = {
      _key: newId(),
      token_hash: tokenDigest(token),
      user_key: user._key,
      created_at: nowIso(),
      expires_at: expiresAt,
      revoked_at: null,
    };
    await this.db.query("INSERT @session INTO app_sessions RETURN NEW", { session });
    await this.audit(user._key, "auth.login_succeeded", { ip: String(ip || "").slice(0, 64) });
    return { token, user: userSafe(user), expiresAt };
  }

  async authenticate(token) {
    if (!token || token.length > 256) return null;
    const rows = await this.db.query(
      "FOR session IN app_sessions FILTER session.token_hash == @hash AND session.revoked_at == null AND session.expires_at > @now LIMIT 1 LET user = DOCUMENT(CONCAT('app_users/', session.user_key)) FILTER user != null AND user.status == 'active' RETURN { session, user }",
      { hash: tokenDigest(token), now: nowIso() },
    );
    if (!rows[0]) return null;
    return { user: rows[0].user, session: rows[0].session };
  }

  async logout(sessionKey, userKey) {
    if (sessionKey) {
      await this.db.query(
        "FOR session IN app_sessions FILTER session._key == @key AND session.user_key == @userKey UPDATE session WITH { revoked_at: @now } IN app_sessions RETURN NEW",
        { key: sessionKey, userKey, now: nowIso() },
      );
    }
    await this.audit(userKey, "auth.logout", {});
  }

  async changePassword(user, currentPassword, newPassword) {
    const problem = passwordError(newPassword);
    if (problem) throw new HttpError(400, "VALIDATION_ERROR", problem);
    const stored = await this.findUserByKey(user._key);
    if (!stored || !(await verifyPassword(currentPassword, stored.password_hash, stored.password_salt))) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Current password is incorrect");
    }
    const credentials = await hashPassword(newPassword);
    const transactionId = await this.db.beginTransaction({
      write: ["app_users", "app_sessions", "app_audit_log"],
      exclusive: ["app_users", "app_sessions", "app_audit_log"],
      lockTimeout: 10,
    });
    try {
      const updated = await this.db.query(
        "FOR user IN app_users FILTER user._key == @key AND user.status == 'active' AND user.password_hash == @expectedHash AND user.password_salt == @expectedSalt UPDATE user WITH MERGE(@credentials, { updated_at: @now }) IN app_users RETURN NEW",
        { key: stored._key, expectedHash: stored.password_hash, expectedSalt: stored.password_salt, credentials, now: nowIso() },
        { transactionId },
      );
      if (!updated[0]) throw new HttpError(401, "INVALID_CREDENTIALS", "Current password is incorrect");
      await this.revokeUserSessions(stored._key, { transactionId });
      await this.audit(stored._key, "auth.password_changed", {}, { transactionId });
      await this.db.commitTransaction(transactionId);
    } catch (error) {
      await this.db.abortTransaction(transactionId).catch(() => {});
      throw error;
    }
  }

  async requestPasswordReset(email) {
    const normalizedEmail = validateEmail(email);
    if (!normalizedEmail) throw new HttpError(400, "VALIDATION_ERROR", "A valid email address is required");
    if (!this.sendResetEmail) {
      throw new HttpError(503, "EMAIL_DELIVERY_NOT_CONFIGURED", "Password recovery is unavailable until an email delivery service is configured");
    }
    const user = await this.findUserByEmail(normalizedEmail);
    if (!user || user.status !== "active") return { accepted: true };
    const token = newOpaqueToken();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const reset = {
      _key: newId(),
      token_hash: tokenDigest(token),
      user_key: user._key,
      created_at: nowIso(),
      expires_at: expiresAt,
      used_at: null,
    };
    await this.db.query("INSERT @reset INTO app_password_resets RETURN NEW", { reset });
    try {
      await this.sendResetEmail({ email: user.email, token, expiresAt });
    } catch {
      await this.db.query("REMOVE @key IN app_password_resets", { key: reset._key });
      throw new HttpError(503, "EMAIL_DELIVERY_FAILED", "Password recovery is temporarily unavailable");
    }
    return { accepted: true };
  }

  async completePasswordReset(token, newPassword) {
    const problem = passwordError(newPassword);
    if (problem) throw new HttpError(400, "VALIDATION_ERROR", problem);
    if (typeof token !== "string" || token.length < 32 || token.length > 256) {
      throw new HttpError(400, "INVALID_RESET_TOKEN", "Reset token is invalid or expired");
    }
    const now = nowIso();
    const resets = await this.db.query(
      "FOR reset IN app_password_resets FILTER reset.token_hash == @hash AND reset.used_at == null AND reset.expires_at > @now LIMIT 1 RETURN reset.user_key",
      { hash: tokenDigest(token), now },
    );
    if (!resets[0]) throw new HttpError(400, "INVALID_RESET_TOKEN", "Reset token is invalid or expired");
    const credentials = await hashPassword(newPassword);
    const claimed = await this.db.query(
      "FOR reset IN app_password_resets FILTER reset.token_hash == @hash AND reset.used_at == null AND reset.expires_at > @now LET user = DOCUMENT(CONCAT('app_users/', reset.user_key)) FILTER user != null AND user.status == 'active' LIMIT 1 UPDATE reset WITH { used_at: @now } IN app_password_resets RETURN { userKey: user._key }",
      { hash: tokenDigest(token), now },
    );
    if (!claimed[0]) throw new HttpError(400, "INVALID_RESET_TOKEN", "Reset token is invalid or expired");
    const results = await this.db.query(
      "FOR user IN app_users FILTER user._key == @userKey AND user.status == 'active' UPDATE user WITH MERGE(@credentials, { updated_at: @now }) IN app_users RETURN NEW",
      { userKey: claimed[0].userKey, credentials, now },
    );
    if (!results.length) throw new HttpError(400, "INVALID_RESET_TOKEN", "Reset token is invalid or expired");
    await this.revokeUserSessions(claimed[0].userKey);
    await this.audit(claimed[0].userKey, "auth.password_reset", {});
    return { changed: true };
  }

  async revokeUserSessions(userKey, { transactionId } = {}) {
    await this.db.query(
      "FOR session IN app_sessions FILTER session.user_key == @userKey AND session.revoked_at == null UPDATE session WITH { revoked_at: @now } IN app_sessions",
      { userKey, now: nowIso() },
      transactionId ? { transactionId } : {},
    );
  }

  async adminUpdateUser(targetKey, patch, actor) {
    if (patch.role != null && !new Set(["user", "admin"]).has(patch.role)) throw new HttpError(400, "VALIDATION_ERROR", "Invalid role or status");
    if (patch.status != null && !new Set(["active", "locked", "disabled"]).has(patch.status)) throw new HttpError(400, "VALIDATION_ERROR", "Invalid role or status");
    const requestedDisplayName = patch.displayName;
    if (requestedDisplayName != null && (typeof requestedDisplayName !== "string" || !requestedDisplayName.trim() || requestedDisplayName.trim().length > 120)) {
      throw new HttpError(400, "VALIDATION_ERROR", "displayName must contain 1–120 characters");
    }

    const transactionId = await this.db.beginTransaction({
      write: ["app_users", "app_sessions"],
      exclusive: ["app_users", "app_sessions"],
      lockTimeout: 10,
    });
    let target;
    let nextRole;
    let nextStatus;
    let displayName;
    let rows;
    try {
      const targets = await this.db.query("FOR user IN app_users FILTER user._key == @key LIMIT 1 RETURN user", { key: targetKey }, { transactionId });
      target = targets[0];
      if (!target) throw new HttpError(404, "NOT_FOUND", "User was not found");
      nextRole = patch.role ?? target.role;
      nextStatus = patch.status ?? target.status;
      displayName = requestedDisplayName ?? target.display_name;
      if (target.role === "admin" && target.status === "active" && (nextRole !== "admin" || nextStatus !== "active")) {
        const counts = await this.db.query("RETURN LENGTH(FOR user IN app_users FILTER user.role == 'admin' AND user.status == 'active' RETURN 1)", {}, { transactionId });
        if ((counts[0] || 0) <= 1) throw new HttpError(409, "LAST_ACTIVE_ADMIN", "The last active administrator cannot be demoted or disabled");
      }
      rows = await this.db.query(
        "UPDATE @key WITH { role: @role, status: @status, display_name: @displayName, updated_at: @now } IN app_users RETURN NEW",
        { key: target._key, role: nextRole, status: nextStatus, displayName: displayName.trim(), now: nowIso() },
        { transactionId },
      );
      if (!rows[0]) throw new HttpError(404, "NOT_FOUND", "User was not found");
      if (nextRole !== target.role || nextStatus !== target.status) {
        await this.revokeUserSessions(target._key, { transactionId });
      }
      await this.db.commitTransaction(transactionId);
    } catch (error) {
      await this.db.abortTransaction(transactionId).catch(() => {});
      throw error;
    }
    await this.audit(actor._key, "user.updated", { targetUserKey: target._key, role: nextRole, status: nextStatus });
    return rows[0];
  }

  async listUsers({ search = "", status = "", role = "", offset = 0, limit = 25 }) {
    return this.db.query(
      "FOR user IN app_users FILTER (@search == '' OR CONTAINS(LOWER(user.email), LOWER(@search)) OR CONTAINS(LOWER(user.display_name), LOWER(@search))) AND (@status == '' OR user.status == @status) AND (@role == '' OR user.role == @role) SORT user.created_at DESC LIMIT @offset, @limit RETURN UNSET(user, 'password_hash', 'password_salt', 'password_scheme')",
      { search, status, role, offset, limit },
    );
  }

  async audit(actorKey, eventType, metadata, { transactionId } = {}) {
    try {
      await this.db.query("INSERT { _key: @key, actor_key: @actor, event_type: @event, metadata: @metadata, created_at: @now } INTO app_audit_log", {
        key: newId(), actor: actorKey, event: eventType, metadata, now: nowIso(),
      }, transactionId ? { transactionId } : {});
    } catch {
      // Audit storage failures must not leak data or credentials in logs.
      throw new HttpError(503, "AUDIT_UNAVAILABLE", "The requested operation could not be recorded");
    }
  }
}

export { userSafe };
