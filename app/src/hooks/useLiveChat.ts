import { useCallback, useRef, useState } from "react";
import { GeminiLiveClient, type FunctionCall } from "@/lib/geminiLiveClient";
import { startPcmRecorder, type PcmPlayer, type PcmRecorderHandle } from "@/lib/pcmAudio";
import type { ChatContext } from "@/lib/chatContext";

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
 */

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
    player: PcmPlayer;
    opener?: string;
    /** Where the child is — minted into the session's system prompt. */
    context?: ChatContext;
    /** The chat's read-only board tools (point_at, highlight_board). */
    onBoardTool?: (name: string, args: Record<string, unknown>) => void;
  }) => Promise<void>;
  /** Ends the chat now (the button, or the lesson stopping). */
  endChat: () => void;
}

export function useLiveChat(): LiveChatHandle {
  const [chatting, setChatting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<{ child: string; zara: string }>({ child: "", zara: "" });
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

  const runChat = useCallback(
    ({
      stream,
      player,
      opener,
      context,
      onBoardTool,
    }: {
      stream: MediaStream;
      player: PcmPlayer;
      opener?: string;
      context?: ChatContext;
      onBoardTool?: (name: string, args: Record<string, unknown>) => void;
    }) =>
      new Promise<void>((resolve) => {
        const connectedAt = Date.now();
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
          idleTimerRef.current = null;
          liveSecondsRef.current += Math.round((Date.now() - connectedAt) / 1000);
          recorderRef.current?.stop();
          recorderRef.current = null;
          clientRef.current?.close();
          clientRef.current = null;
          endRef.current = null;
          player.clear();
          setChatting(false);
          speakingRef.current = null;
          resolve();
        };
        endRef.current = finish;

        const touchIdle = () => {
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
          idleTimerRef.current = setTimeout(finish, CHAT_IDLE_TIMEOUT_MS);
        };

        void (async () => {
          try {
            const response = await fetch("/api/gemini-session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ context: context ?? null }),
            });
            if (!response.ok) throw new Error("could not start a chat session");
            const { token, model } = await response.json();

            let ready = false;
            const client = new GeminiLiveClient({
              onReady: async () => {
                ready = true;
                setError(null);
                setTranscript({ child: "", zara: "" });
                setChatting(true);
                touchIdle();
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
                player.enqueue(chunk);
              },
              onInputTranscript: (text) => {
                touchIdle();
                const fresh = speakingRef.current !== "child";
                speakingRef.current = "child";
                setTranscript((t) => ({ ...t, child: `${fresh ? "" : t.child}${text}`.slice(-140) }));
              },
              onOutputTranscript: (text) => {
                const fresh = speakingRef.current !== "zara";
                speakingRef.current = "zara";
                setTranscript((t) => ({ ...t, zara: `${fresh ? "" : t.zara}${text}`.slice(-140) }));
              },
              onInterrupted: () => player.clear(),
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
                // Closed before the session was ready: a connect failure, said with the socket's code and reason (the overlay and data-chat-error show it).
                if (!ready) setError(`the live connection closed before it was ready (code ${event.code}${event.reason ? `: ${event.reason}` : ""})`);
                finish();
              },
              onError: (why?: unknown) => {
                setError(why instanceof Error ? why.message : typeof why === "string" ? why : "the live session closed with an error");
                finish();
              },
            });
            clientRef.current = client;
            client.connect(token, model);
          } catch (error) {
            console.error("[useLiveChat] Could not open the chat:", error);
            setError(error instanceof Error ? error.message : String(error));
            finish();
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

  return { chatting, transcript, liveSecondsRef, runChat, endChat, error, sendText };
}
