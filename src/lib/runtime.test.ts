import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isConstrainedDevice, loadFallbackOrder, recommendModel } from "./runtime.ts";

describe("recommendModel", () => {
  it("defaults phones to base.en even if they last tried small.en", () => {
    assert.equal(
      recommendModel({ saved: "small.en", coarse: true, userAgent: "iPhone" }),
      "base.en",
    );
    assert.equal(isConstrainedDevice({ coarse: true }), true);
  });

  it("lets a desktop keep an explicit small.en choice", () => {
    assert.equal(
      recommendModel({ saved: "small.en", coarse: false, memoryGiB: 16, userAgent: "Macintosh" }),
      "small.en",
    );
  });

  it("defaults a first visit to base.en", () => {
    assert.equal(recommendModel({}), "base.en");
  });
});

describe("loadFallbackOrder", () => {
  it("tries the requested model first, then safer English models", () => {
    assert.deepEqual(loadFallbackOrder("small.en"), ["small.en", "base.en", "tiny.en"]);
    assert.deepEqual(loadFallbackOrder("base.en"), ["base.en", "tiny.en"]);
  });
});
