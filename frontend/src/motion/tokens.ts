export const motionDurations = {
  panel: 0.24,
  dialog: 0.2,
  list: 0.18,
  reduced: 0
} as const;

export const motionEase = {
  entrance: "power2.out",
  exit: "power1.out",
  list: "power2.out"
} as const;

export const motionOffsets = {
  panelY: 10,
  dialogY: 14,
  listY: 8
} as const;

export function shouldReduceMotion(): boolean {
  if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) {
    return true;
  }
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function durationForMotion(duration: number): number {
  return shouldReduceMotion() ? motionDurations.reduced : duration;
}
