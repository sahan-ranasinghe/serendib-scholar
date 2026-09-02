import { createClient } from "@supabase/supabase-js";
import NodeWebSocket from "ws";

/**
 * The actual service-role Supabase client construction, kept separate from
 * supabaseClient.ts (which wraps this with a `server-only` import guard).
 * That guard throws unconditionally when loaded outside Next.js's bundler —
 * including under plain Node/tsx — so scripts/ingest-syllabus.ts imports
 * this ungated module directly instead of supabaseClient.ts.
 */

// supabase-js's SupabaseClient constructor always initializes a realtime
// client, which throws immediately on Node <22 without a global WebSocket —
// even though this app never uses realtime subscriptions. Next.js's server
// runtime happens to provide one; plain Node/tsx (running this file from
// scripts/ingest-syllabus.ts) doesn't, so polyfill it defensively here.
if (typeof globalThis.WebSocket === "undefined") {
  // @ts-expect-error - the `ws` package's WebSocket is API-compatible with
  // the browser/undici WebSocket that @supabase/supabase-js expects.
  globalThis.WebSocket = NodeWebSocket;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn(
    "[supabaseAdmin] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set — " +
      "syllabus search and progress logging will fail until these are configured.",
  );
}

// createClient throws synchronously on an invalid URL, which would break
// the Next.js build before env vars are configured — fall back to a
// syntactically valid placeholder so the module loads; calls will simply
// fail at runtime until real credentials are set.
export const supabaseAdmin = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseServiceRoleKey ?? "placeholder-service-role-key",
  {
    auth: { persistSession: false },
  },
);
