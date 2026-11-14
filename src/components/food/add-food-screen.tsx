"use client";

// Find a food to log: recent and saved foods first, then Open Food Facts and USDA.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, ChevronLeft, Inbox, Mic, Plus, ScanBarcode, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SkeletonList } from "@/components/ui/skeleton";
import { AmountSheet } from "@/components/food/amount-sheet";
import { BatchSheet } from "@/components/food/batch-sheet";
import { newPantryItem, PantryItemSheet } from "@/components/food/pantry-item-sheet";
import type { AmountTarget } from "@/components/food/amount-sheet";
import { CustomFoodSheet } from "@/components/food/custom-food-sheet";
import { FoodToast } from "@/components/food/food-toast";
import type { FoodToastState } from "@/components/food/food-toast";
import { FoodResultRow, tagFor } from "@/components/food/food-result-row";
import { NutritionSyncChip } from "@/components/food/nutrition-sync-chip";
import { ScanSheet } from "@/components/food/scan-sheet";
import { VoiceLogSheet } from "@/components/food/voice-log-sheet";
import { addToInbox, inboxPhotoUrl, listInbox, removeFromInbox } from "@/lib/nutrition-inbox-store";
import type { InboxItem } from "@/lib/nutrition/inbox";
import { canDictate } from "@/lib/speech";
import type { ScannedCode } from "@/components/food/scan-sheet";
import { useMinuteClock } from "@/hooks/use-nutrition-day";
import { useNutritionPrefs } from "@/hooks/use-nutrition-prefs";
import { onRestoredScan } from "@/lib/barcode-scanner";
import { addEntry, deleteEntry, listBatches, listFoods, listRecents, NUTRITION_EVENT, saveFood } from "@/lib/offline/nutrition-store";
import { portionsLeftText, type Batch } from "@/lib/nutrition/batch";
import type { RecentFood } from "@/lib/offline/nutrition-store";
import { sameBarcode } from "@/lib/nutrition/barcode";
import { dayLabel, defaultMealFor, foodDayFor } from "@/lib/nutrition/day";
import { useWorkShifts } from "@/hooks/use-work-shifts";
import { amountText } from "@/lib/nutrition/display";
import type { Food } from "@/lib/nutrition/diary-types";
import { makePendingFood } from "@/lib/nutrition/enrich";
import { relogEntry } from "@/lib/nutrition/quick-log";
import { tap } from "@/lib/native";
import { isBarcodeQuery } from "@/lib/nutrition/search";
import type { RemoteFood } from "@/lib/nutrition/search";
import { runFoodSearch } from "@/lib/nutrition/search-service";
import type { SearchNote } from "@/lib/nutrition/search-service";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DEBOUNCE_MS = 350;
const LOCAL_SHOWN = 50;

export function remoteToFood(r: RemoteFood): Food {
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
  // A typed UPC-A finds the same product saved as EAN-13 (leading zero), and back.
  if (isBarcodeQuery(needle)) return sameBarcode(f.barcode, needle);
  return f.name.toLowerCase().includes(needle) || (f.brand ?? "").toLowerCase().includes(needle);
}

type Remote = { query: string; results: RemoteFood[]; notes: SearchNote[]; usdaSkipped: boolean; failed: boolean };

