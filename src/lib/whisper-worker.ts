import { env, pipeline } from "@huggingface/transformers";
import { MODEL_REPOS, type ModelId, type WorkerIn, type WorkerOut } from "./types";

env.allowLocalModels = false;
env.useBrowserCache = true;

type AsrPipe = (
  audio: Float32Array,
  opts: { language?: string; task: "transcribe"; return_timestamps: boolean },
) => Promise<{ text: string }>;

let pipe: AsrPipe | null = null;
let loadedModel: ModelId | null = null;
let deviceLabel = "wasm";

function post(msg: WorkerOut) {
  self.postMessage(msg);
}

function asFloat32(data: unknown): Float32Array {
  if (data instanceof Float32Array) return data;
  if (data instanceof Float64Array) return Float32Array.from(data);
  if (data instanceof ArrayBuffer) return new Float32Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Float32Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 4));
  }
  if (data && typeof data === "object" && "length" in data) {
    return Float32Array.from(data as ArrayLike<number>);
  }
  throw new Error("Audio payload was not numeric samples.");
}

async function pickDevice(): Promise<"webgpu" | "wasm"> {
  try {
    const gpu = (self as unknown as { navigator?: { gpu?: { requestAdapter: () => Promise<unknown> } } })
      .navigator?.gpu;
    if (!gpu) return "wasm";
    const adapter = await gpu.requestAdapter();
    return adapter ? "webgpu" : "wasm";
  } catch {
    return "wasm";
  }
}

async function load(model: ModelId) {
  if (pipe && loadedModel === model) {
    post({ type: "ready", model, device: deviceLabel });
    return;
  }

  const device = await pickDevice();
  deviceLabel = device;
  const repo = MODEL_REPOS[model];

  pipe = (await pipeline("automatic-speech-recognition", repo, {
    device,
    dtype: device === "webgpu" ? "fp16" : "q8",
    progress_callback: (info: { status: string; progress?: number; file?: string }) => {
      post({
        type: "progress",
        status: info.status,
        progress: Math.round(info.progress ?? 0),
        file: info.file,
      });
    },
  })) as unknown as AsrPipe;

  loadedModel = model;
  post({ type: "ready", model, device: deviceLabel });
}

async function transcribe(audio: unknown, _sampleRate: number) {
  if (!pipe || !loadedModel) {
    post({ type: "error", message: "Model is not loaded yet." });
    return;
  }
  const samples = asFloat32(audio);
  const t0 = performance.now();
  const language = loadedModel.endsWith(".en") ? "en" : undefined;
  const result = await pipe(samples, {
    language,
    task: "transcribe",
    return_timestamps: false,
  });
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
