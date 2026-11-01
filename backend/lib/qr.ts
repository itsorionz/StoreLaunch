/**
 * QR code encoder for courier labels (§5.4). Pure and dependency-free so the
 * label page and tests can share it, mirroring `barcode.ts`.
 *
 * Scope: Model 2 symbology, byte mode, error correction level M (15% recovery
 * — the right trade-off for thermal-printer smudges), versions 1-9. That
 * covers tracking URLs and order numbers up to 180 bytes; longer values
 * return null, like `encodeCode39` does for un-encodable characters.
 */

export type QrCode = {
  /** Edge length in modules (4 × version + 17). */
  size: number;
  /** True when the module at column `x`, row `y` is dark. */
  isDark(x: number, y: number): boolean;
};

/** GF(256) arithmetic with primitive polynomial x⁸+x⁴+x³+x²+1 (0x11D). */
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
for (let root = 1, i = 0; i < 255; i++) {
  GF_EXP[i] = root;
  GF_LOG[root] = i;
  root <<= 1;
  if (root & 0x100) root ^= 0x11d;
}
for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];

function gfMultiply(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/**
 * Reed-Solomon generator polynomial of `degree`, coefficients as alpha
 * exponents in descending power order. Degree 7 must match the spec's table
 * (0, 87, 229, 146, 149, 238, 102, 21) — asserted by the QR tests.
 */
export function qrReedSolomonGenerator(degree: number): number[] {
  let polynomial = [1]; // descending power order; plain values, not exponents
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(polynomial.length + 1).fill(0);
    for (let j = 0; j < polynomial.length; j++) {
      next[j] ^= polynomial[j]; // multiply by x
      next[j + 1] ^= gfMultiply(polynomial[j], GF_EXP[i]); // multiply by αⁱ
    }
    polynomial = next;
  }
  return polynomial.map((value) => GF_LOG[value]);
}

function reedSolomonRemainder(data: Uint8Array, ecCount: number): Uint8Array {
  const generator = qrReedSolomonGenerator(ecCount);
  const remainder = new Uint8Array(ecCount);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.copyWithin(0, 1);
    remainder[ecCount - 1] = 0;
    for (let i = 0; i < ecCount; i++) remainder[i] ^= gfMultiply(generator[i + 1], factor);
  }
  return remainder;
}

/**
 * Error-correction block structure at level M, versions 1-9:
 * [group1Blocks, group1Data, group2Blocks, group2Data, ecCodewordsPerBlock].
 * Block data counts sum to the spec's codeword totals (26, 44, 70, 100, 134,
 * 172, 196, 242, 292 including EC) — asserted by the QR tests.
 */
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
] as const;

