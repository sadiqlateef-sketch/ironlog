"use client";

// Find a food to log: recent and saved foods first, then Open Food Facts and USDA.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus, ScanBarcode, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SkeletonList } from "@/components/ui/skeleton";
import { AmountSheet } from "@/components/food/amount-sheet";
import type { AmountTarget } from "@/components/food/amount-sheet";
import { CustomFoodSheet } from "@/components/food/custom-food-sheet";
import { FoodResultRow, tagFor } from "@/components/food/food-result-row";
import { NutritionSyncChip } from "@/components/food/nutrition-sync-chip";
import { ScanSheet } from "@/components/food/scan-sheet";
import type { ScannedCode } from "@/components/food/scan-sheet";
import { useMinuteClock } from "@/hooks/use-nutrition-day";
import { useNutritionPrefs } from "@/hooks/use-nutrition-prefs";
import { onRestoredScan } from "@/lib/barcode-scanner";
import { listFoods, listRecents, NUTRITION_EVENT, saveFood } from "@/lib/offline/nutrition-store";
import type { RecentFood } from "@/lib/offline/nutrition-store";
import { dayLabel, foodDay } from "@/lib/nutrition/day";
import { amountText } from "@/lib/nutrition/display";
import type { Food } from "@/lib/nutrition/diary-types";
import { isBarcodeQuery } from "@/lib/nutrition/search";
import type { RemoteFood } from "@/lib/nutrition/search";
import { runFoodSearch } from "@/lib/nutrition/search-service";
import type { SearchNote } from "@/lib/nutrition/search-service";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DEBOUNCE_MS = 350;
const LOCAL_SHOWN = 50;

function remoteToFood(r: RemoteFood): Food {
  return {
    id: crypto.randomUUID(),
    name: r.name,
    brand: r.brand,
    barcode: r.barcode,
    liquid: r.liquid,
    servingAmount: r.serving?.amount ?? null,
    packageAmount: r.packageAmount?.amount ?? null,
    nutrients: r.nutrients,
    source: r.source,
    sourceId: r.sourceId,
    sourceUrl: r.sourceUrl,
    note: null,
    archived: false,
  };
}

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}
const getOnline = () => navigator.onLine;
const getOnlineServer = () => true;

function matches(f: Food, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (needle === "") return true;
  if (isBarcodeQuery(needle)) return f.barcode === needle;
  return f.name.toLowerCase().includes(needle) || (f.brand ?? "").toLowerCase().includes(needle);
}

type Remote = { query: string; results: RemoteFood[]; notes: SearchNote[]; usdaSkipped: boolean; failed: boolean };

