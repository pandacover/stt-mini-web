export type ModelId = "tiny.en" | "tiny" | "base.en";

export const MODEL_REPOS: Record<ModelId, string> = {
  "tiny.en": "Xenova/whisper-tiny.en",
  tiny: "Xenova/whisper-tiny",
  "base.en": "Xenova/whisper-base.en",
};

export const MODEL_NOTES: Record<ModelId, string> = {
  "tiny.en": "~40MB · English · fastest",
  tiny: "~40MB · 99 languages · still light",
  "base.en": "~75MB · English · better names & jargon",
};

export type AppStatus =
  | "booting"
  | "loading-model"
  | "ready"
  | "listening"
  | "transcribing"
  | "error";

export type WorkerIn =
  | { type: "load"; model: ModelId }
  | { type: "transcribe"; audio: Float32Array; sampleRate: number };

export type WorkerOut =
  | { type: "progress"; status: string; progress: number; file?: string }
  | { type: "ready"; model: ModelId; device: string }
  | { type: "result"; text: string; ms: number }
  | { type: "error"; message: string };

export type GlossaryEntry = { from: string; to: string };

export type SessionRow = {
  id: string;
  at: number;
  raw: string;
  clean: string;
  ms: number;
  seconds: number;
};
