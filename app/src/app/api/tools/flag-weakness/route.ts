import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";

export async function POST(request: NextRequest) {
  const { child_id, topic } = await request.json();

  if (!child_id || !topic) {
    return NextResponse.json(
      { error: "child_id and topic are required" },
      { status: 400 },
    );
  }

  const { error } = await supabaseAdmin.from("child_weaknesses").insert({
    child_id,
    topic,
  });

  if (error) {
    console.error("[flag-weakness] Supabase error:", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
