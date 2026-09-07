const TARGET_RATE = 16_000;

export type MicSession = {
  stream: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  chunks: Float32Array[];
  startedAt: number;
};

export async function openMic(): Promise<MicSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];

  processor.onaudioprocess = (event) => {
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };

  const mute = context.createGain();
  mute.gain.value = 0;
  source.connect(processor);
  processor.connect(mute);
  mute.connect(context.destination);

  return { stream, context, source, processor, chunks, startedAt: performance.now() };
}

export function closeMic(session: MicSession): {
  audio: Float32Array;
  sampleRate: number;
  seconds: number;
} {
  session.processor.disconnect();
  session.source.disconnect();
  session.stream.getTracks().forEach((track) => track.stop());
  const sampleRate = session.context.sampleRate;
  void session.context.close();

  const total = session.chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const chunk of session.chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  const audio = resample(merged, sampleRate, TARGET_RATE);
  const seconds = audio.length / TARGET_RATE;
  return { audio, sampleRate: TARGET_RATE, seconds };
}

function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const outLen = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const t = src - i0;
    out[i] = input[i0] * (1 - t) + input[i1] * t;
  }
  return out;
}

export function peakLevel(chunks: Float32Array[]): number {
  const last = chunks[chunks.length - 1];
  if (!last) return 0;
  let peak = 0;
  for (let i = 0; i < last.length; i += 8) {
    const v = Math.abs(last[i]);
    if (v > peak) peak = v;
  }
  return peak;
}
