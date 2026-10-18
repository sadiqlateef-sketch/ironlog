import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { currentWorkout, queue, refreshPlan, savedPlan, signOut, startRoutine, type ActiveWorkout, type WatchPlan } from "../api";
import type { PlanRoutine } from "../logic";
import { Btn, C, Screen, T } from "../ui";

export function HomeScreen({ onOpenWorkout, onSignedOut }: { onOpenWorkout: () => void; onSignedOut: () => void }) {
  const [active, setActive] = useState<ActiveWorkout | null | undefined>(undefined);
  const [plan, setPlan] = useState<WatchPlan | null>(null);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(() => {
    setError(null);
    queue.flush().then(setPending);
    // The saved plan shows straight away (and is all there is with no signal).
    savedPlan().then((saved) => saved && setPlan((cur) => cur ?? saved));
    currentWorkout().then(({ workout, offline: off }) => {
      setActive(workout);
      setOffline(off);
    });
    refreshPlan()
      .then((p) => {
        setPlan(p);
        setOffline(false);
      })
      .catch(() => setOffline(true));
  }, []);

  useEffect(refresh, [refresh]);
  useEffect(() => queue.onChange(setPending), []);

  async function start(routine: PlanRoutine) {
    setBusy(routine.id);
    setError(null);
    try {
      await startRoutine(routine);
      onOpenWorkout();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function unlink() {
    Alert.alert("Unlink watch?", "You can link it again from your phone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Unlink", style: "destructive", onPress: () => signOut().then(onSignedOut) },
    ]);
  }

  if (active === undefined) {
    return (
      <Screen center scroll={false}>
        <ActivityIndicator color={C.accentText} />
      </Screen>
    );
  }

  return (
    <Screen>
      <T center bold style={{ color: C.accentText, fontSize: 16 }}>
        Ironlog
      </T>
      {(error || offline) && (
        <T center small style={{ color: C.amber }}>
          {error ?? (plan ? "No signal · using saved plan" : "Offline")}
        </T>
      )}
      {active ? (
        <>
          <T center muted small>
            In progress
          </T>
          <Btn big label={`▶ ${active.name ?? "Workout"}`} onPress={onOpenWorkout} />
        </>
      ) : plan?.upNext ? (
        <>
          <T center muted small numberOfLines={1}>
            Up next · Week {plan.upNext.week} of {plan.upNext.weeks}
          </T>
          <Btn
            big
            label={busy === plan.upNext.routineId ? "Starting…" : `▶ Day ${plan.upNext.day}`}
            accessibilityLabel={`Start week ${plan.upNext.week} day ${plan.upNext.day}`}
            disabled={!!busy || plan.upNext.routine.items.length === 0}
            onPress={() => start(plan.upNext!.routine)}
          />
          <T center small numberOfLines={2}>
            {plan.upNext.name}
          </T>
        </>
      ) : (
        <>
          <T center muted small>
            Start a routine
          </T>
          {!plan?.routines.length && (
            <T center muted small>
              Make a routine or program on your phone first.
            </T>
          )}
          {plan?.routines.map((r) => (
            <Btn key={r.id} kind="secondary" label={busy === r.id ? "Starting…" : r.name} disabled={!!busy} onPress={() => start(r.routine)} />
          ))}
        </>
      )}
      <View style={{ height: 6 }} />
      {pending > 0 && (
        <T center muted small>
          {pending} change{pending === 1 ? "" : "s"} waiting to sync
        </T>
      )}
      <Btn kind="ghost" label="Refresh" onPress={refresh} />
      <Btn kind="ghost" label="Unlink watch" onPress={unlink} />
    </Screen>
  );
}
