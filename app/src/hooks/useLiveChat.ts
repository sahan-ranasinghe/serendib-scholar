import { useCallback, useRef, useState } from "react";
import { GeminiLiveClient, type FunctionCall } from "@/lib/geminiLiveClient";
import { startPcmRecorder, type PcmRecorderHandle } from "@/lib/pcmAudio";
import { audio } from "@/lib/audioManager";
import type { ChatContext } from "@/lib/chatContext";
import { t, type CopyKey } from "@/lib/appCopy";
import { CHAT_MAX_OPEN_SECONDS, type ChatBudgetView } from "@/lib/chatBudgetRules";
import { AUTHORED_LINES } from "@/lib/authoredLines";
import { warningDue, type TimeWarning } from "@/lib/timeWarnings";

/**
 * LIVE, ONLY WHEN THE CHILD ASKS FOR IT.
 *
 * The lesson itself runs on cached audio and one-shot answer recognition
 * (see useLessonRuntime). A persistent voice session is kept for the one
 * thing it is actually good at: free, full-duplex conversation. The child
 * opens it deliberately — the "✋ Zara එක්ක කතා කරන්න" button, or by
 * accepting the mid-session break — the lesson pauses, and when the chat
 * ends (button again, or 20 seconds of quiet) the session is closed and the
 * lesson resumes at the beat it was holding.
 *
 * Full duplex here on purpose: this is conversation, so the child may
 * interrupt her freely.
 *
 * IT NEVER FAILS SILENTLY (28 Sep 2026). A chat that cannot open — the day's
 * chat time is spent (429), no network, no session, the live connection
 * closing — keeps its panel open with Zara saying what happened, in Sinhala,
 * until the child closes it; the reason goes to the debug overlay. It used to
 * resolve at once, and the panel appeared and vanished.
 *
 * ITS TIME IS CHARGED BY THE SECOND (src/lib/chatBudgetRules.ts): the server
 * holds what one opening may use and says how long that is; the chat closes
 * itself at that point, and reports its connected seconds when it closes (and
 * by beacon if the page goes away).
 *
 * IT WARNS BEFORE IT CLOSES (29 Sep 2026, src/lib/timeWarnings.ts): five
 * minutes before this chat must close Zara says "අපි තව පොඩ්ඩක් කතා කරමු, ඊට
 * පස්සේ පාඩමට යමු නේද?", and one minute before, "දැන් අන්තිම ප්‍රශ්නේ අහන්න,
 * ඊට පස්සේ පාඩම දිගටම කරමු." — each once, on the panel as her line and in her
 * recorded voice, and only once she has finished what she is saying (her turn
 * complete, her audio played out). At the limit the microphone stops, she
 * finishes her sentence, and the chat closes by itself; the lesson carries on
 * from the beat it was holding. It used to stop at the limit with a failure
 * line and wait for the child to close it.
 */

/** Why a chat could not go on, and the line Zara says about it on the panel. */
export type ChatFailureKind = "budget" | "network" | "start" | "dropped";
const FAILURE_LINE: Record<ChatFailureKind, CopyKey> = {
  budget: "chat.outOfTime",
  network: "chat.failNetwork",
  start: "chat.failStart",
  dropped: "chat.failDropped",
};
/** Her words for each warning (src/lib/authoredLines.ts — recorded like every line she says). */
const WARNING_LINE: Record<TimeWarning, string> = { soon: AUTHORED_LINES.chatTimeSoon, last: AUTHORED_LINES.chatTimeLast };
/** How often the chat looks at its clock for a warning, and for her finishing at the limit. */
const WARNING_TICK_MS = 250;
/** A warning whose clip is still being fetched waits this long for it, then is shown without her voice. */
const WARNING_CLIP_WAIT_MS = 4000;
/** At the limit: she must have been quiet this long (turn complete, audio played out) before the chat closes. */
const CLOSE_SETTLE_MS = 300;
/** At the limit: the longest she may take to finish (a turn that never completes must not hold the chat open). */
const CLOSE_GRACE_MS = 30_000;
export interface ChatFailure {
  kind: ChatFailureKind;
  /** What Zara says on the panel. */
  line: string;
  /** For the debug overlay. */
  reason: string;
}

const TOOL_ENDPOINTS: Record<string, string> = {
  search_syllabus: "/api/tools/search-syllabus",
  show_page_image: "/api/tools/show-page-image",
  next_page: "/api/tools/next-page",
  previous_page: "/api/tools/previous-page",
  zoom_to_region: "/api/tools/zoom-to-region",
  zoom_out: "/api/tools/zoom-out",
  clear_board: "/api/tools/clear-board",
};

