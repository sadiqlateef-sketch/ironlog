// Retail barcode rules: cleaning, GS1 check digits, UPC-E expansion and the
// equivalence key that lets a UPC-A, its EAN-13 form and its GTIN-14 form
// match the same stored food. Pure: no throws on junk input.

import type { Food, FoodSource } from "./diary-types.ts";

export type BarcodeKind = "ean8" | "upca" | "ean13" | "gtin14";
export type BarcodeHint = "UPC_E" | "EAN_8" | "EAN_13" | "UPC_A";
export type NormalizedBarcode = { code: string; valid: boolean; kind: BarcodeKind };

/** Digits only: drops spaces, hyphens and any letters or symbols. */
export function cleanBarcode(raw: string): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\D/g, "");
}

function checkDigitFor(body: string): number {
  let sum = 0;
  let weight = 3;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10;
}

/** GS1 check digit for EAN-8, UPC-A, EAN-13 and GTIN-14. */
export function isValidGtin(digits: string): boolean {
  if (typeof digits !== "string" || !/^\d+$/.test(digits)) return false;
  if (![8, 12, 13, 14].includes(digits.length)) return false;
  return checkDigitFor(digits.slice(0, -1)) === Number(digits[digits.length - 1]);
}

/** 8-digit UPC-E (number system 0 or 1) to its 12-digit UPC-A. The last digit is carried over as the check. */
export function expandUpcE(upce: string): string | null {
  if (typeof upce !== "string" || !/^\d{8}$/.test(upce)) return null;
  const ns = upce[0];
  if (ns !== "0" && ns !== "1") return null;
  const d = upce.slice(1, 7);
  const check = upce[7];
  const last = d[5];
  let middle: string;
  if (last === "0" || last === "1" || last === "2") {
    middle = d[0] + d[1] + last + "0000" + d[2] + d[3] + d[4];
  } else if (last === "3") {
    middle = d[0] + d[1] + d[2] + "00000" + d[3] + d[4];
  } else if (last === "4") {
    middle = d[0] + d[1] + d[2] + d[3] + "00000" + d[4];
  } else {
    middle = d[0] + d[1] + d[2] + d[3] + d[4] + "0000" + last;
  }
  return ns + middle + check;
}

function kindForLength(len: number): BarcodeKind | null {
  if (len === 8) return "ean8";
  if (len === 12) return "upca";
  if (len === 13) return "ean13";
  if (len === 14) return "gtin14";
  return null;
}

/**
 * Clean a scanned or typed code and say what it is. A wrong check digit is
 * kept (valid:false) so a damaged label can still be looked up.
 */
export function normalizeBarcode(raw: string, hint?: BarcodeHint): NormalizedBarcode | null {
  const digits = cleanBarcode(raw);
  if (digits.length < 8 || digits.length > 14) return null;
  if (digits.length === 8) {
    if (hint === "UPC_E") {
      const upca = expandUpcE(digits);
      if (upca) return { code: upca, valid: isValidGtin(upca), kind: "upca" };
      return { code: digits, valid: isValidGtin(digits), kind: "ean8" };
    }
    if (hint === "EAN_8" || isValidGtin(digits)) return { code: digits, valid: isValidGtin(digits), kind: "ean8" };
    const upca = expandUpcE(digits);
    if (upca && isValidGtin(upca)) return { code: upca, valid: true, kind: "upca" };
    return { code: digits, valid: false, kind: "ean8" };
  }
  const kind = kindForLength(digits.length);
  if (!kind) return null;
  return { code: digits, valid: isValidGtin(digits), kind };
}

/** Equivalence key: leading zeros stripped, then padded to 14 digits. */
export function barcodeKey(code: string): string {
  const digits = cleanBarcode(code);
  if (!digits) return "";
  return digits.replace(/^0+/, "").padStart(14, "0");
}

export function sameBarcode(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = barcodeKey(a ?? "");
  const kb = barcodeKey(b ?? "");
  return ka !== "" && ka === kb;
}

/** Forms to try against Open Food Facts, in order (it stores UPC-A as EAN-13). */
export function offLookupCodes(code: string): string[] {
  const digits = cleanBarcode(code);
  if (!digits) return [];
  if (digits.length === 12) return [digits, "0" + digits];
  if (digits.length === 13 && digits.startsWith("0")) return [digits, digits.slice(1)];
  return [digits];
}

const SOURCE_RANK: Record<FoodSource, number> = { user: 0, staple: 1, off: 2, usda: 3 };

/** First non-archived food with the same barcode; user foods beat staples, then OFF, then USDA. */
export function findLocalByBarcode(foods: readonly Food[], code: string): Food | null {
  let best: Food | null = null;
  for (const f of foods) {
    if (f.archived || !sameBarcode(f.barcode, code)) continue;
    if (!best || SOURCE_RANK[f.source] < SOURCE_RANK[best.source]) best = f;
  }
  return best;
}

/** Name for a food saved from a scan while offline. */
export function pendingLabel(code: string): string {
  return `Unknown product (${code})`;
}

/**
 * A pending food is a user food saved from an offline scan that still has
 * its placeholder name and no energy value. Renaming or filling it in ends that.
 */
export function isPendingFood(f: Food): boolean {
  return (
    f.source === "user" &&
    f.barcode !== null &&
    f.sourceId === null &&
    f.nutrients.energy.state === "incomplete" &&
    f.name === pendingLabel(f.barcode)
  );
}
