import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  registrationSchema,
  personName,
  emailAddress,
  passwordValue,
  phoneNumber,
  contactPhone,
  moneyAmount,
  safeLink,
  birthDate,
  checkboxValue,
  validationFailure,
  uploadError,
} from "../lib/form-validation";

test("registration requires confirmation and rejects mismatched passwords on the server", () => {
  const input = {
    name: "Customer",
    email: "customer@example.com",
    password: "secure-password-123",
  };
  for (const confirmation of [undefined, "", "different-password", "secure-password-123 "]) {
    const result = registrationSchema.safeParse({ ...input, confirmPassword: confirmation });
    assert.equal(result.success, false);
    if (!result.success) assert.ok(validationFailure(result.error).fieldErrors.confirmPassword);
  }
  assert.equal(
    registrationSchema.safeParse({ ...input, confirmPassword: input.password }).success,
    true,
  );
});

test("names and email reject empty/oversized values and normalize valid input", () => {
  assert.equal(personName.safeParse("   ").success, false);
  assert.equal(personName.safeParse("a".repeat(101)).success, false);
  assert.equal(personName.parse("  Customer  "), "Customer");
  assert.equal(emailAddress.parse(" CUSTOMER@EXAMPLE.COM "), "customer@example.com");
  assert.equal(emailAddress.safeParse("invalid").success, false);
});
test("Bangladesh phones normalize and reject invalid numbers or injected text", () => {
  assert.equal(phoneNumber.parse("+880 1712-345678"), "8801712345678");
  assert.equal(phoneNumber.parse("01712345678"), "8801712345678");
  for (const value of ["123456", "01212345678", "01712345678script", ""])
    assert.equal(phoneNumber.safeParse(value).success, false);
  assert.equal(contactPhone.safeParse("16267").success, true);
  assert.equal(contactPhone.safeParse("+880 2 12345678").success, true);
  assert.equal(contactPhone.safeParse("call me").success, false);
});
test("passwords enforce bcrypt byte limits without silently truncating", () => {
  assert.equal(passwordValue.safeParse("short").success, false);
  assert.equal(passwordValue.safeParse("a".repeat(73)).success, false);
  assert.equal(passwordValue.safeParse("\u0985".repeat(25)).success, false);
  assert.equal(passwordValue.safeParse("secure-password-123").success, true);
});
test("money rejects missing, fractional, negative, infinite and oversized amounts", () => {
  for (const value of ["", "  ", undefined, "invalid", "1.5", -1, Infinity, 1000000001])
    assert.equal(moneyAmount.safeParse(value).success, false);
  assert.equal(moneyAmount.parse("12345"), 12345);
  assert.equal(moneyAmount.parse("0"), 0);
});
test("URLs block script/data/protocol-relative URLs and preserve supported links", () => {
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,test",
    "//evil.example",
    "/\\evil.example",
    "https://example.com/ bad",
  ])
    assert.equal(safeLink.safeParse(value).success, false);
  for (const value of ["", "/products?featured=1", "https://example.com/image.png"])
    assert.equal(safeLink.safeParse(value).success, true);
});
test("birth dates reject rollover, future and malformed dates", () => {
  for (const value of ["2025-02-30", "2999-01-01", "01/02/2000", "1800-01-01"])
    assert.equal(birthDate.safeParse(value).success, false);
  assert.equal(birthDate.safeParse("2000-02-29").success, true);
  assert.equal(birthDate.safeParse("").success, true);
});
test("checkboxes accept known form values and reject malformed values", () => {
  assert.equal(checkboxValue.parse(undefined), false);
  assert.equal(checkboxValue.parse("false"), false);
  assert.equal(checkboxValue.parse("on"), true);
  assert.equal(checkboxValue.parse("true"), true);
  assert.equal(checkboxValue.safeParse("arbitrary").success, false);
});
test("validation messages identify every invalid field", () => {
  const parsed = z
    .object({ name: personName, phone: phoneNumber })
    .safeParse({ name: " ", phone: "invalid" });
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    const result = validationFailure(parsed.error);
    assert.match(result.error, /Name:/);
    assert.match(result.error, /Phone:/);
    assert.equal(Object.keys(result.fieldErrors).length, 2);
  }
});
test("image upload limits reject wrong types, too many files and excessive size", () => {
  assert.match(
    uploadError([new File(["html"], "image.html", { type: "text/html" })]) ?? "",
    /JPEG/,
  );
  assert.match(
    uploadError(
      Array.from({ length: 6 }, () => new File(["x"], "image.png", { type: "image/png" })),
    ) ?? "",
    /at most 5/,
  );
  assert.match(
    uploadError([
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }),
    ]) ?? "",
    /5 MB/,
  );
});
