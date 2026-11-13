// What a scanned or typed barcode turns into: a food already on the phone,
// an Open Food Facts product, nothing, or "try later". Pure apart from the
// injected product lookup, so every branch is testable without a network.

import { findLocalByBarcode, normalizeBarcode, offLookupCodes } from "./barcode.ts";
import type { BarcodeHint } from "./barcode.ts";
import type { Food } from "./diary-types.ts";
import { NutritionError } from "./http.ts";
import type { RemoteFood } from "./search.ts";
import { explainSearchError } from "./search-service.ts";

export type LookupDeps = {
  foods: readonly Food[];
  getProduct(code: string): Promise<RemoteFood | null>;
  isOnline(): boolean;
};

/** `warning` is true when the check digit is wrong (a typo or a damaged label). */
export type LookupResult =
  | { kind: "invalid" }
  | { kind: "local"; code: string; warning: boolean; food: Food }
  | { kind: "remote"; code: string; warning: boolean; food: RemoteFood }
  | { kind: "offline"; code: string; warning: boolean }
  | { kind: "not-found"; code: string; warning: boolean }
  | { kind: "failed"; code: string; warning: boolean; message: string };

const HINTS: readonly string[] = ["UPC_E", "EAN_8", "EAN_13", "UPC_A"];

/** The scanner's format name, when it is one the barcode rules understand. */
export function hintFromFormat(format: string | null | undefined): BarcodeHint | undefined {
  return format && HINTS.includes(format) ? (format as BarcodeHint) : undefined;
}

/** No connection at all (as opposed to a server that answered badly). */
export function isNetworkFailure(e: unknown): boolean {
  if (!(e instanceof NutritionError)) return false;
  return e.code === "unavailable" && !/^HTTP \d+$/.test(e.reason ?? "");
}

export async function lookupBarcode(raw: string, deps: LookupDeps, hint?: BarcodeHint): Promise<LookupResult> {
  const norm = normalizeBarcode(raw, hint);
  if (!norm) return { kind: "invalid" };
  const { code } = norm;
  const warning = !norm.valid;

  const local = findLocalByBarcode(deps.foods, code);
  if (local) return { kind: "local", code, warning, food: local };
  if (!deps.isOnline()) return { kind: "offline", code, warning };

  try {
    for (const form of offLookupCodes(code)) {
      const product = await deps.getProduct(form);
      if (product) return { kind: "remote", code, warning, food: product };
    }
    return { kind: "not-found", code, warning };
  } catch (e) {
    if (isNetworkFailure(e)) return { kind: "offline", code, warning };
    const message =
      e instanceof NutritionError ? explainSearchError("off", e) : explainSearchError("off", new NutritionError("unavailable"));
    return { kind: "failed", code, warning, message };
  }
}
