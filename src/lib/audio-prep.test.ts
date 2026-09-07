import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prepareCapture, TARGET_RATE } from "./audio-prep.ts";

function tone(seconds: number, amplitude: number, freq = 220): Float32Array {
  const n = Math.round(TARGET_RATE * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / TARGET_RATE);
  return out;
}

function concat(...parts: Float32Array[]): Float32Array {
  const n = parts.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

describe("prepareCapture", () => {
  it("rejects near-silent audio that Apple would ignore", () => {
    const quiet = tone(1.2, 0.004);
    const result = prepareCapture(quiet);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "too-quiet");
  });

  it("keeps normal speech-level audio and boosts it toward a usable peak", () => {
    const spoken = concat(tone(0.2, 0.002), tone(0.8, 0.08), tone(0.2, 0.002));
    const result = prepareCapture(spoken);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.ok(result.speechSeconds > 0.25);
      let max = 0;
      for (const s of result.audio) max = Math.max(max, Math.abs(s));
      assert.ok(max > 0.5);
      assert.ok(max <= 0.76);
    }
  });

  it("rejects clips that are just too short", () => {
    const result = prepareCapture(tone(0.2, 0.2));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "too-short");
  });
});
