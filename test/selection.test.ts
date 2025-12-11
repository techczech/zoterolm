import { assert } from "chai";
import { resolveSelection } from "../src/utils/selection";

describe("resolveSelection", function () {
  it("keeps current ID when still available", function () {
    const result = resolveSelection("b", ["a", "b", "c"]);
    assert.deepEqual(result, { resolved: "b", changed: false });
  });

  it("falls back to first available when current is missing", function () {
    const result = resolveSelection("x", ["m", "n"]);
    assert.deepEqual(result, { resolved: "m", changed: true });
  });

  it("returns empty when no options exist", function () {
    const result = resolveSelection("x", []);
    assert.deepEqual(result, { resolved: "", changed: false });
  });
});
