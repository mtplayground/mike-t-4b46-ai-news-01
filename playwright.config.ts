import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8080";
const databaseUrl =
  process.env.DATABASE_URL ??
  readFileSync(resolve(process.cwd(), ".database_url"), "utf8").trim();
const adminPassword =
  process.env.E2E_ADMIN_PASSWORD ?? "playwright-admin-password";
const readinessURL = `${baseURL}/sign-in`;

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
    command: "npm run dev",
    env: {
      ...process.env,
      ADMIN_PASSWORD: adminPassword,
      DATABASE_URL: databaseUrl,
      MCTAI_AUTH_APP_TOKEN: process.env.MCTAI_AUTH_APP_TOKEN,
      MCTAI_AUTH_JWKS_URL: process.env.MCTAI_AUTH_JWKS_URL,
      MCTAI_AUTH_URL: process.env.MCTAI_AUTH_URL,
      SELF_URL: baseURL,
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: readinessURL,
  },
});
