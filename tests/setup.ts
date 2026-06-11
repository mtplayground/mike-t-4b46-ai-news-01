import { readFileSync } from "node:fs";
import { resolve } from "node:path";

process.env.ADMIN_PASSWORD ??= "test-admin-password";
process.env.DATABASE_URL ??= readFileSync(
  resolve(process.cwd(), ".database_url"),
  "utf8",
).trim();
process.env.MCTAI_AUTH_APP_TOKEN ??= "test-app-token";
process.env.MCTAI_AUTH_JWKS_URL ??= "https://auth.example.test/jwks.json";
process.env.MCTAI_AUTH_URL ??= "https://auth.example.test";
