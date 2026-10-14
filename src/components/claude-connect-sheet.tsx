"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Link2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createClaudeLink, deleteClaudeLink, getClaudeLink, type ClaudeLink } from "@/lib/claude-link";

const CONNECTORS_URL = "https://claude.ai/settings/connectors";

function when(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Settings > Connect to Claude: make the private link you paste into Claude
 * as a custom connector, so you can tell Claude your workout and it logs it.
 */
export function ClaudeConnectSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect to Claude</DialogTitle>
          <DialogDescription>
            Tell Claude about a workout in any chat (&ldquo;bench 3x5 at 225, rows 3x10 at 135&rdquo;) and it saves it to Ironlog for you.
          </DialogDescription>
        </DialogHeader>
        {open && <ConnectForm />}
      </DialogContent>
    </Dialog>
  );
}

function ConnectForm() {
  const [link, setLink] = useState<ClaudeLink | null | undefined>(undefined);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getClaudeLink().then(setLink, (e: Error) => {
      setLink(null);
      setError(e.message);
    });
  }, []);

  async function make() {
    if (link && !window.confirm("Make a new link? The old one stops working, so you'll need to paste the new one into Claude.")) return;
    setBusy(true);
    setError(null);
    try {
      setUrl(await createClaudeLink());
      setLink(await getClaudeLink());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    if (!window.confirm("Disconnect Claude? It won't be able to log workouts until you make a new link.")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteClaudeLink();
      setLink(null);
      setUrl(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Press and hold the link above to copy it.");
    }
  }

  if (link === undefined) return <p className="text-muted-foreground text-sm">Checking…</p>;

  return (
    <div className="flex flex-col gap-4 text-sm">
      {url ? (
        <>
          <div className="flex flex-col gap-2">
            <p className="font-semibold">Your connector link</p>
            <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Your connector link" className="font-mono text-xs" />
            <Button onClick={copy}>
              {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy link"}
            </Button>
            <p className="text-muted-foreground text-xs">
              This is the only time it&rsquo;s shown. Treat it like a password: anyone with it can add workouts to your log.
            </p>
          </div>
          <ol className="text-muted-foreground flex list-decimal flex-col gap-1 pl-5">
            <li>
              Open{" "}
              <a href={CONNECTORS_URL} target="_blank" rel="noreferrer" className="text-foreground underline">
                claude.ai Connectors
              </a>{" "}
              and choose <span className="text-foreground">Add custom connector</span>.
            </li>
            <li>
              Name it <span className="text-foreground">Ironlog</span>, paste the link as the URL, and tap <span className="text-foreground">Add</span>.
            </li>
            <li>In a chat, turn Ironlog on from the tools menu and tell Claude your workout.</li>
          </ol>
        </>
      ) : link ? (
        <p>
          Claude is connected (link made {when(link.created_at)}
          {link.last_used_at ? `, last used ${when(link.last_used_at)}` : ", not used yet"}). Lost the link? Make a new one and paste it into Claude again.
        </p>
      ) : (
        <p className="text-muted-foreground">Make a private link, then paste it into Claude as a custom connector. You can turn it off here any time.</p>
      )}

      {error && (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {!url && (
          <Button onClick={make} disabled={busy}>
            <Link2 /> {link ? "Make a new link" : "Make my link"}
          </Button>
        )}
        {link && (
          <Button variant="secondary" className="text-destructive" onClick={turnOff} disabled={busy}>
            <Trash2 /> Disconnect Claude
          </Button>
        )}
      </div>
    </div>
  );
}
