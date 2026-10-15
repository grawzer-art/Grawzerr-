"use client";

import { useEffect } from "react";

/** Registers the service worker in production (installable PWA + offline screen). */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Non-fatal: the app works without it.
    });
  }, []);
  return null;
}
