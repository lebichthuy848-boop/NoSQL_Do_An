import { createInterface } from "node:readline/promises";
import { stdin, stdout, stderr } from "node:process";
import { pathToFileURL } from "node:url";
import { ArangoClient } from "./arango.mjs";
import { AuthService } from "./auth.mjs";
import { loadConfig } from "./config.mjs";

async function readHidden(prompt) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") throw new Error("Admin creation requires an interactive terminal");
  stdout.write(prompt);
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error = null) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      stdout.write("\n");
      error ? reject(error) : resolve(value);
    };
    const onData = (chunk) => {
      for (const char of String(chunk)) {
        if (char === "\u0003") return finish(new Error("Canceled"));
        if (char === "\r" || char === "\n") return finish();
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else if (char >= " " && char <= "~") value += char;
      }
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

export async function createInitialAdmin({ env = process.env, prompt = readHidden } = {}) {
  const config = loadConfig(env);
  const username = env.ARANGO_BOOTSTRAP_USERNAME;
  const password = env.ARANGO_BOOTSTRAP_PASSWORD;
  if (!username || !password) throw new Error("ARANGO_BOOTSTRAP_USERNAME and ARANGO_BOOTSTRAP_PASSWORD are required");
  const db = new ArangoClient({ url: config.databaseUrl, database: config.databaseName, username, password });
  const count = await db.query("RETURN LENGTH(FOR user IN app_users FILTER user.role == 'admin' AND user.status == 'active' RETURN 1)");
  if ((count[0] || 0) > 0) throw new Error("An active administrator already exists; create additional admins through the authenticated admin API");
  const rl = createInterface({ input: stdin, output: stdout });
  let email;
  let displayName;
  try {
    email = (await rl.question("Admin email: ")).trim();
    displayName = (await rl.question("Display name: ")).trim();
  } finally {
    rl.close();
  }
  const first = await prompt("Password (input hidden): ");
  const second = await prompt("Confirm password (input hidden): ");
  if (first !== second) throw new Error("Passwords do not match");
  const auth = new AuthService({ db, config });
  const user = await auth.createUser({ email, password: first, displayName, role: "admin", actor: null });
  stdout.write(`${JSON.stringify({ created: true, id: user._key, email: user.email, role: user.role })}\n`);
  return user;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  if (process.argv[2] !== "create-initial-admin") {
    stderr.write("Usage: node src/cli.mjs create-initial-admin\n");
    process.exitCode = 2;
  } else {
    createInitialAdmin().catch(() => {
      stderr.write("Initial admin creation failed. No credential or internal database details were written to output.\n");
      process.exitCode = 1;
    });
  }
}