export function AddFoodScreen() {
  const router = useRouter();
  const { prefs, loading: prefsLoading } = useNutritionPrefs();
  const now = useMinuteClock();
  const online = useSyncExternalStore(subscribeOnline, getOnline, getOnlineServer);
  // Rendered only after sign-in is known (AppShell), so reading the URL here is safe.
  const [params] = useState(() => {
    const sp = new URLSearchParams(window.location.search);
    const d = sp.get("d");
    return { day: d && DAY.test(d) ? d : null, meal: sp.get("meal") };
  });

  const current = foodDay(now, prefs.day_start);
  const day = params.day ?? current;
  const label = dayLabel(day, current);

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [foods, setFoods] = useState<Food[] | null>(null);
  const [recents, setRecents] = useState<RecentFood[]>([]);
  const [remote, setRemote] = useState<Remote | null>(null);
  const [target, setTarget] = useState<AmountTarget | null>(null);
  const [custom, setCustom] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [restored, setRestored] = useState<ScannedCode | null>(null);

  const loadLocal = useCallback(() => {
    listFoods()
      .then(setFoods)
      .catch(() => setFoods((f) => f ?? []));
    listRecents()
      .then(setRecents)
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadLocal();
    window.addEventListener(NUTRITION_EVENT, loadLocal);
    return () => window.removeEventListener(NUTRITION_EVENT, loadLocal);
  }, [loadLocal]);

  // Android may restart the app while its scanner is open; the scan then arrives here.
  useEffect(
    () =>
      onRestoredScan((out) => {
        if (out.kind !== "code") return;
        setRestored({ raw: out.raw, format: out.format });
        setScanOpen(true);
      }),
    [],
  );

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // Online search. A newer query makes an older answer irrelevant.
  const seq = useRef(0);
  useEffect(() => {
    const mine = ++seq.current;
    if (debounced === "" || !online) return;
    runFoodSearch(debounced)
      .then((res) => {
        if (seq.current === mine) setRemote({ query: debounced, ...res, failed: false });
      })
      .catch(() => {
        if (seq.current === mine) setRemote({ query: debounced, results: [], notes: [], usdaSkipped: false, failed: true });
      });
  }, [debounced, online]);

  const searching = debounced !== "";
  const waitingRemote = searching && online && (query.trim() !== debounced || remote?.query !== debounced);
  const list = useMemo(() => foods ?? [], [foods]);
  const local = useMemo(() => (searching ? list.filter((f) => matches(f, debounced)) : list), [list, debounced, searching]);
  const shownRemote = useMemo(() => {
    if (!searching || !online || remote?.query !== debounced) return [];
    // A food already saved on the phone is shown once, as the phone's copy.
    return remote.results.filter((r) => !list.some((f) => f.source === r.source && f.sourceId === r.sourceId));
  }, [remote, list, debounced, searching, online]);

  const recentFoods = useMemo(() => {
    const byId = new Map(list.map((f) => [f.id, f]));
    const out: { food: Food; last: RecentFood }[] = [];
    for (const r of recents) {
      const food = r.foodId ? byId.get(r.foodId) : undefined;
      if (food) out.push({ food, last: r });
    }
    return out;
  }, [recents, list]);

  const pickFood = (food: Food, last: RecentFood | null = null) =>
    setTarget({ food, isNew: false, last: last ? { quantity: last.quantity, unit: last.unit } : null });
  const pickRemote = (r: RemoteFood) => setTarget({ food: remoteToFood(r), isNew: true });

  const closeScan = (open: boolean) => {
    setScanOpen(open);
    if (!open) setRestored(null);
  };
  // Not found or offline: put the code in the search box. Creating from a barcode comes next.
  const scanToSearch = (code: string) => {
    closeScan(false);
    setQuery(code);
  };

  const finish = () => {
    setTarget(null);
    if (window.history.length > 1) router.back();
    else router.replace(params.day ? `/food/?d=${params.day}` : "/food/");
  };

  const createFood = async (food: Food) => {
    const saved = await saveFood(food);
    setTarget({ food: saved, isNew: false });
  };

  const remoteFailed = remote?.query === debounced && remote.failed;
  const notes = remote?.query === debounced ? remote.notes : [];
  const barcodeMiss =
    searching &&
    isBarcodeQuery(debounced) &&
    local.length === 0 &&
    !waitingRemote &&
    !shownRemote.some((r) => r.barcode === debounced || r.source === "off");

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back to diary">
          <Link href={params.day ? `/food/?d=${params.day}` : "/food/"}>
            <ChevronLeft />
          </Link>
        </Button>
        <div className="flex min-w-0 flex-col">
          <h1 className="text-2xl leading-tight font-bold">Add food</h1>
          <p className="text-muted-foreground text-xs">{prefsLoading ? "" : label}</p>
        </div>
      </header>

      <NutritionSyncChip />

      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
          <Input
            type="search"
            aria-label="Search foods"
            placeholder="Search foods or type a barcode"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            autoComplete="off"
          />
        </div>
        <Button type="button" variant="outline" size="icon" aria-label="Scan a barcode" onClick={() => setScanOpen(true)}>
          <ScanBarcode className="size-5" />
        </Button>
      </div>

      {!online && (
        <p role="status" className="text-muted-foreground text-sm">
          You&apos;re offline. Showing foods on this phone.
        </p>
      )}
      {searching &&
        notes.map((n) => (
          <p key={n.source} role="status" className="text-muted-foreground text-sm">
            {n.source === "usda" ? "USDA: " : "Open Food Facts: "}
            {n.message}
            {n.source === "usda" && n.message.includes("Settings") && (
              <>
                {" "}
                <Link href="/settings/#nutrition" className="text-primary-text underline">
                  Open settings
                </Link>
              </>
            )}
          </p>
        ))}
      {searching && online && remote?.query === debounced && remote.usdaSkipped && (
        <p role="status" className="text-muted-foreground text-sm">
          Searching Open Food Facts only. Add a free USDA key in{" "}
          <Link href="/settings/#nutrition" className="text-primary-text underline">
            Settings
          </Link>{" "}
          to include USDA foods.
        </p>
      )}
      {remoteFailed && (
        <p role="status" className="text-muted-foreground text-sm">
          Couldn&apos;t search online right now. Showing foods on this phone.
        </p>
      )}

      {foods === null ? (
        <SkeletonList rows={4} />
      ) : searching ? (
        <>
          {local.length > 0 && (
            <Group title="On this phone">
              {local.slice(0, LOCAL_SHOWN).map((f) => (
                <FoodResultRow key={f.id} food={f} tag={tagFor(f)} onPick={() => pickFood(f)} />
              ))}
            </Group>
          )}
          {online && (
            <Group title="Search results">
              {waitingRemote ? (
                <SkeletonList rows={3} />
              ) : (
                shownRemote.map((r) => (
                  <FoodResultRow
                    key={`${r.source}:${r.sourceId}`}
                    food={{ name: r.name, brand: r.brand, liquid: r.liquid, nutrients: r.nutrients }}
                    tag={r.source === "off" ? "OFF" : "USDA"}
                    onPick={() => pickRemote(r)}
                  />
                ))
              )}
            </Group>
          )}
          {barcodeMiss && (
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground text-sm">No food with that barcode yet. Scan it, or create the food.</p>
              <Button type="button" onClick={() => setCustom(true)}>
                <Plus /> Create food
              </Button>
            </div>
          )}
          {!waitingRemote && local.length === 0 && shownRemote.length === 0 && !barcodeMiss && (
            <p className="text-muted-foreground text-sm">
              {online && !remoteFailed ? "Nothing found." : "Nothing on this phone matches."} You can add it yourself.
            </p>
          )}
        </>
      ) : (
        <>
          {recentFoods.length > 0 && (
            <Group title="Recent">
              {recentFoods.slice(0, 15).map(({ food, last }) => (
                <FoodResultRow
                  key={last.key}
                  food={food}
                  tag={tagFor(food)}
                  detail={`last ${amountText(last.quantity, last.unit)}`}
                  onPick={() => pickFood(food, last)}
                />
              ))}
            </Group>
          )}
          {list.length > 0 && (
            <Group title="My foods">
              {list.slice(0, LOCAL_SHOWN).map((f) => (
                <FoodResultRow key={f.id} food={f} tag={tagFor(f)} onPick={() => pickFood(f)} />
              ))}
            </Group>
          )}
          {list.length === 0 && <p className="text-muted-foreground text-sm">No foods saved yet. Search above, or add your own.</p>}
        </>
      )}

      <Button type="button" variant="outline" onClick={() => setCustom(true)}>
        <Plus /> Add your own food
      </Button>

      <AmountSheet
        target={target}
        onOpenChange={(o) => !o && setTarget(null)}
        day={day}
        dayLabel={label}
        meals={prefs.meals}
        mealId={params.meal}
        now={now}
        onSaved={finish}
      />
      <ScanSheet
        open={scanOpen}
        onOpenChange={closeScan}
        foods={list}
        initialScan={restored}
        onLocal={(food) => {
          closeScan(false);
          pickFood(food);
        }}
        onRemote={(r) => {
          closeScan(false);
          pickRemote(r);
        }}
        onCreate={scanToSearch}
        onOffline={scanToSearch}
      />
      <CustomFoodSheet open={custom} onOpenChange={setCustom} onCreate={createFood} initialName={searching && !isBarcodeQuery(debounced) ? debounced : ""} />
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="text-muted-foreground px-1 text-xs font-semibold tracking-wide uppercase">{title}</h2>
      <div className="glass rounded-2xl p-1">{children}</div>
    </section>
  );
}
