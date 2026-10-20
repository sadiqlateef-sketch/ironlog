"use client";

import { useEffect, useState } from "react";
import { ACTIVE_WORKOUT_EVENT, getActiveSession, peekActiveWorkout } from "@/lib/offline/workout-store";

export type ActiveWorkout = Awaited<ReturnType<typeof peekActiveWorkout>>;

// Kept between screens (each page mounts its own shell), so the workout bar
// is there on the first frame instead of popping in after a lookup.
let last: ActiveWorkout | undefined;
let checkedServer = false;

/**
 * The workout in progress, from the phone's copy (updated as you log).
 * `undefined` until the first read. Once per app start it also asks the
 * server, to catch a workout started on the watch.
 */
export function useActiveWorkout(): ActiveWorkout | undefined {
  const [workout, setWorkout] = useState(last);
  useEffect(() => {
    let alive = true;
    const read = () =>
      peekActiveWorkout()
        .then((w) => {
          last = w;
          if (alive) setWorkout(w);
        })
        .catch(() => {});
    read();
    if (!checkedServer) {
      checkedServer = true;
      // Updates the phone's copy, which fires the event below.
      getActiveSession().catch(() => {});
    }
    window.addEventListener(ACTIVE_WORKOUT_EVENT, read);
    return () => {
      alive = false;
      window.removeEventListener(ACTIVE_WORKOUT_EVENT, read);
    };
  }, []);
  return workout;
}
