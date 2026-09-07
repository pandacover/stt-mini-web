import type { ModelId } from "./types";

export const FALLBACK_MODELS: ModelId[] = ["base.en", "tiny.en"];

export function isConstrainedDevice(input: {
  coarse?: boolean;
  memoryGiB?: number;
  userAgent?: string;
}): boolean {
  if (input.coarse) return true;
  if (typeof input.memoryGiB === "number" && input.memoryGiB > 0 && input.memoryGiB <= 4) return true;
  const ua = input.userAgent ?? "";
  return /iPhone|iPad|iPod|Android/i.test(ua);
}

export function recommendModel(input: {
  saved?: string | null;
  coarse?: boolean;
  memoryGiB?: number;
  userAgent?: string;
}): ModelId {
  const constrained = isConstrainedDevice(input);
  const saved = input.saved;
  if (saved === "tiny.en" || saved === "tiny" || saved === "base.en") return saved;
  if (saved === "small.en" && !constrained) return "small.en";
  return "base.en";
}

export function loadFallbackOrder(model: ModelId): ModelId[] {
  const rest = FALLBACK_MODELS.filter((id) => id !== model);
  return [model, ...rest];
}
