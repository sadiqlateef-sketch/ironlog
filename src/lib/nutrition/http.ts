export type HttpResponse = { status: number; data: unknown };
export type HttpGet = (url: string, params: Record<string, string>) => Promise<HttpResponse>;

export type NutritionErrorCode =
  | "not-found"
  | "rate-limited"
  | "unauthorized"
  | "unavailable"
  | "bad-response";

export class NutritionError extends Error {
  code: NutritionErrorCode;
  reason?: string;

  constructor(code: NutritionErrorCode, reason?: string) {
    super(reason ? `${code}: ${reason}` : code);
    this.name = "NutritionError";
    this.code = code;
    if (reason !== undefined) this.reason = reason;
  }
}

export function nutritionUserAgent(): string {
  return `IronLog/${process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"} (personal strength-training app)`;
}

export const capacitorGet: HttpGet = async (url, params) => {
  const { CapacitorHttp } = await import("@capacitor/core");
  try {
    const res = await CapacitorHttp.get({
      url,
      params,
      headers: { "User-Agent": nutritionUserAgent(), Accept: "application/json" },
      connectTimeout: 60000,
      readTimeout: 60000,
      responseType: "json",
    });
    return { status: res.status, data: res.data };
  } catch (err) {
    throw new NutritionError("unavailable", err instanceof Error ? err.message : undefined);
  }
};

/** Sliding-window limiter: at most `max` takes in any `windowMs` span. */
export function createRateLimiter(
  max: number,
  windowMs: number,
  now: () => number = () => Date.now(),
): { take(): boolean } {
  let stamps: number[] = [];
  return {
    take(): boolean {
      const t = now();
      stamps = stamps.filter((s) => t - s < windowMs);
      if (stamps.length >= max) return false;
      stamps.push(t);
      return true;
    },
  };
}
