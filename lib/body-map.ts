// ─────────────────────────────────────────────────────────────────────────
// Body map — geometry + the user's annotations for the BODY tab.
//
// The figure is two flat "plates" (front and back silhouettes, split into
// tappable muscle regions) standing a little apart in 3D, drawn with an
// orthographic yaw/elevation camera — an exploded axonometric, the way a
// technical drawing separates layers. Coordinates are a 200 × 440 front-view
// grid, x = 0 on the midline, y = 0 at the crown; only the screen-right half
// is written out and mirrored, so the figure stays symmetric.
//
// Annotations are local-only (AsyncStorage @body_map) — nothing server-side
// reads them yet, so there is no table and no sync.
// ─────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';

export type Plate = 'front' | 'back';
export type Pt = [number, number];
export interface Region { id: string; name: string; plate: Plate; pts: Pt[] }

const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 14): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as Pt;
  });

const mirror = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [-x, y] as Pt).reverse();

// Front plate: screen-right (x > 0) is the figure's LEFT side.
// Back plate:  coordinates are as seen from behind, so x > 0 is the figure's RIGHT.
function paired(plate: Plate, key: string, name: string, pts: Pt[]): Region[] {
  const plusIsLeft = plate === 'front';
  return [
    { id: `${plate}.${key}.${plusIsLeft ? 'l' : 'r'}`, name: `${plusIsLeft ? 'L' : 'R'} ${name}`, plate, pts },
    { id: `${plate}.${key}.${plusIsLeft ? 'r' : 'l'}`, name: `${plusIsLeft ? 'R' : 'L'} ${name}`, plate, pts: mirror(pts) },
  ];
}
const single = (plate: Plate, key: string, name: string, pts: Pt[]): Region => ({ id: `${plate}.${key}`, name, plate, pts });

const ARM_UPPER: Pt[] = [[48, 110], [60, 110], [64, 150], [52, 154], [47, 132]];
const FOREARM: Pt[] = [[52, 158], [64, 154], [74, 204], [62, 208]];
const HAND: Pt[] = [[62, 212], [75, 208], [80, 234], [66, 240]];
const NECK: Pt[] = [[-8, 54], [8, 54], [10, 68], [-10, 68]];
const FOOT: Pt[] = [[19, 398], [31, 396], [38, 416], [16, 418]];
const DELT: Pt[] = [[34, 70], [52, 70], [62, 86], [60, 108], [48, 106], [46, 84]];

export const REGIONS: Region[] = [
  // ── front ──
  single('front', 'head', 'HEAD', ellipse(0, 30, 19, 25)),
  single('front', 'neck', 'NECK', NECK),
  ...paired('front', 'delt', 'FRONT DELT', DELT),
  ...paired('front', 'chest', 'CHEST', [[2, 72], [34, 70], [46, 84], [42, 112], [22, 120], [2, 118]]),
  ...paired('front', 'bicep', 'BICEP', ARM_UPPER),
  ...paired('front', 'forearm', 'FOREARM', FOREARM),
  ...paired('front', 'hand', 'HAND', HAND),
  single('front', 'abs', 'ABS', [[-15, 122], [15, 122], [16, 160], [14, 196], [-14, 196], [-16, 160]]),
  ...paired('front', 'oblique', 'OBLIQUE', [[19, 122], [40, 116], [38, 150], [36, 186], [17, 198], [18, 160]]),
  single('front', 'hip', 'HIP FLEXORS', [[-14, 200], [14, 200], [22, 214], [0, 230], [-22, 214]]),
  ...paired('front', 'quad', 'QUAD', [[24, 214], [38, 192], [42, 240], [36, 294], [14, 296], [4, 236]]),
  ...paired('front', 'knee', 'KNEE', [[14, 300], [36, 298], [34, 320], [16, 322]]),
  ...paired('front', 'shin', 'SHIN', [[16, 326], [34, 324], [31, 392], [19, 394]]),
  ...paired('front', 'foot', 'FOOT', FOOT),
  // ── back ──
  single('back', 'head', 'BACK OF HEAD', ellipse(0, 30, 19, 25)),
  single('back', 'neck', 'NAPE', NECK),
  single('back', 'traps', 'TRAPS', [[-10, 58], [10, 58], [34, 70], [16, 92], [0, 98], [-16, 92], [-34, 70]]),
  ...paired('back', 'rdelt', 'REAR DELT', DELT),
  ...paired('back', 'upper', 'UPPER BACK', [[2, 100], [16, 94], [34, 72], [46, 86], [42, 118], [14, 124], [2, 118]]),
  ...paired('back', 'lat', 'LAT', [[14, 126], [42, 120], [40, 160], [26, 186], [14, 186]]),
  ...paired('back', 'tricep', 'TRICEP', ARM_UPPER),
  ...paired('back', 'forearm', 'FOREARM (BACK)', FOREARM),
  ...paired('back', 'hand', 'BACK OF HAND', HAND),
  single('back', 'lower', 'LOWER BACK', [[-12, 128], [12, 128], [12, 188], [-12, 188]]),
  ...paired('back', 'glute', 'GLUTE', [[2, 190], [28, 188], [40, 206], [36, 236], [12, 240], [2, 226]]),
  ...paired('back', 'ham', 'HAMSTRING', [[8, 244], [36, 240], [38, 262], [34, 298], [14, 298], [8, 270]]),
  ...paired('back', 'calf', 'CALF', [[14, 302], [34, 300], [36, 330], [30, 392], [19, 394], [14, 340]]),
  ...paired('back', 'heel', 'HEEL', FOOT),
];

