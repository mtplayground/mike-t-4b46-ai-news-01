# mike-t-4b46-ai-news-01

Next.js application for publishing AI news subspaces, posts, tags, media uploads, and public SEO-friendly pages.

## Requirements

- Node.js 20 or newer.
- PostgreSQL 16 or compatible PostgreSQL database.
- S3-compatible private object storage. The deployed myClawTeam environment uses Tigris.
- myClawTeam auth service settings for browser sign-in.
- Rust toolchain for the Axum API binary.

Persistent application state must live in PostgreSQL. Uploaded media must live in object storage. Do not use SQLite, local disk uploads, in-memory maps, JSON files, or ephemeral volumes for production data.

## Environment

Copy `.env.example` to your deployment environment and replace every placeholder before starting the app.

Required variables:

| Variable                           | Purpose                                                    |
| ---------------------------------- | ---------------------------------------------------------- |
| `DATABASE_URL`                     | PostgreSQL connection string used by Prisma.               |
| `SELF_URL`                         | Public origin for canonical URLs and auth return targets.  |
| `PORT`                             | Public coordinated gateway port. Use `8080` in production. |
| `NEXT_PORT`                        | Internal Next.js port. Defaults to `3000`.                 |
| `AXUM_PORT`                        | Internal Axum API port. Defaults to `8081`.                |
| `MCTAI_AUTH_URL`                   | myClawTeam auth service origin.                            |
| `MCTAI_AUTH_APP_TOKEN`             | App token registered with myClawTeam auth.                 |
| `MCTAI_AUTH_JWKS_URL`              | JWKS endpoint used to verify `mctai_session`.              |
| `ADMIN_PASSWORD`                   | Fixed admin login password for content management.         |
| `OBJECT_STORAGE_ACCESS_KEY_ID`     | Object storage access key.                                 |
| `OBJECT_STORAGE_SECRET_ACCESS_KEY` | Object storage secret key.                                 |
| `OBJECT_STORAGE_BUCKET`            | Private bucket name.                                       |
| `OBJECT_STORAGE_PREFIX`            | Required object-key prefix. Must end with `/`.             |
| `OBJECT_STORAGE_ENDPOINT`          | S3-compatible endpoint URL.                                |
| `OBJECT_STORAGE_REGION`            | Storage region. Use `auto` for Tigris.                     |
| `OBJECT_STORAGE_FORCE_PATH_STYLE`  | `true` or `false`; use `true` for Tigris.                  |

The app intentionally uses the vendor-neutral `OBJECT_STORAGE_*` names. The storage code prepends `OBJECT_STORAGE_PREFIX` to every S3 `PutObject` and `GetObject` key and returns presigned read URLs for private media.

Direct Google OAuth credentials do not belong in this app. Browser login must go through the myClawTeam auth service and the backend verifies the `mctai_session` cookie.

## Validate Configuration

Run validation before migrations, builds, and process start:

```bash
npm run validate:env
```

By default this reads `.env.production` if it exists, then falls back to already exported process environment variables. To validate a different filled environment file:

```bash
node scripts/validate-env.mjs .env.staging
```

The validator fails on missing values, placeholder values, invalid URLs, non-PostgreSQL database URLs, invalid boolean values, object storage prefixes without a trailing slash, fabricated storage endpoints, short admin passwords, and direct Google OAuth secret variables.

## Production Topology

The production entrypoint is `node scripts/start-coordinated.mjs`. It keeps the public app on `0.0.0.0:8080` and runs two internal services:

- Next.js on `127.0.0.1:3000` for pages, assets, metadata, and any Next API routes that have not been migrated yet.
- Axum on `127.0.0.1:8081` for the Rust API.

The gateway routes every `/api/*` request to Axum first. While the migration is in progress, a `404` from Axum falls back to Next so existing Next API routes continue to work until their Axum replacements are implemented and the old routes are removed. Non-API requests always go directly to Next. Public traffic should only target `:8080`; `NEXT_PORT` and `AXUM_PORT` are loopback-only implementation details.

Override `PORT`, `NEXT_PORT`, or `AXUM_PORT` only when another local process already uses the default. Keep `SELF_URL` set to the externally reachable origin, not an internal loopback URL.

## Production Build

Install dependencies, validate configuration, apply migrations, and build both Next.js and Axum:

```bash
npm ci
npm run validate:env
npm run prisma:migrate:deploy
npm run build
```

`npm run build` runs `next build` and `cargo build --release`. Start the coordinated production gateway:

```bash
npm start
```

`npm start` validates the environment, starts the Axum binary and Next.js on loopback ports, and exposes the gateway on `0.0.0.0:8080`. Put your reverse proxy or platform router in front of that port and set `SELF_URL` to the externally reachable HTTPS origin.

## Local Development

For local work:

```bash
npm install
npm run prisma:migrate:dev
npm run dev
```

The development server listens on `0.0.0.0:8080`.

## Verification

Useful checks before deployment:

```bash
npm run format:check
npm run typecheck
npm run lint
npm test
npm run build
```

The E2E suite is available with:

```bash
npm run e2e
```

It starts the local Next.js server, signs in as admin, creates a subspace, creates a tagged media post, and verifies the rendered public post page. It requires a reachable PostgreSQL database and valid application environment.
