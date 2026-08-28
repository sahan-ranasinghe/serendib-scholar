"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GeminiLiveClient, type FunctionCall } from "@/lib/geminiLiveClient";
import { PcmPlayer, startPcmRecorder, type PcmRecorderHandle } from "@/lib/pcmAudio";

export type SessionStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "error";

const TOOL_ENDPOINTS: Record<string, string> = {
  search_syllabus: "/api/tools/search-syllabus",
  log_answer: "/api/tools/log-answer",
  flag_weakness: "/api/tools/flag-weakness",
  request_teacher_review: "/api/tools/request-teacher-review",
};

async function executeToolCall(call: FunctionCall, childId: string) {
  const endpoint = call.name ? TOOL_ENDPOINTS[call.name] : undefined;
  if (!endpoint) {
    return { error: `Unknown tool: ${call.name}` };
  }
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...call.args, child_id: childId }),
    });
    return await res.json();
  } catch (error) {
    console.error(`[useGeminiLive] Tool call ${call.name} failed:`, error);
    return { error: "Tool execution failed" };
  }
}

export interface UseGeminiLiveOptions {
  /** Identifies whose progress/safety events get logged. */
  childId: string;
}

export function useGeminiLive({ childId }: UseGeminiLiveOptions) {
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [outputTranscript, setOutputTranscript] = useState("");
  const [inputTranscript, setInputTranscript] = useState("");

  const clientRef = useRef<GeminiLiveClient | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);
  const recorderRef = useRef<PcmRecorderHandle | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    playerRef.current?.close();
    playerRef.current = null;
    clientRef.current?.close();
    clientRef.current = null;
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setStatus("connecting");

    try {
      const sessionRes = await fetch("/api/gemini-session", { method: "POST" });
      if (!sessionRes.ok) {
        throw new Error("Could not start a study session. Please try again.");
      }
      const { token, model } = await sessionRes.json();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const player = new PcmPlayer();
      await player.resume();
      playerRef.current = player;

      const client = new GeminiLiveClient({
        onReady: async () => {
          setStatus("listening");
          const recorder = await startPcmRecorder(stream, (chunk) => {
            client.sendAudioChunk(chunk);
          });
          recorderRef.current = recorder;
        },
        onAudioChunk: (chunk) => player.enqueue(chunk),
        onInterrupted: () => player.clear(),
        onInputTranscript: (text) => setInputTranscript((prev) => prev + text),
        onOutputTranscript: (text) => setOutputTranscript((prev) => prev + text),
        onTurnComplete: () => {
          setInputTranscript("");
          setOutputTranscript("");
        },
        onToolCall: async (calls) => {
          const functionResponses = await Promise.all(
            calls.map(async (call) => ({
              id: call.id,
              name: call.name,
              response: await executeToolCall(call, childId),
            })),
          );
          client.sendToolResponse(functionResponses);
        },
        onError: (err) => {
          console.error("[useGeminiLive] WebSocket error:", err);
          setError("Connection lost. Please try again.");
          setStatus("error");
        },
        onClose: () => {
          if (status !== "error") setStatus("idle");
        },
      });

      clientRef.current = client;
      client.connect(token, model);
    } catch (err) {
      console.error("[useGeminiLive] Failed to start session:", err);
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
      stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId, stop]);

  useEffect(() => stop, [stop]);

  return { status, error, inputTranscript, outputTranscript, start, stop };
}
