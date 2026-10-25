import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { checkPairing, enableOfflineMode, startPairing, type Pairing } from "../pairing";
import { Btn, C, Screen, T } from "../ui";

/** Shows a 6-digit code; you type it on your phone (Home > Link watch), or continue offline. */
export function PairScreen({ onLinked }: { onLinked: () => void }) {
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const begin = useCallback(() => {
    setExpired(false);
    setError(null);
    setPairing(null);
    startPairing()
      .then(setPairing)
      .catch((e: Error) => setError(e.message || "No connection"));
  }, []);

  useEffect(begin, [begin]);

  const handleUseOffline = useCallback(async () => {
    await enableOfflineMode();
    onLinked();
  }, [onLinked]);

  useEffect(() => {
    if (!pairing || expired) return;
    let live = true;
    const id = setInterval(async () => {
      try {
        const status = await checkPairing(pairing);
        if (!live) return;
        if (status === "linked") onLinked();
        else if (status === "expired") setExpired(true);
      } catch {
        // Offline for a moment: keep trying until the code expires.
      }
    }, 3000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [pairing, expired, onLinked]);

  const code = pairing ? `${pairing.code.slice(0, 3)} ${pairing.code.slice(3)}` : "";
  return (
    <Screen center>
      <T center bold style={{ color: C.accentText, fontSize: 16 }}>
        Ironlog
      </T>
      {error ? (
        <>
          <T center muted small style={{ marginBottom: 4 }}>
            {error}
          </T>
          <Btn label="Try again" onPress={begin} />
          <View style={{ height: 4 }} />
          <Btn kind="secondary" label="Use offline" onPress={handleUseOffline} />
        </>
      ) : expired ? (
        <>
          <T center muted>
            That code expired.
          </T>
          <Btn label="New code" onPress={begin} />
          <View style={{ height: 4 }} />
          <Btn kind="secondary" label="Use offline" onPress={handleUseOffline} />
        </>
      ) : pairing ? (
        <>
          <T center muted small>
            On phone: Home › Link watch
          </T>
          <Text
            accessibilityLabel={`Code ${pairing.code.split("").join(" ")}`}
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ color: C.text, textAlign: "center", fontSize: 28, fontWeight: "800", letterSpacing: 1, fontVariant: ["tabular-nums"] }}
          >
            {code}
          </Text>
          <View style={{ height: 6 }} />
          <Btn kind="secondary" label="Use offline" onPress={handleUseOffline} />
        </>
      ) : (
        <ActivityIndicator color={C.accentText} />
      )}
    </Screen>
  );
}
