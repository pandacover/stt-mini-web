import type { GlossaryEntry } from "./types";

const KEY = "stt-mini.glossary";

export const DEFAULT_GLOSSARY: GlossaryEntry[] = [
  { from: "whisper", to: "Whisper" },
  { from: "web gpu", to: "WebGPU" },
  { from: "github", to: "GitHub" },
];

export function loadGlossary(): GlossaryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_GLOSSARY.map((e) => ({ ...e }));
    const parsed = JSON.parse(raw) as GlossaryEntry[];
    if (!Array.isArray(parsed)) return DEFAULT_GLOSSARY.map((e) => ({ ...e }));
    return parsed.filter((e) => e && typeof e.from === "string" && typeof e.to === "string");
  } catch {
    return DEFAULT_GLOSSARY.map((e) => ({ ...e }));
  }
}

export function saveGlossary(entries: GlossaryEntry[]): void {
  localStorage.setItem(KEY, JSON.stringify(entries));
}

export function applyGlossary(text: string, entries: GlossaryEntry[]): string {
  let out = text;
  for (const { from, to } of entries) {
    const needle = from.trim();
    if (!needle) continue;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\b${escaped}\\b`, "gi"), to);
  }
  return out;
}
