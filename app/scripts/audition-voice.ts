/**
 * Voice audition: renders the SAME three Sinhala sentences with every
 * candidate prebuilt Live voice, one WAV per voice, so a native speaker can
 * listen and pick ZARA_VOICE.
 *
 * Rendered through the LIVE API itself (not a separate TTS model) — the
 * audition is the production voice stack, byte for byte. A candidate the
 * API rejects is reported as unavailable rather than failing the run, so
 * the printed list is exactly what is currently available.
 *
 *   npm run audition:voice                       # all candidates → /tmp/voices/<name>.wav
 *   npm run audition:voice -- --voices Aoede,Leda
 */
import { GoogleGenAI, Modality } from "@google/genai";
import fs from "node:fs";
import path from "node:path";
import { AUTHORED_LINES } from "../src/lib/authoredLines";
import { resolveAddress } from "../src/lib/addressToken";

/** The documented prebuilt Live voices; availability is checked empirically per name. */
const DEFAULT_CANDIDATES = ["Aoede", "Kore", "Leda", "Zephyr", "Puck", "Charon", "Fenrir", "Orus"];

const OUT_DIR = "/tmp/voices"; // deliberate /tmp: these are throwaway listening copies
const SAMPLE_RATE = 24000;
const PER_VOICE_TIMEOUT_MS = 45000;

/** One from her transcript, one praise line, one question — the same three for every voice. */
const SENTENCES = [
  "හොඳයි. ඔවු. කියන්නකෝ බලන්න මොකක්ද මේ සංඛ්‍යාව කියලා. බලන්න.",
  AUTHORED_LINES.feedbackCorrect[0],
  resolveAddress(AUTHORED_LINES.checkpoint, "boy"),
].join(" ");

function wavFromPcm16(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function renderVoice(ai: GoogleGenAI, voiceName: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("timed out")), PER_VOICE_TIMEOUT_MS);
    let session: Awaited<ReturnType<typeof ai.live.connect>> | null = null;
    const finish = (err?: Error) => {
      clearTimeout(timeout);
      try {
        session?.close();
      } catch {
        /* already closed */
      }
      if (err) reject(err);
      else resolve(Buffer.concat(chunks));
    };
    void ai.live
      .connect({
        model: process.env.GEMINI_LIVE_MODEL ?? "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
          systemInstruction: {
            parts: [{ text: "Read the user's text aloud in Sinhala exactly as written. Say nothing else." }],
          },
        },
        callbacks: {
          onmessage: (message) => {
            for (const part of message.serverContent?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) chunks.push(Buffer.from(part.inlineData.data, "base64"));
            }
            if (message.serverContent?.turnComplete) finish();
          },
          onerror: (error) => finish(new Error(String((error as { message?: string }).message ?? error))),
          onclose: (event) => {
            if (chunks.length === 0) finish(new Error(`closed: ${event?.reason || event?.code || "no audio"}`));
          },
        },
      })
      .then((connected) => {
        session = connected;
        connected.sendClientContent({ turns: [{ role: "user", parts: [{ text: SENTENCES }] }], turnComplete: true });
      })
      .catch((error) => finish(error as Error));
  });
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1alpha" } });

  const flag = process.argv.indexOf("--voices");
  const candidates = flag !== -1 && process.argv[flag + 1] ? process.argv[flag + 1].split(",") : DEFAULT_CANDIDATES;
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Auditioning ${candidates.length} voices — the same three sentences each:\n  "${SENTENCES}"\n`);
  const rendered: string[] = [];
  for (const voice of candidates) {
    try {
      const pcm = await renderVoice(ai, voice.trim());
      if (pcm.length < SAMPLE_RATE) throw new Error("returned almost no audio");
      const file = path.join(OUT_DIR, `${voice.trim()}.wav`);
      fs.writeFileSync(file, wavFromPcm16(pcm));
      rendered.push(voice.trim());
      console.log(`  ✓ ${voice.trim().padEnd(10)} ${(pcm.length / (SAMPLE_RATE * 2)).toFixed(1)}s → ${file}`);
    } catch (error) {
      console.log(`  ✗ ${voice.trim().padEnd(10)} unavailable: ${String(error).slice(0, 90)}`);
    }
  }
  console.log(`\nRendered: ${rendered.join(", ") || "(none)"}`);
  console.log(`Listen in ${OUT_DIR}, then set ZARA_VOICE in .env.local (and Vercel).`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
