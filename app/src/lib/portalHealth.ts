/**
 * Is the portal actually able to accept a recording right now?
 *
 * Every failure in the first real session was a piece of infrastructure
 * that looked fine from the code: the storage bucket's MIME allowlist was
 * widened only inside the render script, so production kept rejecting
 * "mime type audio/webm is not supported" while the fix sat in the repo.
 * The lesson is that the portal has to PROVE the path works rather than
 * assume it — by actually uploading a byte and actually writing a row.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { AUDIO_BUCKET } from "@/lib/audioCache";
import { ensureAudioBucket } from "@/lib/liveTts";

export interface HealthCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface PortalHealth {
  ok: boolean;
  checks: HealthCheck[];
}

/** A real round-trip through the exact path a take takes. */
export async function portalHealth(): Promise<PortalHealth> {
  const checks: HealthCheck[] = [];
  const storage = supabaseAdmin.storage.from(AUDIO_BUCKET);

  try {
    await ensureAudioBucket();
    const { data } = await supabaseAdmin.storage.getBucket(AUDIO_BUCKET);
    const allowed = data?.allowed_mime_types ?? null;
    checks.push({
      name: "bucket",
      ok: Boolean(data),
      detail: data
        ? `${AUDIO_BUCKET} exists, ${data.public ? "PUBLIC (should be private)" : "private"}, mime allowlist: ${
            allowed ? allowed.join(", ") : "unrestricted"
          }`
        : `${AUDIO_BUCKET} is missing`,
    });
  } catch (error) {
    checks.push({ name: "bucket", ok: false, detail: String(error).slice(0, 200) });
  }

  // The check that would have caught the production failure: upload a
  // real webm-typed object, because that is what her browser sends.
  const probePath = `human/_health/${Date.now()}.webm`;
  try {
    const upload = await storage.upload(probePath, new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), {
      contentType: "audio/webm",
      upsert: true,
    });
    if (upload.error) throw new Error(upload.error.message);
    checks.push({ name: "upload", ok: true, detail: "audio/webm accepted by the bucket" });
    await storage.remove([probePath]);
  } catch (error) {
    checks.push({
      name: "upload",
      ok: false,
      detail: `${String(error).slice(0, 160)} — widen the bucket's MIME allowlist (or clear it) in the Supabase dashboard`,
    });
  }

  for (const table of ["actor_takes", "actor_lines"] as const) {
    try {
      const probeId = `_health_${Date.now()}`;
      const row: Record<string, string> =
        table === "actor_takes"
          ? { beat_id: probeId, lesson: "_health", status: "failed" }
          : { beat_id: probeId, original_text: "_health", status: "note_only" };
      const { error } = await supabaseAdmin.from(table).upsert(row);
      if (error) throw new Error(error.message);
      await supabaseAdmin.from(table).delete().eq("beat_id", probeId);
      checks.push({ name: table, ok: true, detail: "writable" });
    } catch (error) {
      checks.push({
        name: table,
        ok: false,
        detail: `${String(error).slice(0, 160)} — run supabase/schema.sql`,
      });
    }
  }

  return { ok: checks.every((check) => check.ok), checks };
}
