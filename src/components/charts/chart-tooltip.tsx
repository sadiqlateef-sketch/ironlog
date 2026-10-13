/** Floating readout: value first (strong), context second. */
export function ChartTooltip({ x, y, value, label }: { x: number; y: number; value: string; label: string }) {
  return (
    <div
      role="status"
      className="bg-popover pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border px-2.5 py-1.5 text-center shadow-lg"
      style={{ left: x, top: y - 8 }}
    >
      <p className="text-sm font-semibold whitespace-nowrap">{value}</p>
      <p className="text-muted-foreground text-xs whitespace-nowrap">{label}</p>
    </div>
  );
}
