// Plate Barcode & Gym Machine QR Quick-Scan Engine.
// Allows scanning equipment QR/barcodes to instantly populate machine calibrations,
// pin stack heights, seat notches, and pulley mechanical advantage ratios.

export interface MachineCalibration {
  id: string;
  name: string;
  exerciseSlug: string;
  brand?: string;
  seatSetting?: string | number;
  pinSetting?: string | number;
  pulleyRatio: "1:1" | "2:1" | "3:1" | "4:1";
  notes?: string;
  barcode?: string;
}

/**
 * Calculates effective mechanical tension from the selected pin stack weight.
 * On a 2:1 cable system, 100 lb stack = 50 lb true tension felt by the muscle.
 */
export function calculateEffectiveCableTension(
  stackWeight: number,
  pulleyRatio: MachineCalibration["pulleyRatio"] = "1:1",
): number {
  if (stackWeight <= 0) return 0;
  switch (pulleyRatio) {
    case "2:1":
      return Math.round((stackWeight / 2) * 10) / 10;
    case "3:1":
      return Math.round((stackWeight / 3) * 10) / 10;
    case "4:1":
      return Math.round((stackWeight / 4) * 10) / 10;
    case "1:1":
    default:
      return stackWeight;
  }
}

/**
 * Generates an IronLog QR payload string for a piece of equipment.
 * Format: ironlog://equip?id=...&slug=...&ratio=...&seat=...
 */
export function encodeMachineQr(calibration: MachineCalibration): string {
  const params = new URLSearchParams();
  params.set("id", calibration.id);
  params.set("name", calibration.name);
  params.set("slug", calibration.exerciseSlug);
  params.set("ratio", calibration.pulleyRatio);
  if (calibration.seatSetting) params.set("seat", String(calibration.seatSetting));
  if (calibration.pinSetting) params.set("pin", String(calibration.pinSetting));
  if (calibration.brand) params.set("brand", calibration.brand);
  if (calibration.notes) params.set("notes", calibration.notes);
  return `ironlog://equip?${params.toString()}`;
}

/**
 * Parses an IronLog QR string or barcode string into a structured MachineCalibration.
 */
export function parseMachineQr(raw: string): MachineCalibration | null {
  if (!raw || typeof raw !== "string") return null;

  // Handle IronLog deep link URI
  if (raw.startsWith("ironlog://equip?")) {
    try {
      const query = raw.replace("ironlog://equip?", "");
      const params = new URLSearchParams(query);
      const id = params.get("id");
      const slug = params.get("slug");
      if (!id || !slug) return null;

      const ratioRaw = params.get("ratio");
      const pulleyRatio: MachineCalibration["pulleyRatio"] =
        ratioRaw === "2:1" || ratioRaw === "3:1" || ratioRaw === "4:1" ? ratioRaw : "1:1";

      return {
        id,
        name: params.get("name") || slug,
        exerciseSlug: slug,
        pulleyRatio,
        seatSetting: params.get("seat") || undefined,
        pinSetting: params.get("pin") || undefined,
        brand: params.get("brand") || undefined,
        notes: params.get("notes") || undefined,
      };
    } catch {
      return null;
    }
  }

  // Handle raw barcode (e.g. UPC/EAN or gym asset tag like "GYM-LAT-04")
  const trimmed = raw.trim();
  if (/^[a-zA-Z0-9_-]{3,32}$/.test(trimmed)) {
    return {
      id: `tag-${trimmed.toLowerCase()}`,
      name: `Machine (${trimmed})`,
      exerciseSlug: "lat-pulldown", // Default fallback slug
      pulleyRatio: "1:1",
      barcode: trimmed,
    };
  }

  return null;
}
