# Security posture — Serendib Scholar

_One page, in plain English, for people who don't read code.
Last reviewed: 2026-09-10._

**What this is:** a tutor for one child at a time, teaching from
pre-recorded lesson audio and answered by touch, deployed as a web app. The things worth
protecting are (1) the child's data, (2) the paid AI accounts behind it,
and (3) the deployment itself being abused by strangers.

## The door is locked

The app's server refuses every request unless it carries a session pass,
which a device can only get by entering a private **access code** once
(meant for the parent). A stranger who discovers the URL sees a code
prompt and gets "not signed in" errors from everything else. Session
passes are cryptographically signed, tied to the child, and expire after
four hours; the device's code entry is remembered for six months.

## The keys stay in the back room

The two powerful secrets — the Google AI key and the database master
key — exist only on the server. The pages sent to the browser were built
for production and searched for both secrets and for anything shaped like
a key: nothing is there. When the browser needs to talk to the AI
directly (the optional live chat), the server hands it a **single-use
token that expires within 30 minutes** and can only do the one thing it
was minted for, in a fixed configuration the browser cannot alter.

## The database refuses the public

Row Level Security is enabled on every table with **no public access
rules at all** — deny everything, for everyone, except the server's own
master key. Even someone holding the database's public address gets
nothing. The tutor's audio recordings (her voice, not the child's) sit in
a **private** bucket; the browser is given ten-minute signed links, one
clip at a time, only with a valid session.

## The child's voice is not on the lesson path at all

Lessons are answered by touch and judged on the device; the microphone
never opens during a lesson. It opens in exactly one place — the ✋ chat —
and only after the child taps ✋ and the tutor has explained, in Sinhala,
why she is asking. That audio streams to the chat model for the length of
the conversation and is never written anywhere. An opt-in reading
assessment (`VOICE_ASSESSMENT=on`, off by default) can record the
three-second reading pause and transcribe it in memory; with it off the
harness asserts a full session makes zero transcription calls. Details in
[PRIVACY.md](PRIVACY.md).

## Spending has ceilings

Every money-spending route is budgeted on the server, per session and per
child: at most 40 reading-assessment transcriptions per 10 minutes (a
route the shipped lesson path never calls), 20 on-demand
voice renders per session, 15 minutes of live chat per day, and 60
requests per minute from any one internet address. Past a ceiling the app
says, kindly, to take a break. (The counters live in a database table —
`api_rate_limits` in `supabase/schema.sql` — and the limits switch on
once that table is created; until then each check logs an error and lets
the request through, so a missing table is loud, never silent.)

## Changes are checked before they ship

Every push runs the type checker, the linter, the unit tests, the lesson
dry-run's assertions, and a dependency vulnerability audit in CI; the
master branch is protected so failing checks block a merge.

## Honest limitations

- One shared access code is a gate, not user accounts. A leaked code can
  be rotated by changing one setting, but until parent login exists,
  anyone with the code is "the parent".
- Rate limits are advisory until the `api_rate_limits` table is created,
  and the per-request counting tolerates small races by design.
- Live-chat time is capped by how many chats can be opened per day (a
  conservative charge per opening), because the server is not a party to
  the chat's audio stream and cannot time it exactly.
