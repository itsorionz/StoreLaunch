import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeCode39, isCode39Encodable } from "../lib/barcode";

// Pure encoder for courier labels (§5.4) — no database needed.

test("Code 39 encodes with exactly three wide elements per character", () => {
  const value = "SL-1234";
  const encoding = encodeCode39(value);
  assert.ok(encoding);
  if (!encoding) return;

  assert.equal(encoding.text, value);
  const characters = value.length + 2; // start/stop asterisks
  // 9 elements per character + a 1-module gap between adjacent characters.
  assert.equal(encoding.widths.length, characters * 9 + (characters - 1));
  assert.equal(
    encoding.totalModules,
    encoding.widths.reduce((sum, width) => sum + width, 0),
  );

  for (let character = 0; character < characters; character++) {
    const block: number[] = encoding.widths.slice(character * 10, character * 10 + 9);
    // "3 of 9": every valid Code 39 character has exactly three wide elements.
    assert.equal(block.filter((width) => width === 3).length, 3, `char ${character}`);
    // The gap between characters is always one narrow module.
    const gap: number = encoding.widths[character * 10 + 9];
    if (character < characters - 1) assert.equal(gap, 1);
  }
  assert.ok(encoding.widths.every((width) => width === 1 || width === 3));
});

test("matches the published patterns for 0 and the asterisk", () => {
  const encoding = encodeCode39("0");
  assert.ok(encoding);
  if (!encoding) return;
  // ZXing CHARACTER_ENCODINGS: '*' = 0x094 → nwnnwnwnn (start/stop),
  // '0' = 0x034 → nnnwwnwnn (the payload sits between the asterisks).
  const asterisk = [1, 3, 1, 1, 3, 1, 3, 1, 1];
  const zero = [1, 1, 1, 3, 3, 1, 3, 1, 1];
  assert.deepEqual(encoding.widths.slice(0, 9), asterisk);
  assert.deepEqual(encoding.widths.slice(10, 19), zero);
  assert.deepEqual(encoding.widths.slice(-9), asterisk);
});

test("lowercase is uppercased and unsupported characters are dropped", () => {
  const lower = encodeCode39("sl-9a");
  assert.equal(lower?.text, "SL-9A");

  const dirty = encodeCode39("SL_12💥34");
  assert.equal(dirty?.text, "SL1234");

  assert.equal(encodeCode39(""), null);
  assert.equal(encodeCode39("💥💥"), null);
});

test("isCode39Encodable round-trips safe tracking values only", () => {
  assert.equal(isCode39Encodable("TRK-00112 ABC"), true);
  assert.equal(isCode39Encodable("trk-00112 abc"), true);
  assert.equal(isCode39Encodable("not:encodable"), false);
  assert.equal(isCode39Encodable(""), false);
});

test("encoding is deterministic", () => {
  const a = encodeCode39("MAN-ALPHAMOV-X9K2D-20261029");
  const b = encodeCode39("MAN-ALPHAMOV-X9K2D-20261029");
  assert.deepEqual(a, b);
});
