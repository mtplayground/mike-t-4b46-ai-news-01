import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8080";
const databaseUrl =
  process.env.DATABASE_URL ??
  readFileSync(resolve(process.cwd(), ".database_url"), "utf8").trim();
const adminPassword =
  process.env.E2E_ADMIN_PASSWORD ?? "playwright-admin-password";
const readinessURL = `${baseURL}/api/health`;

process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? adminPassword;
process.env.DATABASE_URL = databaseUrl;
process.env.MCTAI_AUTH_APP_TOKEN =
  process.env.MCTAI_AUTH_APP_TOKEN ?? "playwright-app-token";
process.env.MCTAI_AUTH_JWKS_URL =
  process.env.MCTAI_AUTH_JWKS_URL ?? "https://auth.example.test/jwks.json";
process.env.MCTAI_AUTH_URL =
  process.env.MCTAI_AUTH_URL ?? "https://auth.example.test";
process.env.SELF_URL = process.env.SELF_URL ?? baseURL;

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  reporter: [["list"]],
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev:coordinated",
    env: {
      ...process.env,
      ADMIN_PASSWORD: adminPassword,
      AXUM_HOST: "127.0.0.1",
      AXUM_MODE: "cargo",
      AXUM_PORT: "8081",
      DATABASE_URL: databaseUrl,
      HOST: "127.0.0.1",
      MCTAI_AUTH_APP_TOKEN: process.env.MCTAI_AUTH_APP_TOKEN,
      MCTAI_AUTH_JWKS_URL: process.env.MCTAI_AUTH_JWKS_URL,
      MCTAI_AUTH_URL: process.env.MCTAI_AUTH_URL,
      NEXT_HOST: "127.0.0.1",
      NEXT_MODE: "dev",
      NEXT_PORT: "3000",
      PORT: "8080",
      SELF_URL: baseURL,
    },
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    url: readinessURL,
  },
});