export const REGION_BY_ID: Record<string, Region> = Object.fromEntries(REGIONS.map(r => [r.id, r]));

// ── camera ───────────────────────────────────────────────────────────────

export const PLATE_GAP = 12;   // half the distance between the plates
export const FLOOR_Y = 424;
export const ELEVATION = (24 * Math.PI) / 180;

/** Plate-local (x, y) → world (x, y, z). The back plate is seen from behind. */
export const toWorld = (plate: Plate, [x, y]: Pt): [number, number, number] =>
  plate === 'front' ? [x, y, PLATE_GAP] : [-x, y, -PLATE_GAP];

export interface Cam { yaw: number; scale: number; cx: number; top: number }

/** Orthographic yaw-then-elevation projection. Returns [sx, sy, depth]. */
export function project(cam: Cam, [x, y, z]: [number, number, number]): [number, number, number] {
  const c = Math.cos(cam.yaw), s = Math.sin(cam.yaw);
  const X = x * c + z * s;
  const D = -x * s + z * c; // + = toward the viewer
  return [cam.cx + cam.scale * X, cam.top + cam.scale * (y * Math.cos(ELEVATION) + D * Math.sin(ELEVATION)), D];
}

/** How squarely a plate faces the camera: 1 = face-on, -1 = facing away. */
export const facing = (plate: Plate, yaw: number) => (plate === 'front' ? 1 : -1) * Math.cos(yaw);

export const centroid = (pts: Pt[]): Pt => {
  const n = pts.length;
  return [pts.reduce((a, p) => a + p[0], 0) / n, pts.reduce((a, p) => a + p[1], 0) / n];
};

// ── annotations ──────────────────────────────────────────────────────────

export type Tone = 'hot' | 'signal' | 'live' | 'dim' | 'alert';
export interface Category { id: string; name: string; tone: Tone }
export interface Mark { category: string; note?: string; pinned: boolean; dx?: number; dy?: number }
export interface BodyMap { categories: Category[]; marks: Record<string, Mark> }

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'grow',     name: 'GROW',     tone: 'hot' },
  { id: 'strength', name: 'STRENGTH', tone: 'signal' },
  { id: 'mobility', name: 'MOBILITY', tone: 'live' },
  { id: 'recover',  name: 'RECOVER',  tone: 'dim' },
  { id: 'pain',     name: 'PAIN',     tone: 'alert' },
];

const KEY = '@body_map';

export async function loadBodyMap(): Promise<BodyMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const m = JSON.parse(raw) as BodyMap;
      if (Array.isArray(m.categories) && m.marks) return m;
    }
  } catch { /* fall through to defaults */ }
  return { categories: DEFAULT_CATEGORIES, marks: {} };
}

export function saveBodyMap(m: BodyMap) {
  AsyncStorage.setItem(KEY, JSON.stringify(m)).catch(() => {});
}
