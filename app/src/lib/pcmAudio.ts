/**
 * Mic capture (AudioWorklet -> 16kHz PCM16) for the Gemini Live duplex audio
 * stream; its 24kHz PCM16 replies play as a chunk stream in the one audio
 * manager (src/lib/audioManager.ts). Gemini Live speaks in raw PCM16 mono
 * chunks, base64-encoded inside the WebSocket JSON frames — no browser codec
 * is involved on either side.
 */

import { audio } from "@/lib/audioManager";

export const INPUT_SAMPLE_RATE = 16000;

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export interface PcmRecorderHandle {
  stop: () => void;
}

/**
 * Starts capturing microphone audio and invokes `onChunk` with base64-encoded
 * PCM16 frames at 16kHz, ready to send as `realtimeInput.audio.data`.
 */
export async function startPcmRecorder(
  stream: MediaStream,
  onChunk: (base64Pcm16: string) => void,
): Promise<PcmRecorderHandle> {
  // Capture only — made by the audio manager, which owns every AudioContext in the app.
  const audioContext = audio.captureContext(INPUT_SAMPLE_RATE);
  await audioContext.audioWorklet.addModule("/worklets/pcm-recorder-worklet.js");

  const source = audioContext.createMediaStreamSource(stream);
  const worklet = new AudioWorkletNode(audioContext, "pcm-recorder-worklet");

  worklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
    onChunk(arrayBufferToBase64(event.data));
  };

  source.connect(worklet);
  // The worklet doesn't need to reach the speakers — connect to a muted
  // destination-less path so the graph stays alive without echoing input.
  const silentGain = audioContext.createGain();
  silentGain.gain.value = 0;
  worklet.connect(silentGain);
  silentGain.connect(audioContext.destination);

  return {
    stop: () => {
      worklet.port.onmessage = null;
      source.disconnect();
      worklet.disconnect();
      silentGain.disconnect();
      void audioContext.close();
    },
  };
}

// Playback lives in the one audio manager (src/lib/audioManager.ts): the ✋ chat's PCM is a chunk stream there
// (audio.openStream), and nothing else in the app starts a source.