/** Quiet after which a chat that nobody is using closes itself. */
const CHAT_IDLE_TIMEOUT_MS = 20000;

export interface LiveChatHandle {
  chatting: boolean;
  /** Why the last chat could not open or ended early — for the debug overlay. */
  error: string | null;
  /** The chat that could not go on: its panel stays, with this line, until the child closes it. */
  failure: ChatFailure | null;
  /** Today's chat time, as the server last told it (null until asked) — the debug overlay shows what is left. */
  budget: ChatBudgetView | null;
  /** The last time warning she said in this chat (null before either). */
  warning: TimeWarning | null;
  /** The chat is at its limit: the microphone is off and it closes once she has finished her sentence. */
  closing: boolean;
  /** Asks the server how much chat time is left today. */
  refreshBudget: () => Promise<void>;
  /** DEV_MODE / the harness: put a typed line to the model as if the child had said it. */
  sendText: (text: string) => boolean;
  /** The live transcript's last two lines — what the child said, what Zara said — from the session's own transcriptions. */
  transcript: { child: string; zara: string };
  /** Connected seconds so far this session — feeds the audio-cost split. */
  liveSecondsRef: React.RefObject<number>;
  /**
   * Opens a chat and RESOLVES WHEN IT ENDS, so the lesson can simply
   * `await` it. `opener` is spoken by the model as its first turn.
   */
  runChat: (options: {
    stream: MediaStream;
    opener?: string;
    /** Where the child is — minted into the session's system prompt. */
    context?: ChatContext;
    /** The chat's read-only board tools (point_at, highlight_board). */
    onBoardTool?: (name: string, args: Record<string, unknown>) => void;
    /** Why it could not go on (the runtime logs it to the debug overlay). */
    onFailure?: (failure: ChatFailure) => void;
    /** Her recorded clip for an authored line, decoded (null: not recorded yet — the warning is then shown, not heard). */
    loadLine?: (text: string) => Promise<AudioBuffer | null>;
    /** A warning said, or the chat closing at its limit — for the debug overlay. */
    onEvent?: (message: string) => void;
  }) => Promise<void>;
  /** Ends the chat now (the button, or the lesson stopping). */
  endChat: () => void;
  /** DEV_MODE / the harness: set the transcript lines as if the session had delivered them. */
  injectTranscript: (lines: { child?: string; zara?: string }) => void;
}

