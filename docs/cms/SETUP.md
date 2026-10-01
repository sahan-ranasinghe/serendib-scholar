# The CMS — how it is installed

1 Oct 2026 · Phase 1 · Payload CMS 3 inside the existing Next.js app, holding no content yet.

Payload runs in the same Next.js process as the app. This phase installs it, locks it, and proves the app did not
change. It adds two collections that are not content: the people who may sign in (`users`) and a media library
(`media`) that proves the storage pipe. The lessons, the copy sheet and the spoken lines stay where
[content-inventory.md](content-inventory.md) says they are until Phase 2.

Paths below are relative to `app/`.

## Versions, and why

| Package | Version | Why this one |
| --- | --- | --- |
| `payload` | **3.90.2** | The latest stable release (23 Sep 2026). See below. |
| `@payloadcms/next` | **3.90.2** | Must equal `payload` exactly: its peer dependency is `payload: 3.90.2`. |
| `@payloadcms/db-postgres` | **3.90.2** | Same. |
| `@payloadcms/ui` | **3.90.2** | Same. |
| `@payloadcms/richtext-lexical` | **3.90.2** | Same. |
| `@payloadcms/storage-s3` | **3.90.2** | Same. |
| `graphql` | 16.14.2 | A peer dependency of `@payloadcms/next` (`^16.8.1`). |
| `next` | 16.3.3 | Unchanged: what the app already ran. |
| `react`, `react-dom` | 19.2.8 | Unchanged. |

Every Payload package is pinned without a caret, so `npm install` can never mix two Payload versions. `npm ls` shows
one copy of each, including the ones the six bring in (`@payloadcms/drizzle`, `@payloadcms/graphql`,
`@payloadcms/translations`, `@payloadcms/plugin-cloud-storage`).

**Why 3.90.2 and not an older release.** The 3.90 line is the first whose `@payloadcms/next` names this repo's Next.js:
its peer range is `>=16.3.3 <17.0.0`, and the app runs exactly 16.3.3. Releases up to 3.89.0 name `>=16.2.6`, which
also admits 16.3.3, but 3.90.0 raised the floor to 16.3.3, so 3.90 is what Payload itself tests against this Next.
`@payloadcms/ui` asks for React `^19.2.1`; the app's 19.2.8 satisfies it. Payload needs Node `^18.20.2 || >=20.9.0`;
CI runs Node 20 and the development machine Node 22.

**One override.** `payload@3.90.2` pins `undici` to exactly 7.29.0, which has a published advisory
(GHSA-pmjh-fq2x-6v4x, denial of service, fixed in 7.29.1). `package.json` overrides it to 7.29.1 for `payload` only.
Remove the override when a Payload release moves past 7.29.0.

### Known issues checked at 3.90.2 (payloadcms/payload, 1 Oct 2026)

