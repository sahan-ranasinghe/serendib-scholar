import "server-only";

/**
 * Server-only Supabase client using the service role key. This must never be
 * imported from client components — the `server-only` import above makes any
 * accidental client-side import fail the build. It powers:
 *   - pgvector syllabus search (see supabase/schema.sql: syllabus_chunks)
 *   - writes to child_progress / child_weaknesses / teacher_review_flags
 *
 * All tool calls from the browser go through the API routes under
 * src/app/api/tools/*, which run server-side and use this client — the
 * browser (and the Gemini Live WebSocket it talks to directly) never sees
 * the service role key.
 *
 * The actual client construction lives in supabaseAdmin.ts (no `server-only`
 * guard), so that scripts/ingest-syllabus.ts — which runs under plain
 * Node/tsx, not Next.js's bundler — can use the same client without
 * tripping the guard above.
 */
export { supabaseAdmin } from "./supabaseAdmin";
