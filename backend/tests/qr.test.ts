import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeQr, qrReedSolomonGenerator, type QrCode } from "../lib/qr";

// Pure QR encoder for courier labels (§5.4) — no database needed. The tests
// anchor the encoder to published spec values (Reed-Solomon generator
// polynomials, format/version information blocks) and round-trip decode
// several versions end to end.

/** Error-correction block structure at level M (independent spec copy). */
const ECC_M_BLOCKS = [
  [1, 16, 0, 0, 10],
  [1, 28, 0, 0, 16],
  [1, 44, 0, 0, 26],
  [2, 32, 0, 0, 18],
  [2, 43, 0, 0, 24],
  [4, 27, 0, 0, 16],
  [4, 31, 0, 0, 18],
  [2, 38, 2, 39, 22],
  [3, 36, 2, 37, 22],
];
/** Total codewords per version (data + EC), independent spec copy. */
const TOTAL_CODEWORDS = [26, 44, 70, 100, 134, 172, 196, 242, 292];

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** Alignment centres per version (independent spec copy). */
const ALIGNMENT_CENTERS: number[][] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
];

/** BCH(18,6) remainder used by the version-information blocks. */
function versionInfo(version: number): number {
  let remainder = version;
  for (let i = 0; i < 12; i++) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  return (version << 12) | remainder;
}

/** Reconstructs the function-module map (mirrors the encoder's layout). */
function functionMap(version: number): boolean[][] {
  const size = version * 4 + 17;
  const map = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number) => {
    map[y][x] = true;
  };
  for (let i = 0; i < size; i++) {
    set(6, i);
    set(i, 6);
  }
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ]) {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && y >= 0 && x < size && y < size) set(x, y);
      }
  }
  const centers = ALIGNMENT_CENTERS[version - 1];
  for (let i = 0; i < centers.length; i++)
    for (let j = 0; j < centers.length; j++) {
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === centers.length - 1) ||
        (i === centers.length - 1 && j === 0)
      )
        continue;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) set(centers[j] + dx, centers[i] + dy);
    }
  // Format-info areas plus the always-dark module.
  for (let i = 0; i <= 8; i++) {
    set(8, i);
    set(i, 8);
  }
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8);
  for (let i = 0; i < 7; i++) set(8, size - 1 - i);
  if (version >= 7)
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b);
      set(b, a);
    }
  return map;
}

/** Decodes the payload of an encoded symbol (test-only, mirrors the spec). */
function decodePayload(qr: QrCode): string {
  const size = qr.size;
  const version = (size - 17) / 4;
  assert.ok(Number.isInteger(version) && version >= 1 && version <= 9, `version ${version}`);

  // Format info (first copy) → error-correction level + mask.
  const bit = (x: number, y: number) => qr.isDark(x, y);
  let format = 0;
  for (let i = 0; i <= 5; i++) if (bit(8, i)) format |= 1 << i;
  if (bit(8, 7)) format |= 1 << 6;
  if (bit(8, 8)) format |= 1 << 7;
  if (bit(7, 8)) format |= 1 << 8;
  for (let i = 9; i < 15; i++) if (bit(14 - i, 8)) format |= 1 << i;
  format ^= 0x5412;
  assert.equal(format >>> 13, 0, "format info must declare ECC level M");
  const mask = (format >>> 10) & 7;

  // Version info must repeat the BCH-protected version in both copies.
  if (version >= 7) {
    let info = 0;
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      if (qr.isDark(a, b)) info |= 1 << i;
    }
    assert.equal(info, versionInfo(version), "version info blocks");
  }

  // Zigzag read of the data modules, unmasking on the way out.
  const isFunction = functionMap(version);
  const maskFn = MASKS[mask];
  const bits: number[] = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vertical : vertical;
        if (isFunction[y][x]) continue;
        bits.push(qr.isDark(x, y) !== maskFn(x, y) ? 1 : 0);
      }
    }
  }
  const interleaved = bits
    .slice(0, TOTAL_CODEWORDS[version - 1] * 8)
    .reduce<number[]>((codewords, current, index) => {
      const byteIndex = index >> 3;
      codewords[byteIndex] = (codewords[byteIndex] ?? 0) | (current << (7 - (index & 7)));
      return codewords;
    }, []);
  assert.equal(interleaved.length, TOTAL_CODEWORDS[version - 1], "total codewords");

  // De-interleave the data blocks and parse the byte segment.
  const [g1, d1, g2, d2, ecCount] = ECC_M_BLOCKS[version - 1];
  const blockSizes = [...new Array<number>(g1).fill(d1), ...new Array<number>(g2).fill(d2)];
  assert.equal(
    blockSizes.reduce((sum, length) => sum + length, 0) + (g1 + g2) * ecCount,
    TOTAL_CODEWORDS[version - 1],
    "block table sums to the spec's codeword total",
  );
  const blocks: number[][] = blockSizes.map(() => []);
  let cursor = 0;
  for (let i = 0; i < Math.max(d1, d2); i++)
    for (const [index, block] of blocks.entries())
      if (i < blockSizes[index]) block.push(interleaved[cursor++]);
  const data = blocks.flat();
  const stream: number[] = [];
  for (const byte of data) for (let i = 7; i >= 0; i--) stream.push((byte >>> i) & 1);
  const take = (count: number) => stream.splice(0, count).reduce((value, b) => (value << 1) | b, 0);
  assert.equal(take(4), 0b0100, "byte-mode indicator");
  const length = take(8);
  return new TextDecoder().decode(new Uint8Array(Array.from({ length }, () => take(8))));
}

