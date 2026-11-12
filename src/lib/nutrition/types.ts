import type { Nutrients } from "./nutrients.ts";

export type RemoteFood = {
  source: "off" | "usda";
  sourceId: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  sourceUrl: string;
  liquid: boolean;
  serving: { amount: number; unit: "g" | "ml" } | null;
  packageAmount: { amount: number; unit: "g" | "ml" } | null;
  nutrients: Nutrients;
  /** Keys whose unit was unusable (e.g. IU); for tests and logs. */
  droppedUnits: string[];
};
