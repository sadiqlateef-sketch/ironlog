import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StatusBar } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadProfile, queue, type Profile } from "./src/api";
import { OFFLINE_KEY } from "./src/pairing";
import { HomeScreen } from "./src/screens/HomeScreen";
import { PairScreen } from "./src/screens/PairScreen";
import { WorkoutScreen } from "./src/screens/WorkoutScreen";
import { supabase } from "./src/supabase";
import { C, Screen } from "./src/ui";

type Route = "boot" | "pair" | "home" | "workout";

export default function App() {
  const [route, setRoute] = useState<Route>("boot");
  const [profile, setProfile] = useState<Profile>({ unit: "imperial", defaultRest: 120, age: null });

  const signedIn = useCallback(() => {
    loadProfile().then(setProfile).catch(() => {});
    setRoute("home");
  }, []);

  useEffect(() => {
    async function checkAuth() {
      const offline = await AsyncStorage.getItem(OFFLINE_KEY);
      if (offline === "true") {
        signedIn();
        return;
      }
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session) signedIn();
        else setRoute("pair");
      } catch {
        setRoute("pair");
      }
    }
    checkAuth();

    // Keep trying to send waiting changes in the background.
    const id = setInterval(() => queue.flush(), 20_000);
    return () => clearInterval(id);
  }, [signedIn]);

  return (
    <>
      <StatusBar hidden />
      {route === "boot" && (
        <Screen center scroll={false}>
          <ActivityIndicator color={C.accentText} />
        </Screen>
      )}
      {route === "pair" && <PairScreen onLinked={signedIn} />}
      {route === "home" && <HomeScreen onOpenWorkout={() => setRoute("workout")} onSignedOut={() => setRoute("pair")} />}
      {route === "workout" && <WorkoutScreen profile={profile} onExit={() => setRoute("home")} />}
    </>
  );
}
