import "dotenv/config";

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

export function optionalEnv(name, fallback) {
  const value = process.env[name];
  return value ?? fallback;
}

