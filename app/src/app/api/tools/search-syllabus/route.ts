import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";

/**
 * Executes the model's search_syllabus tool call. The syllabus database
 * isn't populated yet, so this does a plain text match for now — swap to a
 * pgvector similarity query (see supabase/schema.sql) once embeddings exist.
 */
export async function POST(request: NextRequest) {
  const { subject, topic } = await request.json();

  if (!subject || !topic) {
    return NextResponse.json(
      { error: "subject and topic are required" },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("syllabus_chunks")
    .select("subject, topic, content")
    .ilike("subject", `%${subject}%`)
    .ilike("topic", `%${topic}%`)
    .limit(3);

  if (error) {
    console.error("[search-syllabus] Supabase error:", error.message);
    return NextResponse.json({ results: [], found: false });
  }

  return NextResponse.json({ results: data ?? [], found: (data?.length ?? 0) > 0 });
}
