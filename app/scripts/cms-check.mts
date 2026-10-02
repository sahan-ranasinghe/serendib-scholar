/**
 * `npm run cms:check [-- <baseUrl>]` — the CMS installation, proved against the real thing (docs/cms/SETUP.md).
 *
 *   1. THE DATABASE  every table of Payload's is in the schema "payload"; none of its bookkeeping is in `public`;
 *                    every committed migration has run; the seeded admin exists.
 *   2. THE ROLES     through Payload's own access evaluation (the Local API with overrideAccess off), as each of the
 *                    four roles: who may create / update / delete media and users, and that nobody promotes themselves.
 *   3. THE BUCKET    "cms-media" exists and is private; a file uploaded through Payload lands in it and has no public URL.
 *   4. THE TWO LOCKS (only with a <baseUrl> — a running production build) /admin and /api/payload with no device
 *                    grant, with the grant alone, with Payload's login alone, and with both; "create first user" closed;
 *                    the app's own pages untouched by Payload's headers.
 *
 * It writes to the live database and bucket only what it removes again: a few users named cms-check+<role>@… and a
 * few 1×1 PNGs, deleted in a `finally`. Step 4 signs in as the check's OWN temporary admin, with a password made for
 * this run — never as the real admin, whose password the check does not know and does not need (the seed password is
 * changed and removed from the environment after the first sign-in). No secret is printed.
 *
 * `.mts` and run through `payload run`, like the seed script: Payload is ESM-only.
 */
import config from "@payload-config";
import { createClient } from "@supabase/supabase-js";
import { getPayload } from "payload";
import { ROLES, type Role } from "../src/cms/roles";
import { APP_ADMIN_PAGES } from "../src/cms/routes";
import { migrations } from "../src/cms/migrations/index";

const BASE = process.argv.find((a) => a.startsWith("http"))?.replace(/\/$/u, "") ?? null;
const BUCKET = process.env.S3_BUCKET || "cms-media";
const STAMP = Date.now().toString(36);
/** A 1×1 transparent PNG. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

interface Check { part: string; name: string; ok: boolean | null; detail: string }
const checks: Check[] = [];
const add = (part: string, name: string, ok: boolean | null, detail: string) => checks.push({ part, name, ok, detail });

const payload = await getPayload({ config });
const pool = (payload.db as unknown as { pool: { query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> } }).pool;
const rows = async (text: string, values?: unknown[]) => (await pool.query(text, values)).rows;

/** Does Payload let `user` do this? true / false (Forbidden) — anything else is a real error and is thrown. */
const allowed = async (run: () => Promise<unknown>): Promise<boolean> => {
  try {
    await run();
    return true;
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 403 || status === 404 || status === 401) return false;
    throw error;
  }
};

const tempUsers: Array<{ id: number; role: Role; email: string }> = [];
/** The check's own admin, and the password made for it this run: what step 4 signs in with. */
let checkAdmin: { email: string; password: string } | null = null;

