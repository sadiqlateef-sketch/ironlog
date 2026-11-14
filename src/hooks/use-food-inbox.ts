"use client";

import { useCallback, useEffect, useState } from "react";
import { INBOX_EVENT, listInbox, sweepInboxPhotos } from "@/lib/nutrition-inbox-store";
import type { InboxItem } from "@/lib/nutrition/inbox";

let swept = false;

/** The capture inbox, kept current. The first use after app start also clears photo files left by a sign-out. */
export function useFoodInbox(): { items: InboxItem[] | null; reload: () => void } {
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const reload = useCallback(() => {
    listInbox()
      .then(setItems)
      .catch(() => setItems((x) => x ?? []));
  }, []);
  useEffect(() => {
    reload();
    if (!swept) {
      swept = true;
      void sweepInboxPhotos();
    }
    window.addEventListener(INBOX_EVENT, reload);
    return () => window.removeEventListener(INBOX_EVENT, reload);
  }, [reload]);
  return { items, reload };
}