/** Alignment-pattern centre coordinates per version (v1 has none). */
const ALIGNMENT_CENTERS: readonly number[][] = [
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

/** The eight data masks, ISO/IEC 18004 order. */
const MASKS: readonly ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** 1:1:3:1:1 finder-lookalike module sequence (dark modules only) for rule 3. */
const FINDER_PATTERN = [true, false, true, true, true, false, true, false, false, false, false];

/**
 * Encodes `text` as a QR code matrix, or null when it exceeds version 9
 * capacity at error correction level M (180 bytes).
 */
export function encodeQr(text: string): QrCode | null {
  const bytes = new TextEncoder().encode(text);

  // Smallest version that fits: byte mode uses 4 mode bits + 8 length bits
  // (versions 1-9) on top of the payload, so payload ≤ dataCodewords − 2.
  let version = 0;
  let dataCodewordCount = 0;
  for (let candidate = 1; candidate <= ECC_M_BLOCKS.length; candidate++) {
    const [g1, d1, g2, d2] = ECC_M_BLOCKS[candidate - 1];
    const count = g1 * d1 + g2 * d2;
    if (bytes.length <= count - 2) {
      version = candidate;
      dataCodewordCount = count;
      break;
    }
  }
  if (!version) return null;

  // --- bit stream: mode, length, payload, terminator, pad bits, pad bytes ---
  const bits: number[] = [];
  const appendBits = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  appendBits(0b0100, 4); // byte mode
  appendBits(bytes.length, 8);
  for (const byte of bytes) appendBits(byte, 8);
  appendBits(0, Math.min(4, dataCodewordCount * 8 - bits.length)); // terminator
  appendBits(0, (8 - (bits.length % 8)) % 8); // pad to codeword boundary
  for (let pad = 0xec; bits.length < dataCodewordCount * 8; pad ^= 0x11 ^ 0xec) appendBits(pad, 8);
  const codewords = new Uint8Array(dataCodewordCount);
  bits.forEach((bit, index) => {
    if (bit) codewords[index >>> 3] |= 0x80 >>> (index & 7);
  });

  // --- blocks, error correction, interleaving ---
  const [g1, d1, g2, d2, ecCount] = ECC_M_BLOCKS[version - 1];
  const dataBlocks: Uint8Array[] = [];
  let offset = 0;
  for (let i = 0; i < g1 + g2; i++) {
    const length = i < g1 ? d1 : d2;
    dataBlocks.push(codewords.slice(offset, offset + length));
    offset += length;
  }
  const ecBlocks = dataBlocks.map((block) => reedSolomonRemainder(block, ecCount));
  const interleaved: number[] = [];
  for (let i = 0; i < Math.max(d1, d2); i++)
    for (const block of dataBlocks) if (i < block.length) interleaved.push(block[i]);
  for (let i = 0; i < ecCount; i++) for (const block of ecBlocks) interleaved.push(block[i]);

  // --- function-pattern grid ---
  const size = version * 4 + 17;
  const modules: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );
  const isFunction: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );
  const setFunction = (x: number, y: number, dark: boolean) => {
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };

  // Timing patterns first — the finder patterns below overwrite their ends.
  for (let i = 0; i < size; i++) {
    setFunction(6, i, i % 2 === 0);
    setFunction(i, 6, i % 2 === 0);
  }
  // Finder patterns (7×7 core + light separator ring) at three corners.
  const drawFinder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        setFunction(x, y, distance !== 2 && distance !== 4);
      }
  };
  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);
  // Alignment patterns, skipping the three positions that meet finders.
  const centers = ALIGNMENT_CENTERS[version - 1];
  for (let i = 0; i < centers.length; i++)
    for (let j = 0; j < centers.length; j++) {
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === centers.length - 1) ||
        (i === centers.length - 1 && j === 0)
      )
        continue;
      const cx = centers[j];
      const cy = centers[i];
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          setFunction(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  // BCH(15,5) format info for level M (indicator bits 00), XOR-masked 0x5412.
  const drawFormat = (mask: number) => {
    const data = (0b00 << 3) | mask;
    let remainder = data;
    for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
    const format = ((data << 10) | remainder) ^ 0x5412;
    const bit = (i: number) => ((format >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) setFunction(8, i, bit(i));
    setFunction(8, 7, bit(6));
    setFunction(8, 8, bit(7));
    setFunction(7, 8, bit(8));
    for (let i = 9; i < 15; i++) setFunction(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) setFunction(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) setFunction(8, size - 15 + i, bit(i));
    setFunction(8, size - 8, true); // always-dark module
  };
  drawFormat(0); // reserves the format areas as function modules
  // BCH(18,6) version information (versions 7-9 only).
  if (version >= 7) {
    let remainder = version;
    for (let i = 0; i < 12; i++) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
    const info = (version << 12) | remainder;
    for (let i = 0; i < 18; i++) {
      const dark = ((info >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunction(a, b, dark);
      setFunction(b, a, dark);
    }
  }

  // --- data placement: two-module-wide columns, bottom-up zigzag ---
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // step over the vertical timing column
    for (let vertical = 0; vertical < size; vertical++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vertical : vertical;
        if (isFunction[y][x] || bitIndex >= interleaved.length * 8) continue;
        modules[y][x] = ((interleaved[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0;
        bitIndex++;
      }
    }
  }

  // --- mask selection: try all eight, keep the lowest penalty ---
  const applyMask = (mask: number) => {
    const masked = MASKS[mask];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        if (!isFunction[y][x] && masked(x, y)) modules[y][x] = !modules[y][x];
  };
  const runPenalty = (read: (index: number) => boolean): number => {
    let penalty = 0;
    let runColor = false;
    let runLength = 0;
    for (let i = 0; i < size; i++) {
      const color = read(i);
      if (color === runColor) {
        runLength++;
        if (runLength === 5) penalty += 3;
        else if (runLength > 5) penalty += 1;
      } else {
        runColor = color;
        runLength = 1;
      }
    }
    return penalty;
  };
  const finderPatternPenalty = (read: (index: number) => boolean): number => {
    let penalty = 0;
    for (let start = 0; start + 11 <= size; start++) {
      let matches = true;
      let matchesReversed = true;
      for (let i = 0; i < 11; i++) {
        if (read(start + i) !== FINDER_PATTERN[i]) matches = false;
        if (read(start + i) !== FINDER_PATTERN[10 - i]) matchesReversed = false;
      }
      if (matches || matchesReversed) penalty += 40;
    }
    return penalty;
  };
  const penaltyScore = (): number => {
    let penalty = 0;
    for (let y = 0; y < size; y++) {
      penalty += runPenalty((x) => modules[y][x]); // rule 1: long runs
      penalty += finderPatternPenalty((x) => modules[y][x]); // rule 3: fake finders
    }
    for (let x = 0; x < size; x++) {
      penalty += runPenalty((y) => modules[y][x]);
      penalty += finderPatternPenalty((y) => modules[y][x]);
    }
    for (let y = 0; y < size - 1; y++)
      // rule 2: 2×2 blocks of one colour
      for (let x = 0; x < size - 1; x++) {
        const color = modules[y][x];
        if (
          color === modules[y][x + 1] &&
          color === modules[y + 1][x] &&
          color === modules[y + 1][x + 1]
        )
          penalty += 3;
      }
    let dark = 0; // rule 4: deviation of dark proportion from 50%, in 5% steps
    for (const row of modules) for (const color of row) if (color) dark++;
    penalty += Math.round(Math.abs(dark / (size * size) - 0.5) / 0.05) * 10;
    return penalty;
  };
  let bestMask = 0;
  let bestPenalty = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(mask);
    drawFormat(mask);
    const penalty = penaltyScore();
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
    }
    applyMask(mask); // XOR is its own inverse — undo for the next candidate
  }
  applyMask(bestMask);
  drawFormat(bestMask);

  return { size, isDark: (x, y) => modules[y][x] };
}
