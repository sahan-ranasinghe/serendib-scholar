# Privacy — what Serendib Scholar stores about a child

_Last reviewed: 2026-09-06. This describes the system as built; update it when
data handling changes._

## The child's voice

**Raw answer audio is never stored.** When the tutor asks a question, the app
records the answer on the device, sends the clip to the server, transcribes it
in memory, and discards it — the audio exists only for the seconds the
transcription takes. There is no bucket, table, or file that holds children's
recordings, and `/api/hear` (the only place answer audio arrives) contains no
storage or database call.

During an optional live chat (opened only when the child taps "talk to Zara"
or accepts the offer of a break-time chat), audio streams to Google's Gemini
Live API for the duration of the conversation. We do not record or store that
audio either; Google's processing is governed by the Gemini API terms.

## What IS stored, and for how long

| Data | Where | What it contains | Kept |
|---|---|---|---|
| Lesson progress | `child_progress`, `child_weaknesses` | which concepts were mastered/missed | indefinitely (it is the child's learning record) |
| Session log | `session_log` | which beats played, **text transcripts** of answers, right/wrong judgements, timing | indefinitely, for teaching quality review |
| Profile | `children`, `child_profile` | display name, grade, address form (boy/girl/unspecified), interests the child mentioned (e.g. "likes cricket") | until deleted by us |
| Diagnostics | `debug_reports` | app state snapshots a parent explicitly sends from the debug panel — no audio | until deleted by us |

Transcripts are text only, and only from moments where the tutor asked the
child something (answer windows and soft check-ins). Soft check-in words are
not transcribed at all by default — only the fact that the child responded.

## Who can see it

- The database denies all public access (row level security with no public
  policies). Only server code holding the service-role secret can read or
  write, and that secret never leaves the server.
- The lesson's audio clips (the tutor's own pre-rendered speech — no child
  data) live in a private bucket served through short-lived signed URLs.
- Access to the app itself requires a per-device access code; without it the
  API answers 401 to everything.
- In practice: the project owner, and nobody else.

## Third parties

- **Google (Gemini API)** — receives answer clips for transcription (seconds,
  in memory), text for lesson planning/judging, and live chat audio while a
  chat is open. Also renders the tutor's voice from text (no child data).
- **Supabase** — hosts the database and the tutor's audio clip storage
  described above.

No analytics, no advertising SDKs, no other recipients.
