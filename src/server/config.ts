import "server-only";

export type ServerConfig = {
  /** PostgreSQL connection string. Null means the Passport service is not configured. */
  databaseUrl: string | null;
  /** Public origin, e.g. "https://chog.example". Required for sign-in and write requests. */
  appOrigin: string | null;
  /** Secret (32+ chars) used to sign the sign-in nonce cookie. */
  sessionSecret: string | null;
  /** Monad RPC endpoint for on-chain verification. Null means on-chain evidence is unavailable. */
  monadRpcUrl: string | null;
};

function read(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key]?.trim();
  return value ? value : null;
}

function readOrigin(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Reads configuration from the environment. Invalid values are treated as missing, never guessed. */
export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const secret = read(env, "SESSION_SECRET");
  return {
    databaseUrl: read(env, "DATABASE_URL"),
    appOrigin: readOrigin(read(env, "APP_ORIGIN")),
    sessionSecret: secret && secret.length >= 32 ? secret : null,
    monadRpcUrl: readOrigin(read(env, "MONAD_RPC_URL")) ? read(env, "MONAD_RPC_URL") : null,
  };
}
