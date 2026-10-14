import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { listRoutines, loadActive, loadUpNext, queue, signOut, startRoutine, type ActiveWorkout, type RoutineSummary, type UpNext } from "../api";
import { Btn, C, Screen, T } from "../ui";

export function HomeScreen({ onOpenWorkout, onSignedOut }: { onOpenWorkout: () => void; onSignedOut: () => void }) {
  const [active, setActive] = useState<ActiveWorkout | null | undefined>(undefined);
  const [routines, setRoutines] = useState<RoutineSummary[]>([]);
  const [upNext, setUpNext] = useState<UpNext | null>(null);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setError(null);
    queue.flush().then(setPending);
    loadActive()
      .then(setActive)
      .catch(() => {
        setActive(null);
        setError("Offline");
      });
    listRoutines().then(setRoutines).catch(() => {});
    loadUpNext().then(setUpNext).catch(() => {});
  }, []);

  useEffect(refresh, [refresh]);
  useEffect(() => queue.onChange(setPending), []);

  async function start(id: string) {
    setBusy(id);
    setError(null);
    try {
      await startRoutine(id);
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
      {error && (
        <T center small style={{ color: C.amber }}>
          {error}
        </T>
      )}
      {active ? (
        <>
          <T center muted small>
            In progress
          </T>
          <Btn big label={`▶ ${active.name ?? "Workout"}`} onPress={onOpenWorkout} />
        </>
      ) : upNext ? (
        <>
          <T center muted small numberOfLines={1}>
            Up next · Week {upNext.week} of {upNext.weeks}
          </T>
          <Btn
            big
            label={busy === upNext.routineId ? "Starting…" : `▶ Day ${upNext.day}`}
            accessibilityLabel={`Start week ${upNext.week} day ${upNext.day}`}
            disabled={!!busy}
            onPress={() => start(upNext.routineId)}
          />
          <T center small numberOfLines={2}>
            {upNext.name}
          </T>
        </>
      ) : (
        <>
          <T center muted small>
            Start a routine
          </T>
          {routines.length === 0 && (
            <T center muted small>
              Make a routine or program on your phone first.
            </T>
          )}
          {routines.map((r) => (
            <Btn key={r.id} kind="secondary" label={busy === r.id ? "Starting…" : r.name} disabled={!!busy} onPress={() => start(r.id)} />
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
