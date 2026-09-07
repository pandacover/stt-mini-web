import { applyGlossary } from "./glossary";
import type { GlossaryEntry } from "./types";

const FILLERS = [
  "um",
  "uh",
  "erm",
  "hmm",
  "huh",
  "ah",
  "uhh",
  "umm",
  "you know",
  "i mean",
  "sort of",
  "kind of",
];

export function cleanTranscript(raw: string, glossary: GlossaryEntry[]): string {
  let text = raw.replace(/\s+/g, " ").trim();
  if (!text) return "";

  for (const filler of FILLERS) {
    const escaped = filler.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`(?:^|\\s)${escaped}(?=,|\\s|$)`, "gi"), " ");
  }

  text = text.replace(/\s+,/g, ",").replace(/,\s*,+/g, ",").replace(/\s+/g, " ").trim();
  text = applyGlossary(text, glossary);
  text = normalizeNumbers(text);
  text = punctuate(text);
  return text;
}

function normalizeNumbers(text: string): string {
  const ones: Record<string, string> = {
    zero: "0",
    one: "1",
    two: "2",
    three: "3",
    four: "4",
    five: "5",
    six: "6",
    seven: "7",
    eight: "8",
    nine: "9",
    ten: "10",
  };
  return text.replace(
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi,
    (m) => ones[m.toLowerCase()] ?? m,
  );
}

function punctuate(text: string): string {
  if (!/[.?!]$/.test(text)) text += ".";
  return text.charAt(0).toUpperCase() + text.slice(1);
}
