import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { APP_ADMIN_PAGES, CMS_ADMIN_ROUTE, CMS_API_ROUTE, DEVICE_GATE_ROUTE, SEED_ONLY_ROUTES, afterGate, cmsArea, cmsGateVerdict } from "../cms/routes";

const APP = path.resolve(__dirname, "../..");
const source = (file: string) => readFileSync(path.join(APP, file), "utf8");

test("what is the CMS's: the panel and its API — never the app's own routes, nor its QA galleries under /admin", () => {
  for (const p of ["/admin", "/admin/login", "/admin/collections/users", "/admin/collections/users/1", "/admin/account"]) assert.equal(cmsArea(p), "panel", p);
  for (const p of ["/api/payload", "/api/payload/users/me", "/api/payload/graphql", "/api/payload/media/file/a.png"]) assert.equal(cmsArea(p), "api", p);
  for (const p of ["/", "/home", "/session", "/parent", "/api/session-start", "/api/portal/beats", "/api/payloads", "/administrator", "/admin-gate", DEVICE_GATE_ROUTE]) assert.equal(cmsArea(p), null, p);
  for (const p of [...APP_ADMIN_PAGES, "/admin/design-preview/anything"]) assert.equal(cmsArea(p), null, p);
});

test("no device grant: a page view of the panel goes to the gate and comes back; everything else is refused", () => {
  const none = { deviceGranted: false, waived: false };
  assert.deepEqual(cmsGateVerdict({ path: "/admin", method: "GET", ...none }), { action: "redirect", to: "/device-gate?next=%2Fadmin" });
  assert.deepEqual(cmsGateVerdict({ path: "/admin/collections/users", search: "?limit=10", method: "GET", ...none }), { action: "redirect", to: "/device-gate?next=%2Fadmin%2Fcollections%2Fusers%3Flimit%3D10" });
  // The login form is the panel too: a stranger does not get as far as a password field.
  assert.equal(cmsGateVerdict({ path: "/admin/login", method: "GET", ...none }).action, "redirect");
  // A server action or a form post into the panel, and every call to its API.
  assert.deepEqual(cmsGateVerdict({ path: "/admin/login", method: "POST", ...none }), { action: "deny", status: 401, error: "device_required" });
  for (const method of ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]) assert.deepEqual(cmsGateVerdict({ path: "/api/payload/users/login", method, ...none }), { action: "deny", status: 401, error: "device_required" }, method);
});

test("the first admin is never made through the panel: 'create first user' and its endpoint are closed even to a device with the grant", () => {
  assert.deepEqual([...SEED_ONLY_ROUTES], ["/admin/create-first-user", "/api/payload/users/first-register"]);
  for (const grant of [{ deviceGranted: true, waived: false }, { deviceGranted: false, waived: true }]) {
    assert.deepEqual(cmsGateVerdict({ path: "/admin/create-first-user", method: "GET", ...grant }), { action: "deny", status: 403, error: "seed_only" });
    assert.deepEqual(cmsGateVerdict({ path: "/api/payload/users/first-register", method: "POST", ...grant }), { action: "deny", status: 403, error: "seed_only" });
  }
  // Payload matches its endpoints without regard to case, and a path may arrive encoded: every spelling is the same closed door.
  for (const path of ["/api/payload/users/First-Register", "/api/payload/users/FIRST-REGISTER", "/api/payload/users/first%2Dregister", "/api/payload/users/first-registe%72", "/admin/Create-First-User", "/admin/create-first-user/anything"]) {
    assert.deepEqual(cmsGateVerdict({ path, method: "POST", deviceGranted: true, waived: false }), { action: "deny", status: 403, error: "seed_only" }, path);
  }
  // A malformed escape is not a way round, and not a crash.
  assert.deepEqual(cmsGateVerdict({ path: "/api/payload/users/first-register%", method: "POST", deviceGranted: true, waived: false }).action, "pass");
  // The ordinary login is untouched.
  assert.deepEqual(cmsGateVerdict({ path: "/api/payload/users/login", method: "POST", deviceGranted: true, waived: false }), { action: "pass" });
});

test("with the grant the request goes on to Payload (which asks for its own login); the dev waiver is the same as session-start's", () => {
  for (const p of ["/admin", "/admin/login", "/api/payload/users/me"]) {
    assert.deepEqual(cmsGateVerdict({ path: p, method: "GET", deviceGranted: true, waived: false }), { action: "pass" }, p);
    assert.deepEqual(cmsGateVerdict({ path: p, method: "GET", deviceGranted: false, waived: true }), { action: "pass" }, p);
  }
});

