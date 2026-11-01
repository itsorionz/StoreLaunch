export function canonicalPhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("880")) return digits;
  if (digits.startsWith("0")) return "880" + digits.slice(1);
  if (digits.length === 10) return "880" + digits;
  return digits;
}
