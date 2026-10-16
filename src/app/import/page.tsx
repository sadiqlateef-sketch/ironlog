"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Photo import now lives on the Log screen. */
export default function ImportRedirect() {
  const router = useRouter();
  useEffect(() => router.replace("/log/?tab=photo"), [router]);
  return null;
}
