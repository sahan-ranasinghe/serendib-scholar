import test from "node:test";
import assert from "node:assert/strict";
import {
  autoStopDecision,
  speechThreshold,
  MIN_RECORD_MS,
  SILENCE_STOP_MS,
  STOP_WARNING_MS,
} from "./useTakeRecorder";

/**
 * The auto-stop cut a trained actor off mid-sentence in her first real
 * session: a natural pause for effect, in a quiet room at low speaking
 * volume, read as the end of the take. Each case below is one of the
 * reasons that happened.
 */

test("a pause in delivery does not end the take", () => {
  // Two seconds of silence mid-line, well past the minimum duration.
  const decision = autoStopDecision({ enabled: true, spoke: true, elapsedMs: 20_000, quietForMs: 2000 });
  assert.equal(decision.stop, false);
});

test("the take ends once the silence really is the end", () => {
  const decision = autoStopDecision({
    enabled: true,
    spoke: true,
    elapsedMs: 20_000,
    quietForMs: SILENCE_STOP_MS + 1,
  });
  assert.equal(decision.stop, true);
});

test("nothing auto-stops inside the minimum recording duration", () => {
  // She has spoken and gone quiet, but the take is only two seconds old:
  // a three-word line still gets its full window.
  const decision = autoStopDecision({
    enabled: true,
    spoke: true,
    elapsedMs: MIN_RECORD_MS - 1,
    quietForMs: SILENCE_STOP_MS * 4,
  });
  assert.equal(decision.stop, false);
});

test("silence before she starts speaking never ends the take", () => {
  const decision = autoStopDecision({
    enabled: true,
    spoke: false,
    elapsedMs: 60_000,
    quietForMs: 60_000,
  });
  assert.equal(decision.stop, false);
});

test("switching auto-stop off disables it completely", () => {
  const decision = autoStopDecision({
    enabled: false,
    spoke: true,
    elapsedMs: 60_000,
    quietForMs: 60_000,
  });
  assert.deepEqual(decision, { stop: false, warnInMs: null });
});

test("the warning ring appears only in the last second, counting down", () => {
  const quiet = (ms: number) => autoStopDecision({ enabled: true, spoke: true, elapsedMs: 20_000, quietForMs: ms });
  assert.equal(quiet(SILENCE_STOP_MS - STOP_WARNING_MS - 200).warnInMs, null, "too early to warn");
  assert.equal(quiet(SILENCE_STOP_MS - STOP_WARNING_MS).warnInMs, STOP_WARNING_MS, "warning starts");
  assert.equal(quiet(SILENCE_STOP_MS - 250).warnInMs, 250, "counts down");
});

test("the speech threshold follows the room, with a floor", () => {
  // A quiet room: the threshold drops with it, so soft delivery still
  // registers as speech instead of reading as silence.
  const quietRoom = speechThreshold(0.001);
  const noisyRoom = speechThreshold(0.02);
  assert.ok(noisyRoom > quietRoom, "a noisier room needs a higher bar");
  // ...but never so low that room tone counts as speaking.
  assert.ok(quietRoom >= 0.008, `floor held (${quietRoom})`);
  assert.ok(noisyRoom > 0.05, `scales with the measured floor (${noisyRoom})`);
});

test("the constants are the ones the first session asked for", () => {
  assert.equal(SILENCE_STOP_MS, 2500);
  assert.equal(MIN_RECORD_MS, 3000);
});
