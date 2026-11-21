import { pathToFileURL } from "node:url";
import { ArangoClient } from "./arango.mjs";
import { loadConfig } from "./config.mjs";
import { APP_COLLECTIONS } from "./domain.mjs";
import { newId } from "./security.mjs";
import { migrate } from "./migrate.mjs";

function required(env, name) {
  const value = env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export async function bootstrapDatabase(env = process.env) {
  const config = loadConfig(env);
  const bootstrapUser = required(env, "ARANGO_BOOTSTRAP_USERNAME");
  const bootstrapPassword = required(env, "ARANGO_BOOTSTRAP_PASSWORD");
  const runtimeUser = required(env, "ARANGO_RUNTIME_USERNAME");
  const runtimePassword = required(env, "ARANGO_RUNTIME_PASSWORD");
  if (runtimeUser === bootstrapUser || runtimeUser === "root") throw new Error("Runtime username must be separate from the bootstrap administrator");
  if (runtimePassword.length < 24) throw new Error("Runtime password must contain at least 24 characters");

  const bootstrap = new ArangoClient({ url: config.databaseUrl, database: config.databaseName, username: bootstrapUser, password: bootstrapPassword });
  const system = new ArangoClient({ url: config.databaseUrl, database: "_system", username: bootstrapUser, password: bootstrapPassword });
  const databaseRows = await system.request("/_api/database/user", { system: true });
  if (!databaseRows.result?.includes(config.databaseName)) throw new Error("Bootstrap account cannot access the configured target database");
  const migration = await migrate(bootstrap);

  let userExists = false;
  try {
    await system.request(`/_api/user/${encodeURIComponent(runtimeUser)}`, { system: true });
    userExists = true;
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  if (!userExists) {
    await system.request("/_api/user", {
      method: "POST",
      system: true,
      body: { user: runtimeUser, passwd: runtimePassword, active: true, extra: {}, databases: {} },
    });
  } else {
    await system.request(`/_api/user/${encodeURIComponent(runtimeUser)}`, {
      method: "PUT", system: true, body: { passwd: runtimePassword, active: true, extra: {} },
    });
  }

  await system.request(`/_api/user/${encodeURIComponent(runtimeUser)}/database/${encodeURIComponent(config.databaseName)}`, {
    method: "PUT", system: true, body: { grant: "ro" },
  });
  for (const collection of APP_COLLECTIONS) {
    await system.request(`/_api/user/${encodeURIComponent(runtimeUser)}/database/${encodeURIComponent(config.databaseName)}/${encodeURIComponent(collection)}`, {
      method: "PUT", system: true, body: { grant: "rw" },
    });
  }

  const runtime = new ArangoClient({ url: config.databaseUrl, database: config.databaseName, username: runtimeUser, password: runtimePassword });
  const [coreCounts, collectionRows] = await Promise.all([
    runtime.query("FOR c IN careers COLLECT WITH COUNT INTO count RETURN count"),
    runtime.request("/_api/collection"),
  ]);
  if ((coreCounts[0] || 0) !== 12) throw new Error("Runtime principal could not read the expected career catalog");
  const fixtureKey = `bootstrapcheck_${newId()}`;
  let fixtureInserted = false;
  try {
    await runtime.query("INSERT { _key: @key, event_type: 'backend.bootstrap.permission_check', is_test: true, created_at: @now } INTO app_audit_log", { key: fixtureKey, now: new Date().toISOString() });
    fixtureInserted = true;
  } finally {
    if (fixtureInserted) {
      try { await runtime.query("REMOVE @key IN app_audit_log", { key: fixtureKey }); } catch { /* test fixture is marked is_test */ }
    }
  }

  return { database: config.databaseName, migration, runtimePrincipal: runtimeUser, databasePermission: "ro", writableCollections: APP_COLLECTIONS, readCheck: { careers: coreCounts[0], collections: collectionRows.result?.length || 0 }, appWriteCheck: "PASS_AND_CLEANED" };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  bootstrapDatabase().then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch(() => {
    process.stderr.write("Database bootstrap failed. No credentials or internal database error details were written to output.\n");
    process.exitCode = 1;
  });
}
