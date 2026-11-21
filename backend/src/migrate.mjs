import { pathToFileURL } from "node:url";
import { ArangoClient } from "./arango.mjs";
import { loadConfig } from "./config.mjs";
import { APP_COLLECTIONS } from "./domain.mjs";

const INDEXES = {
  app_users: [
    { type: "persistent", fields: ["email_normalized"], unique: true, sparse: false },
    { type: "persistent", fields: ["role", "status"], sparse: true },
  ],
  app_sessions: [
    { type: "persistent", fields: ["token_hash"], unique: true, sparse: false },
    { type: "persistent", fields: ["user_key", "expires_at"], sparse: false },
  ],
  app_password_resets: [
    { type: "persistent", fields: ["token_hash"], unique: true, sparse: false },
    { type: "persistent", fields: ["user_key", "expires_at", "used_at"], sparse: false },
  ],
  app_profiles: [
    { type: "persistent", fields: ["updated_at"], sparse: false },
  ],
  app_audit_log: [
    { type: "persistent", fields: ["actor_key", "created_at"], sparse: false },
    { type: "persistent", fields: ["event_type", "created_at"], sparse: false },
  ],
  app_resource_drafts: [
    { type: "persistent", fields: ["status", "created_at"], sparse: false },
  ],
  app_provider_drafts: [
    { type: "persistent", fields: ["name_normalized"], unique: true, sparse: false },
    { type: "persistent", fields: ["status", "created_at"], sparse: false },
  ],
  app_mapping_drafts: [
    { type: "persistent", fields: ["resource_key", "skill_key"], unique: true, sparse: false },
    { type: "persistent", fields: ["status", "created_at"], sparse: false },
  ],
};

async function migrate(client) {
  const created = [];
  for (const name of APP_COLLECTIONS) {
    try {
      await client.request("/_api/collection", { method: "POST", body: { name, type: 2 } });
      created.push(name);
    } catch (error) {
      if (error.status !== 409) throw error;
    }
    for (const index of INDEXES[name] || []) {
      await client.request(`/_api/index?collection=${encodeURIComponent(name)}`, { method: "POST", body: index });
    }
  }
  return { createdCollections: created, appCollections: APP_COLLECTIONS.length, note: "Existing collections and all non-app collections were left untouched." };
}

export { migrate };

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const config = loadConfig();
  const username = process.env.ARANGO_BOOTSTRAP_USERNAME || config.databaseUser;
  const password = process.env.ARANGO_BOOTSTRAP_PASSWORD || config.databasePassword;
  if (!username || !password) {
    process.stderr.write("Bootstrap credentials are required for migrations.\n");
    process.exitCode = 1;
  } else {
    const client = new ArangoClient({
      url: config.databaseUrl,
      database: config.databaseName,
      username,
      password,
    });
    migrate(client).then((result) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }).catch(() => {
      process.stderr.write("Migration failed; inspect ArangoDB administration logs. No secret was written to output.\n");
      process.exitCode = 1;
    });
  }
}
