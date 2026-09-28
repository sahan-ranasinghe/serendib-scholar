# Serendib Scholar

A voice-first AI study companion for Sri Lankan children preparing for the
Grade 5 Scholarship Exam. The child talks to a warm, patient tutor in
natural spoken Sinhala (or Tamil/English, if selected) — no typing, no
buttons to navigate, just conversation.

## How it works

A single Gemini Live model (`gemini-3.1-flash-live-preview` by default)
handles listening, thinking, and speaking natively over a WebSocket —
there's no separate speech-to-text or text-to-speech step. The browser
streams the child's mic audio in as 16kHz PCM16 and plays back the model's
24kHz PCM16 audio response in near-real time, with barge-in support (the
child can interrupt the model mid-sentence).

- **`src/hooks/useGeminiLive.ts`** — React hook orchestrating session
  lifecycle: mints an ephemeral token, opens the WebSocket, wires mic
  capture and playback, and dispatches tool calls.
- **`src/lib/geminiLiveClient.ts`** — thin WebSocket wrapper around the
  Gemini Live (`BidiGenerateContent`) protocol.
- **`src/lib/pcmAudio.ts`** + **`public/worklets/pcm-recorder-worklet.js`**
  — mic capture via an `AudioWorklet` (converts to 16kHz PCM16).
- **`src/lib/audioManager.ts`** — the one owner of everything the app
  plays: the only playback AudioContext, a token per request to speak,
  `stopAll()` that stops, disconnects and aborts, and the invariant that
  two voice clips never start together. The model's 24kHz PCM16 replies
  are a chunk stream there.
- **`src/app/api/gemini-session/route.ts`** — mints short-lived ephemeral
  tokens server-side using `GEMINI_API_KEY`. The real API key never
  reaches the browser; the model, system prompt, and tool set are locked
  into the token itself so a tampered client can't override them.
- **`src/lib/prompt.ts`** — the tutor's full system prompt (tone, safety
  rules, and language handling for a child audience).
- **`src/lib/geminiLiveTools.ts`** — the four tools the model can call:
  `search_syllabus`, `log_answer`, `flag_weakness`, and
  `request_teacher_review`.
- **`src/app/api/tools/*`** — server-side routes that actually execute
  those tool calls against Supabase. The browser only ever talks to these
  routes (never directly to Supabase with the service role key).
- **`src/lib/supabaseClient.ts`** — server-only Supabase client (guarded
  by the `server-only` package) for pgvector syllabus search and
  `child_progress` logging.
- **`src/components/HostScreen.tsx`** — the child-facing voice chat UI.
- **`src/components/ParentOnboarding.tsx`** — scaffold for the
  parent-facing setup flow (name, grade, subjects) — not wired up yet.

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Where it's used | Notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | `api/gemini-session` (server only) | Never exposed to the browser. |
| `GEMINI_LIVE_MODEL` | `api/gemini-session` (server only) | Optional; defaults to `gemini-3.1-flash-live-preview`. |
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabaseClient` | Safe to expose — it's just the project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabaseClient` (server only) | Never exposed to the browser. |

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:3000, allow microphone access, and tap the button to
start a session — you should hear a placeholder "Hello, I'm your study
buddy" style greeting.

## Database

`supabase/schema.sql` has a starter schema: `syllabus_chunks` (with a
`pgvector` embedding column, currently unused — `search_syllabus` falls
back to a plain text match until it's populated), `child_progress`,
`child_weaknesses`, and `teacher_review_flags`. Run it in the Supabase SQL
editor before wiring up real content.

## Status

This is a clean scaffold: session plumbing, safety-focused prompt, tool
declarations, and UI shells are in place, but the syllabus database isn't
populated and parent onboarding isn't persisted yet.
