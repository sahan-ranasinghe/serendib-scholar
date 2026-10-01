import path from "node:path";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { s3Storage } from "@payloadcms/storage-s3";
import { buildConfig } from "payload";
import { COLLECTIONS, Media, Users } from "./src/cms/collections";
import { CMS_ADMIN_ROUTE, CMS_API_ROUTE } from "./src/cms/routes";
import { SUPABASE_ROOT_CA } from "./src/cms/supabaseCa";

/**
 * PAYLOAD CMS, PHASE 1 (30 Sep 2026) — installed beside the app, holding no content yet. docs/cms/SETUP.md is the
 * account of every choice here; the short version:
 *
 *   - /admin is the panel and /api/payload its API (the app owns the rest of /api). Both sit behind the app's device
 *     gate (src/proxy.ts) AND Payload's own login.
 *   - The database is the app's Supabase Postgres, but ONLY the schema "payload": Payload never reads or writes
 *     `public`. `push: false` — the schema changes through the committed migrations in src/cms/migrations and nothing
 *     else (drizzle's dev-time push has a history of phantom diffs on Supabase).
 *   - The connection is TLS, verified against Supabase's root CA, and small: the session-mode pooler hands out a
 *     limited number of connections and the app's own traffic does not use this pool at all.
 *   - Uploads go to the private Supabase Storage bucket through its S3-compatible endpoint (path-style URLs — the
 *     virtual-hosted style fails the TLS handshake there).
 *
 * The paths are from the working directory (the app's root, where `next` and `payload` are both run), like every
 * other script in this repo; they are only used by the CLI's generators and migrations, never at request time.
 */
const root = process.cwd();

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: { baseDir: root },
  },
  routes: { admin: CMS_ADMIN_ROUTE, api: CMS_API_ROUTE },
  collections: COLLECTIONS,
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || "",
  // Nothing about this installation leaves it.
  telemetry: false,
  typescript: { outputFile: path.resolve(root, "src/cms/payload-types.ts") },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || "",
      ssl: { ca: SUPABASE_ROOT_CA, rejectUnauthorized: true },
      max: 5,
    },
    schemaName: "payload",
    push: false,
    migrationDir: path.resolve(root, "src/cms/migrations"),
  }),
  plugins: [
    s3Storage({
      collections: { [Media.slug]: true },
      bucket: process.env.S3_BUCKET || "cms-media",
      config: {
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION,
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
        },
      },
    }),
  ],
});