export function AddFoodScreen() {
  const router = useRouter();
  const { prefs, loading: prefsLoading } = useNutritionPrefs();
  const now = useMinuteClock();
  const shifts = useWorkShifts();
  const online = useSyncExternalStore(subscribeOnline, getOnline, getOnlineServer);
  // Rendered only after sign-in is known (AppShell), so reading the URL here is safe.
  const [params] = useState(() => {
    const sp = new URLSearchParams(window.location.search);
    const d = sp.get("d");
    return { day: d && DAY.test(d) ? d : null, meal: sp.get("meal"), pantry: sp.get("pantry") === "1", inbox: sp.get("inbox") };
  });

  const current = foodDayFor(now, prefs, shifts);
  const day = params.day ?? current;
  const label = dayLabel(day, current);

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [foods, setFoods] = useState<Food[] | null>(null);
  const [recents, setRecents] = useState<RecentFood[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchOpen, setBatchOpen] = useState<Batch | null>(null);
  const [remote, setRemote] = useState<Remote | null>(null);
  const [target, setTarget] = useState<AmountTarget | null>(null);
  const [custom, setCustom] = useState(false);
  // Barcode for the next new food (from a scan or a typed code that found nothing).
  const [customBarcode, setCustomBarcode] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [restored, setRestored] = useState<ScannedCode | null>(null);
  const scanButton = useRef<HTMLButtonElement>(null);
  const [voiceOk, setVoiceOk] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  // Logging a meal captured in the inbox: it keeps the capture time and is removed once logged.
  const [inboxItem, setInboxItem] = useState<InboxItem | null>(null);
  const [inboxPhoto, setInboxPhoto] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    canDictate()
      .then((ok) => live && setVoiceOk(ok))
      .catch(() => {});
    if (params.inbox) {
      listInbox()
        .then((list) => {
          const item = list.find((i) => i.id === params.inbox) ?? null;
          if (!live || !item) return;
          setInboxItem(item);
          void inboxPhotoUrl(item).then((u) => live && setInboxPhoto(u));
        })
        .catch(() => {});
    }
    return () => {
      live = false;
    };
  }, [params.inbox]);
  const eatenAt = inboxItem ? new Date(inboxItem.takenAt) : null;

  const loadLocal = useCallback(() => {
    listFoods()
      .then(setFoods)
      .catch(() => setFoods((f) => f ?? []));
    listRecents()
      .then(setRecents)
      .catch(() => {});
    listBatches()
      .then((list) => setBatches(list.filter((b) => !b.finished && b.portionsLeft > 0)))
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

  // Press and hold a food you've logged before: log it again at that amount, with Undo.
  const lastByFood = useMemo(() => new Map(recents.filter((r) => r.foodId).map((r) => [r.foodId as string, r])), [recents]);
  const [toast, setToast] = useState<FoodToastState | null>(null);
  const toastSeq = useRef(0);
  const clearToast = useCallback(() => setToast(null), []);
  const showToast = (text: string, onUndo?: () => void) => setToast({ id: ++toastSeq.current, text, onUndo });
  const currentMeal = prefs.meals.find((m) => m.id === params.meal) ?? defaultMealFor(prefs.meals, now) ?? prefs.meals[0] ?? null;

  const relog = async (food: Food, last: RecentFood) => {
    const entry = currentMeal ? relogEntry(food, last, day, currentMeal, new Date(), crypto.randomUUID()) : null;
    if (!entry || !currentMeal) {
      pickFood(food, last);
      return;
    }
    tap();
    try {
      await addEntry(entry);
    } catch {
      showToast("Couldn't log that. Try again.");
      return;
    }
    showToast(`Logged ${amountText(entry.quantity, entry.unit)} ${food.name} to ${currentMeal.name}`, () => {
      void deleteEntry(entry.id, day).catch(() => {});
    });
  };
  const holdProps = (food: Food) => {
    const last = lastByFood.get(food.id);
    if (!last) return {};
    return {
      onLongPress: () => void relog(food, last),
      longPressHint: `Press and hold to log ${amountText(last.quantity, last.unit)} again`,
    };
  };

  const closeScan = (open: boolean) => {
    setScanOpen(open);
    if (!open) setRestored(null);
  };
  const openCustom = (barcode = "") => {
    setCustomBarcode(barcode);
    setCustom(true);
  };
  const createFromScan = (code: string) => {
    closeScan(false);
    openCustom(code);
  };
  // Offline: keep the barcode as a placeholder food that fills in later.
  const saveOffline = async (code: string, logNow: boolean) => {
    const saved = await saveFood(makePendingFood(code, crypto.randomUUID()));
    closeScan(false);
    if (logNow) setTarget({ food: saved, isNew: false });
    else setQuery(code);
  };

  // In pantry mode a picked food opens the pantry sheet instead of the amount sheet.
  const pantryTarget = useMemo(
    () => (params.pantry && target ? { item: newPantryItem(target.food, new Date()), food: target.food, isNewFood: target.isNew, isNew: true } : null),
    [params.pantry, target],
  );

  const finish = () => {
    setTarget(null);
    if (inboxItem) {
      void removeFromInbox(inboxItem.id).catch(() => {});
      router.replace("/food/inbox/");
      return;
    }
    if (params.pantry) router.replace("/food/pantry/");
    else if (window.history.length > 1) router.back();
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
    !shownRemote.some((r) => sameBarcode(r.barcode, debounced) || r.source === "off");

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back to diary">
          <Link href={params.day ? `/food/?d=${params.day}` : "/food/"}>
            <ChevronLeft />
          </Link>
        </Button>
        <div className="flex min-w-0 flex-col">
          <h1 className="text-2xl leading-tight font-bold">{params.pantry ? "Add to pantry" : "Add food"}</h1>
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
        {voiceOk && !params.pantry && (
          <Button type="button" variant="outline" size="icon" aria-label="Say what you ate" onClick={() => setVoiceOpen(true)}>
            <Mic className="size-5" aria-hidden />
          </Button>
        )}
        <Button ref={scanButton} type="button" variant="outline" size="icon" aria-label="Scan a barcode" onClick={() => setScanOpen(true)}>
          <ScanBarcode className="size-5" aria-hidden />
        </Button>
      </div>

      {inboxItem ? (
        <div className="glass flex items-center gap-3 rounded-2xl p-2" data-testid="inbox-capture">
          {inboxPhoto ? (
            // A local data: URL of the inbox photo.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={inboxPhoto} alt="Meal photo" className="size-16 shrink-0 rounded-xl object-cover" />
          ) : (
            <Inbox className="text-muted-foreground size-6 shrink-0" aria-hidden />
          )}
          <p className="min-w-0 flex-1 text-sm">
            {inboxItem.note ?? "From your food inbox"}
            <span className="text-muted-foreground block text-xs">
              Eaten {new Date(inboxItem.takenAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Removed from the inbox once logged.
            </span>
          </p>
        </div>
      ) : (
        !params.pantry && (
          <div className="-mt-2 flex items-center gap-3 px-1 text-sm">
            <button type="button" className="text-primary-text flex items-center gap-1.5 underline-offset-2 hover:underline" onClick={() => photoInput.current?.click()}>
              <Camera className="size-4" aria-hidden /> Snap now, log later
            </button>
            <Link href="/food/inbox/" className="text-muted-foreground underline-offset-2 hover:underline">
              Inbox
            </Link>
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              aria-hidden
              tabIndex={-1}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                e.target.value = "";
                if (!file) return;
                addToInbox({ photo: file, note: null, prefs, shifts })
                  .then(() => showToast("Saved to your food inbox. Log it when you have a minute."))
                  .catch(() => showToast("Couldn't save that photo. Try again."));
              }}
            />
          </div>
        )
      )}

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
                <FoodResultRow key={f.id} food={f} tag={tagFor(f)} onPick={() => pickFood(f)} {...holdProps(f)} />
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
              <Button type="button" onClick={() => openCustom(debounced)}>
                <Plus /> Create food
              </Button>
            </div>
          )}
          {!waitingRemote && local.length === 0 && shownRemote.length === 0 && !barcodeMiss && (
            <p className="text-muted-foreground text-sm">
              {online && !remoteFailed && notes.length === 0 ? "Nothing found." : "Nothing on this phone matches."} You can add it yourself.
            </p>
          )}
        </>
      ) : (
        <>
          {!params.pantry && batches.length > 0 && (
            <Group title="From your batches">
              {batches.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="hover:bg-accent flex w-full flex-col rounded-xl px-3 py-2.5 text-left"
                  onClick={() => setBatchOpen(b)}
                >
                  <span className="truncate text-base font-medium">{b.name}</span>
                  <span className="text-muted-foreground text-xs">{portionsLeftText(b)}</span>
                </button>
              ))}
            </Group>
          )}
          {recentFoods.length > 0 && (
            <Group title="Recent">
              {recentFoods.slice(0, 15).map(({ food, last }) => (
                <FoodResultRow
                  key={last.key}
                  food={food}
                  tag={tagFor(food)}
                  detail={`last ${amountText(last.quantity, last.unit)}`}
                  onPick={() => pickFood(food, last)}
                  {...holdProps(food)}
                />
              ))}
            </Group>
          )}
          {list.length > 0 && (
            <Group title="My foods">
              {list.slice(0, LOCAL_SHOWN).map((f) => (
                <FoodResultRow key={f.id} food={f} tag={tagFor(f)} onPick={() => pickFood(f)} {...holdProps(f)} />
              ))}
            </Group>
          )}
          {list.length === 0 && <p className="text-muted-foreground text-sm">No foods saved yet. Search above, scan a barcode, or add your own.</p>}
        </>
      )}

      <Button type="button" variant="outline" onClick={() => openCustom(isBarcodeQuery(debounced) ? debounced : "")}>
        <Plus /> Add your own food
      </Button>

      <PantryItemSheet
        target={pantryTarget}
        onOpenChange={(o) => !o && setTarget(null)}
        onDone={finish}
        day={day}
        meals={prefs.meals}
        now={now}
      />
      <BatchSheet
        mode={batchOpen ? { kind: "log", batch: batchOpen } : null}
        onOpenChange={(o) => !o && setBatchOpen(null)}
        onDone={finish}
        day={day}
        meals={prefs.meals}
        mealId={params.meal}
        now={now}
      />
      <AmountSheet
        target={params.pantry ? null : target}
        onOpenChange={(o) => !o && setTarget(null)}
        day={day}
        dayLabel={label}
        meals={prefs.meals}
        mealId={params.meal}
        now={now}
        eatenAt={eatenAt}
        onSaved={finish}
      />
      {voiceOpen && (
        <VoiceLogSheet
          open={voiceOpen}
          onOpenChange={setVoiceOpen}
          foods={list}
          recents={recents}
          day={day}
          meals={prefs.meals}
          mealId={params.meal}
          now={now}
          eatenAt={eatenAt}
          onSearch={(text) => {
            setVoiceOpen(false);
            setQuery(text);
          }}
          onPick={(food) => {
            setVoiceOpen(false);
            pickFood(food);
          }}
          onLogged={(text) => {
            if (inboxItem) finish();
            else showToast(text);
          }}
        />
      )}
      <ScanSheet
        open={scanOpen}
        onOpenChange={closeScan}
        foods={list}
        initialScan={restored}
        returnFocusRef={scanButton}
        onLocal={(food) => {
          closeScan(false);
          pickFood(food);
        }}
        onRemote={(r) => {
          closeScan(false);
          pickRemote(r);
        }}
        onCreate={createFromScan}
        onOffline={saveOffline}
      />
      <FoodToast toast={toast} onDone={clearToast} />
      <CustomFoodSheet
        open={custom}
        onOpenChange={setCustom}
        onCreate={createFood}
        initialName={searching && !isBarcodeQuery(debounced) ? debounced : ""}
        initialBarcode={customBarcode}
      />
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