test("after the gate: only ever back into the panel", () => {
  assert.equal(afterGate("/admin/collections/users?limit=10"), "/admin/collections/users?limit=10");
  assert.equal(afterGate("/admin"), "/admin");
  for (const next of [null, undefined, "", "https://evil.example/admin", "//evil.example/admin", "/\\evil.example", "/home", "/parent", "/api/payload/users", "/admin/design-preview", "admin"]) assert.equal(afterGate(next), CMS_ADMIN_ROUTE, String(next));
});

test("the proxy runs on both doors, and Payload is mounted where the gate stands", () => {
  const proxy = source("src/proxy.ts");
  assert.match(proxy, /matcher: \["\/api\/:path\*", "\/admin\/:path\*"\]/u);
  assert.equal(CMS_ADMIN_ROUTE, "/admin");
  assert.equal(CMS_API_ROUTE, "/api/payload");
  const config = source("payload.config.mts");
  assert.match(config, /routes: \{ admin: CMS_ADMIN_ROUTE, api: CMS_API_ROUTE \}/u);
  // The route group's folders are the URLs: /admin/[[...segments]] and /api/payload/[...slug].
  assert.ok(readFileSync(path.join(APP, "src/app/(payload)/admin/[[...segments]]/page.tsx"), "utf8").includes("RootPage"));
  assert.ok(readFileSync(path.join(APP, "src/app/(payload)/api/payload/[...slug]/route.ts"), "utf8").includes("REST_GET"));
});

test("Payload keeps to its own schema and changes it only by migration", () => {
  const config = source("payload.config.mts");
  assert.match(config, /schemaName: "payload"/u);
  assert.match(config, /push: false/u);
  assert.match(config, /rejectUnauthorized: true/u);
  const migrations = source("src/cms/migrations/index.ts");
  for (const name of [...migrations.matchAll(/name: '([^']+)'/gu)].map((m) => m[1]!)) {
    const sql = source(`src/cms/migrations/${name}.ts`);
    assert.ok(!/"public"\./u.test(sql) && !/\bpublic\./u.test(sql.replace(/^ \*.*$/gmu, "")), `${name} names the public schema`);
    // Every table, type and index it makes is inside "payload".
    for (const statement of sql.matchAll(/CREATE (?:TABLE|TYPE) ("[^"]+")\./gu)) assert.equal(statement[1], '"payload"', `${name}: ${statement[0]}`);
  }
});

test("the service worker never touches the panel; it and the Next config agree with the proxy about which /admin pages are the app's", () => {
  const sw = source("public/sw.js");
  assert.match(sw, /if \(isCmsPanel\(url\)\) return;/u);
  // Two plain-JS files cannot import the TypeScript list: each carries its own copy, and this keeps the three equal.
  for (const file of ["public/sw.js", "next.config.mjs"]) {
    const list = /const APP_ADMIN_PAGES = (\[[^\]]+\]);/u.exec(source(file));
    assert.ok(list, `${file} APP_ADMIN_PAGES`);
    assert.deepEqual(JSON.parse(list[1]!), [...APP_ADMIN_PAGES], file);
  }
});

test("Payload's client-hint headers are scoped to Payload's routes — the app's responses keep the headers they had", async () => {
  const config = (await import(path.join(APP, "next.config.mjs"))).default as { headers: () => Promise<Array<{ source: string; headers: Array<{ key: string }> }>>; poweredByHeader?: boolean };
  const rules = await config.headers();
  const hinted = rules.filter((rule) => rule.headers.some((h) => h.key === "Critical-CH"));
  assert.deepEqual(hinted.map((rule) => rule.source), ["/admin", "/admin/((?!board-gallery|design-gallery|design-preview).*)", "/api/payload/:path*"]);
  assert.equal(rules.some((rule) => rule.source === "/:path*"), false, "no Payload header on every route");
  assert.equal(rules.some((rule) => rule.headers.some((h) => h.key === "X-Powered-By")), false);
  assert.equal("poweredByHeader" in config, false, "Next's own X-Powered-By stays on, as before");
});

test("the dead-control crawler never enters the CMS: no route of its list, no link into it clicked, every request watched", () => {
  const crawl = source("scripts/crawl-check.ts");
  const routes = JSON.parse(/const ALL_ROUTES = (\[[^\]]+\]);/u.exec(crawl)![1]!) as string[];
  assert.ok(routes.length > 10);
  for (const route of routes) assert.equal(cmsArea(route), null, route);
  assert.match(crawl, /if \(control\.href && inCms\(control\.href\)\) \{\s+results\.push\(\{[^}]+verdict: "cms"/u);
  assert.match(crawl, /page\.on\("Network\.requestWillBeSent"/u);
  assert.match(crawl, /ok: cmsRequests\.length === 0/u);
});
