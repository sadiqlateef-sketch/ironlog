import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Pressable, Vibration, View } from "react-native";
import { currentWorkout, finishWorkout, queue, saveActive, type ActiveWorkout, type Profile } from "../api";
import { keepScreenOn, requestHeartRate, watchHeartRate } from "../heartRate";
import {
  currentPosition,
  displayWeight,
  formatClock,
  hrZone,
  prefill,
  restSeconds,
  fineStepKg,
  stepKg,
  toHrRows,
  weightStepKg,
  LB_PER_KG,
  type ExerciseGroup,
  type WatchSet,
} from "../logic";
import { canListen, listen } from "../voice";
import { parseSpokenSet } from "../voiceSet";
import { uuid } from "../queue";
import { watchBridge } from "../wearableBridge";
import { Btn, C, Screen, Stepper, T, ZONE } from "../ui";

type View_ = { kind: "log" } | { kind: "rest"; endsAt: number; duration: number; next: string } | { kind: "done" };

const HR_FLUSH_MS = 15_000;

export function WorkoutScreen({ profile, onExit }: { profile: Profile; onExit: () => void }) {
  const [w, setW] = useState<ActiveWorkout | null | undefined>(undefined);
  const [view, setView] = useState<View_>({ kind: "log" });
  const [focus, setFocus] = useState<{ group: number; set: number } | null>(null);
  const [draft, setDraft] = useState({ weight: 0, reps: 0 });
  const [bpm, setBpm] = useState<number | null>(null);
  const hrBuffer = useRef<{ bpm: number; at: number }[]>([]);
  const hrAll = useRef<number[]>([]);
  const [voiceOk, setVoiceOk] = useState(false);
  const [voice, setVoice] = useState<{ text: string; undo?: () => void } | null>(null);
  const voiceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    canListen().then(setVoiceOk);
    return () => clearTimeout(voiceTimer.current);
  }, []);
  const unit = profile.unit;

  // ---- Load (and reload when the watch wakes, unless local changes are still syncing) ----
  const load = useCallback(async () => {
    if ((await queue.flush()) > 0 && w) return;
    const { workout } = await currentWorkout();
    setW((cur) => workout ?? (cur && workout === null ? null : cur ?? null));
  }, [w]);

  // Keep a copy on the watch so the workout survives the app closing with no signal.
  useEffect(() => {
    if (w) saveActive(w);
  }, [w]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s === "active" && load());
    return () => sub.remove();
  }, [load]);

  const sessionId = w?.id;

  useEffect(() => {
    if (!sessionId) return;
    return watchBridge.onPhoneSetLogged((raw) => {
      try {
        const data = JSON.parse(raw);
        if (data && data.sessionId === sessionId) {
          setW((cur) =>
            cur
              ? {
                  ...cur,
                  groups: cur.groups.map((g) =>
                    g.exerciseId === data.exerciseId
                      ? {
                          ...g,
                          sets: g.sets.map((s) =>
                            s.set_number === data.setNumber
                              ? {
                                  ...s,
                                  weight: data.weightKg ?? s.weight,
                                  reps: data.reps ?? s.reps,
                                  is_completed: data.isCompleted ?? s.is_completed,
                                }
                              : s
                          ),
                        }
                      : g
                  ),
                }
              : cur
          );
        }
      } catch {
        // ignore malformed payload
      }
    });
  }, [sessionId]);

  // ---- Screen on + heart rate while the workout is open ----
  useEffect(() => {
    if (!sessionId) return;
    keepScreenOn(true);
    const buffer = hrBuffer.current;
    let stop = () => {};
    let live = true;
    requestHeartRate().then((ok) => {
      if (!ok || !live) return;
      stop = watchHeartRate((r) => {
        setBpm(Math.round(r.bpm));
        buffer.push(r);
        hrAll.current.push(r.bpm);
      });
    });
    const flush = setInterval(() => {
      const rows = toHrRows(sessionId, buffer.splice(0));
      if (rows.length) queue.push({ kind: "hr", rows });
    }, HR_FLUSH_MS);
    return () => {
      live = false;
      stop();
      clearInterval(flush);
      const rows = toHrRows(sessionId, buffer.splice(0));
      if (rows.length) queue.push({ kind: "hr", rows });
      keepScreenOn(false);
    };
  }, [sessionId]);

  // ---- Which set we're on, and its pre-filled numbers ----
  const groups = w?.groups ?? [];
  const pos = focus ?? currentPosition(groups);
  const group = pos ? groups[pos.group] : null;
  const set: WatchSet | null = group && pos ? group.sets[pos.set] ?? null : null;
  const setKey = set?.id;
  useEffect(() => {
    if (!group || !pos || !set) return;
    const p = prefill(group, pos.set);
    const targetReps = w?.targets[group.order]?.reps ?? 0;
    setDraft({ weight: p.weight, reps: p.reps || targetReps || 0 });
    // Only when we move to a different set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setKey]);

  // ---- Rest countdown ----
  const [now, setNow] = useState(Date.now());
  const restEnds = view.kind === "rest" ? view.endsAt : null;
  useEffect(() => {
    if (restEnds == null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [restEnds]);
  useEffect(() => {
    if (restEnds != null && now >= restEnds) {
      Vibration.vibrate([0, 400, 200, 400]);
      setView({ kind: "log" });
    }
  }, [now, restEnds]);

  if (w === undefined) {
    return (
      <Screen center scroll={false}>
        <ActivityIndicator color={C.accentText} />
      </Screen>
    );
  }
  if (w === null && view.kind !== "done") {
    return (
      <Screen center>
        <T center muted>
          No workout in progress.
        </T>
        <Btn label="Back" onPress={onExit} />
      </Screen>
    );
  }

  const workout = w as ActiveWorkout;
  const allSets = groups.flatMap((g) => g.sets);
  const doneSets = allSets.filter((s) => s.is_completed);

  function updateSet(id: string, patch: Partial<WatchSet>) {
    setW((cur) =>
      cur ? { ...cur, groups: cur.groups.map((g) => ({ ...g, sets: g.sets.map((s) => (s.id === id ? { ...s, ...patch } : s)) })) } : cur,
    );
  }

  function complete() {
    if (!set || !group || draft.reps <= 0) return;
    logSet(group, set, draft.weight, draft.reps);
  }

  function logSet(g: ExerciseGroup, target: WatchSet, weight: number, reps: number) {
    const at = new Date().toISOString();
    updateSet(target.id, { weight, reps, is_completed: true });
    queue.push({ kind: "complete", setId: target.id, weight, reps, at });
    watchBridge.sendSetLogged({
      sessionId: workout.id,
      exerciseId: g.exerciseId,
      setNumber: target.set_number,
      weightKg: weight,
      reps,
      isCompleted: true,
    }).catch(() => {});
    Vibration.vibrate(40);
    setFocus(null);

    const rest = restSeconds({
      type: target.set_type,
      mechanic: g.mechanic,
      // Same order as the phone: your own rest for this exercise, then the routine's.
      routineRest: workout.myRest?.[g.exerciseId] ?? workout.targets[g.order]?.rest ?? null,
      profileDefault: profile.defaultRest,
      supersetGroup: g.supersetGroup,
      order: g.order,
      groups: groups.map((x) => ({ order: x.order, supersetGroup: x.supersetGroup })),
    });
    // What comes next, for the rest screen.
    const after = groups.map((x) => ({ ...x, sets: x.sets.map((s) => (s.id === target.id ? { ...s, is_completed: true } : s)) }));
    const nextPos = currentPosition(after);
    const next = nextPos ? `${after[nextPos.group].name} · set ${nextPos.set + 1}` : "Last set done";
    if (rest > 0) setView({ kind: "rest", endsAt: Date.now() + rest * 1000, duration: rest, next });
  }

  // ---- Say a set: "bench 185 for 8" ----
  async function speak() {
    const text = await listen('Say "185 for 8"');
    if (!text) return;
    const parsed = parseSpokenSet(text, groups.map((g, i) => ({ key: i, name: g.name })));
    if (!parsed || parsed.reps == null || parsed.reps <= 0) return showVoice({ text: `Heard "${text}". Try "185 for 8".` });
    if (parsed.unknownExercise) return showVoice({ text: `"${text}" isn't in this workout.` });
    const gi = parsed.exercise ?? pos?.group ?? 0;
    const g = groups[gi];
    if (!g) return;
    let target = g.sets.find((s) => !s.is_completed);
    let added = false;
    if (!target) {
      target = newSetFor(g);
      added = true;
    }
    const mine = unit === "imperial" ? "lb" : "kg";
    const said = parsed.unit ?? mine;
    const weight =
      parsed.weight == null
        ? gi === pos?.group
          ? draft.weight
          : added
            ? target.weight
            : prefill(g, g.sets.indexOf(target)).weight
        : said === "kg"
          ? parsed.weight
          : parsed.weight / LB_PER_KG;
    const done = { ...target, is_completed: false };
    logSet(added ? { ...g, sets: [...g.sets, done] } : g, done, weight, parsed.reps);
    const id = target.id;
    showVoice({
      text: `${g.name} ${weight > 0 ? `${displayWeight(weight, unit)} × ` : ""}${parsed.reps}`,
      undo: () => {
        updateSet(id, { is_completed: false });
        queue.push({ kind: "uncomplete", setId: id });
        setView({ kind: "log" });
      },
    });
  }

  function showVoice(v: { text: string; undo?: () => void }) {
    clearTimeout(voiceTimer.current);
    setVoice(v);
    voiceTimer.current = setTimeout(() => setVoice(null), 8000);
  }

  /** Add a set to this exercise (copying the last one's numbers) and return it. */
  function newSetFor(g: ExerciseGroup): WatchSet {
    const last = g.sets[g.sets.length - 1];
    const id = uuid();
    const row = {
      id,
      client_id: id,
      session_id: workout.id,
      exercise_id: g.exerciseId,
      exercise_order: g.order,
      set_number: (last?.set_number ?? 0) + 1,
      set_type: "normal" as const,
      superset_group: g.supersetGroup,
      weight: last?.weight ?? 0,
      reps: last?.reps ?? 0,
    };
    setW((cur) =>
      cur ? { ...cur, groups: cur.groups.map((x) => (x.order === g.order ? { ...x, sets: [...x.sets, { ...row, is_completed: false }] } : x)) } : cur,
    );
    queue.push({ kind: "addSet", row });
    return { ...row, is_completed: false };
  }

  function addSet() {
    if (!group) return;
    newSetFor(group);
    setFocus({ group: pos!.group, set: group.sets.length });
  }

  function finish() {
    finishWorkout(workout);
    watchBridge.sendWorkoutFinished(workout.id).catch(() => {});
    keepScreenOn(false);
    setView({ kind: "done" });
  }

  function moveExercise(delta: number) {
    if (!pos) return;
    const g = (pos.group + delta + groups.length) % groups.length;
    const i = groups[g].sets.findIndex((s) => !s.is_completed);
    setFocus({ group: g, set: i >= 0 ? i : groups[g].sets.length - 1 });
  }

  const hr =
    bpm != null ? (
      <T center bold style={{ color: ZONE[hrZone(bpm, profile.age) - 1], fontSize: 13 }}>
        ♥ {bpm}
      </T>
    ) : null;

  const voiceBar = voice ? (
    <View style={{ gap: 4 }}>
      <T center small numberOfLines={2} style={{ color: voice.undo ? C.text : C.amber }}>
        {voice.undo ? `✓ ${voice.text}` : voice.text}
      </T>
      {voice.undo && (
        <Btn
          kind="secondary"
          label="Undo"
          accessibilityLabel="Undo the set you just said"
          onPress={() => {
            voice.undo?.();
            setVoice(null);
          }}
        />
      )}
    </View>
  ) : null;

  // ---- Summary ----
  if (view.kind === "done") {
    const volume = doneSets.filter((s) => s.set_type !== "warmup").reduce((v, s) => v + s.weight * s.reps, 0);
    const avg = hrAll.current.length ? Math.round(hrAll.current.reduce((a, b) => a + b, 0) / hrAll.current.length) : null;
    return (
      <Screen center>
        <T center bold style={{ color: C.accentText, fontSize: 16 }}>
          Workout saved
        </T>
        <T center>
          {doneSets.length} sets · {Math.round(Number(displayWeight(volume, unit))).toLocaleString()} {unit === "imperial" ? "lb" : "kg"}
        </T>
        {avg != null && (
          <T center muted>
            ♥ {avg} avg · {Math.round(Math.max(...hrAll.current))} max
          </T>
        )}
        <Btn label="Done" onPress={onExit} />
      </Screen>
    );
  }

  // ---- Rest ----
  if (view.kind === "rest") {
    const left = Math.max(0, (view.endsAt - now) / 1000);
    const pct = 1 - left / view.duration;
    return (
      <Screen center scroll={false}>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 10 }}>
          <T center muted small>
            Rest
          </T>
          {hr}
        </View>
        <T center style={{ fontSize: 42, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
          {formatClock(left)}
        </T>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: C.card, overflow: "hidden" }}>
          <View style={{ height: 4, width: `${Math.min(100, pct * 100)}%`, backgroundColor: C.accent }} />
        </View>
        <T center muted small>
          {view.next}
        </T>
        {voiceBar}
        <View style={{ flexDirection: "row", gap: 4 }}>
          <View style={{ flex: 1 }}>
            <Btn kind="secondary" label="−15" accessibilityLabel="15 seconds less" onPress={() => setView({ ...view, endsAt: Math.max(Date.now(), view.endsAt - 15000) })} />
          </View>
          <View style={{ flex: 1.3 }}>
            <Btn label="Skip" onPress={() => setView({ kind: "log" })} />
          </View>
          <View style={{ flex: 1 }}>
            <Btn kind="secondary" label="+15" accessibilityLabel="15 seconds more" onPress={() => setView({ ...view, endsAt: view.endsAt + 15000, duration: view.duration + 15 })} />
          </View>
        </View>
      </Screen>
    );
  }

  // ---- Log a set ----
  const unitLabel = unit === "imperial" ? "lb" : "kg";
  const step = weightStepKg(unit);
  const fine = fineStepKg(unit);
  const working = group ? group.sets.filter((s) => s.set_type !== "warmup") : [];
  const label =
    set == null
      ? ""
      : set.set_type === "warmup"
        ? "Warm-up"
        : `Set ${working.findIndex((s) => s.id === set.id) + 1} of ${working.length}`;

  return (
    <Screen>
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 10 }}>
        {hr}
        <T center muted small>
          {doneSets.length}/{allSets.length} sets
        </T>
      </View>
      {group ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Next exercise" onPress={() => moveExercise(1)}>
          <T center bold style={{ fontSize: 15 }}>
            {group.name}
          </T>
          <T center small style={{ color: set?.set_type === "warmup" ? C.amber : C.muted }}>
            {set?.is_completed ? `${label} · done` : label}
            {groups.length > 1 ? "  ›" : ""}
          </T>
        </Pressable>
      ) : (
        <T center bold>
          {workout.name ?? "Workout"}
        </T>
      )}

      {set && !set.is_completed ? (
        <>
          <Stepper
            label="weight"
            value={displayWeight(draft.weight, unit)}
            unit={unitLabel}
            onMinus={() => setDraft((d) => ({ ...d, weight: stepKg(d.weight, -step, unit) }))}
            onPlus={() => setDraft((d) => ({ ...d, weight: stepKg(d.weight, step, unit) }))}
            onLongMinus={() => setDraft((d) => ({ ...d, weight: stepKg(d.weight, -fine, unit) }))}
            onLongPlus={() => setDraft((d) => ({ ...d, weight: stepKg(d.weight, fine, unit) }))}
          />
          <Stepper
            label="reps"
            value={String(draft.reps)}
            unit="reps"
            onMinus={() => setDraft((d) => ({ ...d, reps: Math.max(0, d.reps - 1) }))}
            onPlus={() => setDraft((d) => ({ ...d, reps: d.reps + 1 }))}
          />
          <Btn big label="✓  Done" accessibilityLabel="Complete set" disabled={draft.reps <= 0} onPress={complete} />
        </>
      ) : (
        <T center muted>
          {allSets.length === 0 ? "Add exercises on your phone." : "All sets done."}
        </T>
      )}

      {voiceBar}
      {voiceOk && group && <Btn kind="secondary" label="🎤 Say a set" accessibilityLabel="Say your set, like 185 for 8" onPress={speak} />}
      {group && <Btn kind="secondary" label="+ Add set" onPress={addSet} />}
      {doneSets.length > 0 && <Btn kind={currentPosition(groups) ? "secondary" : "primary"} label="Finish workout" onPress={finish} />}
      <Btn kind="ghost" label="Back" onPress={onExit} />
    </Screen>
  );
}
