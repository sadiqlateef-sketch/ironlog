// Shared look for the round watch screen: matches the phone's dark glass theme,
// high contrast, big touch targets. Real blur is too heavy for a watch chip and
// drains the battery, so "glass" here is a solid navy tint over near-black.
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type ViewStyle } from "react-native";

export const C = {
  bg: "#07080f",
  card: "#1a1e36",
  text: "#f5f7ff",
  muted: "#a3aacb",
  accent: "#3d63ee", // fills (buttons, progress); white text on it
  onAccent: "#ffffff",
  accentText: "#84a8ff", // blue text and spinners on the dark background
  amber: "#f5b544",
  red: "#ff6b5e",
};

/** Heart-rate zone colors, 1 (easy) to 5 (max). */
export const ZONE = ["#a1a1aa", "#7cc8f0", "#aae841", "#f5b544", "#ff6b5e"];

/**
 * Keeps content inside the circle: on a round face the corners are cut off,
 * so we pad by the gap between the circle and its inner square.
 */
export function Screen({ children, scroll = true, center = false }: { children: ReactNode; scroll?: boolean; center?: boolean }) {
  const { width } = useWindowDimensions();
  const pad = Math.round(width * 0.11);
  const style: ViewStyle = { paddingHorizontal: pad, paddingTop: pad * 0.9, paddingBottom: pad * 1.4, gap: 8 };
  if (!scroll) return <View style={[styles.fill, style, center && styles.center]}>{children}</View>;
  return (
    <ScrollView style={styles.fill} contentContainerStyle={[style, center && styles.center, { flexGrow: 1 }]}>
      {children}
    </ScrollView>
  );
}

export function Btn({
  label,
  onPress,
  kind = "primary",
  disabled,
  big,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  big?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        big && styles.btnBig,
        kind === "primary" && { backgroundColor: C.accent },
        kind === "secondary" && { backgroundColor: C.card },
        kind === "ghost" && { backgroundColor: "transparent" },
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <Text style={[styles.btnText, big && styles.btnTextBig, { color: kind === "primary" ? C.onAccent : C.text }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** [-]  value  [+]  with large round buttons for sweaty fingers. */
export function Stepper({ value, unit, onMinus, onPlus, label }: { value: string; unit?: string; onMinus: () => void; onPlus: () => void; label: string }) {
  return (
    <View style={styles.stepper}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Less ${label}`} onPress={onMinus} style={({ pressed }) => [styles.round, pressed && { opacity: 0.6 }]}>
        <Text style={styles.roundText}>−</Text>
      </Pressable>
      <View style={styles.valueBox} accessible accessibilityLabel={`${label} ${value} ${unit ?? ""}`}>
        <Text style={[styles.value, { fontSize: value.length >= 5 ? 21 : value.length === 4 ? 25 : 30 }]} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`More ${label}`} onPress={onPlus} style={({ pressed }) => [styles.round, pressed && { opacity: 0.6 }]}>
        <Text style={styles.roundText}>+</Text>
      </Pressable>
    </View>
  );
}

export function T({ children, style, muted, small, center, bold, numberOfLines }: { children: ReactNode; style?: object; muted?: boolean; small?: boolean; center?: boolean; bold?: boolean; numberOfLines?: number }) {
  return (
    <Text numberOfLines={numberOfLines} style={[{ color: muted ? C.muted : C.text, fontSize: small ? 12 : 14 }, center && { textAlign: "center" }, bold && { fontWeight: "700" }, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: C.bg },
  center: { justifyContent: "center", alignItems: "stretch" },
  btn: { minHeight: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  btnBig: { minHeight: 52, borderRadius: 26 },
  btnText: { fontSize: 14, fontWeight: "700" },
  btnTextBig: { fontSize: 18 },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 },
  round: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, alignItems: "center", justifyContent: "center" },
  roundText: { color: C.text, fontSize: 24, fontWeight: "600", marginTop: -2 },
  valueBox: { flex: 1, alignItems: "center" },
  value: { color: C.text, fontSize: 34, fontWeight: "800", fontVariant: ["tabular-nums"] },
  unit: { color: C.muted, fontSize: 11, marginTop: -4 },
});
