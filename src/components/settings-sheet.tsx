"use client";

import { useState } from "react";
import { Dumbbell, LogOut, MessageCircle } from "lucide-react";
import { ClaudeConnectSheet } from "@/components/claude-connect-sheet";
import { EquipmentSheet } from "@/components/equipment-sheet";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** The gear on the Progress profile header: your name, units, weights and sign out. */
export function SettingsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [equipment, setEquipment] = useState(false);
  const [claude, setClaude] = useState(false);
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>Your profile and how Ironlog shows weights.</DialogDescription>
          </DialogHeader>
          {open && (
            <SettingsForm
              onEquipment={() => {
                onOpenChange(false);
                setEquipment(true);
              }}
              onClaude={() => {
                onOpenChange(false);
                setClaude(true);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <EquipmentSheet open={equipment} onOpenChange={setEquipment} />
      <ClaudeConnectSheet open={claude} onOpenChange={setClaude} />
    </>
  );
}

function SettingsForm({ onEquipment, onClaude }: { onEquipment: () => void; onClaude: () => void }) {
  const { profile, unit, setUnit, updateProfile, signOut } = useAuth();
  const [name, setName] = useState(profile?.display_name ?? "");
  const [saved, setSaved] = useState<string | null>(null);

  async function saveName() {
    const next = name.trim() || null;
    if (next === (profile?.display_name ?? null)) return;
    try {
      await updateProfile({ display_name: next });
      setSaved("Saved.");
    } catch (e) {
      setSaved((e as Error).message);
    }
  }

  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        Your name
        <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} placeholder="What should we call you?" />
      </label>
      {saved && (
        <p className="text-muted-foreground text-xs" role="status">
          {saved}
        </p>
      )}
      <div className="flex flex-col gap-1 text-sm">
        Weight unit
        <div className="bg-secondary grid grid-cols-2 gap-1 rounded-xl p-1" role="group" aria-label="Weight unit">
          {(["imperial", "metric"] as const).map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={unit === u}
              onClick={() => setUnit(u)}
              className={cn("h-10 rounded-lg font-semibold", unit === u ? "bg-foreground text-background" : "text-muted-foreground")}
            >
              {u === "imperial" ? "Pounds (lb)" : "Kilograms (kg)"}
            </button>
          ))}
        </div>
      </div>
      <Button variant="secondary" onClick={onEquipment}>
        <Dumbbell /> Edit available weights
      </Button>
      <Button variant="secondary" onClick={onClaude}>
        <MessageCircle /> Connect to Claude
      </Button>
      <Button variant="secondary" className="text-destructive" onClick={signOut}>
        <LogOut /> Sign out
      </Button>
    </>
  );
}
