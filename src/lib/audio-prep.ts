export const TARGET_RATE = 16_000;
const FRAME_MS = 20;
const PAD_MS = 160;
const MIN_SPEECH_MS = 280;
const SPEECH_RMS = 0.018;
const TARGET_PEAK = 0.75;

export type PreparedAudio =
  | { ok: true; audio: Float32Array; sampleRate: number; seconds: number; speechSeconds: number }
  | { ok: false; reason: "too-short" | "too-quiet" };

export function rms(frame: Float32Array): number {
  if (frame.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}

export function peak(audio: Float32Array): number {
  let max = 0;
  for (let i = 0; i < audio.length; i++) {
    const v = Math.abs(audio[i]);
    if (v > max) max = v;
  }
  return max;
}

export function normalizePeak(audio: Float32Array, target = TARGET_PEAK): Float32Array {
  const p = peak(audio);
  if (p < 1e-5) return audio;
  const gain = Math.min(target / p, 12);
  const out = new Float32Array(audio.length);
  for (let i = 0; i < audio.length; i++) out[i] = audio[i] * gain;
  return out;
}

export function prepareCapture(audio: Float32Array, sampleRate = TARGET_RATE): PreparedAudio {
  const seconds = audio.length / sampleRate;
  if (seconds < 0.35) return { ok: false, reason: "too-short" };

  const frame = Math.max(1, Math.round(sampleRate * (FRAME_MS / 1000)));
  const pad = Math.round(sampleRate * (PAD_MS / 1000));
  let first = -1;
  let last = -1;
  let speechSamples = 0;

  for (let i = 0; i + frame <= audio.length; i += frame) {
    const slice = audio.subarray(i, i + frame);
    if (rms(slice) >= SPEECH_RMS) {
      if (first < 0) first = i;
      last = i + frame;
      speechSamples += frame;
    }
  }

  if (first < 0 || speechSamples < sampleRate * (MIN_SPEECH_MS / 1000)) {
    return { ok: false, reason: "too-quiet" };
  }

  const start = Math.max(0, first - pad);
  const end = Math.min(audio.length, last + pad);
  const trimmed = normalizePeak(audio.subarray(start, end));
  return {
    ok: true,
    audio: trimmed,
    sampleRate,
    seconds: trimmed.length / sampleRate,
    speechSeconds: speechSamples / sampleRate,
  };
}
