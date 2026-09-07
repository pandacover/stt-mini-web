import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { asFloat32, asrGenerateOptions, isEnglishOnlyModel } from "./asr.ts";

describe("asrGenerateOptions", () => {
  it("does not send task or language to English-only Whisper models", () => {
    for (const model of ["tiny.en", "base.en"] as const) {
      const opts = asrGenerateOptions(model);
      assert.equal(isEnglishOnlyModel(model), true);
      assert.deepEqual(opts, { return_timestamps: false });
      assert.equal("task" in opts, false);
      assert.equal("language" in opts, false);
    }
  });

  it("allows task on multilingual Whisper, still without a hardcoded language", () => {
    const opts = asrGenerateOptions("tiny");
    assert.equal(isEnglishOnlyModel("tiny"), false);
    assert.equal(opts.task, "transcribe");
    assert.equal("language" in opts, false);
  });
});

describe("asFloat32", () => {
  it("returns the same Float32Array instance", () => {
    const input = new Float32Array([0, 0.5, -0.25]);
    assert.equal(asFloat32(input), input);
  });

  it("rebuilds samples from an array-like object", () => {
    const rebuilt = asFloat32({ 0: 0, 1: 1, length: 2 });
    assert.ok(rebuilt instanceof Float32Array);
    assert.deepEqual(Array.from(rebuilt), [0, 1]);
  });

  it("rejects the { raw, sampling_rate } wrapper that WhisperFeatureExtractor cannot read", () => {
    const raw = new Float32Array([0, 1]);
    assert.throws(() => asFloat32({ raw, sampling_rate: 16000 }), /not numeric samples/i);
  });
});
