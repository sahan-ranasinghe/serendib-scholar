import "server-only";
import { createClient } from "@supabase/supabase-js";

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
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn(
    "[supabaseClient] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set — " +
      "syllabus search and progress logging will fail until these are configured.",
  );
}

// createClient throws synchronously on an invalid URL, which would break
// the build before env vars are configured — fall back to a syntactically
// valid placeholder so the module loads; calls will simply fail at runtime
// until real credentials are set.
export const supabaseAdmin = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseServiceRoleKey ?? "placeholder-service-role-key",
  {
    auth: { persistSession: false },
  },
);
