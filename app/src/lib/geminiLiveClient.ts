/**
 * Thin wrapper around a raw WebSocket connection to the Gemini Live
 * (BidiGenerateContent) API, driven by a short-lived ephemeral token minted
 * server-side by /api/gemini-session. The model, system prompt, and tools
 * are locked into the token itself, so the client only needs to open the
 * socket, stream mic audio in, and react to audio/tool-call events coming
 * back out.
 */

const WEBSOCKET_BASE_URL = "wss://generativelanguage.googleapis.com";
const API_VERSION = "v1alpha";

export interface FunctionCall {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
}

export interface GeminiLiveClientCallbacks {
  onOpen?: () => void;
  onReady?: () => void;
  /** Base64-encoded PCM16 audio chunk at 24kHz. */
  onAudioChunk?: (base64Pcm16: string) => void;
  onInterrupted?: () => void;
  onTurnComplete?: () => void;
  onInputTranscript?: (text: string) => void;
  onOutputTranscript?: (text: string) => void;
  onToolCall?: (calls: FunctionCall[]) => void;
  onError?: (error: Event | Error) => void;
  onClose?: (event: CloseEvent) => void;
}

export class GeminiLiveClient {
  private socket: WebSocket | null = null;
  private callbacks: GeminiLiveClientCallbacks;

  constructor(callbacks: GeminiLiveClientCallbacks = {}) {
    this.callbacks = callbacks;
  }

  connect(ephemeralToken: string, model: string): void {
    const url = `${WEBSOCKET_BASE_URL}/ws/google.ai.generativelanguage.${API_VERSION}.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(ephemeralToken)}`;
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.onopen = () => {
      this.callbacks.onOpen?.();
      // Model/systemInstruction/tools are locked server-side via the
      // ephemeral token's liveConnectConstraints; this just satisfies the
      // protocol's requirement for an initial setup message.
      this.send({
        setup: {
          model,
          generationConfig: { responseModalities: ["AUDIO"] },
        },
      });
    };

    socket.onmessage = async (event: MessageEvent) => {
      const text =
        typeof event.data === "string" ? event.data : await (event.data as Blob).text();
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(text);
      } catch {
        return;
      }
      this.handleMessage(message);
    };

    socket.onerror = (event) => this.callbacks.onError?.(event);
    socket.onclose = (event) => this.callbacks.onClose?.(event);
  }

  private handleMessage(message: Record<string, unknown>): void {
    if (message.setupComplete) {
      this.callbacks.onReady?.();
      return;
    }

    const toolCall = message.toolCall as { functionCalls?: FunctionCall[] } | undefined;
    if (toolCall?.functionCalls?.length) {
      this.callbacks.onToolCall?.(toolCall.functionCalls);
    }

    const serverContent = message.serverContent as
      | {
          modelTurn?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
          interrupted?: boolean;
          turnComplete?: boolean;
          inputTranscription?: { text?: string };
          outputTranscription?: { text?: string };
        }
      | undefined;

    if (serverContent?.interrupted) {
      this.callbacks.onInterrupted?.();
    }

    for (const part of serverContent?.modelTurn?.parts ?? []) {
      if (part.inlineData?.data && part.inlineData.mimeType?.startsWith("audio/")) {
        this.callbacks.onAudioChunk?.(part.inlineData.data);
      }
    }

    if (serverContent?.inputTranscription?.text) {
      this.callbacks.onInputTranscript?.(serverContent.inputTranscription.text);
    }
    if (serverContent?.outputTranscription?.text) {
      this.callbacks.onOutputTranscript?.(serverContent.outputTranscription.text);
    }

    if (serverContent?.turnComplete) {
      this.callbacks.onTurnComplete?.();
    }
  }

  sendAudioChunk(base64Pcm16: string): void {
    this.send({
      realtimeInput: {
        audio: { data: base64Pcm16, mimeType: "audio/pcm;rate=16000" },
      },
    });
  }

  /**
   * Sends a complete text turn from the user — e.g. an answer typed/tapped
   * on the board instead of spoken (see submit_blank_answer's UI
   * counterpart in LessonComponents.tsx). Uses `clientContent` (a discrete,
   * turn-complete conversational turn) rather than `realtimeInput` (for
   * continuous low-latency streaming like mic audio) since this is a
   * one-shot input the model should respond to immediately, not a
   * streaming fragment. The concurrent mic audio stream is unaffected —
   * the Live API accepts mixed text/audio input within one session.
   */
  sendTextInput(text: string): void {
    this.send({
      clientContent: {
        turns: [{ role: "user", parts: [{ text }] }],
        turnComplete: true,
      },
    });
  }

  sendToolResponse(functionResponses: Array<{ id?: string; name?: string; response: Record<string, unknown> }>): void {
    this.send({ toolResponse: { functionResponses } });
  }

  private send(payload: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
  }
}
