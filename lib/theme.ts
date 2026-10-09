// ─────────────────────────────────────────────────────────────────────────
// PUCK design tokens — the single source of truth for colour and type.
//
// Mirrors the Companion HUD firmware (companion-hud/main/theme.h and
// log_home/log_home_cfg.h) so the phone and the puck read as one product:
// pure black, white is the only "hot" colour, greys carry hierarchy, and
// the green today-dot is the one accent. Red is reserved for destructive.
//
// Type system — three faces, each with one job:
//   DOT  London Underground Heavy (SIL OFL, petykowski) — the "bold stuff".
//        Arrival-board dot-matrix: screen titles, section labels, tab labels,
//        board rows (next task, reps), category tags. Covers A–Z a–z 0–9 and
//        - ' , * ( ) : only — no . / % ? ! — so never set prose or decimals in it.
//   NUM  Doto (SIL OFL) — dot-matrix numerals that need . / % (72.5 KG, 3/5).
//   MONO Share Tech Mono (SIL OFL) — everything read as a sentence; same
//        face the puck uses for its small text.
// The puck's Ndot57 is NOT used: its embedded licence restricts it to
// Nothing brand materials.
// ─────────────────────────────────────────────────────────────────────────

export const C = {
  bg:       '#000000',
  surface:  '#0C0C0C', // cards
  raised:   '#151515', // pressed / inputs / sheets
  line:     '#222222', // hairlines, card borders
  lineHi:   '#383838', // emphasised borders, dividers on raised
  ink:      '#EDEDED', // primary text
  hot:      '#FFFFFF', // the accent: active, primary buttons, selection
  onHot:    '#000000', // text/icons on a hot fill
  dim:      '#8A8A8A', // secondary text
  faint:    '#4A4A4A', // placeholders, future, disabled
  ghost:    '#2C2C2C', // idle dots, empty tracks
  live:     '#74F25B', // today / done — the puck's today dot
  alert:    '#FF3B30', // destructive, over-target
  signal:   '#FFB23F', // arrival-board amber — body-map categories only
  scrim:    'rgba(0,0,0,0.72)',
};

export const F = {
  dot:      'LondonUnderground_Heavy',
  num:      'Doto_900Black',
  numLight: 'Doto_700Bold',
  mono:     'ShareTechMono_400Regular',
};

/** Dot-matrix face for a displayed value: the Underground face unless the
 *  string needs a glyph it lacks (. / % ×), then Doto at a size bumped to
 *  match the Underground cap height (Doto digits are 0.70 em vs 0.83 em). */
export function numFace(value: string | number, size: number) {
  return /[.\/%×]/.test(String(value))
    ? { fontFamily: F.num, fontSize: Math.round(size * 1.18) }
    : { fontFamily: F.dot, fontSize: size };
}

// Type scale. Dot sizes are for numerals/headings; anything a user has to
// read as a sentence stays MONO.
export const T = {
  hero:    { fontFamily: F.dot,  fontSize: 44, color: C.ink, letterSpacing: 1 },
  title:   { fontFamily: F.dot,  fontSize: 30, color: C.ink, letterSpacing: 1 },
  num:     { fontFamily: F.num,  fontSize: 24, color: C.ink },
  eyebrow: { fontFamily: F.mono, fontSize: 11, color: C.dim, letterSpacing: 2 },
  body:    { fontFamily: F.mono, fontSize: 14, color: C.ink },
  small:   { fontFamily: F.mono, fontSize: 12, color: C.dim },
  micro:   { fontFamily: F.mono, fontSize: 10, color: C.dim, letterSpacing: 1.5 },
} as const;

// Springs used for every "bouncy" interaction, so motion feels like one system.
export const SPRING = {
  pop:    { friction: 5, tension: 140, useNativeDriver: true },
  settle: { friction: 8, tension: 90,  useNativeDriver: true },
} as const;

export const RADIUS = { card: 18, pill: 999, chip: 10 } as const;
