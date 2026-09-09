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

            const client = new GeminiLiveClient({
              onReady: async () => {
                setChatting(true);
                touchIdle();
                recorderRef.current = await startPcmRecorder(stream, (chunk) => {
                  // Full duplex: everything goes, interruptions included.
                  client.sendAudioChunk(chunk);
                });
                client.sendTextInput(
                  opener ??
                    (context
                      ? "The child has raised their hand during the lesson. In ONE short Sinhala sentence, acknowledge where they are (name the thing on the board) and ask what their doubt is, then listen."
                      : "The child has opened a free chat with you. Say one short, warm Sinhala sentence inviting " +
                        "them to tell you anything, then listen."),
                );
              },
              onAudioChunk: (chunk) => {
                touchIdle();
                player.enqueue(chunk);
              },
              onInputTranscript: touchIdle,
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
              onClose: finish,
              onError: finish,
            });
            clientRef.current = client;
            client.connect(token, model);
          } catch (error) {
            console.error("[useLiveChat] Could not open the chat:", error);
            finish();
          }
        })();
      }),
    [],
  );

  return { chatting, liveSecondsRef, runChat, endChat };
}
