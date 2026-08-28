// AudioWorkletProcessor that runs on the audio rendering thread.
// The owning AudioContext is created with sampleRate: 16000, so the
// Float32 frames arriving here are already at 16kHz — we only need to
// convert them to PCM16 and hand the raw bytes back to the main thread.
class PcmRecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel && channel.length > 0) {
      const pcm16 = new Int16Array(channel.length);
      for (let i = 0; i < channel.length; i++) {
        const sample = Math.max(-1, Math.min(1, channel[i]));
        pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }
      this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    }
    return true;
  }
}

registerProcessor("pcm-recorder-worklet", PcmRecorderProcessor);
