# Privacy — what Serendib Scholar stores about a child

_Last reviewed: 2026-09-10. This describes the system as built; update it when
data handling changes._

## The child's voice

**The lesson never listens.** Every answer in a lesson is a touch — a chip,
a tile, a bead, a table cell, a rod, the number pad — and is judged on the
device with no network call. The microphone does not open on any lesson
beat: not on a question, not on a soft check-in, not during the reading
practice (where the child is invited to say a number aloud for three
seconds, with a faint 🎤 cue, and the tutor then reads it herself —
nothing is recorded). There is no answer audio, so nothing to transcribe,
store or send.

**The microphone opens in one place, by the child's choice: the ✋ chat.**
The first time the child taps ✋, the tutor explains in Sinhala that she
needs permission to hear their voice, and only then does the browser ask.
While a chat is open, audio streams to Google's Gemini Live API for the
duration of the conversation and is not recorded or stored by us; Google's
processing is governed by the Gemini API terms. Closing the chat ends the
stream.

**An opt-in reading assessment exists behind a server switch
(`VOICE_ASSESSMENT=on`, off by default).** When it is on, the three-second
reading pause is recorded on the device, sent to `/api/hear`, transcribed in
memory for the learning record, and discarded — never judged, never stored
as audio. When it is off (the shipped default), that code path is
unreachable: the app's own test harness asserts that a full session makes
zero calls to `/api/hear`.

## What IS stored, and for how long

| Data | Where | What it contains | Kept |
|---|---|---|---|
| Lesson progress | `child_progress`, `child_weaknesses` | which concepts were mastered/missed | indefinitely (it is the child's learning record) |
| Session log | `session_log` | which beats played, the **tapped answers** (text), right/wrong judgements, timing; speech transcripts only with the reading assessment on | indefinitely, for teaching quality review |
| Profile | `children`, `child_profile` | display name, grade, address form (boy/girl/unspecified), interests the child mentioned (e.g. "likes cricket") | until deleted by us |
| Diagnostics | `debug_reports` | app state snapshots a parent explicitly sends from the debug panel — no audio | until deleted by us |

Answers in the session log are the child's taps (the chip or number they
chose) and the judgement; soft check-ins record only whether the child
tapped. Speech transcripts appear only when the reading assessment switch is
on. The session's cost line records `flash_audio_seconds` (transcription
time on the lesson path — 0 unless the assessment is on), `live_seconds`
(chat) and `mic_opens` (how many times the child opened the chat).

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

- **Google (Gemini API)** — receives live chat audio while a ✋ chat is
  open, and renders the tutor's voice from text (no child data). Reading
  clips for transcription only when the reading assessment switch is on.
  Lesson answers are judged on the device and never leave it as audio.
- **Supabase** — hosts the database and the tutor's audio clip storage
  described above.

No analytics, no advertising SDKs, no other recipients.