| Issue | State | What it is | Effect here |
| --- | --- | --- | --- |
| [#4580](https://github.com/payloadcms/payload/issues/4580) | closed | On Supabase, drizzle's dev-time push "detects" schema changes that are not there. | `push: false`. The schema changes only through committed migrations. |
| [#14035](https://github.com/payloadcms/payload/issues/14035) | open | Push mode fails with `type serial does not exist` against an existing database. | Push is off, so the path is never taken. |
| [#14526](https://github.com/payloadcms/payload/issues/14526) | closed | TLS handshake failure using Supabase Storage as the S3 backend (virtual-hosted URLs). | `forcePathStyle: true` in `payload.config.mts`. Verified: `cms:check` uploads and reads back a file. |
| [#12475](https://github.com/payloadcms/payload/issues/12475) | open | `storage-s3` with the `prefix` option: the `prefix` column is missing from generated migrations. | No `prefix` is set. Do not add one without checking this issue. |
| [#12659](https://github.com/payloadcms/payload/issues/12659) | open | `storage-s3` files are served through Payload's own URL, not the bucket's. | Wanted here: the bucket is private, so a file must go through Payload's access rules. |
| [#18162](https://github.com/payloadcms/payload/issues/18162) | open | After "create first user", the account page and the user edit page crash on the server. Reproduced by others on 3.90.2 with Supabase. | "Create first user" is closed in this install (the admin is seeded), which is the trigger the reports name. `/admin/account` and the user edit page were opened in a real browser after seeding: see "Verified". |
| [#18406](https://github.com/payloadcms/payload/issues/18406) | open | When about `pool.max` updates or deletes run at once, every connection waits on the pool and the server hangs. | The pool is 5. One or two editors cannot reach it by hand; a script that sends five or more writes in parallel can. Send bulk writes one at a time until the fix (PR #18421) is released. |
| [#16939](https://github.com/payloadcms/payload/issues/16939) | open, no reproduction | An uncaught exception when Postgres ends a connection (`57P01`). | Not seen here. If the server log ever shows it after a Supabase restart, this is the issue to read. |
| [#18420](https://github.com/payloadcms/payload/issues/18420) | open | In a production build, API validation errors lose their field details. | The panel shows a toast naming the invalid field instead of marking it. Cosmetic. |
| [#18362](https://github.com/payloadcms/payload/issues/18362), [#18333](https://github.com/payloadcms/payload/issues/18333) | open | Upload problems since 3.90 with Vercel Blob storage. | Not used: storage is S3. |

No open issue was found against Next 16's `proxy.ts`, against `schemaName`, or against Supabase's session-mode
pooler.

## What is where

| Thing | Where |
| --- | --- |
| Payload's config | `payload.config.mts` |
| The panel | `/admin` — `src/app/(payload)/admin/[[...segments]]` |
| The CMS API | `/api/payload` — `src/app/(payload)/api/payload/[...slug]` (REST), `/api/payload/graphql` |
| The app | `src/app/(app)/…` (every page moved into this route group, URLs unchanged) and `src/app/api/…` (unchanged) |
| Collections, roles, access rules | `src/cms/collections/`, `src/cms/roles.ts`, `src/cms/access.ts` |
| Routes and the gate's rules | `src/cms/routes.ts`, enforced in `src/proxy.ts` |
| Migrations | `src/cms/migrations/` |
| Generated types | `src/cms/payload-types.ts` |
| Scripts | `scripts/cms-seed-admin.mts`, `scripts/cms-check.mts` |

Three choices that differ from Payload's guide, each forced by this repo:

- **`payload.config.mts`, not `.ts`, and `next.config.mjs`, not `.ts`.** Payload is ESM-only and this project is
  CommonJS. An `.mts`/`.mjs` file is ESM on every Node the project runs on, and CI is Node 20. `src/cms/package.json`
  marks that one folder as ESM for the same reason. The `payload` scripts in `package.json` pass
  `PAYLOAD_CONFIG_PATH=payload.config.mts`.
- **The app's pages moved into `src/app/(app)/`.** Payload's panel has its own root layout (its own `<html>`). Next
  allows two root layouts only when each lives in its own route group, so the app's layout, styles and pages moved
  into `(app)` beside Payload's `(payload)`. A route group does not appear in the URL: no route changed.
- **`/api/payload`, not `/api`.** The app owns `/api`. `routes: { admin: "/admin", api: "/api/payload" }`.

The app already had three pages under `/admin`: the QA galleries `/admin/board-gallery`, `/admin/design-gallery`
and `/admin/design-preview`. They are the app's, carry fixture data only, and stay as reachable as they were.
`src/cms/routes.ts` names them (`APP_ADMIN_PAGES`), and `public/sw.js` and `next.config.mjs` carry the same list;
`src/lib/cmsGate.test.ts` fails if the three lists differ.

`withPayload` adds client-hint headers (`Accept-CH`, `Vary`, `Critical-CH`) and its own `X-Powered-By` to every
route. On the app's routes those would change what a child's phone is sent, so `next.config.mjs` scopes them to
Payload's routes. The service worker never caches or answers anything under the panel.

**One trade-off, left as it is.** The app sets `experimental.staleTimes` (`dynamic: 120`) so a child's tap on a
prefetched route is instant and works offline. Next cannot scope that setting to some routes, and Payload warns at
build time that a non-zero value "may cause stale data to load within the Admin panel". In practice: moving between
panel pages without a reload can show a list up to two minutes old; a reload shows the current data. The app keeps
its setting. Phase 2 should decide whether editors need the panel on `staleTimes.dynamic: 0`.

## Environment variables

All of these live in `app/.env.local` on a development machine and in the host's environment in production. None is
committed, and none starts with `NEXT_PUBLIC_`.

| Variable | What it is |
| --- | --- |
| `DATABASE_URI` | The Supabase Postgres connection string for the **session-mode** pooler (`…pooler.supabase.com:5432`). Session mode, not transaction mode: migrations need a real session. |
| `PAYLOAD_SECRET` | Signs Payload's login tokens. Long and random. Changing it signs everyone out. |
| `S3_ENDPOINT` | Supabase Storage's S3-compatible endpoint, from the project's Storage settings in the Supabase dashboard: `https://<project-ref>.storage.supabase.co/storage/v1/s3`. |
| `S3_REGION` | The project's region, as the Supabase dashboard shows it. |
| `S3_ACCESS_KEY_ID` | An S3 access key made in the same Storage settings. |
| `S3_SECRET_ACCESS_KEY` | Its secret. |
| `S3_BUCKET` | Optional. The bucket's name; defaults to `cms-media`. |
| `ADMIN_EMAIL` | The first admin's email. Read only by `cms:seed-admin`. |
| `ADMIN_INITIAL_PASSWORD` | A password for the first sign-in only, 12 characters or more. Read only by `cms:seed-admin`. Remove it once the admin has changed their password. |
| `ACCESS_CODE` | Already in use: the app's device gate. The same code opens the door in front of `/admin`. |

## The database

- **Adapter:** `@payloadcms/db-postgres` against `DATABASE_URI`.
- **Schema:** `schemaName: "payload"`. Every table, type and index of Payload's is inside the schema `payload`.
  Payload never reads or writes `public`, where the app's tables are.
- **`push: false`.** Payload does not alter the database when the server starts, in development or in production.
  The schema changes only when someone runs a committed migration.
- **TLS:** the connection is encrypted and verified against Supabase's root certificate (`src/cms/supabaseCa.ts`,
  a public certificate, valid to April 2031).
- **Pool:** 5 connections at most. The app's own database traffic goes through Supabase's HTTP API and does not use
  this pool.

The first migration, `20260930_103853_initial`, creates the schema and nine tables:

| Table | Holds |
| --- | --- |
| `payload.users` | The people who may sign in, with their role. |
| `payload.users_sessions` | Their live sessions. |
| `payload.media` | The media library's records (the files are in the bucket). |
| `payload.payload_kv` | Payload's own key-value store. |
| `payload.payload_locked_documents` | Which document is open for editing, so two editors do not overwrite each other. |
| `payload.payload_locked_documents_rels` | Its links to users and documents. |
| `payload.payload_preferences` | Each user's panel preferences (columns, theme). |
| `payload.payload_preferences_rels` | Its links to users. |
| `payload.payload_migrations` | Which migrations have run. |

It also creates one type, `payload.enum_users_role`. The generated file has one hand edit: `CREATE SCHEMA IF NOT
EXISTS "payload"`, because the adapter creates a schema only when it creates the whole database.

### Changing the schema

1. Change a collection in `src/cms/collections/`.
2. `npm run cms:migrate:create -- <name>` writes a migration into `src/cms/migrations/`. Read it: it must name only
   `"payload"`. `src/lib/cmsGate.test.ts` fails if a migration names `public`.
3. `npm run cms:types` regenerates `src/cms/payload-types.ts`; `npm run cms:importmap` regenerates the panel's
   import map if a plugin or a custom component changed.
4. `npm run cms:migrate` runs it against the database in `DATABASE_URI`. `npm run cms:migrate:status` shows what has
   run.
5. Commit the migration, its `.json` snapshot, `index.ts` and the types together with the collection change.

In production the migration is run by a person, before the deploy that needs it. The build does not run it.

## Media

`@payloadcms/storage-s3` stores the `media` collection's files in the **private** bucket `cms-media` in Supabase
Storage, through the S3-compatible endpoint, with path-style URLs. Because the bucket is private, a file has no
public URL: it is served by Payload at `/api/payload/media/file/<name>`, under the same two locks and the same role
rules as everything else.

No image sizes, crop or focal point are configured in this phase. Nothing in the app reads the library yet.

## Who may do what

Login is by email and password. There are four roles:

| Role | Media (content) | Users |
| --- | --- | --- |
| `admin` | read, create, update, delete | read, create, update, delete (never themselves) |
| `editor` | read, create, update | their own record only |
| `reviewer` | read | their own record only |
| `viewer` | read | their own record only |

- Every collection names its own `read`, `create`, `update` and `delete` rule; none is left to Payload's default
  ("any signed-in user"). `src/lib/cmsCollections.test.ts` fails if a new collection omits one.
- No role, no access: a request with no user, or a user whose role is not one of the four, is refused everything.
- Only an admin sets or changes a role. A non-admin who sends `role: "admin"` for their own record keeps the role
  they had.
- Five wrong passwords lock an account for ten minutes. A session lasts eight hours.
- A new content collection in Phase 2 takes its rules from `content(...)` in `src/cms/access.ts`.

## The two locks on `/admin`

The panel and its API are unreachable without **both** of these:

1. **The app's device gate.** `src/proxy.ts` runs in front of `/admin` and `/api/payload`. A device must hold the
   signed `ss_device` cookie, which it earns by entering `ACCESS_CODE` once (the same gate the lesson uses). Without
   it, a page view of the panel is sent to `/device-gate` and returned to where it was going afterwards; every other
   request is refused with 401. A stranger with the URL does not see Payload's login form.
2. **Payload's own login.** Past the gate, Payload asks for an email and a password, then applies the role rules.

Either one alone opens nothing: the right email and password from a device with no grant get 401, and a device
with the grant but no login gets the login form.

"Create first user" (`/admin/create-first-user` and `/api/payload/users/first-register`) is closed to everyone with
403. With an empty `users` table Payload would offer it to whoever arrives; here the first admin comes only from
the seed script. Payload matches its own endpoints without regard to case (`/users/First-Register` is the same
endpoint), so the gate folds case and percent-encoding before it compares.

The panel's API is counted in its own rate-limit bucket (300 requests a minute per IP), separate from the 60 a
minute a child's phone lives on.

### The dead-control crawler stays out

`scripts/crawl-check.ts` clicks every control on every app screen. In the panel that would save, delete and sign
out, so it never goes in: its route list contains no CMS route, a control whose link leads into the CMS is recorded
and not clicked, and every request the crawl's browser makes is watched. One request to `/admin` (Payload's) or
`/api/payload` fails the run.

## The first admin

`npm run cms:seed-admin` creates one user with the role `admin` from `ADMIN_EMAIL` and `ADMIN_INITIAL_PASSWORD`.
It is safe to run again: an account that already exists is left as it is, password included. It prints neither
value.

After the first sign-in, change the password on `/admin/account`, then remove `ADMIN_INITIAL_PASSWORD` from the
environment.

## Setting it up from nothing

1. Put the variables above in `app/.env.local`.
2. In the Supabase dashboard, create a **private** bucket named `cms-media`.
3. `npm ci`
4. `npm run cms:migrate` — creates the schema `payload` and its tables.
5. `npm run cms:seed-admin` — creates the first admin.
6. `npm run build`, then `npx next start -p 3001`.
7. Open `http://localhost:3001/admin`. Enter the access code, then sign in.
8. `npm run cms:check -- http://localhost:3001` — proves the installation.

## Checking it

`npm run cms:check [-- <baseUrl>]` proves the installation against the real database, bucket and server:

- **Database:** the schema `payload` holds exactly the nine tables; nothing of Payload's is in `public`; every
  committed migration has run; the seeded admin exists.
- **Roles:** as each of the four roles, through Payload's own access evaluation, who may create, update and delete
  media and users, and that nobody can promote themselves.
- **Bucket:** `cms-media` is private; a file uploaded through Payload lands in it and has no public URL.
- **The two locks** (with a base URL): no grant, the grant alone, Payload's login alone, and both.

It creates three or four users named `cms-check+…@example.invalid` and a few 1×1 images, and deletes them before it
exits. It signs in as `ADMIN_EMAIL` with `ADMIN_INITIAL_PASSWORD`; once that password has been changed, the
signed-in checks are reported as skipped.

The unit tests `src/lib/cmsRoles.test.ts`, `src/lib/cmsCollections.test.ts` and `src/lib/cmsGate.test.ts` run with
every other test in CI.

## Verified, 1 Oct 2026

Against the live database and bucket, and a production build (`next build`, `next start -p 3001`) of this tree.

**The CMS**

- `npm run cms:migrate:status`: `20260930_103853_initial`, batch 1, ran. `npm run cms:migrate:create -- --skip-empty`
  wrote nothing: the collections and the migration agree.
- `npm run cms:seed-admin`: created the admin; a second run left the account as it was.
- `npm run cms:check -- http://localhost:3001`: 27/27. The schema `payload` holds the nine tables and nothing of
  Payload's is in `public`; the four roles do what the table above says; `cms-media` is private and an uploaded file
  has no public URL; `/admin` and `/api/payload` are closed without the device grant, closed with Payload's login
  alone, and open with both.
- A real browser (headless Chromium): `/admin` → the device gate → the access code → Payload's login → the dashboard
  with Users and Media. `/admin/account`, the users list, the media list and the user edit page all rendered, with
  no page errors (issue #18162 does not occur here). `/admin/logout` returned to the login.
- Twenty-one spellings of the CMS's paths with no grant (encoded, upper-case, doubled slashes, `..`): none reached
  the panel or the API.

**The app, unchanged**

| Check | Result |
| --- | --- |
| Typecheck | clean |
| Unit tests | 268/268 (249 before, plus the 19 CMS tests) |
| Lint | 8 errors, 15 warnings: the same 23 findings as the commit before, none added |
| `dry-run:lesson` | exit 0: 25 PASS, 0 FAIL, 0 NOT COVERED |
| `session:check --drills` | exit 0: 41/41 drills, cluster A/G 14/14, session 1 complete, 0 overlaps, 141 clips never two at once, 0 paid calls. This was the second run. The first failed one drill (40/41): the feedback clip's fetch timed out, so her line was not seen within 4 s; the same drill showed it at +45 ms on the second run. |
| `crawl:check` | exit 0: 16 routes, 129 controls, 0 dead, 0 overflows, cluster M 21/21, 0 requests to the CMS |
| `design:check` | exit 0: PASS |
| `board:check` | **exit 1, one failure, and the same failure on the commit before.** `strokes/phone/pointer-card`: the hand for `number:528` has no clean spot and waits out of sight; it is reported hidden, or as appearing 1306–1319 ms after the tap against a 1300 ms limit (five runs). The commit before (89d19bc), built and run the same way, fails the same audit three runs out of three (1334, 1346, 1369 ms). Everything else passes on both: 0 overlaps in 506 frames, 100 screenshots, 18 rings complete. Not caused by this change and not fixed by it. |

The first `next build` failed once with `next/font/google queries have exactly one entry` (the font download);
the second succeeded with no change.
