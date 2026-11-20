// CHỈ chạy thủ công sau khi chọn đúng database: arangosh --server.database <database> ...
// API không import hay tự chạy file này. Không thay đổi collection catalog hiện có.
const db = require('@arangodb').db;
for (const name of ['auth_users', 'auth_sessions', 'auth_password_resets']) {
  if (!db._collection(name)) db._create(name);
}
db.auth_users.ensureIndex({ type: 'persistent', fields: ['email'], unique: true, sparse: false });
db.auth_sessions.ensureIndex({ type: 'persistent', fields: ['userId'] });
db.auth_sessions.ensureIndex({ type: 'ttl', fields: ['expiresAt'], expireAfter: 0 });
db.auth_password_resets.ensureIndex({ type: 'persistent', fields: ['userId'] });
db.auth_password_resets.ensureIndex({ type: 'ttl', fields: ['expiresAt'], expireAfter: 0 });
