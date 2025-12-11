import { assert } from "chai";
import { uint8ArrayToBase64 } from "../src/modules/pdf/extractor";

function bytesToBinaryString(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i]);
  }
  return s;
}

describe("uint8ArrayToBase64", function () {
  it("matches btoa() for empty input", function () {
    const bytes = new Uint8Array([]);
    assert.equal(uint8ArrayToBase64(bytes), btoa(""));
  });

  it("matches btoa() for 1-2 byte inputs (padding)", function () {
    const one = new Uint8Array([255]);
    const two = new Uint8Array([1, 2]);

    assert.equal(uint8ArrayToBase64(one), btoa(bytesToBinaryString(one)));
    assert.equal(uint8ArrayToBase64(two), btoa(bytesToBinaryString(two)));
  });

  it("matches btoa() for small random inputs", function () {
    for (let len = 0; len <= 128; len++) {
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }

      assert.equal(uint8ArrayToBase64(bytes), btoa(bytesToBinaryString(bytes)));
    }
  });
});

