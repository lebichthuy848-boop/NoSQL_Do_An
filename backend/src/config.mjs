const DEFAULT_ORIGINS = [];

export function loadConfig(env = process.env) {
  const databaseUrl = env.ARANGO_URL || "http://127.0.0.1:39529";
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("ARANGO_URL must be a valid URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("ARANGO_URL must be an HTTP(S) origin without credentials, query, or fragment");
  }

  const origins = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  for (const origin of origins) {
    const normalized = new URL(origin);
    if (!["http:", "https:"].includes(normalized.protocol) || normalized.origin !== origin) {
      throw new Error("ALLOWED_ORIGINS entries must be exact origins");
    }
  }

  const port = Number(env.PORT || 3000);
  const sessionTtlSeconds = Number(env.SESSION_TTL_SECONDS || 8 * 60 * 60);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be 1–65535");
  if (!Number.isInteger(sessionTtlSeconds) || sessionTtlSeconds < 300 || sessionTtlSeconds > 30 * 24 * 60 * 60) {
    throw new Error("SESSION_TTL_SECONDS is outside the supported range");
  }

  return Object.freeze({
    databaseUrl: parsed.origin,
    databaseName: env.ARANGO_DATABASE || "skill_graph_v366_acceptance",
    databaseUser: env.ARANGO_USERNAME || "",
    databasePassword: env.ARANGO_PASSWORD || "",
    port,
    host: env.HOST || "0.0.0.0",
    allowedOrigins: origins.length ? origins : DEFAULT_ORIGINS,
    sessionTtlSeconds,
    cookieName: "sg_session",
    cookieSecure: env.COOKIE_SECURE === "true" || (env.COOKIE_SECURE !== "false" && env.NODE_ENV === "production"),
    nodeEnv: env.NODE_ENV || "development",
    emailDeliveryConfigured: env.EMAIL_DELIVERY_CONFIGURED === "true",
  });
}
