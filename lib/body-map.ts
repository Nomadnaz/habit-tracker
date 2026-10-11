// ─────────────────────────────────────────────────────────────────────────
// Body map — geometry + the user's annotations for the BODY tab.
//
// Two anatomical views, FRONT and BACK, each split into tappable muscle
// regions. Regions are written as a handful of control points and drawn as
// closed Catmull-Rom splines (smoothPath), so the outlines read as muscle,
// not as polygons. Coordinates are a 200 × 430 grid, x = 0 on the midline,
// y = 0 at the crown; only the screen-right half is written out and
// mirrored, so the figure stays symmetric.
//
// Annotations are local-only (AsyncStorage @body_map) — nothing server-side
// reads them yet, so there is no table and no sync.
// ─────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';

export type Plate = 'front' | 'back';
export type Pt = [number, number];
export interface Region { id: string; name: string; plate: Plate; pts: Pt[] }

export const FIGURE = { minX: -100, maxX: 100, height: 430 };

const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 8): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as Pt;
  });

const mirror = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [-x, y] as Pt).reverse();

// Front: screen-right (x > 0) is the figure's LEFT side.
// Back:  seen from behind, so screen-right is the figure's RIGHT.
function paired(plate: Plate, key: string, name: string, pts: Pt[]): Region[] {
  const plusIsLeft = plate === 'front';
  return [
    { id: `${plate}.${key}.${plusIsLeft ? 'l' : 'r'}`, name: `${plusIsLeft ? 'L' : 'R'} ${name}`, plate, pts },
    { id: `${plate}.${key}.${plusIsLeft ? 'r' : 'l'}`, name: `${plusIsLeft ? 'R' : 'L'} ${name}`, plate, pts: mirror(pts) },
  ];
}
const single = (plate: Plate, key: string, name: string, pts: Pt[]): Region => ({ id: `${plate}.${key}`, name, plate, pts });

const HEAD = ellipse(0, 27, 16, 22);
const NECK: Pt[] = [[-8, 47], [8, 47], [10, 58], [13, 64], [-13, 64], [-10, 58]];
const DELT: Pt[] = [[30, 66], [46, 64], [58, 72], [63, 88], [60, 106], [54, 104], [48, 88], [38, 74]];
const UPPER_ARM: Pt[] = [[50, 106], [60, 110], [66, 128], [66, 148], [61, 158], [54, 154], [49, 134]];
const FOREARM: Pt[] = [[56, 162], [65, 160], [74, 176], [81, 204], [81, 222], [75, 224], [66, 200], [57, 180]];
const HAND: Pt[] = [[75, 229], [83, 228], [89, 244], [87, 262], [80, 266], [74, 250]];
const FOOT: Pt[] = [[19, 400], [31, 400], [37, 412], [35, 421], [18, 421], [16, 411]];

export const REGIONS: Region[] = [
  // ── front ──
  single('front', 'head', 'HEAD', HEAD),
  single('front', 'neck', 'NECK', NECK),
  ...paired('front', 'traps', 'UPPER TRAP', [[11, 55], [16, 62], [30, 65], [24, 69], [13, 67]]),
  ...paired('front', 'delt', 'FRONT DELT', DELT),
  ...paired('front', 'chest', 'CHEST', [[3, 74], [28, 68], [42, 76], [47, 92], [43, 110], [28, 117], [10, 117], [3, 110]]),
  ...paired('front', 'bicep', 'BICEP', UPPER_ARM),
  ...paired('front', 'forearm', 'FOREARM', FOREARM),
  ...paired('front', 'hand', 'HAND', HAND),
  single('front', 'abs', 'ABS', [[-13, 121], [13, 121], [15, 150], [14, 192], [0, 197], [-14, 192], [-15, 150]]),
  ...paired('front', 'oblique', 'OBLIQUE', [[19, 122], [33, 119], [41, 136], [39, 166], [34, 190], [20, 197], [18, 160]]),
  single('front', 'hip', 'HIP FLEXORS', [[-13, 202], [13, 202], [25, 207], [9, 225], [0, 228], [-9, 225], [-25, 207]]),
  ...paired('front', 'quad', 'QUAD', [[28, 210], [40, 202], [46, 224], [46, 258], [40, 290], [32, 302], [21, 302], [17, 282], [19, 252], [23, 230]]),
  ...paired('front', 'adductor', 'ADDUCTOR', [[4, 234], [13, 228], [20, 234], [17, 254], [13, 274], [7, 262], [4, 246]]),
  ...paired('front', 'knee', 'KNEE', [[19, 307], [33, 306], [36, 318], [32, 330], [21, 330], [17, 318]]),
  ...paired('front', 'shin', 'SHIN', [[19, 335], [33, 334], [38, 350], [36, 374], [30, 395], [22, 395], [18, 370], [16, 350]]),
  ...paired('front', 'foot', 'FOOT', FOOT),
  // ── back ──
  single('back', 'head', 'BACK OF HEAD', HEAD),
  single('back', 'neck', 'NAPE', NECK),
  single('back', 'traps', 'TRAPS', [[-9, 66], [9, 66], [24, 66], [40, 72], [24, 88], [0, 124], [-24, 88], [-40, 72], [-24, 66]]),
  ...paired('back', 'rdelt', 'REAR DELT', DELT),
  ...paired('back', 'upper', 'UPPER BACK', [[26, 92], [43, 77], [50, 92], [46, 112], [31, 122], [14, 120], [10, 112]]),
  ...paired('back', 'lat', 'LAT', [[15, 128], [31, 126], [46, 118], [44, 142], [38, 166], [28, 186], [18, 188], [16, 160]]),
  ...paired('back', 'tricep', 'TRICEP', UPPER_ARM),
  ...paired('back', 'forearm', 'FOREARM (BACK)', FOREARM),
  ...paired('back', 'hand', 'BACK OF HAND', HAND),
  single('back', 'lower', 'LOWER BACK', [[-10, 132], [10, 132], [12, 165], [13, 190], [0, 196], [-13, 190], [-12, 165]]),
  ...paired('back', 'glute', 'GLUTE', [[3, 202], [22, 198], [38, 205], [44, 222], [40, 240], [24, 246], [8, 242], [3, 226]]),
  ...paired('back', 'ham', 'HAMSTRING', [[8, 251], [24, 251], [40, 247], [44, 264], [40, 290], [32, 304], [21, 304], [14, 286], [10, 268]]),
  ...paired('back', 'calf', 'CALF', [[17, 312], [33, 311], [40, 330], [38, 352], [31, 376], [25, 394], [20, 376], [14, 346]]),
  ...paired('back', 'heel', 'HEEL', FOOT),
];

export const REGION_BY_ID: Record<string, Region> = Object.fromEntries(REGIONS.map(r => [r.id, r]));

/** Closed Catmull-Rom spline through the points, as an SVG path. */
export function smoothPath(pts: Pt[], sx = 1, ox = 0, sy = 1, oy = 0): string {
  const n = pts.length;
  const P = (i: number) => pts[(i + n) % n];
  const X = (v: number) => (ox + v * sx).toFixed(1);
  const Y = (v: number) => (oy + v * sy).toFixed(1);
  let d = `M${X(P(0)[0])},${Y(P(0)[1])}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${X(c1[0])},${Y(c1[1])} ${X(c2[0])},${Y(c2[1])} ${X(p2[0])},${Y(p2[1])}`;
  }
  return d + 'Z';
}

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
