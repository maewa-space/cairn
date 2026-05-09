// AudioWorklet processor that downsamples Float32 mic audio to 16kHz mono
// Int16 PCM and posts each frame back to the main thread for forwarding to
// Deepgram. Runs off the audio rendering thread so the main JS context
// stays responsive.
//
// Loaded via audioCtx.audioWorklet.addModule(<this file>) in the renderer.
//
// This file ships as raw JS (no bundler transform) — keep it minimal,
// browser-native, no imports.

class PcmProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { targetSampleRate = 16000 } = options?.processorOptions ?? {};
    this.targetSampleRate = targetSampleRate;
    this.inputSampleRate = sampleRate; // global from AudioWorkletGlobalScope
    this.ratio = this.inputSampleRate / this.targetSampleRate;
    // Carry-over buffer across process() calls so we don't re-fragment frames.
    this._carry = new Float32Array(0);
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    // Mix down channels to mono.
    const channelCount = input.length;
    const len = input[0].length;
    const mono = new Float32Array(len);
    if (channelCount === 1) {
      mono.set(input[0]);
    } else {
      for (let i = 0; i < len; i++) {
        let sum = 0;
        for (let c = 0; c < channelCount; c++) sum += input[c][i];
        mono[i] = sum / channelCount;
      }
    }
    // Concatenate carry-over.
    const buf = new Float32Array(this._carry.length + mono.length);
    buf.set(this._carry);
    buf.set(mono, this._carry.length);

    // Downsample by averaging windows of `ratio` samples (cheap anti-alias).
    const outCount = Math.floor(buf.length / this.ratio);
    if (outCount === 0) {
      this._carry = buf;
      return true;
    }
    const out = new Int16Array(outCount);
    for (let i = 0; i < outCount; i++) {
      const start = Math.floor(i * this.ratio);
      const end = Math.floor((i + 1) * this.ratio);
      let sum = 0;
      let n = 0;
      for (let j = start; j < end && j < buf.length; j++) {
        sum += buf[j];
        n++;
      }
      const avg = n > 0 ? sum / n : 0;
      const clamped = Math.max(-1, Math.min(1, avg));
      out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }
    // Save tail.
    const consumed = Math.floor(outCount * this.ratio);
    this._carry = buf.slice(consumed);

    // Post the Int16 frame as a transferable ArrayBuffer.
    this.port.postMessage(out.buffer, [out.buffer]);
    return true;
  }
}

registerProcessor('pcm-processor', PcmProcessor);
