# mike-t-4b46-ai-news-01 Product Contract

## What It Is

`mike-t-4b46-ai-news-01` is a Next.js application for publishing AI news content organized into subspaces, posts, and tags. It serves public, SEO-friendly pages and an admin content-management surface.

## Current Capabilities

- Public home page with site name/slogan, subspace directory, and latest-post feed.
- Public subspace directory and subspace detail routes at `/s/[slug]`.
- Public post detail routes at `/s/[slug]/[postId]` with sanitized rendered markdown, author attribution, and tag links.
- Public tag directory and tag detail pages at `/t/[slug]`.
- Admin sign-in using a fixed `ADMIN_PASSWORD` and database-backed admin session cookie.
- myClawTeam auth integration for user sessions via the `mctai_session` cookie and JWKS verification.
- Admin subspace create/update/delete UI.
- Admin post create/update/delete UI with raw markdown editing, media upload insertion, tag selection, and delete confirmation.
- Server actions enforce ownership/admin authorization: authors can manage their own posts, admins can manage any post.
- Media uploads go to private S3-compatible object storage and are returned as presigned URLs.
- Dynamic metadata, Open Graph tags, JSON-LD site/article structured data, sitemap, robots.txt, loading states, error states, and not-found handling.
- Unit tests cover auth/authorization helpers, markdown rendering/sanitization, and slug logic.
- Playwright E2E test covers the core admin publishing flow when PostgreSQL and env are reachable.

## Architecture And Data

- Framework: Next.js App Router with React 19 and TypeScript.
- Database: PostgreSQL only, accessed through Prisma 7 and `@prisma/adapter-pg`.
- Persistent models: `User`, `Account`, `Session`, `Subspace`, `Post`, `Tag`, and join table `PostTag`.
- Markdown rendering uses `marked` plus `sanitize-html`.
- Object storage uses AWS SDK v3 with vendor-neutral `OBJECT_STORAGE_*` env vars.
- Deployment listens on `0.0.0.0:8080`.

## Required Conventions

- All persistent state belongs in PostgreSQL. Do not add SQLite, JSON-file persistence, in-memory persistence, or ephemeral volume storage.
- All uploaded files belong in S3-compatible object storage. Store object keys, not public bucket URLs.
- Every S3 key must prepend `OBJECT_STORAGE_PREFIX`; the configured prefix must end with `/`.
- Private media must be displayed with presigned GET URLs.
- Do not implement direct Google OAuth. Use the myClawTeam auth service variables: `MCTAI_AUTH_URL`, `MCTAI_AUTH_APP_TOKEN`, and `MCTAI_AUTH_JWKS_URL`.
- Do not add an app-issued JWT layer over `mctai_session`.
- Validate deployment env with `npm run validate:env` before migrations, build, and start.

## Operations

- Install: `npm ci`
- Validate env: `npm run validate:env`
- Apply migrations: `npm run prisma:migrate:deploy`
- Build: `npm run build`
- Start: `npm start`
- Checks: `npm run format:check`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`
- E2E: `npm run e2e`
