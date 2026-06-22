#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_ENV_FILE = ".env.production";
const PLACEHOLDER_PATTERNS = [
  /^app_token_from_myclawteam$/i,
  /^object-storage-/i,
  /^replace-with-/i,
  /^postgresql:\/\/USER:PASSWORD@HOST/i,
];

const requiredEnv = [
  "ADMIN_PASSWORD",
  "AI_NEWS_BOT_API_TOKEN",
  "DATABASE_URL",
  "MCTAI_AUTH_APP_TOKEN",
  "MCTAI_AUTH_JWKS_URL",
  "MCTAI_AUTH_URL",
  "OBJECT_STORAGE_ACCESS_KEY_ID",
  "OBJECT_STORAGE_BUCKET",
  "OBJECT_STORAGE_ENDPOINT",
  "OBJECT_STORAGE_FORCE_PATH_STYLE",
  "OBJECT_STORAGE_PREFIX",
  "OBJECT_STORAGE_REGION",
  "OBJECT_STORAGE_SECRET_ACCESS_KEY",
  "SELF_URL",
];

const urlEnv = [
  "MCTAI_AUTH_JWKS_URL",
  "MCTAI_AUTH_URL",
  "OBJECT_STORAGE_ENDPOINT",
  "SELF_URL",
];

function parseDotEnvLine(line) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);

  if (!match) {
    return null;
  }

  let value = match[2].trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [match[1], value];
}

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return;
  }

  const contents = readFileSync(path, "utf8");

  for (const line of contents.split(/\r?\n/)) {
    const entry = parseDotEnvLine(line);

    if (!entry) {
      continue;
    }

    const [key, value] = entry;

    process.env[key] ??= value;
  }
}

function getEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value))) {
    throw new Error(
      `Environment variable ${name} still contains a placeholder`,
    );
  }

  return value;
}

function validateUrl(name) {
  try {
    new URL(getEnv(name));
  } catch {
    throw new Error(`Environment variable ${name} must be a valid URL`);
  }
}

function validateDatabaseUrl() {
  const value = getEnv("DATABASE_URL");
  const url = new URL(value);

  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error(
      "DATABASE_URL must use the postgres:// or postgresql:// scheme",
    );
  }
}

function validateObjectStoragePrefix() {
  const prefix = getEnv("OBJECT_STORAGE_PREFIX");

  if (!prefix.endsWith("/")) {
    throw new Error('OBJECT_STORAGE_PREFIX must end with "/"');
  }

  if (prefix.startsWith("/")) {
    throw new Error("OBJECT_STORAGE_PREFIX must be a relative prefix");
  }
}

function validateObjectStorageEndpoint() {
  const endpoint = getEnv("OBJECT_STORAGE_ENDPOINT");

  if (endpoint.includes("s3.invalid")) {
    throw new Error(
      "OBJECT_STORAGE_ENDPOINT must not use a fabricated endpoint",
    );
  }

  validateUrl("OBJECT_STORAGE_ENDPOINT");
}

function validateBoolean(name) {
  const value = getEnv(name).toLowerCase();

  if (value !== "true" && value !== "false") {
    throw new Error(`Environment variable ${name} must be "true" or "false"`);
  }
}

function validateAdminPassword() {
  const value = getEnv("ADMIN_PASSWORD");

  if (value.length < 16) {
    throw new Error("ADMIN_PASSWORD must be at least 16 characters");
  }
}

function validateBotApiToken() {
  const value = getEnv("AI_NEWS_BOT_API_TOKEN");

  if (value.length < 32) {
    throw new Error("AI_NEWS_BOT_API_TOKEN must be at least 32 characters");
  }
}

function validateNoGoogleOAuthSecrets() {
  const forbidden = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_SECRET",
  ].filter((name) => process.env[name]?.trim());

  if (forbidden.length > 0) {
    throw new Error(
      `Remove direct Google OAuth env vars; use myClawTeam auth instead: ${forbidden.join(", ")}`,
    );
  }
}

const envFile = process.argv[2] ?? DEFAULT_ENV_FILE;
loadEnvFile(resolve(process.cwd(), envFile));

for (const name of requiredEnv) {
  getEnv(name);
}

for (const name of urlEnv) {
  validateUrl(name);
}

validateDatabaseUrl();
validateObjectStoragePrefix();
validateObjectStorageEndpoint();
validateBoolean("OBJECT_STORAGE_FORCE_PATH_STYLE");
validateAdminPassword();
validateBotApiToken();
validateNoGoogleOAuthSecrets();

console.log(`Environment validation passed (${requiredEnv.length} variables).`);
