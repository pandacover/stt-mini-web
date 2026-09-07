import type { ModelId } from "./types";

export type AsrGenerateOptions = {
  return_timestamps: false;
  language?: string;
  task?: "transcribe";
};

export function isEnglishOnlyModel(model: ModelId): boolean {
  return model.endsWith(".en");
}

export function asrGenerateOptions(model: ModelId): AsrGenerateOptions {
  if (isEnglishOnlyModel(model)) {
    return { return_timestamps: false };
  }
  return { return_timestamps: false, task: "transcribe" };
}

export function asFloat32(data: unknown): Float32Array {
  if (data instanceof Float32Array) return data;
  if (data instanceof Float64Array) return Float32Array.from(data);
  if (data instanceof ArrayBuffer) return new Float32Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Float32Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 4));
  }
  if (Array.isArray(data) || isNumericLengthObject(data)) {
    return Float32Array.from(data as ArrayLike<number>);
  }
  throw new Error("Audio payload was not numeric samples.");
}

function isNumericLengthObject(data: unknown): data is ArrayLike<number> {
  if (!data || typeof data !== "object") return false;
  if ("raw" in data || "sampling_rate" in data) return false;
  const rec = data as { length?: unknown };
  return typeof rec.length === "number" && rec.length >= 0;
}