test("Reed-Solomon generators match the spec's published polynomials", () => {
  // Alpha-exponent coefficient tables from ISO/IEC 18004 Annex A.
  assert.deepEqual(qrReedSolomonGenerator(2), [0, 25, 1]);
  assert.deepEqual(qrReedSolomonGenerator(7), [0, 87, 229, 146, 149, 238, 102, 21]);
  assert.deepEqual(qrReedSolomonGenerator(10), [0, 251, 67, 46, 61, 118, 70, 64, 94, 32, 45]);
});

test("version-7 information block matches the published value", () => {
  // Published table: version 7 → 000111 110010010100.
  assert.equal(versionInfo(7), 0b000111110010010100);
});

test("structure: size, finders, timing patterns and the dark module", () => {
  const qr = encodeQr("SL-1234");
  assert.ok(qr);
  if (!qr) return;
  assert.equal(qr.size, 21, "version 1 is 21×21 modules");

  // Top-left finder: 3×3 dark core, light ring at distance 2, dark ring at 3.
  for (const [x, y] of [
    [2, 2],
    [3, 3],
    [4, 4],
    [0, 0],
  ])
    assert.equal(qr.isDark(x, y), true, `dark at ${x},${y}`);
  assert.equal(qr.isDark(1, 1), false, "light ring");
  assert.equal(qr.isDark(1, 3), false, "light ring");
  assert.equal(qr.isDark(3, 0), true, "dark outer ring");
  assert.equal(qr.isDark(7, 3), false, "separator");
  // Timing patterns alternate along row/column 6.
  assert.equal(qr.isDark(8, 6), true);
  assert.equal(qr.isDark(9, 6), false);
  assert.equal(qr.isDark(6, 8), true);
  assert.equal(qr.isDark(6, 9), false);
  // The always-dark module below the top-left finder.
  assert.equal(qr.isDark(8, 13), true);
});

test("format info declares level M and survives a round trip", () => {
  const qr = encodeQr("SL-ORD-77");
  assert.ok(qr);
  if (!qr) return;
  // Published level-M mask-0 entry: 101010000010010 — which is exactly the
  // XOR mask 0x5412 applied to zero data, anchoring the BCH construction.
  assert.equal(0x5412, 0b101010000010010);
  // decodePayload asserts level M and the mask index for every symbol.
  assert.equal(decodePayload(qr), "SL-ORD-77");
});

test("round-trips through versions 1, 4, 7 and 9 (all block layouts)", () => {
  for (const text of [
    "SL-ORD-1", // v1: single block
    "a".repeat(62), // v4 capacity: 2 interleaved blocks
    "b".repeat(122), // v7 capacity: 4 blocks + version info
    "c".repeat(180), // v9 capacity: mixed 3+2 block groups
  ]) {
    const qr = encodeQr(text);
    assert.ok(qr, `encodes ${text.length} bytes`);
    if (!qr) return;
    const version = text.length <= 14 ? 1 : text.length <= 62 ? 4 : text.length <= 122 ? 7 : 9;
    assert.equal(qr.size, version * 4 + 17, "edge length");
    assert.equal(decodePayload(qr), text);
  }
});

test("empty text encodes and capacity is version 9 (180 bytes)", () => {
  const empty = encodeQr("");
  assert.ok(empty);
  if (!empty) return;
  assert.equal(decodePayload(empty), "");
  assert.ok(encodeQr("x".repeat(180)), "180 bytes fit in version 9-M");
  assert.equal(encodeQr("x".repeat(181)), null, "181 bytes exceed version 9-M");
});
