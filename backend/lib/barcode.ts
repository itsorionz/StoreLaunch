/**
 * Code 39 barcode encoder for courier labels (§5.4). Pure and dependency-free
 * so the label page and tests can share it.
 *
 * Element patterns come from the ZXing project's `CHARACTER_ENCODINGS` table
 * (Apache-2.0): the 9 least-significant bits of each value describe the nine
 * elements of one character — 1 = wide, 0 = narrow — most significant bit
 * first, alternating bar/space and always starting with a bar. Every valid
 * character carries exactly three wide elements; `*` is start/stop only.
 */

/** Character set of standard Code 39 (index = checksum value; `*` excluded). */
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%";

const CHARACTER_ENCODINGS = [
  0x034,
  0x121,
  0x061,
  0x160,
  0x031,
  0x130,
  0x070,
  0x025,
  0x124,
  0x064, // 0-9
  0x109,
  0x049,
  0x148,
  0x019,
  0x118,
  0x058,
  0x00d,
  0x10c,
  0x04c,
  0x01c, // A-J
  0x103,
  0x043,
  0x142,
  0x013,
  0x112,
  0x052,
  0x007,
  0x106,
  0x046,
  0x016, // K-T
  0x181,
  0x0c1,
  0x1c0,
  0x091,
  0x190,
  0x0d0,
  0x085,
  0x184,
  0x0c4,
  0x0a8, // U-$
  0x0a2,
  0x08a,
  0x02a, // /, +, %
];

const ASTERISK_ENCODING = 0x094;

const NARROW = 1;
const WIDE = 3;

export type Code39Encoding = {
  /**
   * Element widths in modules, alternating bar/space and starting with a bar
   * (index parity: even = bar, odd = space). Includes the narrow
   * inter-character gap spaces between characters.
   */
  widths: number[];
  /** Total width of the barcode in modules. */
  totalModules: number;
  /** The sanitized, encodable text (start/stop `*` excluded). */
  text: string;
};

function encodingOf(character: string): number {
  if (character === "*") return ASTERISK_ENCODING;
  const index = ALPHABET.indexOf(character);
  if (index < 0) throw new Error(`Unsupported Code 39 character: ${character}`);
  return CHARACTER_ENCODINGS[index];
}

function widthsOf(encoding: number): number[] {
  const widths: number[] = [];
  for (let element = 0; element < 9; element++) {
    // Element i is bit (8 - i) of the encoding.
    widths.push((encoding >> (8 - element)) & 1 ? WIDE : NARROW);
  }
  return widths;
}

/**
 * Encodes `value` as Code 39. Characters outside the Code 39 alphabet are
 * dropped (the encoder never emits an unscannable pattern); returns null when
 * nothing encodable remains.
 */
export function encodeCode39(value: string): Code39Encoding | null {
  const text = (value ?? "")
    .toUpperCase()
    .split("")
    .filter((character) => ALPHABET.includes(character))
    .join("");
  if (!text) return null;

  const characters = ["*", ...text.split(""), "*"];
  const widths: number[] = [];
  characters.forEach((character, position) => {
    widths.push(...widthsOf(encodingOf(character)));
    // Narrow gap between characters — required or readers will not scan it.
    if (position < characters.length - 1) widths.push(NARROW);
  });

  return {
    widths,
    totalModules: widths.reduce((sum, width) => sum + width, 0),
    text,
  };
}

/** True when `value` round-trips through the encoder without dropped characters. */
export function isCode39Encodable(value: string): boolean {
  return encodeCode39(value)?.text === (value ?? "").toUpperCase();
}

/**
 * Check digit for a 12-digit EAN-13 body (GS1 mod-10, weights 1/3 alternating
 * from the left). Exported so tests can verify against published examples.
 */
export function ean13CheckDigit(twelveDigits: string): number {
  const digits = twelveDigits.split("").map(Number);
  const sum = digits.reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

/**
 * Generates a unique-looking product barcode: a valid EAN-13 value with the
 * GS1 "2" prefix reserved for in-store use. Printed as Code 39 on labels and
 * matched by POS/warehouse scanners via exact or prefix search.
 */
export function generateBarcodeValue(): string {
  const bytes = new Uint8Array(11);
  globalThis.crypto.getRandomValues(bytes);
  let body = "2";
  for (const byte of bytes) body += String(byte % 10);
  return body + ean13CheckDigit(body);
}