export function useLiveChat(): LiveChatHandle {
  const [chatting, setChatting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<{ child: string; zara: string }>({ child: "", zara: "" });
  const [failure, setFailure] = useState<ChatFailure | null>(null);
  const [budget, setBudget] = useState<ChatBudgetView | null>(null);
  const [warning, setWarning] = useState<TimeWarning | null>(null);
  const [closing, setClosing] = useState(false);
  /** Whose line is being built: a new speaker starts a fresh line. */
  const speakingRef = useRef<"child" | "zara" | null>(null);
  const clientRef = useRef<GeminiLiveClient | null>(null);
  const recorderRef = useRef<PcmRecorderHandle | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endRef = useRef<(() => void) | null>(null);
  const liveSecondsRef = useRef(0);

  const endChat = useCallback(() => {
    endRef.current?.();
  }, []);

  const refreshBudget = useCallback(async () => {
    try {
      const response = await fetch("/api/chat-usage");
      const json = (await response.json()) as { budget?: ChatBudgetView };
      if (json.budget) setBudget(json.budget);
    } catch {
      // the overlay keeps the last figure
    }
  }, []);

  const runChat = useCallback(
    ({
      stream,
      opener,
      context,
      onBoardTool,
      onFailure,
      loadLine,
      onEvent,
    }: {
      stream: MediaStream;
      opener?: string;
      context?: ChatContext;
      onBoardTool?: (name: string, args: Record<string, unknown>) => void;
      onFailure?: (failure: ChatFailure) => void;
      loadLine?: (text: string) => Promise<AudioBuffer | null>;
      onEvent?: (message: string) => void;
    }) =>
      new Promise<void>((resolve) => {
        // Her replies are ONE chunk stream in the audio manager: back to back, one clip to the no-overlap rule, and
        // opening it claims the speaker (whatever the lesson was saying has already stopped).
        const speaker = audio.openStream("✋ chat");
        let finished = false;
        let failed = false;
        let ready = false;
        /** When the live connection was ready: the chat's time is counted from here. */
        let connectedAt = 0;
        /** The server's hold for this opening (null: exempt, or no budget table). */
        let openId: string | null = null;
        let reported = false;
        let capTimer: ReturnType<typeof setTimeout> | null = null;
        let warningTimer: ReturnType<typeof setInterval> | null = null;
        /** We closed the socket ourselves (a close after this is not a failure). */
        let closing = false;
        /** How long this opening may run (the server's hold); the warnings count down to it. */
        let allowedSeconds: number = CHAT_MAX_OPEN_SECONDS;
        /** She is in a turn: from its first audio (or words) until the server says the turn is complete. */
        let modelTurn = false;
        const said: TimeWarning[] = [];
        /** Her two warning clips, fetched when the chat connects: undefined while in flight, null when not recorded. */
        const warningClip: Partial<Record<TimeWarning, AudioBuffer | null>> = {};
        /** When a warning first fell due (its clip may still be on its way). */
        const dueSince: Partial<Record<TimeWarning, number>> = {};
        /** At the limit: the microphone is off and the chat closes once she is quiet. */
        let atLimit = false;
        /** For the harness: each warning as it is said, and how the chat closed at its limit (page clock). */
        const trace = window as unknown as { __chatWarnings?: Array<{ kind: TimeWarning; line: string; at: number; remaining: number; clip: boolean }>; __chatClose?: { at: number; waitedMs: number; how: "quiet" | "grace" } | null };
        trace.__chatWarnings = [];
        trace.__chatClose = null;
        setFailure(null);
        setError(null);
        setWarning(null);
        setClosing(false);
        const connectedSeconds = () => (ready ? (Date.now() - connectedAt) / 1000 : 0);
        /** The chat's connected seconds, to the server — once: on close, or by beacon when the page goes away. */
        const report = (how: "close" | "beacon") => {
          if (reported || !openId) return;
          reported = true;
          const body = JSON.stringify({ openId, seconds: Math.round(connectedSeconds() * 10) / 10 });
          if (how === "beacon" && typeof navigator.sendBeacon === "function") {
            navigator.sendBeacon("/api/chat-usage", new Blob([body], { type: "text/plain" }));
            return;
          }
          void fetch("/api/chat-usage", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true })
            .then((response) => response.json())
            .then((json: { budget?: ChatBudgetView }) => {
              if (json.budget) setBudget(json.budget);
              // For the harness's drill: what the server charged this chat.
              (window as unknown as { __chatUsage?: unknown }).__chatUsage = json;
            })
            .catch(() => undefined);
        };
        const onUnload = () => report("beacon");
        window.addEventListener("pagehide", onUnload);
        /** Mic, socket, timers and her voice go; the time is reported. */
        const teardown = () => {
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
          idleTimerRef.current = null;
          if (capTimer) clearTimeout(capTimer);
          capTimer = null;
          if (warningTimer) clearInterval(warningTimer);
          warningTimer = null;
          setClosing(false);
          window.removeEventListener("pagehide", onUnload);
          liveSecondsRef.current += Math.round(connectedSeconds());
          recorderRef.current?.stop();
          recorderRef.current = null;
          closing = true;
          clientRef.current?.close();
          clientRef.current = null;
          speaker.end();
          report("close");
          setChatting(false);
          speakingRef.current = null;
        };
        /** The chat is over — the child closed it, or it went quiet. */
        const finish = () => {
          if (finished) return;
          finished = true;
          if (!failed) teardown();
          endRef.current = null;
          setFailure(null);
          resolve();
        };
        /**
         * The chat cannot go on: the panel STAYS, with Zara's line, until the child closes it (finish); the reason goes
         * to the debug overlay. Never a panel that appears and vanishes.
         */
        const fail = (kind: ChatFailureKind, reason: string) => {
          if (finished || failed) return;
          failed = true;
          teardown();
          const failure: ChatFailure = { kind, line: t(FAILURE_LINE[kind]), reason };
          console.warn(`[useLiveChat] the chat could not go on (${kind}): ${reason}`);
          setError(`${kind}: ${reason}`);
          setFailure(failure);
          onFailure?.(failure);
        };
        endRef.current = finish;

        const touchIdle = () => {
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
          idleTimerRef.current = setTimeout(finish, CHAT_IDLE_TIMEOUT_MS);
        };

        /** She is saying something: a turn in progress, or her audio (or a warning) still playing out. */
        const speaking = () => modelTurn || speaker.queuedMs() > 0;
        /**
         * A warning, said the moment it is due and she is quiet: her line on the panel and her recorded clip in the same
         * queue as her live voice, in one go — so it can never land inside a sentence of hers, and whatever she says next
         * waits for it.
         */
        const sayWarning = (kind: TimeWarning, remaining: number) => {
          said.push(kind);
          const line = WARNING_LINE[kind];
          speakingRef.current = null; // her next words start a fresh line under it
          setTranscript((t) => ({ ...t, zara: line }));
          setWarning(kind);
          const clip = warningClip[kind] ?? null;
          const heard = clip ? speaker.pushBuffer(clip, `✋ chat · ${kind} warning`) : false;
          touchIdle();
          trace.__chatWarnings?.push({ kind, line, at: performance.now(), remaining: Math.round(remaining * 10) / 10, clip: heard });
          onEvent?.(`✋ ${kind === "soon" ? "five" : "one"}-minute warning (${Math.round(remaining)} s left${heard ? "" : ", no clip — shown only"})`);
        };
        /** The limit: no new question (the microphone stops), then the chat closes as soon as she has finished. */
        const closeAtLimit = () => {
          if (finished || failed || atLimit) return;
          atLimit = true;
          setClosing(true);
          recorderRef.current?.stop();
          recorderRef.current = null;
          const began = performance.now();
          let quietSince = speaking() ? 0 : began;
          onEvent?.(`✋ this chat's ${allowedSeconds} s are up — closing ${speaking() ? "once she finishes her sentence" : "now"}`);
          const settle = setInterval(() => {
            if (finished || failed) {
              clearInterval(settle);
              return;
            }
            const now = performance.now();
            if (speaking()) quietSince = 0;
            else if (quietSince === 0) quietSince = now;
            const quiet = quietSince > 0 && now - quietSince >= CLOSE_SETTLE_MS;
            const grace = now - began >= CLOSE_GRACE_MS;
            if (!quiet && !grace) return;
            clearInterval(settle);
            trace.__chatClose = { at: now, waitedMs: Math.round(now - began), how: quiet ? "quiet" : "grace" };
            onEvent?.(`✋ chat closed at its limit after ${Math.round(now - began)} ms (${quiet ? "she had finished" : "she had not finished in 30 s"})`);
            finish();
          }, 100);
        };
        const checkWarnings = () => {
          if (finished || failed || !ready || atLimit) return;
          const remaining = allowedSeconds - connectedSeconds();
          const due = warningDue(remaining, { startedWith: allowedSeconds, said });
          if (!due || speaking()) return;
          dueSince[due] ??= performance.now();
          // Her clip was fetched when the chat connected; one still on its way is waited for a moment, then let go.
          if (warningClip[due] === undefined && loadLine && performance.now() - dueSince[due]! < WARNING_CLIP_WAIT_MS) return;
          sayWarning(due, remaining);
        };

        void (async () => {
          try {
            let response: Response;
            try {
              response = await fetch("/api/gemini-session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ context: context ?? null }),
              });
            } catch (error) {
              fail("network", `the chat session request did not reach the server (${error instanceof Error ? error.message : String(error)})`);
              return;
            }
            if (finished) return;
            const json = (await response.json().catch(() => ({}))) as { token?: string; model?: string; error?: string; budget?: ChatBudgetView; chat?: { openId: string | null; allowedSeconds: number; budget: ChatBudgetView } };
            if (response.status === 429 && json.error === "chat_budget_spent") {
              if (json.budget) setBudget(json.budget);
              fail("budget", `429 chat_budget_spent — ${json.budget ? `${Math.round(json.budget.usedSeconds)} of ${json.budget.limitSeconds} s used today` : "no figures"}`);
              return;
            }
            if (!response.ok || !json.token || !json.model) {
              fail("start", `/api/gemini-session answered ${response.status}${json.error ? ` (${json.error})` : ""}`);
              return;
            }
            const { token, model } = json;
            openId = json.chat?.openId ?? null;
            if (json.chat?.budget) setBudget(json.chat.budget);
            // This opening's time: warned at five minutes and one, and closed when it is up (the day spent, or one chat's longest stretch).
            allowedSeconds = json.chat?.allowedSeconds ?? CHAT_MAX_OPEN_SECONDS;

            const client = new GeminiLiveClient({
              onReady: async () => {
                if (finished || failed) return;
                ready = true;
                connectedAt = Date.now();
                setError(null);
                setTranscript({ child: "", zara: "" });
                setChatting(true);
                touchIdle();
                for (const kind of ["soon", "last"] as const) {
                  if (!loadLine) warningClip[kind] = null;
                  else
                    void loadLine(WARNING_LINE[kind])
                      .catch(() => null)
                      .then((clip) => {
                        warningClip[kind] = clip;
                      });
                }
                warningTimer = setInterval(checkWarnings, WARNING_TICK_MS);
                capTimer = setTimeout(closeAtLimit, allowedSeconds * 1000);
                recorderRef.current = await startPcmRecorder(stream, (chunk) => {
                  // Full duplex: everything goes, interruptions included.
                  client.sendAudioChunk(chunk);
                });
                client.sendTextInput(
                  opener ??
                    (context
                      ? // 18 Sep (the device walk, issue 11): she does NOT narrate where they are. A child on the same screen may ask
                        // about many different things — she invites the question in a few words, then simply answers it.
                        "The child has opened the chat during the lesson; the board is still in front of them. Say ONLY a very short, warm Sinhala invitation to ask (three or four words — for example asking what they would like to know). Do NOT describe the board, the lesson or what you were doing, and do not guess their question. Then listen, and answer whatever they ask about anything on the board."
                      : "The child has opened a free chat with you. Say one short, warm Sinhala sentence inviting " +
                        "them to tell you anything, then listen."),
                );
              },
              onAudioChunk: (chunk) => {
                touchIdle();
                modelTurn = true;
                speaker.push(chunk);
              },
              onInputTranscript: (text) => {
                touchIdle();
                const fresh = speakingRef.current !== "child";
                speakingRef.current = "child";
                setTranscript((t) => ({ ...t, child: `${fresh ? "" : t.child}${text}`.slice(-140) }));
              },
              onOutputTranscript: (text) => {
                modelTurn = true;
                const fresh = speakingRef.current !== "zara";
                speakingRef.current = "zara";
                setTranscript((t) => ({ ...t, zara: `${fresh ? "" : t.zara}${text}`.slice(-140) }));
              },
              onInterrupted: () => {
                modelTurn = false;
                speaker.interrupt();
              },
              onTurnComplete: () => {
                modelTurn = false;
              },
              onToolCall: async (calls: FunctionCall[]) => {
                const responses = await Promise.all(
                  calls.map(async (call) => {
                    // The board tools are answered on the client: they move
                    // the pointer or draw a ring on the lesson's own board.
                    if (call.name === "point_at" || call.name === "highlight_board") {
                      onBoardTool?.(call.name, (call.args ?? {}) as Record<string, unknown>);
                      return { id: call.id, name: call.name, response: { ok: true } };
                    }
                    const endpoint = call.name ? TOOL_ENDPOINTS[call.name] : undefined;
                    if (!endpoint) return { id: call.id, name: call.name, response: { ok: false } };
                    try {
                      const result = await fetch(endpoint, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(call.args ?? {}),
                      });
                      return { id: call.id, name: call.name, response: await result.json() };
                    } catch {
                      return { id: call.id, name: call.name, response: { ok: false } };
                    }
                  }),
                );
                client.sendToolResponse(responses);
              },
              onClose: (event) => {
                // We closed it (the child, the quiet, the time) — nothing to say. Otherwise the connection went away.
                if (closing) return;
                fail("dropped", `the live connection closed ${ready ? "mid-chat" : "before it was ready"} (code ${event.code}${event.reason ? `: ${event.reason}` : ""})`);
              },
              onError: (why?: unknown) => {
                if (closing) return;
                fail("dropped", why instanceof Error ? why.message : typeof why === "string" ? why : "the live session closed with an error");
              },
            });
            clientRef.current = client;
            client.connect(token, model);
          } catch (error) {
            console.error("[useLiveChat] Could not open the chat:", error);
            fail("start", error instanceof Error ? error.message : String(error));
          }
        })();
      }),
    [],
  );

  const sendText = useCallback((text: string): boolean => {
    const client = clientRef.current;
    if (!client) return false;
    client.sendTextInput(text);
    return true;
  }, []);

  /** DEV_MODE / the harness: what the transcription channel would have delivered, without a session — for asserting where it does and does not appear. */
  const injectTranscript = useCallback((lines: { child?: string; zara?: string }) => {
    setTranscript((t) => ({ child: lines.child ?? t.child, zara: lines.zara ?? t.zara }));
  }, []);

  return { chatting, transcript, liveSecondsRef, runChat, endChat, error, failure, budget, warning, closing, refreshBudget, sendText, injectTranscript };
}
