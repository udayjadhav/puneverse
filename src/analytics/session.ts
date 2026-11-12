/**
 * Lightweight session engagement — counts meaningful interactions and emits
 * a throttled heartbeat. Does not rely on unreliable browser-close events.
 */

import { track } from "./client";
import { PV_EVENTS } from "./events";

const HEARTBEAT_MS = 60_000;
const ENGAGED_AFTER = 3;

let interactions = 0;
let lastAt = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let started = false;

export function noteMeaningfulInteraction(): void {
  interactions += 1;
  lastAt = Date.now();
  ensureHeartbeat();
}

function ensureHeartbeat(): void {
  if (started) return;
  started = true;
  timer = setInterval(() => {
    const idle = Date.now() - lastAt;
    if (idle > 5 * 60_000) return; // idle tab — do not count continuous engagement
    track(PV_EVENTS.session_engagement, {
      engaged: interactions >= ENGAGED_AFTER,
      interaction_count: interactions,
    });
  }, HEARTBEAT_MS);
}

export function stopSessionHeartbeat(): void {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}

export function __resetSessionForTests(): void {
  stopSessionHeartbeat();
  interactions = 0;
  lastAt = 0;
}

export function getInteractionCount(): number {
  return interactions;
}
