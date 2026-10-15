"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => undefined;

/**
 * Reads a browser-only value (feature detection) without a hydration mismatch:
 * the server snapshot is used for the first render, the real value right after.
 */
export function useClientValue<T extends string | number | boolean>(read: () => T, serverValue: T): T {
  return useSyncExternalStore(noopSubscribe, read, () => serverValue);
}