try {
  // ── 1. the database ────────────────────────────────────────────────────────────────────────────────────────────
  const tables = (await rows(`select table_name from information_schema.tables where table_schema = 'payload' order by table_name`)).map((r) => String(r.table_name));
  console.log(`\nschema "payload" — ${tables.length} tables:`);
  for (const table of tables) console.log(`    ${table}`);
  const expected = ["media", "payload_kv", "payload_locked_documents", "payload_locked_documents_rels", "payload_migrations", "payload_preferences", "payload_preferences_rels", "users", "users_sessions"];
  add("database", `the schema "payload" holds Payload's ${expected.length} tables and nothing else`, JSON.stringify(tables) === JSON.stringify(expected), tables.join(", "));
  const strays = (await rows(`select table_name from information_schema.tables where table_schema = 'public' and (table_name like 'payload\\_%' or table_name = 'users_sessions')`)).map((r) => String(r.table_name));
  const strayTypes = (await rows(`select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname like 'enum\\_users\\_%'`)).map((r) => String(r.typname));
  add("database", "nothing of Payload's is in `public`", strays.length === 0 && strayTypes.length === 0, strays.length + strayTypes.length === 0 ? "no payload_* table, no users_sessions, no enum_users_* type" : [...strays, ...strayTypes].join(", "));
  const ran = (await rows(`select name, batch from payload.payload_migrations order by id`)).map((r) => String(r.name));
  const committed = migrations.map((m) => m.name);
  add("database", "every committed migration has run, and nothing else has (push is off)", JSON.stringify(ran) === JSON.stringify(committed), `ran: ${ran.join(", ") || "none"} · committed: ${committed.join(", ")}`);
  const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const admins = await payload.find({ collection: "users", where: { role: { equals: "admin" } }, limit: 50, depth: 0 });
  const seeded = admins.docs.some((u) => u.email === adminEmail);
  add("database", "the first admin (ADMIN_EMAIL) exists, with the role admin", !!adminEmail && seeded, `${admins.totalDocs} admin(s); ADMIN_EMAIL ${adminEmail ? (seeded ? "is one of them" : "is NOT among them — run `npm run cms:seed-admin`") : "is not set"}`);

  // ── 2. the roles, through Payload's own access evaluation ──────────────────────────────────────────────────────
  for (const role of ROLES) {
    const email = `cms-check+${role}-${STAMP}@example.invalid`;
    const password = `${STAMP}-${Math.random().toString(36).slice(2)}-Aa1!`;
    const made = await payload.create({ collection: "users", data: { email, password, role } });
    tempUsers.push({ id: made.id, role, email });
    if (role === "admin") checkAdmin = { email, password };
  }
  const as = (role: Role) => ({ ...tempUsers.find((u) => u.role === role)!, collection: "users" as const });
  const file = (name: string) => ({ data: PNG, mimetype: "image/png", name, size: PNG.length });
  const seed = await payload.create({ collection: "media", data: { alt: "cms-check" }, file: file(`cms-check-${STAMP}.png`) });

  const matrix: Record<string, string[]> = {};
  for (const role of ROLES) {
    const user = as(role);
    const can: string[] = [];
    if (await allowed(() => payload.findByID({ collection: "media", id: seed.id, overrideAccess: false, user }))) can.push("read");
    if (await allowed(() => payload.create({ collection: "media", data: { alt: role }, file: file(`cms-check-${STAMP}-${role}.png`), overrideAccess: false, user }))) can.push("create");
    if (await allowed(() => payload.update({ collection: "media", id: seed.id, data: { alt: `by ${role}` }, overrideAccess: false, user }))) can.push("update");
    matrix[role] = can;
  }
  // Delete last, on a file of its own per role, so one role's delete never decides the next role's verdict.
  for (const role of ROLES) {
    const victim = await payload.create({ collection: "media", data: { alt: "to delete" }, file: file(`cms-check-${STAMP}-del-${role}.png`) });
    if (await allowed(() => payload.delete({ collection: "media", id: victim.id, overrideAccess: false, user: as(role) }))) matrix[role]!.push("delete");
  }
  const mediaWant = { admin: ["read", "create", "update", "delete"], editor: ["read", "create", "update"], reviewer: ["read"], viewer: ["read"] };
  add("roles", "media: admin all · editor creates and changes · reviewer and viewer read", JSON.stringify(matrix) === JSON.stringify(mediaWant), ROLES.map((r) => `${r}: ${matrix[r]!.join("/") || "nothing"}`).join(" · "));

  const userMatrix: Record<string, string[]> = {};
  for (const role of ROLES) {
    const user = as(role);
    const other = tempUsers.find((u) => u.role !== role && u.role !== "admin")!;
    const can: string[] = [];
    if (await allowed(() => payload.findByID({ collection: "users", id: other.id, overrideAccess: false, user }))) can.push("read-others");
    if (await allowed(async () => { const doc = await payload.create({ collection: "users", data: { email: `cms-check+made-by-${role}-${STAMP}@example.invalid`, password: `${STAMP}-${Math.random().toString(36).slice(2)}-Aa1!`, role: "viewer" }, overrideAccess: false, user }); tempUsers.push({ id: doc.id, role: "viewer", email: doc.email }); })) can.push("create");
    if (await allowed(() => payload.update({ collection: "users", id: other.id, data: { role: other.role }, overrideAccess: false, user }))) can.push("update-others");
    if (await allowed(() => payload.findByID({ collection: "users", id: user.id, overrideAccess: false, user }))) can.push("read-self");
    userMatrix[role] = can;
  }
  const usersWant = { admin: ["read-others", "create", "update-others", "read-self"], editor: ["read-self"], reviewer: ["read-self"], viewer: ["read-self"] };
  add("roles", "users: only an admin reads, makes or changes another user; everyone reads their own record", JSON.stringify(userMatrix) === JSON.stringify(usersWant), ROLES.map((r) => `${r}: ${userMatrix[r]!.join("/") || "nothing"}`).join(" · "));

  const promoted: string[] = [];
  for (const role of ["editor", "reviewer", "viewer"] as const) {
    const user = as(role);
    await payload.update({ collection: "users", id: user.id, data: { role: "admin" }, overrideAccess: false, user }).catch(() => undefined);
    const after = await payload.findByID({ collection: "users", id: user.id, depth: 0 });
    if (after.role !== role) promoted.push(`${role} → ${after.role}`);
  }
  add("roles", "nobody promotes themselves: a non-admin's change to their own role is dropped", promoted.length === 0, promoted.length === 0 ? "editor, reviewer and viewer each tried role=admin on their own record; all three kept their role" : promoted.join(", "));
  const selfDelete = await allowed(() => payload.delete({ collection: "users", id: as("admin").id, overrideAccess: false, user: as("admin") }));
  const editorDelete = await allowed(() => payload.delete({ collection: "users", id: as("viewer").id, overrideAccess: false, user: as("editor") }));
  add("roles", "users: an admin cannot delete themselves; a non-admin deletes nobody", !selfDelete && !editorDelete, `admin deletes self: ${selfDelete} · editor deletes a viewer: ${editorDelete}`);

  // ── 3. the bucket ──────────────────────────────────────────────────────────────────────────────────────────────
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/u, "");
  const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", { auth: { persistSession: false } });
  const bucket = await supabase.storage.getBucket(BUCKET);
  add("bucket", `"${BUCKET}" exists and is private`, !!bucket.data && bucket.data.public === false, bucket.error ? bucket.error.message : `public=${bucket.data?.public}`);
  const stored = await supabase.storage.from(BUCKET).list("", { search: `cms-check-${STAMP}.png` });
  const inBucket = (stored.data ?? []).some((o) => o.name === seed.filename);
  add("bucket", "a file uploaded through Payload is in the bucket (the S3 credentials work)", inBucket, inBucket ? `${seed.filename}, ${PNG.length} bytes` : stored.error?.message ?? "not found in the bucket");
  const publicUrl = await fetch(`${supabaseUrl}/storage/v1/object/public/${BUCKET}/${seed.filename}`);
  add("bucket", "that file has no public URL", publicUrl.status !== 200, `GET …/object/public/${BUCKET}/${seed.filename} → ${publicUrl.status}`);

  // ── 4. the two locks, over HTTP ────────────────────────────────────────────────────────────────────────────────
  if (BASE) {
    const get = (path: string, cookie = "", init: RequestInit = {}) => fetch(`${BASE}${path}`, { redirect: "manual", ...init, headers: { ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) } });
    const where = (r: Response) => `${r.status}${r.headers.get("location") ? ` → ${r.headers.get("location")!.replace(BASE, "")}` : ""}`;
    const cookieOf = (r: Response, name: string) => r.headers.getSetCookie().map((c) => c.split(";")[0]!).find((c) => c.startsWith(`${name}=`)) ?? "";
    const post = (path: string, body: unknown, cookie = "") => get(path, cookie, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

    // No device grant: a stranger with the URL.
    const strangerPanel = await get("/admin");
    add("locks", "no grant: /admin sends a stranger to the app's device gate", strangerPanel.status === 307 && (strangerPanel.headers.get("location") ?? "").endsWith("/device-gate?next=%2Fadmin"), where(strangerPanel));
    const strangerLogin = await get("/admin/login");
    add("locks", "no grant: even Payload's login form is not shown", strangerLogin.status === 307 && (strangerLogin.headers.get("location") ?? "").includes("/device-gate"), where(strangerLogin));
    const strangerApi = await get("/api/payload/users/me");
    add("locks", "no grant: the CMS API answers 401", strangerApi.status === 401, where(strangerApi));
    const admin = checkAdmin!;
    const strangerSignIn = await post("/api/payload/users/login", admin);
    add("locks", "no grant: the RIGHT email and password still get 401 — Payload's login alone opens nothing", strangerSignIn.status === 401 && !cookieOf(strangerSignIn, "payload-token"), `${where(strangerSignIn)}, no token issued`);

    // The device grant, earned the way a device earns it.
    const grant = await post("/api/session-start", { access_code: (process.env.ACCESS_CODE ?? "").trim() });
    const device = cookieOf(grant, "ss_device");
    add("locks", "the device grant comes from the app's own gate (ACCESS_CODE at /api/session-start)", grant.status === 200 && !!device, `${grant.status}, ss_device ${device ? "issued" : "NOT issued"}`);

    // The grant alone: Payload asks for its own login.
    // Payload redirects from inside a streamed render: the status is already 200 and the redirect travels in the stream
    // (NEXT_REDIRECT), which the browser follows. What matters is where it leads and that no panel content came with it.
    const grantedPanel = await get("/admin", device);
    const grantedHtml = await grantedPanel.text();
    const toLogin = (grantedPanel.headers.get("location") ?? "").includes("/admin/login") || /NEXT_REDIRECT;replace;\/admin\/login/u.test(grantedHtml);
    add("locks", "grant only: /admin goes to Payload's own login, with nothing of the panel in the answer", toLogin && !/collections\//u.test(grantedHtml), `${where(grantedPanel)}, redirect to /admin/login ${toLogin}, collection links in the body ${/collections\//u.test(grantedHtml)}`);
    const loginPage = await get("/admin/login", device);
    const loginHtml = await loginPage.text();
    // The form's fields are drawn in the browser; the server's page is the login template (the browser walk in SETUP.md saw the form itself).
    add("locks", "grant only: the login page loads", loginPage.status === 200 && /template-minimal/u.test(loginHtml) && !/collections\//u.test(loginHtml), `${loginPage.status}, ${loginHtml.length} bytes, login template ${/template-minimal/u.test(loginHtml)}`);
    const me = await get("/api/payload/users/me", device);
    const meBody = (await me.json().catch(() => ({}))) as { user?: unknown };
    add("locks", "grant only: the API says nobody is signed in", me.status === 200 && meBody.user === null, `${me.status}, user=${JSON.stringify(meBody.user ?? null)}`);
    const grantedList = await get("/api/payload/users", device);
    const grantedFile = await get(`/api/payload/media/file/${seed.filename}`, device);
    add("locks", "grant only: no user list, no media file", grantedList.status === 403 && grantedFile.status !== 200, `users ${grantedList.status} · media file ${grantedFile.status}`);
    const firstUser = await get("/admin/create-first-user", device);
    const firstRegister = await post("/api/payload/users/first-register", { email: `cms-check+first-${STAMP}@example.invalid`, password: "not-a-real-password-1!" }, device);
    // Payload matches its endpoints without regard to case: the other spelling must be stopped by the GATE (seed_only), not left to Payload.
    const firstRegisterCased = await post("/api/payload/users/First-Register", { email: `cms-check+first-${STAMP}@example.invalid`, password: "not-a-real-password-1!" }, device);
    const casedBody = (await firstRegisterCased.json().catch(() => ({}))) as { error?: string };
    add("locks", "'create first user' is closed, page and endpoint, in any spelling (the seed script is the only way)", firstUser.status === 403 && firstRegister.status === 403 && firstRegisterCased.status === 403 && casedBody.error === "seed_only", `page ${firstUser.status} · endpoint ${firstRegister.status} · /users/First-Register ${firstRegisterCased.status} ${casedBody.error ?? "(answered by Payload, not the gate)"}`);

    // Both: the panel.
    const signIn = await post("/api/payload/users/login", admin, device);
    const token = cookieOf(signIn, "payload-token");
    if (signIn.status === 200 && token) {
      const both = `${device}; ${token}`;
      const panel = await get("/admin", both);
      const html = await panel.text();
      add("locks", "both: /admin loads (the dashboard, with Users and Media)", panel.status === 200 && /collections\/users/u.test(html) && /collections\/media/u.test(html), `${panel.status}, ${html.length} bytes, links to users ${/collections\/users/u.test(html)} and media ${/collections\/media/u.test(html)}`);
      const fileBoth = await get(`/api/payload/media/file/${seed.filename}`, both);
      const bytes = Buffer.from(await fileBoth.arrayBuffer());
      add("locks", "both: a media file is served through Payload, byte for byte", fileBoth.status === 200 && bytes.equals(PNG), `${fileBoth.status}, ${bytes.length} bytes, ${fileBoth.headers.get("content-type")}`);
      // Payload's login alone, on a device that never passed the gate.
      const tokenOnlyPanel = await get("/admin", token);
      const tokenOnlyApi = await get("/api/payload/users/me", token);
      add("locks", "Payload login only (no grant): the panel and the API are still closed", tokenOnlyPanel.status === 307 && (tokenOnlyPanel.headers.get("location") ?? "").includes("/device-gate") && tokenOnlyApi.status === 401, `/admin ${where(tokenOnlyPanel)} · API ${tokenOnlyApi.status}`);
      await get("/api/payload/users/logout", both, { method: "POST" });
    } else {
      add("locks", "both: /admin loads (the dashboard, with Users and Media)", false, `the check's own admin could not sign in through the gate: ${signIn.status}`);
    }

    // The app is as it was.
    const galleries = await Promise.all(APP_ADMIN_PAGES.map((page) => get(page)));
    add("locks", "the app's QA galleries under /admin are as reachable as before (no gate, not Payload's)", galleries.every((r) => r.status === 200), APP_ADMIN_PAGES.map((page, i) => `${page} ${galleries[i]!.status}`).join(" · "));
    const hinted: string[] = [];
    for (const page of ["/", "/home", "/session", "/parent", ...APP_ADMIN_PAGES, "/api/build"]) {
      const r = await get(page);
      if (r.headers.get("critical-ch") || r.headers.get("accept-ch") || /payload/iu.test(r.headers.get("x-powered-by") ?? "")) hinted.push(page);
    }
    const panelHeaders = (await get("/admin/login", device)).headers;
    add("locks", "Payload's response headers are on Payload's routes only", hinted.length === 0 && !!panelHeaders.get("critical-ch"), hinted.length === 0 ? `none on /, /home, /session, /parent, the galleries, /api/build; Critical-CH on /admin/login: ${panelHeaders.get("critical-ch")}` : `on ${hinted.join(", ")}`);
  }
} finally {
  // Everything this run made, removed — files first (their objects go from the bucket with them) — and anything an
  // interrupted earlier run left behind: the names are the check's own. A delete that fails is tried once more and said.
  const sweep = async (collection: "media" | "users", field: "filename" | "email", prefix: string): Promise<void> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const found = await payload.find({ collection, where: { [field]: { like: prefix } }, limit: 100, depth: 0 });
      for (const doc of found.docs) await payload.delete({ collection, id: doc.id }).catch((error: unknown) => console.error(`cms:check — could not delete ${collection} ${doc.id}${attempt ? "" : " (will retry)"}: ${error instanceof Error ? error.message : String(error)}`));
    }
  };
  await sweep("media", "filename", "cms-check-");
  await sweep("users", "email", "cms-check+");
  const leftUsers = await payload.find({ collection: "users", where: { email: { like: "cms-check+" } }, limit: 1, depth: 0 });
  const leftMedia = await payload.find({ collection: "media", where: { filename: { like: "cms-check-" } }, limit: 1, depth: 0 });
  add("cleanup", "the check's own users and files are gone", leftUsers.totalDocs === 0 && leftMedia.totalDocs === 0, `${leftUsers.totalDocs} user(s), ${leftMedia.totalDocs} file(s) left`);
}

let part = "";
for (const c of checks) {
  if (c.part !== part) { part = c.part; console.log(`\n${part}:`); }
  console.log(`    ${c.ok === null ? "–" : c.ok ? "✓" : "✗"} ${c.name}\n        ${c.detail}`);
}
const failed = checks.filter((c) => c.ok === false);
const skipped = checks.filter((c) => c.ok === null);
console.log(`\ncms:check — ${checks.length - failed.length - skipped.length}/${checks.length} passed${skipped.length ? `, ${skipped.length} skipped` : ""}${BASE ? "" : " (database, roles and bucket only: pass a base URL for the two locks)"}`);
await payload.destroy();
process.exit(failed.length === 0 ? 0 : 1);
