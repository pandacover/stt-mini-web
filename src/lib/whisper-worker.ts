import { env, pipeline } from "@huggingface/transformers";
import { asFloat32, asrGenerateOptions } from "./asr";
import { loadFallbackOrder } from "./runtime";
import { MODEL_REPOS, type ModelId, type WorkerIn, type WorkerOut } from "./types";

env.allowLocalModels = false;
env.useBrowserCache = true;
const wasmBackend = env.backends.onnx?.wasm;
if (wasmBackend) wasmBackend.numThreads = 1;

type AsrPipe = (
  audio: Float32Array,
  opts: ReturnType<typeof asrGenerateOptions>,
) => Promise<{ text: string }>;

let pipe: AsrPipe | null = null;
let loadedModel: ModelId | null = null;
let deviceLabel = "wasm/q8";

function post(msg: WorkerOut) {
  self.postMessage(msg);
}

async function loadOne(model: ModelId) {
  const repo = MODEL_REPOS[model];
  return (await pipeline("automatic-speech-recognition", repo, {
    device: "wasm",
    dtype: "q8",
    progress_callback: (info: { status: string; progress?: number; file?: string }) => {
      const progress = Math.round(info.progress ?? 0);
      if (progress % 10 !== 0 && progress < 100) return;
      post({
        type: "progress",
        status: info.status,
        progress,
        file: info.file,
      });
    },
  })) as unknown as AsrPipe;
}

async function load(model: ModelId) {
  if (pipe && loadedModel === model) {
    post({ type: "ready", model, device: deviceLabel });
    return;
  }

  let lastError: unknown;
  for (const candidate of loadFallbackOrder(model)) {
    try {
      post({ type: "progress", status: `loading ${candidate}`, progress: 0 });
      pipe = await loadOne(candidate);
      loadedModel = candidate;
      deviceLabel = candidate === model ? "wasm/q8" : `wasm/q8 · fell back to ${candidate}`;
      post({ type: "ready", model: candidate, device: deviceLabel });
      return;
    } catch (err) {
      lastError = err;
      pipe = null;
      loadedModel = null;
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  post({ type: "error", message: `Could not load a Whisper model. ${message}` });
}

async function transcribe(audio: unknown, _sampleRate: number) {
  if (!pipe || !loadedModel) {
    post({ type: "error", message: "Model is not loaded yet." });
    return;
  }
  const samples = asFloat32(audio);
  const t0 = performance.now();
  const result = await pipe(samples, asrGenerateOptions(loadedModel));
  post({
    type: "result",
    text: (result.text ?? "").trim(),
    ms: Math.round(performance.now() - t0),
  });
}

self.onmessage = async (event: MessageEvent<WorkerIn>) => {
  try {
    const msg = event.data;
    if (msg.type === "load") await load(msg.model);
    if (msg.type === "transcribe") await transcribe(msg.audio, msg.sampleRate);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    post({ type: "error", message });
  }
};
