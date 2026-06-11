# mike-t-4b46-ai-news-01 Product Contract

## What It Is

`mike-t-4b46-ai-news-01` is a Next.js application for publishing AI news content organized by subspace, post, and tag. It provides public SEO-friendly reading pages plus an authenticated/admin content-management surface.

## Current Capabilities

- Public home page with AI News branding, latest posts, and subspace discovery.
- Public subspace directory and subspace detail pages at `/subspaces` and `/s/[slug]`.
- Public post detail pages at `/s/[slug]/[postId]` with sanitized markdown rendering, author attribution, and tag links.
- Public tag directory and tag detail pages at `/tags` and `/t/[slug]`.
- Sign-in page with myClawTeam/Google auth handoff and admin password sign-in.
- Admin sign-in with `ADMIN_PASSWORD`, database-backed admin session cookie, and fixed admin role/user bootstrap.
- Admin UI for creating, editing, and deleting subspaces.
- Admin/authenticated post editor for creating, editing, deleting, tagging, and assigning posts to subspaces.
- Markdown media uploader that stores image/video uploads in private S3-compatible object storage and inserts presigned URLs into post markdown.
- Server actions enforce authorization: admins can manage all content; authenticated authors can manage their own posts.
- Dynamic metadata, Open Graph data, JSON-LD site/article structured data, sitemap, robots.txt, route loading/error states, and not-found handling.
- Unit tests cover auth/authorization helpers, markdown rendering/sanitization, and slug logic; Playwright covers the core admin publishing flow when full env and PostgreSQL are available.

## Architecture And Data

- Framework: Next.js App Router with React 19 and TypeScript.
- Styling: Tailwind CSS through the global Next stylesheet.
- Database: PostgreSQL only, accessed through Prisma 7 and `@prisma/adapter-pg`.
- Persistent models: `User`, `Account`, `Session`, `Subspace`, `Post`, `Tag`, and join table `PostTag`.
- Auth: myClawTeam sessions are verified from the `mctai_session` JWT cookie using JWKS; admin sessions are stored in PostgreSQL.
- Markdown: `marked` renders markdown and `sanitize-html` restricts output.
- Object storage: AWS SDK v3 writes private objects using vendor-neutral `OBJECT_STORAGE_*` env vars and always returns presigned reads.
- Deployment: production starts with `npm start`, validates env first, and listens on `0.0.0.0:8080`.

## Required Conventions

- All persistent state belongs in PostgreSQL. Do not add SQLite, JSON-file persistence, in-memory persistence, or ephemeral volume storage.
- Uploaded files belong in S3-compatible object storage. Store object keys/relative keys, not public bucket URLs.
- Every S3 key must prepend `OBJECT_STORAGE_PREFIX`; the configured prefix must end with `/`.
- Private media must be displayed through presigned GET URLs.
- Do not implement direct Google OAuth in this app. Browser login must go through the myClawTeam auth service using `MCTAI_AUTH_URL`, `MCTAI_AUTH_APP_TOKEN`, and `MCTAI_AUTH_JWKS_URL`.
- Do not add an app-issued JWT layer over `mctai_session`.
- Links that hand off to auth/API redirects should use plain anchors or otherwise avoid Next prefetch/RSC fetches, so the browser does not attempt cross-origin auth redirects as fetch requests.
- Validate deployment env with `npm run validate:env` before migrations, build, and start.

## Operations

- Install: `npm ci`
- Validate env: `npm run validate:env`
- Apply migrations: `npm run prisma:migrate:deploy`
- Build: `npm run build`
- Start: `npm start`
- Checks: `npm run format:check`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`
- E2E: `npm run e2e`
