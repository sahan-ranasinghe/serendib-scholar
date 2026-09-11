import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getActiveChildId } from "@/lib/activeChild";

export async function POST(request: NextRequest) {
  const { topic } = await request.json();

  if (!topic) {
    return NextResponse.json(
      { error: "topic is required" },
      { status: 400 },
    );
  }

  const { error } = await supabaseAdmin.from("child_weaknesses").insert({
    // See activeChild.ts — identity is resolved server-side, never client-supplied.
    child_id: await getActiveChildId(),
    topic,
  });

  if (error) {
    console.error("[flag-weakness] Supabase error:", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
