// ─────────────────────────────────────────────────────────────────────────
// featureFlags.ts — one of the 5 "governors" in system-model.md: what's
// visible. Everything non-MVP defaults to false. A flag flips to true only
// once its real integration exists (an OAuth app is registered, an
// entitlement is granted, etc.) — not just because a screen was drafted.
// ─────────────────────────────────────────────────────────────────────────

export const featureFlags = {
  // Onboarding's "connect" screen (task 062): only HealthKit is live.
  healthKitConnect: true,
  gmailConnect: false,
  googleCalendarConnect: false,
  garminConnect: false,
  whoopConnect: false,

  // Everything else in the spec, correctly FUTURE per current-state.md.
  appBlocking: false,
  cycleTracking: false,
  accountabilityPayments: false,
  // Gates the real filesystem/Obsidian round-trip (task 058/059 phase 2 —
  // "Export to Obsidian") ONLY. Does NOT gate lib/obsidian.ts's phase-1
  // vault-note writer (see that file) — that runs ungated for every user,
  // since it's populating the AI's existing memory store (vault_files), not
  // "Obsidian sync" in the sense this flag means.
  obsidianSync: false,
  socialFeed: false,
} as const;

export type FeatureFlag = keyof typeof featureFlags;
