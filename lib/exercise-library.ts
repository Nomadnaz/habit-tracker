// ─────────────────────────────────────────────────────────────────────────
// Exercise library — every lift, machine, bodyweight move, carry, jump and
// conditioning piece the app knows by name, with the muscles each one works.
//
// Muscles are the BODY figure's base ids (lib/muscle-recovery.ts), each a
// share 0–1 of how hard that muscle works in the move: 1 = prime mover,
// ~0.6–0.8 = strong synergist, ~0.3–0.5 = synergist, ~0.15–0.25 = holds or
// stabilises. Shares feed recovery (sets × share drains a muscle), the
// HISTORY body, the coach's fit and swap maths, and the GO list.
//
// Where the shares come from — functional anatomy first (what each muscle
// does at the joints the move uses, and at what length), then the training
// literature where it settles a question:
//   · squats, leg press and lunges grow the vasti and adductors far more than
//     rectus femoris, which is shortened at the hip (Kubo 2019; Earp 2015);
//     deep squats load adductor magnus and glute max hard (Kubo 2019)
//   · leg extensions and sissy squats are where rectus femoris works fully
//   · seated calf raises are soleus work; the bent knee slackens the
//     gastrocnemius (Kinoshita 2023)
//   · overhead triceps work biases the long head (Maeo 2022)
//   · seated leg curls favour semitendinosus/semimembranosus (Maeo 2021);
//     Nordics lean on semitendinosus (Bourne 2017)
//   · reverse and hammer grips shift elbow flexion to brachialis and
//     brachioradialis
//   · hip thrusts are glute dominant with little hamstring, knees bent
//     (Contreras 2015)
//   · pulldown grip width barely changes lat work (Andersen 2014; Lusk 2010)
//   · decline pressing favours the sternal pec, incline the clavicular
//     (Glass & Armstrong 1997; Trebs 2010) — so a HANDS-elevated (incline)
//     push-up is the lower-chest one and a FEET-elevated (decline) push-up
//     the upper-chest one
//   · pullovers share the work between lats and sternal pec (Marchetti 2011)
//   · sumo pulls use more quads and adductors than conventional (Escamilla 2002)
// Surface EMG is noisy and studies disagree in places; where they do, the
// share sits between them rather than picking a side.
//
// Pure — no imports beyond types — so vitest and every layer can load it.
// ─────────────────────────────────────────────────────────────────────────

import type { Equipment, Pattern } from './exercise-guide';
import type { MuscleGroup } from './workout-data';

export type Share = Record<string, number>;

export type LibraryExercise = {
  name: string;
  aka: string[];
  pattern: Pattern;
  kit: Equipment;
  muscles: Share;
  groups: MuscleGroup[];
  /** A staple: offered by the coach's ADD tray, GO list and swaps. */
  staple: boolean;
  /** The weight is assistance (assisted pull-up machine), not load. */
  assisted?: boolean;
  /** Cable moves: where the pulley goes, 0 = floor … 1 = top of the column. */
  pulley?: number;
  /** Conditioning (cardio machines, intervals), not a strength set. */
  cardio?: boolean;
};

// ── muscle profiles ──────────────────────────────────────────────────────

const s = (k: number, sh: Share): Share => Object.fromEntries(Object.entries(sh).map(([m, v]) => [m, Math.round(v * k * 100) / 100]));
const mix = (...parts: Share[]): Share => {
  const out: Share = {};
  for (const p of parts) for (const [m, v] of Object.entries(p)) out[m] = Math.max(out[m] ?? 0, v);
  return out;
};
const QUADS = (vasti: number, rf: number): Share => ({ 'quad.vl': vasti, 'quad.vm': vasti, 'quad.rf': rf });
const HAMS = (bf: number, st = bf): Share => ({ 'ham.bf': bf, 'ham.st': st });
const TRI = (lat: number, long: number): Share => ({ 'triceps.lat': lat, 'triceps.long': long });
const PECS = (lower: number, upper: number): Share => ({ 'pec.lower': lower, 'pec.upper': upper });
const CALF = (gastro: number, soleus: number): Share => ({ 'gastro.lat': gastro, 'gastro.med': gastro, soleus });
const ABS = (upper: number, lower = upper): Share => ({ 'abs.upper': upper, 'abs.lower': lower });
const ELBOW = (biceps: number, brachialis: number, brachiorad: number): Share => ({ biceps, brachialis, brachiorad });

// Chest
const FLAT_PRESS = { ...PECS(1, 0.7), 'delt.front': 0.6, ...TRI(0.55, 0.35), serratus: 0.2 };
const INCLINE_PRESS = { ...PECS(0.5, 1), 'delt.front': 0.8, ...TRI(0.5, 0.3), serratus: 0.25 };
const DECLINE_PRESS = { ...PECS(1, 0.45), 'delt.front': 0.35, ...TRI(0.55, 0.35) };
const CLOSE_PRESS = { ...TRI(1, 0.6), ...PECS(0.7, 0.5), 'delt.front': 0.6 };
const WIDE_PRESS = { ...PECS(1, 0.75), 'delt.front': 0.55, ...TRI(0.4, 0.25) };
const FLOOR_PRESS = { ...TRI(0.8, 0.5), ...PECS(0.9, 0.6), 'delt.front': 0.45 };
const FLY = { ...PECS(1, 0.75), 'delt.front': 0.45, biceps: 0.15 };
const FLY_LOW_HIGH = { ...PECS(0.5, 1), 'delt.front': 0.6, biceps: 0.15 };
const FLY_HIGH_LOW = { ...PECS(1, 0.4), 'delt.front': 0.3, lat: 0.15 };
const SQUEEZE_PRESS = { ...PECS(1, 0.8), 'delt.front': 0.5, ...TRI(0.4, 0.2) };
const PUSHUP = { ...PECS(1, 0.6), 'delt.front': 0.6, ...TRI(0.55, 0.3), serratus: 0.5, ...ABS(0.25) };
const PUSHUP_HANDS_UP = s(0.75, { ...PECS(1, 0.4), 'delt.front': 0.45, ...TRI(0.55, 0.3), serratus: 0.45, ...ABS(0.2) });
const PUSHUP_FEET_UP = { ...PECS(0.7, 1), 'delt.front': 0.8, ...TRI(0.55, 0.3), serratus: 0.5, ...ABS(0.3) };
const PUSHUP_CLOSE = { ...TRI(1, 0.55), ...PECS(0.7, 0.5), 'delt.front': 0.55, serratus: 0.4, ...ABS(0.25) };
const PUSHUP_WIDE = { ...PECS(1, 0.7), 'delt.front': 0.5, ...TRI(0.35, 0.2), serratus: 0.4, ...ABS(0.25) };
const PUSHUP_ONE_ARM = { ...PUSHUP, oblique: 0.6, ...TRI(0.7, 0.4), 'delt.front': 0.7 };
const PIKE_PUSHUP = { 'delt.front': 1, 'delt.side': 0.5, ...TRI(0.6, 0.35), 'pec.upper': 0.4, 'traps.upper': 0.35, serratus: 0.45 };
const HSPU = { 'delt.front': 1, 'delt.side': 0.6, ...TRI(0.7, 0.4), 'traps.upper': 0.5, 'pec.upper': 0.3, serratus: 0.45, 'traps.lower': 0.2 };
const CHEST_DIP = { ...PECS(1, 0.35), 'delt.front': 0.6, ...TRI(0.8, 0.5), lat: 0.25, 'traps.lower': 0.3 };
const TRICEP_DIP = { ...TRI(1, 0.6), ...PECS(0.6, 0.25), 'delt.front': 0.55, 'traps.lower': 0.3 };
const BENCH_DIP = { ...TRI(1, 0.55), 'delt.front': 0.6, 'pec.lower': 0.4 };
const PULLOVER = { lat: 0.85, 'pec.lower': 0.9, 'pec.upper': 0.4, teres: 0.6, 'triceps.long': 0.55, serratus: 0.4 };
const SCAP_PUSHUP = { serratus: 1, 'delt.front': 0.3, 'pec.lower': 0.25, ...ABS(0.25) };

// Shoulders
const OHP_STAND = { 'delt.front': 1, 'delt.side': 0.55, ...TRI(0.6, 0.35), 'traps.upper': 0.45, serratus: 0.4, 'pec.upper': 0.3, ...ABS(0.25), erector: 0.25 };
const OHP_SEATED = { 'delt.front': 1, 'delt.side': 0.55, ...TRI(0.6, 0.35), 'traps.upper': 0.4, serratus: 0.35, 'pec.upper': 0.3 };
const ARNOLD = { 'delt.front': 1, 'delt.side': 0.65, ...TRI(0.5, 0.3), 'pec.upper': 0.35, 'traps.upper': 0.35, serratus: 0.35 };
const BTN_PRESS = { 'delt.front': 0.85, 'delt.side': 0.85, 'delt.rear': 0.2, ...TRI(0.6, 0.35), 'traps.upper': 0.5, serratus: 0.35 };
const PUSH_PRESS = mix(OHP_STAND, QUADS(0.45, 0.2), { 'glute.max': 0.35 }, CALF(0.25, 0.25));
const LANDMINE_PRESS = { 'delt.front': 1, 'pec.upper': 0.7, ...TRI(0.5, 0.3), serratus: 0.6, 'delt.side': 0.3, oblique: 0.3 };
const LATERAL = { 'delt.side': 1, 'delt.front': 0.35, 'traps.upper': 0.45, 'delt.rear': 0.2, cuff: 0.4 };
const FRONT_RAISE = { 'delt.front': 1, 'pec.upper': 0.45, 'delt.side': 0.35, serratus: 0.3, 'traps.upper': 0.25 };
const UPRIGHT_ROW = { 'delt.side': 1, 'traps.upper': 0.8, 'delt.front': 0.4, ...ELBOW(0.35, 0.35, 0.35), 'traps.mid': 0.2 };
const REAR_FLY = { 'delt.rear': 1, 'traps.mid': 0.7, cuff: 0.6, 'traps.lower': 0.35, 'delt.side': 0.2 };
const FACE_PULL = { 'delt.rear': 1, cuff: 0.8, 'traps.mid': 0.7, 'traps.lower': 0.5, 'traps.upper': 0.3, biceps: 0.2 };
const EXT_ROT = { cuff: 1, 'delt.rear': 0.35 };
const INT_ROT = { cuff: 0.9, 'pec.lower': 0.4, lat: 0.3, teres: 0.3 };
const Y_RAISE = { 'traps.lower': 1, 'traps.mid': 0.6, 'delt.rear': 0.5, 'delt.side': 0.45, cuff: 0.45 };
const CUBAN = { cuff: 1, 'delt.side': 0.5, 'delt.rear': 0.5, 'traps.mid': 0.4, 'traps.upper': 0.3 };
const SCAPTION = { 'delt.front': 0.8, 'delt.side': 0.8, cuff: 0.5, 'traps.upper': 0.4, serratus: 0.4 };
const SHRUG = { 'traps.upper': 1, 'traps.mid': 0.35, 'forearm.flex': 0.35 };
const BAND_PULL_APART = { 'delt.rear': 1, 'traps.mid': 0.8, cuff: 0.6, 'traps.lower': 0.4 };

// Back
const PULLUP = { lat: 1, teres: 0.7, ...ELBOW(0.5, 0.55, 0.45), 'traps.lower': 0.55, 'traps.mid': 0.4, 'delt.rear': 0.35, 'forearm.flex': 0.4, 'pec.lower': 0.25, ...ABS(0.2) };
const CHINUP = { lat: 1, ...ELBOW(0.8, 0.6, 0.35), teres: 0.6, 'traps.lower': 0.4, 'traps.mid': 0.3, 'pec.lower': 0.3, 'forearm.flex': 0.4, ...ABS(0.2) };
const NEUTRAL_PULLUP = { lat: 1, ...ELBOW(0.6, 0.65, 0.6), teres: 0.65, 'traps.lower': 0.45, 'traps.mid': 0.35, 'forearm.flex': 0.4, 'pec.lower': 0.25, ...ABS(0.2) };
const WIDE_PULLUP = { lat: 1, teres: 0.75, ...ELBOW(0.4, 0.5, 0.45), 'traps.lower': 0.6, 'traps.mid': 0.45, 'delt.rear': 0.4, 'forearm.flex': 0.4, ...ABS(0.2) };
const PULLDOWN = { lat: 1, teres: 0.7, ...ELBOW(0.45, 0.45, 0.4), 'traps.lower': 0.5, 'traps.mid': 0.4, 'delt.rear': 0.3, 'pec.lower': 0.2, 'forearm.flex': 0.3 };
const PULLDOWN_CLOSE = { lat: 1, teres: 0.6, ...ELBOW(0.55, 0.55, 0.45), 'traps.mid': 0.45, 'traps.lower': 0.4, 'delt.rear': 0.3, 'forearm.flex': 0.3 };
const PULLDOWN_UNDER = { lat: 1, teres: 0.6, ...ELBOW(0.7, 0.55, 0.3), 'traps.lower': 0.4, 'traps.mid': 0.35, 'pec.lower': 0.25, 'forearm.flex': 0.3 };
const STRAIGHT_ARM = { lat: 1, teres: 0.8, 'triceps.long': 0.5, 'pec.lower': 0.3, 'delt.rear': 0.3, ...ABS(0.2) };
const BENT_ROW = { 'traps.mid': 1, lat: 0.8, teres: 0.6, 'delt.rear': 0.7, 'traps.lower': 0.4, 'traps.upper': 0.3, ...ELBOW(0.45, 0.45, 0.4), erector: 0.6, ...HAMS(0.3), 'glute.max': 0.25, 'forearm.flex': 0.4 };
const UNDER_ROW = { lat: 1, 'traps.mid': 0.85, teres: 0.6, 'delt.rear': 0.55, ...ELBOW(0.6, 0.5, 0.3), erector: 0.6, ...HAMS(0.3), 'glute.max': 0.25, 'forearm.flex': 0.4 };
const ONE_ARM_ROW = { lat: 1, 'traps.mid': 0.7, teres: 0.7, 'delt.rear': 0.55, ...ELBOW(0.45, 0.45, 0.35), 'traps.lower': 0.3, 'forearm.flex': 0.3, oblique: 0.2 };
const CABLE_ROW = { 'traps.mid': 1, lat: 0.9, teres: 0.6, 'delt.rear': 0.6, 'traps.lower': 0.45, ...ELBOW(0.4, 0.4, 0.3), erector: 0.25 };
const SUPPORTED_ROW = { 'traps.mid': 1, lat: 0.8, 'delt.rear': 0.7, teres: 0.6, 'traps.lower': 0.45, ...ELBOW(0.4, 0.4, 0.3) };
const WIDE_ROW = { 'traps.mid': 1, 'delt.rear': 0.9, lat: 0.55, teres: 0.5, 'traps.lower': 0.5, cuff: 0.4, ...ELBOW(0.35, 0.35, 0.3) };
const HIGH_ROW = { lat: 1, teres: 0.6, 'traps.mid': 0.6, 'traps.lower': 0.5, 'delt.rear': 0.5, ...ELBOW(0.4, 0.4, 0.3) };
const INVERTED_ROW = { 'traps.mid': 1, lat: 0.75, 'delt.rear': 0.7, teres: 0.5, ...ELBOW(0.45, 0.4, 0.35), 'traps.lower': 0.4, erector: 0.2, 'glute.max': 0.2, ...ABS(0.2) };
const RENEGADE_ROW = mix(ONE_ARM_ROW, { ...ABS(0.6), oblique: 0.6, 'pec.lower': 0.3, 'delt.front': 0.3, ...TRI(0.3, 0.2), serratus: 0.35 });
const BACK_EXT = { erector: 1, 'glute.max': 0.6, ...HAMS(0.6) };
const BACK_EXT_GLUTE = { 'glute.max': 1, ...HAMS(0.7), erector: 0.55 };
const REVERSE_HYPER = { 'glute.max': 1, ...HAMS(0.75), erector: 0.7 };
const SUPERMAN = { erector: 1, 'glute.max': 0.5, ...HAMS(0.3), 'traps.lower': 0.3, 'delt.rear': 0.2 };
const BIRD_DOG = { erector: 1, 'glute.max': 0.7, 'glute.med': 0.4, 'delt.front': 0.3, 'traps.lower': 0.3, ...ABS(0.3), oblique: 0.3 };

// Hinges and pulls from the floor
const DEADLIFT = { 'glute.max': 1, erector: 1, ...HAMS(0.75), ...QUADS(0.55, 0.25), adductor: 0.6, 'traps.upper': 0.5, 'traps.mid': 0.4, lat: 0.4, 'forearm.flex': 0.6, ...ABS(0.2), 'gastro.lat': 0.2, 'gastro.med': 0.2 };
const SUMO_DEADLIFT = { 'glute.max': 1, ...QUADS(0.75, 0.3), adductor: 0.85, erector: 0.8, ...HAMS(0.6), 'traps.upper': 0.45, lat: 0.35, 'forearm.flex': 0.6, 'glute.med': 0.3, tib: 0.3 };
const TRAP_BAR = { 'glute.max': 1, ...QUADS(0.75, 0.3), erector: 0.75, ...HAMS(0.55), adductor: 0.55, 'traps.upper': 0.6, 'forearm.flex': 0.6, lat: 0.3 };
const DEFICIT_DEADLIFT = mix(DEADLIFT, QUADS(0.65, 0.3));
const RACK_PULL = { erector: 1, 'glute.max': 0.8, 'traps.upper': 0.8, ...HAMS(0.5), 'traps.mid': 0.5, lat: 0.4, 'forearm.flex': 0.7, ...QUADS(0.25, 0.1) };
const RDL = { ...HAMS(1), 'glute.max': 0.85, adductor: 0.6, erector: 0.65, 'forearm.flex': 0.4, 'traps.upper': 0.3, lat: 0.3 };
const STIFF_LEG = { ...HAMS(1), 'glute.max': 0.8, erector: 0.75, adductor: 0.55, 'forearm.flex': 0.4, 'traps.upper': 0.3 };
const SL_RDL = { ...HAMS(1), 'glute.max': 0.9, 'glute.med': 0.6, adductor: 0.45, erector: 0.4, 'forearm.flex': 0.3 };
const GOOD_MORNING = { ...HAMS(1), 'glute.max': 0.8, erector: 0.9, adductor: 0.5 };
const SWING = { 'glute.max': 1, ...HAMS(0.8), erector: 0.6, adductor: 0.4, ...QUADS(0.25, 0.1), 'delt.front': 0.2, 'forearm.flex': 0.45, ...ABS(0.3) };
const PULL_THROUGH = { 'glute.max': 1, ...HAMS(0.75), erector: 0.4, adductor: 0.45 };
const GHR = { 'ham.st': 1, 'ham.bf': 0.9, 'glute.max': 0.5, 'gastro.lat': 0.4, 'gastro.med': 0.4, erector: 0.3 };
const NORDIC = { 'ham.st': 1, 'ham.bf': 0.8, 'gastro.lat': 0.3, 'gastro.med': 0.3 };

// Arms
const CURL_BB = { ...ELBOW(1, 0.7, 0.5), 'forearm.flex': 0.35, 'delt.front': 0.15 };
const CURL_EZ = { ...ELBOW(1, 0.75, 0.55), 'forearm.flex': 0.3 };
const CURL_DB = { ...ELBOW(1, 0.65, 0.45), 'forearm.flex': 0.3 };
const CURL_STRETCH = { ...ELBOW(1, 0.6, 0.4), 'forearm.flex': 0.25 };
const CURL_SHORT = { ...ELBOW(1, 0.8, 0.4), 'forearm.flex': 0.25 };
const HAMMER = { brachiorad: 1, brachialis: 0.9, biceps: 0.6, 'forearm.ext': 0.3, 'forearm.flex': 0.3 };
const REVERSE_CURL = { brachiorad: 1, brachialis: 0.85, 'forearm.ext': 0.7, biceps: 0.4 };
const ZOTTMAN = { brachiorad: 1, biceps: 0.8, brachialis: 0.8, 'forearm.ext': 0.5, 'forearm.flex': 0.3 };
const DRAG_CURL = { ...ELBOW(1, 0.6, 0.4), 'delt.rear': 0.15 };
const WRIST_CURL = { 'forearm.flex': 1, brachiorad: 0.2 };
const WRIST_EXT = { 'forearm.ext': 1, brachiorad: 0.4 };
const WRIST_ROLLER = { 'forearm.flex': 1, 'forearm.ext': 1, brachiorad: 0.5, 'delt.front': 0.3 };
const GRIP = { 'forearm.flex': 1, 'forearm.ext': 0.4, brachiorad: 0.3 };
const DEAD_HANG = { 'forearm.flex': 1, lat: 0.3, brachiorad: 0.4, teres: 0.2 };
const PUSHDOWN = TRI(1, 0.6);
const PUSHDOWN_ROPE = TRI(1, 0.65);
const PUSHDOWN_REVERSE = { ...TRI(0.95, 0.5), 'forearm.ext': 0.2 };
const OVERHEAD_EXT = TRI(0.75, 1);
const SKULL = TRI(1, 0.9);
const JM_PRESS = { ...TRI(1, 0.7), 'pec.lower': 0.35, 'delt.front': 0.3 };
const KICKBACK = { ...TRI(1, 0.6), 'delt.rear': 0.2 };
const TATE = TRI(1, 0.6);

// Legs
const BACK_SQUAT = { ...QUADS(1, 0.45), 'glute.max': 0.8, adductor: 0.75, ...HAMS(0.25), erector: 0.6, soleus: 0.25, ...ABS(0.3), oblique: 0.2 };
const LOW_BAR = { ...QUADS(0.85, 0.4), 'glute.max': 0.9, adductor: 0.8, ...HAMS(0.35), erector: 0.75, ...ABS(0.3), oblique: 0.2 };
const FRONT_SQUAT = { ...QUADS(1, 0.45), 'glute.max': 0.65, adductor: 0.65, erector: 0.55, 'traps.upper': 0.3, 'traps.mid': 0.3, ...ABS(0.4), soleus: 0.25 };
const GOBLET = { ...QUADS(1, 0.4), 'glute.max': 0.65, adductor: 0.6, erector: 0.35, ...ABS(0.35), 'delt.front': 0.2, biceps: 0.15 };
const OVERHEAD_SQUAT = mix(FRONT_SQUAT, { 'delt.front': 0.5, 'delt.side': 0.4, 'traps.upper': 0.5, 'traps.lower': 0.45, serratus: 0.4, ...ABS(0.5), 'triceps.lat': 0.3 });
const BOX_SQUAT = { ...QUADS(0.85, 0.4), 'glute.max': 0.9, adductor: 0.75, ...HAMS(0.4), erector: 0.7, ...ABS(0.3) };
const ZERCHER = { ...QUADS(1, 0.45), 'glute.max': 0.7, adductor: 0.65, erector: 0.8, ...ABS(0.5), biceps: 0.4, brachialis: 0.3, 'traps.upper': 0.3 };
const SUMO_SQUAT = { adductor: 1, ...QUADS(0.85, 0.35), 'glute.max': 0.85, 'glute.med': 0.3, ...HAMS(0.25), erector: 0.3 };
const MACHINE_SQUAT = { ...QUADS(1, 0.4), 'glute.max': 0.6, adductor: 0.55, ...HAMS(0.15) };
const SMITH_SQUAT = { ...QUADS(1, 0.45), 'glute.max': 0.75, adductor: 0.7, ...HAMS(0.2), erector: 0.35, ...ABS(0.2) };
const BELT_SQUAT = { ...QUADS(1, 0.45), 'glute.max': 0.7, adductor: 0.7, ...HAMS(0.2) };
const LEG_PRESS = { ...QUADS(1, 0.35), 'glute.max': 0.6, adductor: 0.6, ...HAMS(0.2) };
const LEG_PRESS_HIGH = { ...QUADS(0.8, 0.3), 'glute.max': 0.8, adductor: 0.8, ...HAMS(0.35) };
const LEG_PRESS_NARROW = { ...QUADS(1, 0.35), 'glute.max': 0.5, adductor: 0.45 };
const SISSY = { ...QUADS(1, 1), ...ABS(0.3) };
const BW_SQUAT = s(0.7, { ...QUADS(1, 0.4), 'glute.max': 0.65, adductor: 0.55, ...ABS(0.2) });
const PISTOL = { ...QUADS(1, 0.5), 'glute.max': 0.85, 'glute.med': 0.6, adductor: 0.5, hipflex: 0.4, ...ABS(0.3), tib: 0.3, soleus: 0.3 };
const WALL_SIT = { ...QUADS(1, 0.5), 'glute.max': 0.3, adductor: 0.3 };
const SPLIT_SQUAT = { ...QUADS(1, 0.4), 'glute.max': 0.85, adductor: 0.7, 'glute.med': 0.45, ...HAMS(0.25), soleus: 0.2 };
const BULGARIAN = { ...QUADS(1, 0.4), 'glute.max': 0.9, adductor: 0.75, 'glute.med': 0.5, ...HAMS(0.25), soleus: 0.2, hipflex: 0.2 };
const LUNGE = { ...QUADS(1, 0.4), 'glute.max': 0.75, adductor: 0.65, 'glute.med': 0.45, ...HAMS(0.25), ...CALF(0.2, 0.25) };
const REVERSE_LUNGE = { ...QUADS(0.9, 0.35), 'glute.max': 0.85, adductor: 0.65, 'glute.med': 0.45, ...HAMS(0.3) };
const WALKING_LUNGE = { ...QUADS(1, 0.4), 'glute.max': 0.85, adductor: 0.65, 'glute.med': 0.5, ...HAMS(0.3), ...CALF(0.25, 0.3) };
const CURTSY = { 'glute.med': 0.8, 'glute.max': 0.85, ...QUADS(0.9, 0.35), adductor: 0.6 };
const LATERAL_LUNGE = { adductor: 1, ...QUADS(0.85, 0.35), 'glute.max': 0.7, 'glute.med': 0.5, ...HAMS(0.2) };
const STEP_UP = { ...QUADS(1, 0.35), 'glute.max': 0.9, 'glute.med': 0.55, adductor: 0.4, ...HAMS(0.3), ...CALF(0.25, 0.25) };
const LEG_EXT = QUADS(1, 1);
const LEG_CURL_LYING = { ...HAMS(1, 0.9), 'gastro.lat': 0.45, 'gastro.med': 0.45 };
const LEG_CURL_SEATED = { ...HAMS(0.9, 1), 'gastro.lat': 0.3, 'gastro.med': 0.3 };
const LEG_CURL_STANDING = { ...HAMS(1, 0.85), 'gastro.lat': 0.4, 'gastro.med': 0.4 };
const BALL_CURL = { ...HAMS(1), 'glute.max': 0.6, 'gastro.lat': 0.3, 'gastro.med': 0.3, ...ABS(0.2) };
const HIP_THRUST = { 'glute.max': 1, 'glute.med': 0.45, ...HAMS(0.35), ...QUADS(0.35, 0.1), adductor: 0.4, erector: 0.2 };
const GLUTE_BRIDGE = { 'glute.max': 1, ...HAMS(0.45), 'glute.med': 0.4, adductor: 0.3, erector: 0.2 };
const SL_BRIDGE = { 'glute.max': 1, 'glute.med': 0.6, ...HAMS(0.5), adductor: 0.3 };
const KICKBACK_GLUTE = { 'glute.max': 1, ...HAMS(0.5), 'glute.med': 0.4, erector: 0.2 };
const FROG_PUMP = { 'glute.max': 1, 'glute.med': 0.5, adductor: 0.2 };
const ABDUCT_SEATED = { 'glute.med': 1, 'glute.max': 0.6, tfl: 0.6 };
const ABDUCT_STANDING = { 'glute.med': 1, tfl: 0.6, 'glute.max': 0.4 };
const CLAMSHELL = { 'glute.med': 1, 'glute.max': 0.6, tfl: 0.2 };
const BAND_WALK = { 'glute.med': 1, tfl: 0.6, 'glute.max': 0.5, ...QUADS(0.2, 0.1) };
const FIRE_HYDRANT = { 'glute.med': 1, 'glute.max': 0.7, tfl: 0.3, ...ABS(0.15) };
const ADDUCT = { adductor: 1 };
const COPENHAGEN = { adductor: 1, oblique: 0.7, 'glute.med': 0.4, ...ABS(0.3) };
const CALF_STANDING = CALF(1, 0.7);
const CALF_SEATED = CALF(0.3, 1);
const CALF_BENT = CALF(1, 0.6);
const TIB_RAISE = { tib: 1 };
const HIP_FLEX = { hipflex: 1, 'quad.rf': 0.7, tfl: 0.5 };

// Core
const CRUNCH = { ...ABS(1, 0.5), oblique: 0.4 };
const CABLE_CRUNCH = { ...ABS(1, 0.6), oblique: 0.45 };
const DECLINE_CRUNCH = { ...ABS(1, 0.6), oblique: 0.4, hipflex: 0.3 };
const SIT_UP = { ...ABS(1, 0.7), hipflex: 0.7, oblique: 0.45, 'quad.rf': 0.3 };
const REVERSE_CRUNCH = { ...ABS(0.6, 1), oblique: 0.4, hipflex: 0.2 };
const HANGING_LEG = { hipflex: 1, ...ABS(0.6, 0.85), oblique: 0.5, 'quad.rf': 0.5, tfl: 0.3, 'forearm.flex': 0.4, lat: 0.2 };
const HANGING_KNEE = { hipflex: 1, ...ABS(0.4, 0.7), oblique: 0.4, 'quad.rf': 0.3, 'forearm.flex': 0.35 };
const CAPTAINS_CHAIR = { hipflex: 1, ...ABS(0.4, 0.7), oblique: 0.4, 'quad.rf': 0.3, 'traps.lower': 0.2 };
const LYING_LEG = { hipflex: 1, ...ABS(0.45, 0.7), 'quad.rf': 0.45, tfl: 0.3 };
const TOES_TO_BAR = { hipflex: 1, ...ABS(0.8, 0.9), lat: 0.5, oblique: 0.5, 'forearm.flex': 0.45, 'quad.rf': 0.4 };
const V_UP = { ...ABS(1, 0.9), hipflex: 0.8, oblique: 0.4, 'quad.rf': 0.35 };
const FLUTTER = { hipflex: 1, ...ABS(0.3, 0.7), 'quad.rf': 0.5 };
const PLANK = { ...ABS(1), oblique: 0.75, serratus: 0.35, 'delt.front': 0.3, 'glute.max': 0.25, 'quad.rf': 0.2 };
const SIDE_PLANK = { oblique: 1, 'glute.med': 0.6, ...ABS(0.4), 'delt.side': 0.3, adductor: 0.25 };
const DEAD_BUG = { ...ABS(0.8, 1), oblique: 0.6, hipflex: 0.3 };
const HOLLOW = { ...ABS(1), oblique: 0.6, hipflex: 0.6, 'quad.rf': 0.3 };
const AB_WHEEL = { ...ABS(1, 0.9), oblique: 0.6, lat: 0.5, 'delt.front': 0.4, 'triceps.long': 0.3, serratus: 0.3, hipflex: 0.3 };
const RUSSIAN_TWIST = { oblique: 1, ...ABS(0.5, 0.4), hipflex: 0.4 };
const WOODCHOP = { oblique: 1, ...ABS(0.5), 'delt.front': 0.3, 'glute.max': 0.25, serratus: 0.2 };
const PALLOF = { oblique: 1, ...ABS(0.6), 'glute.med': 0.3 };
const SIDE_BEND = { oblique: 1, erector: 0.4, ...ABS(0.2) };
const BICYCLE = { oblique: 1, ...ABS(0.8, 0.6), hipflex: 0.5, 'quad.rf': 0.3 };
const MOUNTAIN = { hipflex: 1, ...ABS(0.7, 0.8), oblique: 0.4, 'delt.front': 0.5, 'quad.rf': 0.5, ...PECS(0.3, 0.2), ...TRI(0.3, 0.15), serratus: 0.3 };
const L_SIT = { hipflex: 1, 'quad.rf': 0.8, ...ABS(0.8), 'triceps.lat': 0.5, 'traps.lower': 0.5, lat: 0.3 };
const DRAGON_FLAG = { ...ABS(1), oblique: 0.6, lat: 0.5, hipflex: 0.4, 'glute.max': 0.3 };
const WIPERS = { oblique: 1, ...ABS(0.5, 0.7), hipflex: 0.6 };
const STIR_POT = { ...ABS(1), oblique: 0.7, serratus: 0.4, 'delt.front': 0.3 };
const HEEL_TOUCH = { oblique: 1, ...ABS(0.5, 0.3) };

// Carries, Olympic lifts, strongman
const FARMER = { 'forearm.flex': 1, 'traps.upper': 0.9, 'traps.mid': 0.4, oblique: 0.5, ...ABS(0.4), erector: 0.4, 'glute.med': 0.4, ...QUADS(0.25, 0.1), brachiorad: 0.4 };
const SUITCASE = { oblique: 1, 'forearm.flex': 0.9, 'traps.upper': 0.6, 'glute.med': 0.6, erector: 0.4, brachiorad: 0.35 };
const OVERHEAD_CARRY = { 'delt.front': 0.8, 'delt.side': 0.6, 'traps.upper': 0.8, serratus: 0.6, 'traps.lower': 0.4, ...ABS(0.6), oblique: 0.6, 'triceps.lat': 0.4 };
const CLEAN = { 'glute.max': 1, ...QUADS(0.85, 0.35), ...HAMS(0.75), erector: 0.9, 'traps.upper': 1, 'traps.mid': 0.5, ...CALF(0.6, 0.5), 'delt.front': 0.4, 'delt.side': 0.3, 'forearm.flex': 0.6, biceps: 0.2, adductor: 0.5 };
const SNATCH = { 'glute.max': 1, ...QUADS(0.85, 0.35), ...HAMS(0.75), erector: 0.9, 'traps.upper': 1, 'traps.mid': 0.6, 'traps.lower': 0.5, 'delt.side': 0.5, 'delt.front': 0.5, 'delt.rear': 0.3, cuff: 0.4, 'triceps.lat': 0.4, ...CALF(0.6, 0.5), adductor: 0.5, 'forearm.flex': 0.5, serratus: 0.3 };
const HIGH_PULL = { 'traps.upper': 1, 'glute.max': 0.9, ...HAMS(0.7), erector: 0.8, ...QUADS(0.6, 0.25), 'delt.side': 0.5, ...CALF(0.5, 0.4), 'forearm.flex': 0.6, 'traps.mid': 0.4 };
const JERK = { 'delt.front': 1, ...TRI(0.7, 0.4), ...QUADS(0.6, 0.25), 'glute.max': 0.5, 'delt.side': 0.5, 'traps.upper': 0.5, serratus: 0.4, ...CALF(0.3, 0.3) };
const CLEAN_JERK = mix(CLEAN, JERK);
const THRUSTER = { ...QUADS(1, 0.4), 'glute.max': 0.75, 'delt.front': 0.8, 'delt.side': 0.4, ...TRI(0.55, 0.3), adductor: 0.55, 'traps.upper': 0.35, ...ABS(0.3), erector: 0.4 };
const CLEAN_PRESS = mix(CLEAN, OHP_STAND);
const TGU = { 'delt.front': 0.8, cuff: 0.7, oblique: 0.8, ...ABS(0.6), 'glute.max': 0.6, 'glute.med': 0.4, ...TRI(0.4, 0.3), ...QUADS(0.4, 0.2), serratus: 0.6, 'traps.upper': 0.4 };
const WINDMILL = { oblique: 1, 'glute.med': 0.6, 'glute.max': 0.5, ...HAMS(0.5), cuff: 0.6, 'delt.front': 0.5, serratus: 0.4, erector: 0.4 };
const HALO = { 'delt.front': 0.8, 'delt.side': 0.6, 'delt.rear': 0.4, 'traps.upper': 0.5, cuff: 0.5, 'triceps.long': 0.4, ...ABS(0.3) };
const ATLAS = { 'glute.max': 1, erector: 0.9, ...HAMS(0.7), ...QUADS(0.6, 0.25), ...ELBOW(0.6, 0.5, 0.3), 'traps.upper': 0.6, lat: 0.4, 'forearm.flex': 0.5, ...PECS(0.4, 0.3), adductor: 0.5 };
const TIRE_FLIP = { 'glute.max': 1, ...QUADS(0.8, 0.35), ...HAMS(0.6), erector: 0.8, 'delt.front': 0.6, ...TRI(0.5, 0.3), ...PECS(0.4, 0.4), 'traps.upper': 0.6, biceps: 0.4, ...CALF(0.5, 0.4) };
const SLED_PUSH = { ...QUADS(1, 0.6), 'glute.max': 0.8, ...CALF(0.8, 0.8), ...HAMS(0.3), adductor: 0.4, 'delt.front': 0.3, ...TRI(0.3, 0.2), ...ABS(0.3) };
const SLED_BACKWARD = { ...QUADS(1, 0.6), ...CALF(0.4, 0.5), tib: 0.4, 'glute.max': 0.3, 'forearm.flex': 0.4 };
const SLED_FORWARD = { 'glute.max': 0.9, ...HAMS(0.6), ...QUADS(0.7, 0.4), ...CALF(0.8, 0.8), hipflex: 0.3 };
const YOKE = { ...QUADS(0.8, 0.35), 'glute.max': 0.7, erector: 0.9, 'traps.upper': 0.7, ...ABS(0.6), oblique: 0.5, ...CALF(0.5, 0.5), adductor: 0.4 };
const BEAR_HUG_CARRY = { erector: 0.9, ...ABS(0.6), ...ELBOW(0.5, 0.4, 0.3), 'traps.upper': 0.5, ...QUADS(0.4, 0.2), 'glute.max': 0.5, ...PECS(0.3, 0.3), 'traps.mid': 0.4 };
const SANDBAG_LOAD = mix(ATLAS, { 'traps.mid': 0.4 });
const BATTLE_ROPES = { 'delt.front': 1, 'delt.side': 0.5, 'forearm.flex': 0.6, biceps: 0.4, ...TRI(0.4, 0.3), ...ABS(0.4), oblique: 0.3, ...QUADS(0.3, 0.1), 'traps.upper': 0.4 };
const SLAM = { lat: 0.8, ...ABS(1, 0.7), 'delt.front': 0.5, 'triceps.long': 0.5, teres: 0.5, 'glute.max': 0.4, ...QUADS(0.3, 0.1), ...PECS(0.4, 0.2) };
const MED_BALL_THROW = { 'glute.max': 0.8, ...QUADS(0.6, 0.25), 'delt.front': 0.7, ...PECS(0.6, 0.5), ...TRI(0.6, 0.35), oblique: 0.5, ...CALF(0.4, 0.3) };
const ROTATIONAL_THROW = { oblique: 1, ...ABS(0.5), 'glute.max': 0.6, 'delt.front': 0.4, 'pec.lower': 0.4, adductor: 0.3 };
const SLEDGEHAMMER = { oblique: 1, lat: 0.7, ...ABS(0.7), 'forearm.flex': 0.7, teres: 0.5, 'triceps.long': 0.4, 'glute.max': 0.4 };
const ROPE_CLIMB = { lat: 1, ...ELBOW(0.9, 0.8, 0.7), 'forearm.flex': 1, teres: 0.6, 'traps.lower': 0.4, ...ABS(0.4), 'delt.rear': 0.3 };
const MUSCLE_UP = { lat: 1, ...TRI(0.8, 0.5), 'pec.lower': 0.7, ...ELBOW(0.5, 0.5, 0.4), 'delt.front': 0.6, teres: 0.6, 'traps.lower': 0.5, ...ABS(0.4), 'forearm.flex': 0.5, serratus: 0.3 };
const BAR_HOLD_DIP_SUPPORT = { ...TRI(0.6, 0.4), 'traps.lower': 0.7, 'pec.lower': 0.4, lat: 0.3, 'delt.front': 0.3 };
const FRONT_LEVER = { lat: 1, teres: 0.7, ...ABS(0.8), 'triceps.long': 0.5, 'delt.rear': 0.4, 'traps.lower': 0.5, 'forearm.flex': 0.5, 'glute.max': 0.3 };
const BACK_LEVER = { 'pec.lower': 0.8, biceps: 0.7, 'delt.front': 0.6, lat: 0.6, erector: 0.6, 'glute.max': 0.5, ...ABS(0.4) };
const PLANCHE = { 'delt.front': 1, serratus: 0.8, ...PECS(0.6, 0.6), biceps: 0.4, ...TRI(0.4, 0.2), ...ABS(0.6), 'traps.lower': 0.3, 'forearm.flex': 0.4 };

// Plyometrics and bodyweight conditioning
const JUMP = { ...QUADS(1, 0.45), 'glute.max': 0.8, ...CALF(0.8, 0.7), ...HAMS(0.4), adductor: 0.3, hipflex: 0.3 };
const JUMP_SQUAT = { ...QUADS(1, 0.45), 'glute.max': 0.8, ...CALF(0.6, 0.6), adductor: 0.4, ...HAMS(0.3) };
const BROAD_JUMP = { 'glute.max': 1, ...QUADS(0.9, 0.4), ...HAMS(0.6), ...CALF(0.8, 0.7), adductor: 0.3 };
const BOUND = { 'glute.max': 1, ...HAMS(0.7), ...QUADS(0.8, 0.45), ...CALF(0.9, 0.8), 'glute.med': 0.6, adductor: 0.4, hipflex: 0.5 };
const LATERAL_JUMP = { 'glute.med': 0.9, 'glute.max': 0.8, ...QUADS(0.8, 0.35), adductor: 0.6, ...CALF(0.8, 0.7) };
const SPLIT_JUMP = { ...QUADS(1, 0.45), 'glute.max': 0.85, ...CALF(0.7, 0.6), adductor: 0.5, hipflex: 0.4, ...HAMS(0.3) };
const TUCK_JUMP = { ...QUADS(1, 0.5), 'glute.max': 0.7, ...CALF(0.8, 0.7), hipflex: 0.7, ...ABS(0.4, 0.5) };
const POGO = { ...CALF(1, 0.9), tib: 0.3, ...QUADS(0.3, 0.15) };
const JACKS = { ...CALF(1, 1), 'glute.med': 0.7, adductor: 0.6, 'delt.side': 0.5, 'delt.front': 0.3, ...QUADS(0.3, 0.15), 'traps.upper': 0.2 };
const BURPEE = { ...QUADS(0.8, 0.4), 'glute.max': 0.7, ...PECS(0.6, 0.4), 'delt.front': 0.6, ...TRI(0.5, 0.3), ...CALF(0.5, 0.5), ...ABS(0.6), hipflex: 0.5, ...HAMS(0.3), serratus: 0.3 };
const ROPE_SKIP = { ...CALF(1, 1), tib: 0.4, ...QUADS(0.35, 0.15), 'delt.side': 0.2, 'forearm.flex': 0.2 };
const HIGH_KNEES = { hipflex: 1, 'quad.rf': 0.7, ...CALF(0.8, 0.8), 'quad.vl': 0.5, 'quad.vm': 0.5, ...ABS(0.4), 'glute.max': 0.4 };
const BUTT_KICKS = { ...HAMS(1), ...CALF(0.7, 0.7), hipflex: 0.3, ...QUADS(0.4, 0.2) };
const BEAR_CRAWL = { 'delt.front': 1, ...QUADS(0.7, 0.5), ...ABS(0.7), oblique: 0.5, serratus: 0.6, ...TRI(0.5, 0.3), ...PECS(0.4, 0.3), hipflex: 0.5, 'glute.max': 0.3 };
const CRAB_WALK = { ...TRI(0.8, 0.6), 'delt.front': 0.6, 'delt.rear': 0.4, 'glute.max': 0.7, ...HAMS(0.5), erector: 0.4, ...QUADS(0.3, 0.15) };
const INCHWORM = { ...HAMS(0.6), 'delt.front': 0.7, ...ABS(0.7), serratus: 0.5, ...PECS(0.4, 0.3), ...TRI(0.4, 0.25) };
const SKATER = LATERAL_JUMP;
const SPRAWL = BURPEE;
const SHADOW_BOX = { 'delt.front': 1, serratus: 0.6, ...TRI(0.6, 0.4), ...PECS(0.5, 0.5), oblique: 0.8, ...CALF(0.5, 0.5), ...QUADS(0.3, 0.15), 'glute.max': 0.3, 'delt.side': 0.4 };

// Cardio machines and modes
const SPRINT = { ...HAMS(0.9), 'glute.max': 0.9, hipflex: 0.8, ...QUADS(0.7, 0.6), ...CALF(0.9, 1), 'glute.med': 0.5, adductor: 0.4, tib: 0.3 };
const ROWER = { ...QUADS(0.85, 0.3), 'glute.max': 0.7, ...HAMS(0.5), lat: 0.8, 'traps.mid': 0.7, 'delt.rear': 0.6, ...ELBOW(0.5, 0.4, 0.3), erector: 0.6, ...CALF(0.4, 0.4), 'forearm.flex': 0.4, teres: 0.4, ...ABS(0.3) };
const BIKE = { ...QUADS(1, 0.6), 'glute.max': 0.6, ...HAMS(0.4), ...CALF(0.5, 0.6), tib: 0.3, hipflex: 0.3 };
const AIR_BIKE = { ...QUADS(1, 0.55), 'glute.max': 0.6, ...HAMS(0.4), ...CALF(0.5, 0.5), 'delt.front': 0.5, ...PECS(0.4, 0.3), lat: 0.4, ...TRI(0.4, 0.2), biceps: 0.3 };
const ELLIPTICAL = { ...QUADS(0.8, 0.4), 'glute.max': 0.7, ...HAMS(0.5), ...CALF(0.5, 0.5), 'delt.front': 0.2, lat: 0.2, ...PECS(0.2, 0.2), ...TRI(0.2, 0.1) };
const STAIRS = { ...QUADS(1, 0.4), 'glute.max': 0.9, 'glute.med': 0.5, ...CALF(0.7, 0.7), ...HAMS(0.4), adductor: 0.3 };
const INCLINE_WALK = { 'glute.max': 0.8, ...CALF(1, 1), ...HAMS(0.5), ...QUADS(0.5, 0.35), tib: 0.4, 'glute.med': 0.5, hipflex: 0.4 };
const SKI_ERG = { lat: 1, ...TRI(0.5, 0.7), teres: 0.6, ...ABS(0.8, 0.6), 'pec.lower': 0.5, 'delt.rear': 0.3, 'glute.max': 0.4, ...HAMS(0.3), ...QUADS(0.3, 0.1) };
const SWIM = { lat: 1, 'pec.lower': 0.6, 'delt.front': 0.7, 'delt.side': 0.5, ...TRI(0.6, 0.6), teres: 0.6, cuff: 0.5, ...ABS(0.4), 'glute.max': 0.3, ...QUADS(0.3, 0.3), hipflex: 0.4, serratus: 0.4 };
const RUN_SHARE = {
  soleus: 1, 'gastro.lat': 0.85, 'gastro.med': 0.85, 'quad.vl': 0.6, 'quad.vm': 0.6, 'quad.rf': 0.55,
  'glute.med': 0.5, 'glute.max': 0.45, 'ham.bf': 0.45, 'ham.st': 0.45, hipflex: 0.5, tib: 0.5, adductor: 0.25,
};
const WALK_SHARE = {
  soleus: 1, 'gastro.lat': 0.7, 'gastro.med': 0.7, tib: 0.6, 'glute.med': 0.6, 'quad.vl': 0.35, 'quad.vm': 0.35,
  'quad.rf': 0.3, 'glute.max': 0.35, 'ham.bf': 0.3, 'ham.st': 0.3, hipflex: 0.35, adductor: 0.2,
};
const HIKE = { ...WALK_SHARE, 'glute.max': 0.7, 'quad.vl': 0.6, 'quad.vm': 0.6, 'quad.rf': 0.4, 'ham.bf': 0.4, 'ham.st': 0.4 };

// ── groups (the coarse labels lib/workout-data keeps per exercise) ───────

const GROUP_OF: Record<string, MuscleGroup> = {
  'pec.upper': 'chest', 'pec.lower': 'chest', lat: 'lats', teres: 'lats',
  'traps.mid': 'upper back', 'traps.lower': 'upper back', cuff: 'upper back', 'traps.upper': 'traps',
  'delt.front': 'shoulders', 'delt.side': 'shoulders', 'delt.rear': 'shoulders',
  biceps: 'biceps', brachialis: 'biceps', brachiorad: 'forearms', 'forearm.flex': 'forearms', 'forearm.ext': 'forearms',
  'triceps.lat': 'triceps', 'triceps.long': 'triceps',
  'quad.rf': 'quads', 'quad.vl': 'quads', 'quad.vm': 'quads', 'ham.bf': 'hamstrings', 'ham.st': 'hamstrings',
  'glute.max': 'glutes', 'glute.med': 'glutes', adductor: 'glutes', tfl: 'hip flexors', hipflex: 'hip flexors',
  'gastro.lat': 'calves', 'gastro.med': 'calves', soleus: 'calves', tib: 'calves',
  'abs.upper': 'abs', 'abs.lower': 'abs', oblique: 'core', serratus: 'core', erector: 'lower back',
};

/** The groups a move's main muscles (share ≥ 0.6) fall in, biggest first. */
export function groupsOf(muscles: Share): MuscleGroup[] {
  const best = new Map<MuscleGroup, number>();
  for (const [m, v] of Object.entries(muscles)) {
    const g = GROUP_OF[m];
    if (g && v >= 0.6) best.set(g, Math.max(best.get(g) ?? 0, v));
  }
  return [...best.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
}

// ── the list ─────────────────────────────────────────────────────────────

type Opt = { staple?: boolean; assisted?: boolean; pulley?: number; cardio?: boolean };
const LIST: LibraryExercise[] = [];
/** One exercise: canonical name (how the app shows it), its other names, the movement, the kit. */
function x(name: string, muscles: Share, pattern: Pattern, kit: Equipment, aka: string[] = [], o: Opt = {}) {
  LIST.push({ name, aka, pattern, kit, muscles, groups: groupsOf(muscles), staple: !!o.staple, ...(o.assisted ? { assisted: true } : {}), ...(o.pulley != null ? { pulley: o.pulley } : {}), ...(o.cardio ? { cardio: true } : {}) });
}
const ST = { staple: true };

// Chest ──
x('BENCH PRESS', FLAT_PRESS, 'bench', 'barbell', ['barbell bench press', 'flat bench press', 'flat bench', 'bench', 'bb bench', 'flat barbell press', 'chest press barbell'], ST);
x('DUMBBELL BENCH PRESS', FLAT_PRESS, 'bench', 'dumbbell', ['db bench press', 'db bench', 'flat db press', 'db chest press', 'db press', 'flat dumbbell press'], ST);
x('INCLINE BENCH PRESS', INCLINE_PRESS, 'bench', 'barbell', ['incline barbell press', 'incline bb press', 'incline press', 'incline barbell bench press', 'incline bench'], ST);
x('INCLINE DB PRESS', INCLINE_PRESS, 'bench', 'dumbbell', ['incline dumbbell press', 'incline db bench press', 'incline dumbbell bench press', 'incline db bench'], ST);
x('DECLINE BENCH PRESS', DECLINE_PRESS, 'bench', 'barbell', ['decline barbell press', 'decline press', 'decline bb press', 'decline bench'], ST);
x('DECLINE DB PRESS', DECLINE_PRESS, 'bench', 'dumbbell', ['decline dumbbell press', 'decline db bench press']);
x('SMITH BENCH PRESS', FLAT_PRESS, 'bench', 'barbell', ['smith flat bench', 'smith chest press']);
x('SMITH INCLINE PRESS', INCLINE_PRESS, 'bench', 'barbell', ['smith incline bench press', 'smith incline bench']);
x('SMITH DECLINE PRESS', DECLINE_PRESS, 'bench', 'barbell', ['smith decline bench press']);
x('MACHINE CHEST PRESS', FLAT_PRESS, 'bench', 'machine', ['chest press', 'chest press machine', 'machine bench press', 'seated chest press', 'hammer strength chest press', 'plate loaded chest press', 'leverage chest press', 'vertical chest press'], ST);
x('INCLINE MACHINE PRESS', INCLINE_PRESS, 'bench', 'machine', ['incline chest press', 'incline chest press machine', 'incline hammer strength press', 'leverage incline chest press']);
x('DECLINE MACHINE PRESS', DECLINE_PRESS, 'bench', 'machine', ['decline chest press', 'decline chest press machine', 'leverage decline chest press']);
x('CABLE CHEST PRESS', FLAT_PRESS, 'bench', 'cable', ['standing cable chest press', 'cable press'], { pulley: 0.6 });
x('INCLINE CABLE PRESS', INCLINE_PRESS, 'bench', 'cable', ['incline cable chest press'], { pulley: 0.1 });
x('CLOSE GRIP BENCH PRESS', CLOSE_PRESS, 'bench', 'barbell', ['close grip bench', 'cgbp', 'narrow grip bench press'], ST);
x('CLOSE GRIP DB PRESS', CLOSE_PRESS, 'bench', 'dumbbell', ['close grip dumbbell press', 'db squeeze press tricep']);
x('SMITH CLOSE GRIP BENCH', CLOSE_PRESS, 'bench', 'barbell', ['smith close grip bench press']);
x('WIDE GRIP BENCH PRESS', WIDE_PRESS, 'bench', 'barbell', ['wide bench press', 'wide grip bench']);
x('PAUSE BENCH PRESS', FLAT_PRESS, 'bench', 'barbell', ['paused bench press', 'pause bench', 'spoto press', 'larsen press']);
x('FLOOR PRESS', FLOOR_PRESS, 'bench', 'barbell', ['barbell floor press']);
x('DB FLOOR PRESS', FLOOR_PRESS, 'bench', 'dumbbell', ['dumbbell floor press', 'kb floor press', 'kettlebell floor press']);
x('BOARD PRESS', FLOOR_PRESS, 'bench', 'barbell', ['pin press', 'pin presses']);
x('NEUTRAL GRIP DB PRESS', { ...FLAT_PRESS, ...TRI(0.6, 0.35) }, 'bench', 'dumbbell', ['hammer grip db press', 'neutral grip dumbbell press', 'palms in db press']);
x('DB SQUEEZE PRESS', SQUEEZE_PRESS, 'bench', 'dumbbell', ['squeeze press', 'crush press', 'hex press']);
x('SVEND PRESS', SQUEEZE_PRESS, 'raise', 'dumbbell', ['plate squeeze press', 'plate press']);
x('LANDMINE CHEST PRESS', { ...INCLINE_PRESS, serratus: 0.5 }, 'ohp', 'barbell', ['landmine press chest', 'landmine squeeze press']);
x('CABLE FLY', FLY, 'fly', 'cable', ['cable flye', 'cable chest fly', 'standing cable fly', 'mid cable fly', 'cable pec fly'], { ...ST, pulley: 0.6 });
x('CABLE CROSSOVER', FLY_HIGH_LOW, 'fly', 'cable', ['high cable crossover', 'high to low cable fly', 'high to low fly', 'cable crossovers', 'standing cable crossover'], { ...ST, pulley: 0.95 });
x('LOW TO HIGH CABLE FLY', FLY_LOW_HIGH, 'fly', 'cable', ['low cable crossover', 'low to high fly', 'low cable fly', 'upward cable fly'], { pulley: 0.05 });
x('SEATED CABLE FLY', FLY, 'fly', 'cable', ['bench cable fly', 'flat bench cable fly', 'lying cable fly'], { pulley: 0.05 });
x('INCLINE CABLE FLY', FLY_LOW_HIGH, 'fly', 'cable', ['incline bench cable fly'], { pulley: 0.05 });
x('SINGLE ARM CABLE FLY', FLY, 'fly', 'cable', ['single arm cable crossover', 'one arm cable fly'], { pulley: 0.6 });
x('PEC DECK', FLY, 'fly', 'machine', ['machine fly', 'pec fly', 'pec fly machine', 'pec deck fly', 'butterfly', 'butterfly machine', 'chest fly machine', 'machine chest fly', 'pec dec', 'seated fly machine'], ST);
x('DB FLY', FLY, 'fly', 'dumbbell', ['dumbbell fly', 'flat db fly', 'flat dumbbell fly', 'chest fly', 'flys', 'dumbbell chest fly'], ST);
x('INCLINE DB FLY', FLY_LOW_HIGH, 'fly', 'dumbbell', ['incline dumbbell fly', 'incline fly']);
x('DECLINE DB FLY', FLY_HIGH_LOW, 'fly', 'dumbbell', ['decline dumbbell fly', 'decline fly']);
x('BAND FLY', FLY, 'fly', 'bodyweight', ['band chest fly', 'resistance band fly', 'band crossover']);
x('PUSH UP', PUSHUP, 'pushup', 'bodyweight', ['pushup', 'push ups', 'press up', 'standard push up', 'floor push up', 'weighted push up', 'vest push up', 'plate push up'], ST);
x('KNEE PUSH UP', s(0.7, PUSHUP), 'pushup', 'bodyweight', ['kneeling push up', 'modified push up', 'girl push up']);
x('INCLINE PUSH UP', PUSHUP_HANDS_UP, 'pushup', 'bodyweight', ['incline pushup', 'hands elevated push up', 'bench push up', 'box push up', 'wall push up', 'incline press up']);
x('DECLINE PUSH UP', PUSHUP_FEET_UP, 'pushup', 'bodyweight', ['decline pushup', 'feet elevated push up', 'feet up push up', 'decline press up']);
x('DIAMOND PUSH UP', PUSHUP_CLOSE, 'pushup', 'bodyweight', ['diamond pushup', 'close grip push up', 'close push up', 'triangle push up', 'tricep push up', 'narrow push up']);
x('WIDE PUSH UP', PUSHUP_WIDE, 'pushup', 'bodyweight', ['wide grip push up', 'wide pushup']);
x('ARCHER PUSH UP', PUSHUP_ONE_ARM, 'pushup', 'bodyweight', ['archer pushup', 'typewriter push up']);
x('ONE ARM PUSH UP', PUSHUP_ONE_ARM, 'pushup', 'bodyweight', ['single arm push up', 'one handed push up']);
x('PLYO PUSH UP', { ...PUSHUP, ...TRI(0.6, 0.35) }, 'pushup', 'bodyweight', ['clap push up', 'explosive push up', 'plyometric push up']);
x('DEFICIT PUSH UP', { ...PUSHUP, ...PECS(1, 0.7) }, 'pushup', 'bodyweight', ['deep push up', 'push up on handles', 'push up bars']);
x('RING PUSH UP', { ...PUSHUP, serratus: 0.6, ...ABS(0.35) }, 'pushup', 'bodyweight', ['suspended push up', 'trx push up']);
x('SPIDERMAN PUSH UP', { ...PUSHUP, oblique: 0.5, hipflex: 0.4 }, 'pushup', 'bodyweight', ['spider push up']);
x('HINDU PUSH UP', { ...PUSHUP, 'delt.front': 0.8, ...TRI(0.6, 0.3) }, 'pushup', 'bodyweight', ['dand', 'dive bomber push up']);
x('PSEUDO PLANCHE PUSH UP', { ...PUSHUP, 'delt.front': 1, ...PECS(0.8, 0.6), biceps: 0.3, serratus: 0.6 }, 'pushup', 'bodyweight', ['pseudo planche pushup', 'planche lean push up']);
x('PIKE PUSH UP', PIKE_PUSHUP, 'pushup', 'bodyweight', ['pike pushup', 'pike press']);
x('HANDSTAND PUSH UP', HSPU, 'ohp', 'bodyweight', ['hspu', 'wall handstand push up', 'handstand press']);
x('CHEST DIP', CHEST_DIP, 'dip', 'bodyweight', ['chest dips', 'dips', 'dip', 'parallel bar dip', 'weighted dip', 'leaning dip'], ST);
x('TRICEP DIP', TRICEP_DIP, 'dip', 'bodyweight', ['triceps dip', 'upright dip', 'straight bar dip']);
x('RING DIP', { ...CHEST_DIP, serratus: 0.3, ...ABS(0.3) }, 'dip', 'bodyweight', ['ring dips']);
x('ASSISTED DIP', CHEST_DIP, 'dip', 'machine', ['assisted dip machine', 'machine assisted dip', 'dip assist', 'gravitron dip'], { assisted: true });
x('SEATED DIP MACHINE', TRICEP_DIP, 'dip', 'machine', ['dip machine', 'seated dip', 'machine dip', 'tricep dip machine']);
x('BENCH DIP', BENCH_DIP, 'dip', 'bodyweight', ['bench dips', 'chair dip', 'box dip', 'tricep bench dip']);
x('DB PULLOVER', PULLOVER, 'pullover', 'dumbbell', ['dumbbell pullover', 'pullover', 'straight arm pullover', 'bent arm pullover'], ST);
x('BARBELL PULLOVER', PULLOVER, 'pullover', 'barbell', ['bb pullover', 'ez bar pullover']);
x('MACHINE PULLOVER', { ...PULLOVER, lat: 1, 'pec.lower': 0.6 }, 'pullover', 'machine', ['nautilus pullover', 'pullover machine']);
x('SCAPULAR PUSH UP', SCAP_PUSHUP, 'plank', 'bodyweight', ['scap push up', 'push up plus', 'serratus push up']);
x('SERRATUS PUNCH', { serratus: 1, 'delt.front': 0.4, 'pec.upper': 0.2 }, 'raise', 'cable', ['cable serratus punch', 'serratus press'], { pulley: 0.6 });

// Shoulders ──
x('OVERHEAD PRESS', OHP_STAND, 'ohp', 'barbell', ['ohp', 'standing overhead press', 'military press', 'barbell overhead press', 'shoulder press barbell', 'strict press', 'standing military press'], ST);
x('SEATED BARBELL PRESS', OHP_SEATED, 'ohp', 'barbell', ['seated military press', 'seated overhead press', 'seated barbell shoulder press']);
x('SEATED DB SHOULDER PRESS', OHP_SEATED, 'ohp', 'dumbbell', ['db shoulder press', 'dumbbell shoulder press', 'seated dumbbell press', 'db overhead press', 'seated db press', 'dumbbell overhead press'], ST);
x('STANDING DB PRESS', OHP_STAND, 'ohp', 'dumbbell', ['standing dumbbell press', 'standing db shoulder press', 'standing dumbbell shoulder press']);
x('SINGLE ARM SHOULDER PRESS', { ...OHP_STAND, oblique: 0.45 }, 'ohp', 'dumbbell', ['single arm db shoulder press', 'one arm overhead press', 'single arm overhead press', 'one arm dumbbell shoulder press']);
x('ARNOLD PRESS', ARNOLD, 'ohp', 'dumbbell', ['arnold dumbbell press', 'arnolds'], ST);
x('MACHINE SHOULDER PRESS', OHP_SEATED, 'ohp', 'machine', ['shoulder press', 'shoulder press machine', 'seated shoulder press machine', 'leverage shoulder press', 'hammer strength shoulder press', 'overhead press machine'], ST);
x('SMITH SHOULDER PRESS', OHP_SEATED, 'ohp', 'barbell', ['smith overhead press', 'smith machine shoulder press', 'smith military press']);
x('CABLE SHOULDER PRESS', OHP_SEATED, 'ohp', 'cable', ['cable overhead press'], { pulley: 0.05 });
x('BEHIND THE NECK PRESS', BTN_PRESS, 'ohp', 'barbell', ['btn press', 'behind neck press']);
x('Z PRESS', { ...OHP_SEATED, ...ABS(0.45), 'traps.lower': 0.3 }, 'ohp', 'barbell', ['floor seated press']);
x('PUSH PRESS', PUSH_PRESS, 'ohp', 'barbell', ['barbell push press', 'db push press', 'kb push press']);
x('LANDMINE PRESS', LANDMINE_PRESS, 'ohp', 'barbell', ['single arm landmine press', 'half kneeling landmine press', 'landmine shoulder press']);
x('KETTLEBELL PRESS', { ...OHP_STAND, oblique: 0.4 }, 'ohp', 'dumbbell', ['kb press', 'kb overhead press', 'kettlebell overhead press', 'kettlebell military press', 'bottoms up press']);
x('BAND SHOULDER PRESS', OHP_STAND, 'ohp', 'bodyweight', ['band overhead press', 'resistance band shoulder press']);
x('LATERAL RAISE', LATERAL, 'lateral', 'dumbbell', ['side raise', 'side lateral raise', 'db lateral raise', 'dumbbell lateral raise', 'lateral raises', 'lat raise', 'side delt raise', 'laterals'], ST);
x('SEATED LATERAL RAISE', LATERAL, 'lateral', 'dumbbell', ['seated side raise', 'seated db lateral raise']);
x('CABLE LATERAL RAISE', LATERAL, 'lateral', 'cable', ['cable side raise', 'single arm cable lateral raise', 'cable lateral', 'cable y lateral'], { ...ST, pulley: 0.05 });
x('MACHINE LATERAL RAISE', LATERAL, 'lateral', 'machine', ['lateral raise machine', 'side raise machine', 'machine side raise', 'delt machine']);
x('LEAN AWAY LATERAL RAISE', LATERAL, 'lateral', 'dumbbell', ['leaning lateral raise', 'lean away raise']);
x('LYING LATERAL RAISE', LATERAL, 'lateral', 'dumbbell', ['side lying lateral raise', 'incline side lying raise', 'one arm incline lateral raise']);
x('BAND LATERAL RAISE', LATERAL, 'lateral', 'bodyweight', ['resistance band lateral raise']);
x('FRONT RAISE', FRONT_RAISE, 'raise', 'dumbbell', ['db front raise', 'dumbbell front raise', 'front delt raise'], ST);
x('CABLE FRONT RAISE', FRONT_RAISE, 'raise', 'cable', ['front cable raise', 'rope front raise'], { pulley: 0.05 });
x('PLATE FRONT RAISE', FRONT_RAISE, 'raise', 'barbell', ['plate raise', 'front plate raise', 'steering wheel', 'plate steering wheel']);
x('BARBELL FRONT RAISE', FRONT_RAISE, 'raise', 'barbell', ['bb front raise']);
x('UPRIGHT ROW', UPRIGHT_ROW, 'lateral', 'barbell', ['barbell upright row', 'ez bar upright row'], ST);
x('DB UPRIGHT ROW', UPRIGHT_ROW, 'lateral', 'dumbbell', ['dumbbell upright row', 'kb upright row']);
x('CABLE UPRIGHT ROW', UPRIGHT_ROW, 'lateral', 'cable', ['rope upright row'], { pulley: 0.05 });
x('SMITH UPRIGHT ROW', UPRIGHT_ROW, 'lateral', 'barbell', ['smith machine upright row']);
x('REAR DELT FLY', REAR_FLY, 'facepull', 'dumbbell', ['rear delt raise', 'reverse fly', 'bent over reverse fly', 'bent over rear delt raise', 'db rear delt fly', 'reverse db fly', 'rear lateral raise', 'bent over lateral raise'], ST);
x('REVERSE PEC DECK', REAR_FLY, 'facepull', 'machine', ['rear delt machine', 'reverse fly machine', 'rear delt fly machine', 'reverse machine fly', 'machine rear delt fly', 'reverse pec dec'], ST);
x('CABLE REAR DELT FLY', REAR_FLY, 'facepull', 'cable', ['cable reverse fly', 'reverse cable crossover', 'cable rear delt', 'rear delt cable fly'], { pulley: 0.75 });
x('SINGLE ARM CABLE REAR DELT', REAR_FLY, 'facepull', 'cable', ['cross body cable rear delt', 'single arm reverse cable fly'], { pulley: 0.7 });
x('CHEST SUPPORTED REAR DELT RAISE', REAR_FLY, 'facepull', 'dumbbell', ['incline rear delt raise', 'prone rear delt raise', 'lying rear delt raise']);
x('REAR DELT ROW', { 'delt.rear': 1, 'traps.mid': 0.8, teres: 0.4, lat: 0.4, ...ELBOW(0.35, 0.35, 0.3), cuff: 0.4 }, 'row', 'dumbbell', ['rope rear delt row', 'barbell rear delt row', 'wide elbow row']);
x('FACE PULL', FACE_PULL, 'facepull', 'cable', ['cable face pull', 'rope face pull', 'face pulls', 'band face pull'], { ...ST, pulley: 0.8 });
x('BAND PULL APART', BAND_PULL_APART, 'facepull', 'bodyweight', ['pull apart', 'band pull aparts', 'banded pull apart']);
x('EXTERNAL ROTATION', EXT_ROT, 'facepull', 'cable', ['cable external rotation', 'band external rotation', 'db external rotation', 'side lying external rotation', 'rotator cuff external rotation'], { ...ST, pulley: 0.5 });
x('INTERNAL ROTATION', INT_ROT, 'facepull', 'cable', ['cable internal rotation', 'band internal rotation'], { pulley: 0.5 });
x('Y RAISE', Y_RAISE, 'facepull', 'dumbbell', ['prone y raise', 'incline y raise', 'cable y raise', 'ytw', 'y t w raise'], ST);
x('CUBAN PRESS', CUBAN, 'facepull', 'dumbbell', ['cuban rotation']);
x('SCAPTION', SCAPTION, 'lateral', 'dumbbell', ['scaption raise', 'db scaption', 'thumbs up raise']);
x('SHRUG', SHRUG, 'shrug', 'barbell', ['barbell shrug', 'shrugs', 'bb shrug', 'trap shrug'], ST);
x('DB SHRUG', SHRUG, 'shrug', 'dumbbell', ['dumbbell shrug', 'db shrugs']);
x('TRAP BAR SHRUG', SHRUG, 'shrug', 'barbell', ['hex bar shrug']);
x('CABLE SHRUG', SHRUG, 'shrug', 'cable', ['cable shrugs'], { pulley: 0.05 });
x('MACHINE SHRUG', SHRUG, 'shrug', 'machine', ['shrug machine', 'leverage shrug', 'calf machine shrug']);
x('SMITH SHRUG', SHRUG, 'shrug', 'barbell', ['smith machine shrug', 'behind the back shrug']);

// Back ──
x('PULL UP', PULLUP, 'pullup', 'bodyweight', ['pullup', 'pull ups', 'overhand pull up', 'strict pull up', 'weighted pull up', 'bodyweight pull up'], ST);
x('CHIN UP', CHINUP, 'pullup', 'bodyweight', ['chinup', 'chin ups', 'chins', 'underhand pull up', 'supinated pull up', 'weighted chin up'], ST);
x('NEUTRAL GRIP PULL UP', NEUTRAL_PULLUP, 'pullup', 'bodyweight', ['neutral pull up', 'hammer grip pull up', 'parallel grip pull up', 'v bar pull up']);
x('WIDE GRIP PULL UP', WIDE_PULLUP, 'pullup', 'bodyweight', ['wide pull up', 'wide grip pullup']);
x('ASSISTED PULL UP', PULLUP, 'pullup', 'machine', ['assisted pull up machine', 'assist pull up', 'machine assisted pull up', 'gravitron', 'assisted pullup machine', 'band assisted pull up'], { staple: true, assisted: true });
x('ASSISTED CHIN UP', CHINUP, 'pullup', 'machine', ['assisted chin up machine', 'chin assist machine', 'chin assist', 'chin assist machine pull up', 'machine assisted chin up'], { assisted: true });
x('NEGATIVE PULL UP', PULLUP, 'pullup', 'bodyweight', ['eccentric pull up', 'pull up negative']);
x('KIPPING PULL UP', { ...PULLUP, hipflex: 0.4, ...ABS(0.4) }, 'pullup', 'bodyweight', ['kip pull up', 'butterfly pull up']);
x('ONE ARM PULL UP', { ...PULLUP, ...ELBOW(0.7, 0.7, 0.6), oblique: 0.4 }, 'pullup', 'bodyweight', ['one arm chin up', 'archer pull up']);
x('L SIT PULL UP', mix(PULLUP, { hipflex: 0.6, ...ABS(0.6) }), 'pullup', 'bodyweight', ['l pull up']);
x('SCAPULAR PULL UP', { 'traps.lower': 1, lat: 0.6, 'traps.mid': 0.5, 'forearm.flex': 0.5, teres: 0.3 }, 'pullup', 'bodyweight', ['scap pull up', 'scapula pull up']);
x('LAT PULLDOWN', PULLDOWN, 'pulldown', 'cable', ['lat pull down', 'pulldown', 'wide grip pulldown', 'wide grip lat pulldown', 'front lat pulldown', 'lat pull', 'pull down'], ST);
x('CLOSE GRIP PULLDOWN', PULLDOWN_CLOSE, 'pulldown', 'cable', ['close grip lat pulldown', 'v bar pulldown', 'neutral grip pulldown', 'narrow grip pulldown', 'triangle pulldown'], ST);
x('REVERSE GRIP PULLDOWN', PULLDOWN_UNDER, 'pulldown', 'cable', ['underhand pulldown', 'supinated pulldown', 'reverse grip lat pulldown', 'chin up pulldown']);
x('SINGLE ARM PULLDOWN', { ...PULLDOWN_CLOSE, lat: 1, oblique: 0.2 }, 'pulldown', 'cable', ['one arm lat pulldown', 'single arm lat pulldown', 'kneeling single arm pulldown'], { pulley: 1 });
x('MACHINE PULLDOWN', PULLDOWN, 'pulldown', 'machine', ['plate loaded pulldown', 'hammer strength pulldown', 'iso lateral pulldown', 'leverage pulldown']);
x('BEHIND THE NECK PULLDOWN', { ...PULLDOWN, 'delt.rear': 0.45, 'traps.mid': 0.5 }, 'pulldown', 'cable', ['behind neck pulldown']);
x('STRAIGHT ARM PULLDOWN', STRAIGHT_ARM, 'pulldown', 'cable', ['straight arm pull down', 'rope straight arm pulldown', 'lat prayer', 'cable pullover', 'standing lat pullover'], { ...ST, pulley: 1 });
x('BARBELL ROW', BENT_ROW, 'row', 'barbell', ['bent over row', 'bent over barbell row', 'bb row', 'barbell bent over row', 'overhand row'], ST);
x('PENDLAY ROW', { ...BENT_ROW, erector: 0.7 }, 'row', 'barbell', ['pendlay rows', 'dead stop row']);
x('YATES ROW', UNDER_ROW, 'row', 'barbell', ['reverse grip barbell row', 'underhand barbell row', 'underhand row', 'reverse grip row', 'reverse grip bent over row']);
x('SMITH ROW', { ...BENT_ROW, erector: 0.45 }, 'row', 'barbell', ['smith machine row', 'smith bent over row']);
x('T BAR ROW', BENT_ROW, 'row', 'barbell', ['t-bar row', 'landmine row', 't bar rows'], ST);
x('CHEST SUPPORTED T BAR ROW', SUPPORTED_ROW, 'row', 'machine', ['chest supported t-bar', 'lying t bar row', 'incline t bar row']);
x('SINGLE ARM DB ROW', ONE_ARM_ROW, 'row', 'dumbbell', ['one arm db row', 'dumbbell row', 'db row', 'one arm dumbbell row', 'single arm row', 'bench row', 'kroc row'], ST);
x('MEADOWS ROW', { ...ONE_ARM_ROW, 'delt.rear': 0.7, 'traps.mid': 0.8 }, 'row', 'barbell', ['landmine single arm row']);
x('BENT OVER DB ROW', BENT_ROW, 'row', 'dumbbell', ['two arm dumbbell row', 'bent over dumbbell row', 'db bent over row']);
x('CHEST SUPPORTED ROW', SUPPORTED_ROW, 'row', 'dumbbell', ['incline db row', 'chest supported db row', 'prone db row', 'incline bench row', 'seal row', 'incline bench pull'], ST);
x('SEATED CABLE ROW', CABLE_ROW, 'cablerow', 'cable', ['cable row', 'seated row', 'low row', 'v bar row', 'close grip cable row', 'seated rows'], { ...ST, pulley: 0.05 });
x('WIDE GRIP CABLE ROW', WIDE_ROW, 'cablerow', 'cable', ['wide grip seated row', 'wide cable row', 'cable row to neck'], { pulley: 0.05 });
x('SINGLE ARM CABLE ROW', { ...CABLE_ROW, lat: 1, oblique: 0.2 }, 'cablerow', 'cable', ['one arm cable row', 'single arm seated row', 'standing cable row'], { pulley: 0.5 });
x('MACHINE ROW', SUPPORTED_ROW, 'cablerow', 'machine', ['seated row machine', 'chest supported machine row', 'hammer strength row', 'iso row', 'plate loaded row', 'leverage row', 'row machine'], ST);
x('HIGH ROW', HIGH_ROW, 'pulldown', 'machine', ['machine high row', 'hammer strength high row', 'leverage high row']);
x('KNEELING HIGH CABLE ROW', HIGH_ROW, 'pulldown', 'cable', ['high cable row', 'kneeling cable row', 'half kneeling cable row'], { pulley: 1 });
x('INVERTED ROW', INVERTED_ROW, 'invrow', 'bodyweight', ['bodyweight row', 'australian pull up', 'body row', 'smith inverted row', 'ring row', 'trx row', 'suspension row'], ST);
x('RENEGADE ROW', RENEGADE_ROW, 'row', 'dumbbell', ['plank row', 'kb renegade row']);
x('KETTLEBELL ROW', ONE_ARM_ROW, 'row', 'dumbbell', ['kb row', 'one arm kettlebell row', 'gorilla row']);
x('BAND ROW', CABLE_ROW, 'cablerow', 'bodyweight', ['resistance band row', 'banded row']);
x('BACK EXTENSION', BACK_EXT, 'backext', 'bodyweight', ['hyperextension', 'hyperextensions', 'back extensions', '45 degree back extension', 'roman chair back extension', 'lower back extension', 'weighted back extension'], ST);
x('GLUTE BACK EXTENSION', BACK_EXT_GLUTE, 'backext', 'bodyweight', ['glute hyperextension', 'glute focused back extension', 'rounded back extension']);
x('MACHINE BACK EXTENSION', BACK_EXT, 'backext', 'machine', ['back extension machine', 'lower back machine', 'seated back extension']);
x('REVERSE HYPER', REVERSE_HYPER, 'backext', 'machine', ['reverse hyperextension', 'reverse hypers']);
x('SUPERMAN', SUPERMAN, 'backext', 'bodyweight', ['supermans', 'superman hold', 'prone back extension', 'swimmers']);
x('BIRD DOG', BIRD_DOG, 'plank', 'bodyweight', ['bird dogs', 'quadruped arm leg raise']);
x('DEADLIFT', DEADLIFT, 'hinge', 'barbell', ['conventional deadlift', 'barbell deadlift', 'deadlifts', 'dl', 'bb deadlift'], ST);
x('SUMO DEADLIFT', SUMO_DEADLIFT, 'hinge', 'barbell', ['sumo deadlifts', 'sumo dl', 'sumo pull']);
x('TRAP BAR DEADLIFT', TRAP_BAR, 'hinge', 'barbell', ['hex bar deadlift', 'trap bar dl', 'hex bar dl'], ST);
x('DEFICIT DEADLIFT', DEFICIT_DEADLIFT, 'hinge', 'barbell', ['deficit pull']);
x('RACK PULL', RACK_PULL, 'hinge', 'barbell', ['rack pulls', 'block pull', 'partial deadlift']);
x('SNATCH GRIP DEADLIFT', { ...DEADLIFT, 'traps.upper': 0.7, 'traps.mid': 0.6, ...QUADS(0.65, 0.3) }, 'hinge', 'barbell', ['snatch deadlift', 'wide grip deadlift']);
x('DB DEADLIFT', DEADLIFT, 'hinge', 'dumbbell', ['dumbbell deadlift', 'kettlebell deadlift', 'kb deadlift']);
x('SMITH DEADLIFT', DEADLIFT, 'hinge', 'barbell', ['smith machine deadlift']);
x('MACHINE DEADLIFT', TRAP_BAR, 'hinge', 'machine', ['leverage deadlift', 'deadlift machine', 'plate loaded deadlift']);
x('ROMANIAN DEADLIFT', RDL, 'hinge', 'barbell', ['rdl', 'barbell rdl', 'romanian deadlifts', 'bb rdl'], ST);
x('DB ROMANIAN DEADLIFT', RDL, 'hinge', 'dumbbell', ['db rdl', 'dumbbell rdl', 'dumbbell romanian deadlift', 'kb rdl']);
x('SMITH RDL', RDL, 'hinge', 'barbell', ['smith romanian deadlift', 'smith machine rdl']);
x('CABLE RDL', RDL, 'hinge', 'cable', ['cable romanian deadlift', 'cable deadlift'], { pulley: 0.05 });
x('STIFF LEG DEADLIFT', STIFF_LEG, 'hinge', 'barbell', ['stiff legged deadlift', 'sldl', 'straight leg deadlift', 'stiff leg db deadlift'], ST);
x('SINGLE LEG RDL', SL_RDL, 'hinge', 'dumbbell', ['single leg romanian deadlift', 'one leg rdl', 'sl rdl', 'single leg deadlift', 'b stance rdl', 'kickstand rdl', 'kb single leg deadlift']);
x('GOOD MORNING', GOOD_MORNING, 'hinge', 'barbell', ['good mornings', 'barbell good morning', 'seated good morning', 'band good morning'], ST);
x('KETTLEBELL SWING', SWING, 'swing', 'dumbbell', ['kb swing', 'kettlebell swings', 'russian swing', 'american swing', 'db swing', 'two hand kettlebell swing', 'single arm kettlebell swing'], ST);
x('CABLE PULL THROUGH', PULL_THROUGH, 'swing', 'cable', ['pull through', 'pull throughs', 'band pull through'], { pulley: 0.05 });
x('GLUTE HAM RAISE', GHR, 'legcurl', 'bodyweight', ['ghr', 'glute ham raises', 'glute ham developer', 'ghd raise'], ST);
x('NORDIC CURL', NORDIC, 'legcurl', 'bodyweight', ['nordic hamstring curl', 'nordics', 'nordic', 'natural glute ham raise', 'russian leg curl', 'reverse nordic hamstring'], ST);

// Arms ──
x('BARBELL CURL', CURL_BB, 'curl', 'barbell', ['bb curl', 'barbell bicep curl', 'standing barbell curl', 'straight bar curl', 'bicep curl barbell'], ST);
x('EZ BAR CURL', CURL_EZ, 'curl', 'barbell', ['ez curl', 'ez bar bicep curl', 'ez barbell curl', 'cambered bar curl']);
x('DB CURL', CURL_DB, 'curl', 'dumbbell', ['dumbbell curl', 'bicep curl', 'db bicep curl', 'dumbbell bicep curl', 'alternating db curl', 'standing db curl', 'seated db curl', 'biceps curl', 'curls'], ST);
x('INCLINE DB CURL', CURL_STRETCH, 'curl', 'dumbbell', ['incline dumbbell curl', 'incline curl', 'incline bicep curl'], ST);
x('PREACHER CURL', CURL_SHORT, 'curl', 'barbell', ['ez bar preacher curl', 'barbell preacher curl', 'scott curl', 'preacher curls'], ST);
x('DB PREACHER CURL', CURL_SHORT, 'curl', 'dumbbell', ['single arm preacher curl', 'dumbbell preacher curl', 'one arm preacher curl']);
x('MACHINE PREACHER CURL', CURL_SHORT, 'curl', 'machine', ['preacher curl machine', 'machine bicep curl', 'bicep curl machine', 'machine curl', 'seated machine curl']);
x('CABLE PREACHER CURL', CURL_SHORT, 'curl', 'cable', ['preacher cable curl'], { pulley: 0.05 });
x('SPIDER CURL', CURL_SHORT, 'curl', 'dumbbell', ['prone incline curl', 'spider curls', 'ez bar spider curl']);
x('CONCENTRATION CURL', CURL_SHORT, 'curl', 'dumbbell', ['concentration curls', 'seated concentration curl']);
x('CABLE CURL', CURL_DB, 'curl', 'cable', ['cable bicep curl', 'standing cable curl', 'straight bar cable curl', 'ez bar cable curl', 'single arm cable curl'], { ...ST, pulley: 0.05 });
x('BAYESIAN CURL', CURL_STRETCH, 'curl', 'cable', ['bayesian cable curl', 'behind the back cable curl', 'face away cable curl'], { pulley: 0.05 });
x('HIGH CABLE CURL', CURL_SHORT, 'curl', 'cable', ['overhead cable curl', 'double bicep cable curl', 'crucifix curl'], { pulley: 0.95 });
x('LYING CABLE CURL', CURL_DB, 'curl', 'cable', ['lying cable bicep curl'], { pulley: 0.05 });
x('DRAG CURL', DRAG_CURL, 'curl', 'barbell', ['barbell drag curl', 'drag curls']);
x('BAND CURL', CURL_DB, 'curl', 'bodyweight', ['resistance band curl', 'band bicep curl']);
x('HAMMER CURL', HAMMER, 'curl', 'dumbbell', ['hammer curls', 'db hammer curl', 'neutral grip curl', 'alternating hammer curl', 'seated hammer curl', 'incline hammer curl', 'standing hammer curl'], ST);
x('CROSS BODY HAMMER CURL', HAMMER, 'curl', 'dumbbell', ['cross body curl', 'pinwheel curl', 'cross body hammer curls']);
x('ROPE HAMMER CURL', HAMMER, 'curl', 'cable', ['cable hammer curl', 'rope curl', 'cable rope curl'], { pulley: 0.05 });
x('PREACHER HAMMER CURL', { ...HAMMER, brachialis: 1 }, 'curl', 'dumbbell', ['hammer preacher curl']);
x('REVERSE CURL', REVERSE_CURL, 'curl', 'barbell', ['reverse barbell curl', 'reverse grip curl', 'overhand curl', 'ez bar reverse curl', 'reverse db curl', 'reverse cable curl', 'pronated curl'], ST);
x('ZOTTMAN CURL', ZOTTMAN, 'curl', 'dumbbell', ['zottman curls']);
x('WRIST CURL', WRIST_CURL, 'curl', 'barbell', ['barbell wrist curl', 'db wrist curl', 'palms up wrist curl', 'seated wrist curl', 'cable wrist curl', 'behind the back wrist curl'], ST);
x('REVERSE WRIST CURL', WRIST_EXT, 'curl', 'barbell', ['wrist extension', 'palms down wrist curl', 'reverse wrist curls', 'db wrist extension']);
x('WRIST ROLLER', WRIST_ROLLER, 'raise', 'bodyweight', ['forearm roller', 'wrist roller exercise']);
x('PLATE PINCH', GRIP, 'shrug', 'barbell', ['plate pinches', 'pinch grip hold', 'grip trainer', 'hand gripper', 'gripper', 'grip squeeze', 'finger curl']);
x('DEAD HANG', DEAD_HANG, 'pullup', 'bodyweight', ['bar hang', 'hang', 'dead hangs', 'passive hang', 'active hang']);
x('PRONATION SUPINATION', { 'forearm.flex': 0.7, 'forearm.ext': 0.6, brachiorad: 0.5, biceps: 0.3 }, 'curl', 'dumbbell', ['wrist rotation', 'forearm rotation', 'db pronation', 'db supination', 'hammer rotation']);
x('TRICEP PUSHDOWN', PUSHDOWN, 'pushdown', 'cable', ['triceps pushdown', 'cable pushdown', 'straight bar pushdown', 'v bar pushdown', 'tricep pushdowns', 'pushdown', 'push down', 'cable tricep pushdown', 'tricep press down', 'cable tricep extension'], { ...ST, pulley: 1 });
x('ROPE PUSHDOWN', PUSHDOWN_ROPE, 'pushdown', 'cable', ['rope tricep pushdown', 'tricep rope pushdown', 'rope push down', 'rope triceps extension', 'tricep rope'], { ...ST, pulley: 1 });
x('REVERSE GRIP PUSHDOWN', PUSHDOWN_REVERSE, 'pushdown', 'cable', ['underhand pushdown', 'reverse grip tricep pushdown', 'supinated pushdown'], { pulley: 1 });
x('SINGLE ARM PUSHDOWN', PUSHDOWN, 'pushdown', 'cable', ['one arm tricep pushdown', 'single arm cable pushdown'], { pulley: 1 });
x('CROSS BODY TRICEP EXTENSION', TRI(1, 0.75), 'pushdown', 'cable', ['cable cross body extension', 'katana extension', 'cross cable tricep'], { pulley: 0.9 });
x('OVERHEAD TRICEP EXTENSION', OVERHEAD_EXT, 'overheadext', 'dumbbell', ['db overhead extension', 'overhead extension', 'french press', 'seated overhead tricep extension', 'dumbbell overhead tricep extension', 'two hand overhead extension', 'tricep extension', 'db tricep extension', 'seated tricep press', 'standing tricep extension', 'kb overhead tricep extension', 'towel tricep extension'], ST);
x('CABLE OVERHEAD EXTENSION', OVERHEAD_EXT, 'overheadext', 'cable', ['cable overhead tricep extension', 'rope overhead extension', 'overhead rope extension', 'overhead cable extension', 'cable french press', 'kneeling cable tricep extension', 'low cable tricep extension', 'high cable overhead extension'], { ...ST, pulley: 0.72 });
x('SINGLE ARM OVERHEAD EXTENSION', OVERHEAD_EXT, 'overheadext', 'dumbbell', ['one arm overhead extension', 'single arm db overhead extension', 'single arm cable overhead extension']);
x('EZ BAR OVERHEAD EXTENSION', OVERHEAD_EXT, 'overheadext', 'barbell', ['barbell overhead extension', 'standing overhead barbell extension']);
x('MACHINE TRICEP EXTENSION', TRI(1, 0.7), 'overheadext', 'machine', ['tricep extension machine', 'triceps machine', 'seated tricep extension machine', 'overhead tricep machine']);
x('SKULL CRUSHER', SKULL, 'skull', 'barbell', ['skull crushers', 'ez bar skull crusher', 'lying tricep extension', 'lying triceps extension', 'skullcrusher', 'nose breaker', 'ez skull crusher', 'lying tricep press', 'decline tricep extension', 'incline tricep extension'], ST);
x('DB SKULL CRUSHER', SKULL, 'skull', 'dumbbell', ['dumbbell skull crusher', 'db lying tricep extension', 'dumbbell lying extension']);
x('CABLE SKULL CRUSHER', SKULL, 'skull', 'cable', ['cable lying tricep extension'], { pulley: 0.05 });
x('JM PRESS', JM_PRESS, 'skull', 'barbell', ['j m press', 'smith jm press']);
x('TATE PRESS', TATE, 'skull', 'dumbbell', ['tate presses', 'elbows out extension']);
x('TRICEP KICKBACK', KICKBACK, 'pushdown', 'dumbbell', ['db kickback', 'dumbbell kickback', 'tricep kickbacks', 'triceps kickback', 'bent over tricep extension'], ST);
x('CABLE KICKBACK', KICKBACK, 'pushdown', 'cable', ['cable tricep kickback', 'single arm cable kickback'], { pulley: 0.15 });
x('BODYWEIGHT TRICEP EXTENSION', SKULL, 'pushup', 'bodyweight', ['bodyweight skull crusher', 'bench tricep extension', 'body tricep press', 'sphinx push up']);

// Legs ──
x('BACK SQUAT', BACK_SQUAT, 'squat', 'barbell', ['squat', 'barbell squat', 'squats', 'high bar squat', 'barbell back squat', 'bb squat', 'full squat'], ST);
x('LOW BAR SQUAT', LOW_BAR, 'squat', 'barbell', ['low bar back squat', 'powerlifting squat']);
x('PAUSE SQUAT', BACK_SQUAT, 'squat', 'barbell', ['paused squat', 'tempo squat']);
x('FRONT SQUAT', FRONT_SQUAT, 'squat', 'barbell', ['barbell front squat', 'front squats', 'clean grip front squat'], ST);
x('GOBLET SQUAT', GOBLET, 'squat', 'dumbbell', ['db goblet squat', 'kb goblet squat', 'goblet squats', 'kettlebell goblet squat'], ST);
x('DB SQUAT', GOBLET, 'squat', 'dumbbell', ['dumbbell squat', 'db front squat', 'kettlebell front squat', 'double kettlebell front squat']);
x('OVERHEAD SQUAT', OVERHEAD_SQUAT, 'squat', 'barbell', ['ohs', 'overhead squats', 'snatch balance']);
x('BOX SQUAT', BOX_SQUAT, 'squat', 'barbell', ['barbell box squat', 'squat to box', 'squat to bench']);
x('ZERCHER SQUAT', ZERCHER, 'squat', 'barbell', ['zercher squats', 'zercher']);
x('SAFETY BAR SQUAT', { ...BACK_SQUAT, erector: 0.75, 'traps.upper': 0.3 }, 'squat', 'barbell', ['ssb squat', 'safety squat bar squat', 'yoke bar squat']);
x('SUMO SQUAT', SUMO_SQUAT, 'squat', 'dumbbell', ['plie squat', 'wide stance squat', 'db sumo squat', 'kb sumo squat', 'wide squat', 'sumo goblet squat']);
x('SMITH SQUAT', SMITH_SQUAT, 'squat', 'barbell', ['smith machine squat', 'smith squats']);
x('HACK SQUAT', MACHINE_SQUAT, 'squat', 'machine', ['machine hack squat', 'hack squats', 'hack squat machine', 'sled hack squat', 'lying machine squat'], ST);
x('REVERSE HACK SQUAT', { ...MACHINE_SQUAT, 'glute.max': 0.8, ...HAMS(0.3) }, 'squat', 'machine', ['reverse hack', 'hack squat facing in']);
x('BARBELL HACK SQUAT', { ...DEADLIFT, ...QUADS(0.9, 0.4), erector: 0.6 }, 'squat', 'barbell', ['behind the back deadlift']);
x('PENDULUM SQUAT', MACHINE_SQUAT, 'squat', 'machine', ['pendulum squats', 'pendulum']);
x('V SQUAT', MACHINE_SQUAT, 'squat', 'machine', ['v squat machine', 'power squat machine', 'leverage squat']);
x('BELT SQUAT', BELT_SQUAT, 'squat', 'machine', ['belt squats', 'hip belt squat']);
x('LEG PRESS', LEG_PRESS, 'legpress', 'machine', ['leg press machine', '45 degree leg press', 'sled leg press', 'seated leg press', 'horizontal leg press', 'plate loaded leg press'], ST);
x('HIGH FOOT LEG PRESS', LEG_PRESS_HIGH, 'legpress', 'machine', ['wide stance leg press', 'high and wide leg press', 'glute leg press']);
x('NARROW STANCE LEG PRESS', LEG_PRESS_NARROW, 'legpress', 'machine', ['close stance leg press', 'low foot leg press', 'narrow leg press']);
x('SINGLE LEG PRESS', { ...LEG_PRESS, 'glute.med': 0.3 }, 'legpress', 'machine', ['single leg leg press', 'one leg press', 'unilateral leg press']);
x('SISSY SQUAT', SISSY, 'squat', 'bodyweight', ['sissy squats', 'weighted sissy squat', 'sissy squat machine']);
x('BODYWEIGHT SQUAT', BW_SQUAT, 'squat', 'bodyweight', ['air squat', 'air squats', 'bw squat', 'squat bodyweight', 'free squat', 'chair squat']);
x('PISTOL SQUAT', PISTOL, 'squat', 'bodyweight', ['pistol', 'pistols', 'single leg squat', 'one leg squat', 'kb pistol squat']);
x('SHRIMP SQUAT', { ...PISTOL, ...QUADS(1, 0.55), hipflex: 0.2 }, 'lunge', 'bodyweight', ['shrimp squats', 'skater squat']);
x('BOX PISTOL', PISTOL, 'squat', 'bodyweight', ['single leg box squat', 'single leg sit to stand']);
x('JUMP SQUAT', JUMP_SQUAT, 'jump', 'bodyweight', ['squat jump', 'jump squats', 'weighted jump squat', 'squat jumps']);
x('WALL SIT', WALL_SIT, 'squat', 'bodyweight', ['wall squat', 'wall sits', 'wall chair']);
x('SPANISH SQUAT', { ...QUADS(1, 0.5), 'glute.max': 0.3 }, 'squat', 'bodyweight', ['band spanish squat']);
x('CYCLIST SQUAT', { ...QUADS(1, 0.45), 'glute.max': 0.5, adductor: 0.4 }, 'squat', 'dumbbell', ['heels elevated squat', 'heel elevated goblet squat', 'quad squat']);
x('BULGARIAN SPLIT SQUAT', BULGARIAN, 'lunge', 'dumbbell', ['bss', 'rear foot elevated split squat', 'rfess', 'bulgarian', 'bulgarians', 'db bulgarian split squat', 'barbell bulgarian split squat', 'smith bulgarian split squat'], ST);
x('SPLIT SQUAT', SPLIT_SQUAT, 'lunge', 'dumbbell', ['static lunge', 'db split squat', 'barbell split squat', 'smith split squat', 'stationary lunge']);
x('FRONT FOOT ELEVATED SPLIT SQUAT', { ...SPLIT_SQUAT, 'glute.max': 0.9, adductor: 0.75 }, 'lunge', 'dumbbell', ['ffe split squat', 'deficit split squat']);
x('LUNGE', LUNGE, 'lunge', 'dumbbell', ['lunges', 'forward lunge', 'db lunge', 'dumbbell lunge', 'barbell lunge', 'front lunge'], ST);
x('REVERSE LUNGE', REVERSE_LUNGE, 'lunge', 'dumbbell', ['reverse lunges', 'back lunge', 'rear lunge', 'step back lunge', 'db reverse lunge', 'deficit reverse lunge']);
x('WALKING LUNGE', WALKING_LUNGE, 'lunge', 'dumbbell', ['walking lunges', 'db walking lunge', 'barbell walking lunge', 'bodyweight walking lunge'], ST);
x('BODYWEIGHT LUNGE', s(0.7, LUNGE), 'lunge', 'bodyweight', ['bw lunge', 'lunge bodyweight', 'bodyweight lunges']);
x('CURTSY LUNGE', CURTSY, 'lunge', 'dumbbell', ['curtsy lunges', 'crossover lunge']);
x('LATERAL LUNGE', LATERAL_LUNGE, 'lunge', 'dumbbell', ['side lunge', 'cossack squat', 'lateral lunges', 'side lunges', 'cossack']);
x('JUMPING LUNGE', SPLIT_JUMP, 'jump', 'bodyweight', ['lunge jump', 'split jump', 'jump lunge', 'jumping lunges', 'scissor jump']);
x('STEP UP', STEP_UP, 'lunge', 'dumbbell', ['step ups', 'box step up', 'db step up', 'barbell step up', 'weighted step up', 'lateral step up', 'step up with knee raise', 'step up knee drive'], ST);
x('LEG EXTENSION', LEG_EXT, 'legext', 'machine', ['leg extensions', 'quad extension', 'knee extension', 'leg ext', 'single leg extension', 'seated leg extension'], ST);
x('LYING LEG CURL', LEG_CURL_LYING, 'legcurl', 'machine', ['prone leg curl', 'lying hamstring curl', 'leg curl', 'leg curls', 'hamstring curl'], ST);
x('SEATED LEG CURL', LEG_CURL_SEATED, 'legcurl', 'machine', ['seated hamstring curl', 'seated leg curls'], ST);
x('STANDING LEG CURL', LEG_CURL_STANDING, 'legcurl', 'machine', ['single leg curl', 'standing hamstring curl', 'cable leg curl', 'kneeling leg curl'], { pulley: 0.05 });
x('DB LEG CURL', LEG_CURL_LYING, 'legcurl', 'dumbbell', ['dumbbell leg curl', 'dumbbell hamstring curl']);
x('SLIDER LEG CURL', BALL_CURL, 'legcurl', 'bodyweight', ['stability ball leg curl', 'ball leg curl', 'swiss ball hamstring curl', 'sliding leg curl', 'towel leg curl', 'hamstring slide']);
x('HIP THRUST', HIP_THRUST, 'thrust', 'barbell', ['barbell hip thrust', 'hip thrusts', 'bb hip thrust', 'glute thrust', 'db hip thrust', 'single leg hip thrust'], ST);
x('MACHINE HIP THRUST', HIP_THRUST, 'thrust', 'machine', ['hip thrust machine', 'glute drive', 'glute bridge machine', 'plate loaded hip thrust']);
x('SMITH HIP THRUST', HIP_THRUST, 'thrust', 'barbell', ['smith machine hip thrust', 'smith glute bridge']);
x('GLUTE BRIDGE', GLUTE_BRIDGE, 'thrust', 'bodyweight', ['bridge', 'hip bridge', 'glute bridges', 'barbell glute bridge', 'floor bridge', 'butt lift'], ST);
x('SINGLE LEG GLUTE BRIDGE', SL_BRIDGE, 'thrust', 'bodyweight', ['single leg bridge', 'one leg glute bridge', 'single leg hip bridge']);
x('FROG PUMP', FROG_PUMP, 'thrust', 'bodyweight', ['frog pumps', 'frog bridge']);
x('GLUTE KICKBACK', KICKBACK_GLUTE, 'kickback', 'cable', ['cable glute kickback', 'cable kickback glute', 'glute kick back', 'cable hip extension', 'standing kickback'], { ...ST, pulley: 0.05 });
x('MACHINE GLUTE KICKBACK', KICKBACK_GLUTE, 'kickback', 'machine', ['glute kickback machine', 'glute machine', 'rear kick machine']);
x('DONKEY KICK', KICKBACK_GLUTE, 'kickback', 'bodyweight', ['donkey kicks', 'quadruped hip extension', 'band donkey kick']);
x('HIP ABDUCTION', ABDUCT_SEATED, 'abduct', 'machine', ['abductor machine', 'hip abductor', 'abduction machine', 'outer thigh machine', 'seated hip abduction', 'thigh abductor', 'abductors'], ST);
x('CABLE HIP ABDUCTION', ABDUCT_STANDING, 'abduct', 'cable', ['standing hip abduction', 'cable abduction', 'standing cable abduction'], { pulley: 0.05 });
x('SIDE LYING LEG RAISE', ABDUCT_STANDING, 'abduct', 'bodyweight', ['side leg raise', 'lying hip abduction', 'side lying abduction', 'side leg lift']);
x('CLAMSHELL', CLAMSHELL, 'abduct', 'bodyweight', ['clamshells', 'clam', 'band clamshell']);
x('LATERAL BAND WALK', BAND_WALK, 'abduct', 'bodyweight', ['band walk', 'monster walk', 'crab walk band', 'banded side step', 'lateral walk', 'side step band']);
x('FIRE HYDRANT', FIRE_HYDRANT, 'abduct', 'bodyweight', ['fire hydrants', 'band fire hydrant']);
x('HIP ADDUCTION', ADDUCT, 'abduct', 'machine', ['adductor machine', 'hip adductor', 'adduction machine', 'inner thigh machine', 'seated hip adduction', 'thigh adductor', 'adductors'], ST);
x('CABLE HIP ADDUCTION', ADDUCT, 'abduct', 'cable', ['standing hip adduction', 'cable adduction', 'band adduction'], { pulley: 0.05 });
x('COPENHAGEN PLANK', COPENHAGEN, 'sideplank', 'bodyweight', ['copenhagen', 'copenhagen adductor', 'copenhagen side plank', 'adductor plank']);
x('STANDING CALF RAISE', CALF_STANDING, 'calf', 'machine', ['calf raise', 'calf raises', 'standing calf raises', 'calf raise machine', 'standing calf machine', 'smith calf raise', 'barbell calf raise', 'db calf raise', 'single leg calf raise', 'bodyweight calf raise', 'heel raise'], ST);
x('SEATED CALF RAISE', CALF_SEATED, 'calf', 'machine', ['seated calf raises', 'seated calf machine', 'seated calf', 'soleus raise', 'bent knee calf raise'], ST);
x('LEG PRESS CALF RAISE', CALF_STANDING, 'calf', 'machine', ['calf press', 'leg press calf press', 'calf press on leg press', 'calf extension']);
x('DONKEY CALF RAISE', CALF_BENT, 'calf', 'machine', ['donkey calf raises', 'donkey calf']);
x('TIBIALIS RAISE', TIB_RAISE, 'calf', 'bodyweight', ['tib raise', 'tibialis raises', 'toe raise', 'tib bar raise', 'reverse calf raise', 'dorsiflexion raise'], ST);
x('HIP FLEXION', HIP_FLEX, 'legraise', 'cable', ['cable hip flexion', 'band hip flexion', 'standing knee drive', 'hip flexor raise', 'psoas march'], { pulley: 0.05 });

// Core ──
x('CRUNCH', CRUNCH, 'crunch', 'bodyweight', ['crunches', 'ab crunch', 'floor crunch', 'weighted crunch', 'stability ball crunch', 'swiss ball crunch'], ST);
x('CABLE CRUNCH', CABLE_CRUNCH, 'crunch', 'cable', ['kneeling cable crunch', 'rope crunch', 'cable crunches', 'cable ab crunch', 'standing cable crunch'], { ...ST, pulley: 1 });
x('MACHINE CRUNCH', CABLE_CRUNCH, 'crunch', 'machine', ['ab crunch machine', 'ab machine', 'crunch machine', 'seated ab crunch']);
x('DECLINE CRUNCH', DECLINE_CRUNCH, 'crunch', 'bodyweight', ['decline crunches', 'decline bench crunch']);
x('SIT UP', SIT_UP, 'crunch', 'bodyweight', ['situp', 'sit ups', 'decline sit up', 'weighted sit up', 'butterfly sit up', 'ghd sit up', 'anchored sit up']);
x('REVERSE CRUNCH', REVERSE_CRUNCH, 'legraise', 'bodyweight', ['reverse crunches', 'bench reverse crunch', 'decline reverse crunch', 'cable reverse crunch', 'leg pull in', 'knee tuck', 'seated knee tuck']);
x('HANGING LEG RAISE', HANGING_LEG, 'legraise', 'bodyweight', ['hanging leg raises', 'straight leg raise hanging', 'hanging leg lift'], ST);
x('HANGING KNEE RAISE', HANGING_KNEE, 'legraise', 'bodyweight', ['hanging knee raises', 'knee raise', 'hanging knee tuck', 'knee ups'], ST);
x("CAPTAIN'S CHAIR LEG RAISE", CAPTAINS_CHAIR, 'legraise', 'machine', ['captains chair', 'captain chair', 'vertical knee raise', 'roman chair leg raise', 'dip station leg raise', 'parallel bar knee raise', 'vkr']);
x('LYING LEG RAISE', LYING_LEG, 'legraise', 'bodyweight', ['leg raise', 'leg raises', 'floor leg raise', 'bench leg raise', 'lying leg raises', 'leg lift']);
x('TOES TO BAR', TOES_TO_BAR, 'legraise', 'bodyweight', ['t2b', 'toes to bars', 'knees to elbows', 'hanging pike']);
x('V UP', V_UP, 'crunch', 'bodyweight', ['v ups', 'jackknife', 'jack knife sit up', 'v sit up', 'tuck up']);
x('FLUTTER KICKS', FLUTTER, 'legraise', 'bodyweight', ['flutter kick', 'scissor kicks', 'scissors', 'leg flutters']);
x('PLANK', PLANK, 'plank', 'bodyweight', ['front plank', 'forearm plank', 'elbow plank', 'high plank', 'plank hold', 'weighted plank', 'rkc plank'], ST);
x('SIDE PLANK', SIDE_PLANK, 'sideplank', 'bodyweight', ['side planks', 'side bridge', 'side plank hold', 'side plank hip dip'], ST);
x('PLANK SHOULDER TAP', { ...PLANK, oblique: 0.9, 'delt.front': 0.4 }, 'plank', 'bodyweight', ['shoulder taps', 'plank taps']);
x('PLANK UP DOWN', { ...PLANK, ...TRI(0.6, 0.3), 'delt.front': 0.5 }, 'plank', 'bodyweight', ['up down plank', 'plank walk up', 'commando plank']);
x('DEAD BUG', DEAD_BUG, 'crunch', 'bodyweight', ['dead bugs', 'deadbug']);
x('HOLLOW HOLD', HOLLOW, 'crunch', 'bodyweight', ['hollow body hold', 'hollow rock', 'hollow body', 'banana hold']);
x('AB WHEEL', AB_WHEEL, 'plank', 'bodyweight', ['ab rollout', 'ab roller', 'rollout', 'ab wheel rollout', 'barbell rollout', 'barbell rollout from bench', 'kneeling rollout', 'stability ball rollout', 'body saw'], ST);
x('RUSSIAN TWIST', RUSSIAN_TWIST, 'twist', 'bodyweight', ['russian twists', 'weighted russian twist', 'med ball russian twist', 'seated twist', 'plate twist'], ST);
x('CABLE WOODCHOP', WOODCHOP, 'twist', 'cable', ['woodchop', 'wood chop', 'woodchopper', 'high to low woodchop', 'cable wood chop', 'cable chop'], { ...ST, pulley: 0.95 });
x('LOW TO HIGH WOODCHOP', WOODCHOP, 'twist', 'cable', ['cable lift', 'reverse woodchop', 'low to high chop', 'standing cable lift'], { pulley: 0.05 });
x('PALLOF PRESS', PALLOF, 'twist', 'cable', ['pallof', 'anti rotation press', 'band pallof press', 'pallof hold'], { pulley: 0.6 });
x('LANDMINE ROTATION', { oblique: 1, ...ABS(0.5), 'delt.front': 0.5, 'glute.max': 0.3 }, 'twist', 'barbell', ['landmine 180', 'landmine twist', 'rainbows']);
x('SIDE BEND', SIDE_BEND, 'twist', 'dumbbell', ['db side bend', 'dumbbell side bend', 'side bends', 'cable side bend', 'oblique side bend']);
x('BICYCLE CRUNCH', BICYCLE, 'crunch', 'bodyweight', ['bicycle crunches', 'bicycles', 'cross body crunch', 'elbow to knee crunch', 'elbow to knee']);
x('OBLIQUE CRUNCH', { oblique: 1, ...ABS(0.6, 0.4) }, 'crunch', 'bodyweight', ['side crunch', 'oblique crunches', 'decline oblique crunch']);
x('HEEL TOUCHES', HEEL_TOUCH, 'crunch', 'bodyweight', ['heel touch', 'alternating heel touch', 'heel taps']);
x('MOUNTAIN CLIMBER', MOUNTAIN, 'plank', 'bodyweight', ['mountain climbers', 'climbers', 'cross body mountain climber'], ST);
x('L SIT', L_SIT, 'legraise', 'bodyweight', ['l sit hold', 'l-sit', 'tuck l sit']);
x('DRAGON FLAG', DRAGON_FLAG, 'legraise', 'bodyweight', ['dragon flags']);
x('WINDSHIELD WIPER', WIPERS, 'legraise', 'bodyweight', ['windshield wipers', 'hanging windshield wiper', 'lying windshield wiper']);
x('STIR THE POT', STIR_POT, 'plank', 'bodyweight', ['stir the pot plank']);
x('SUITCASE CARRY', SUITCASE, 'carry', 'dumbbell', ['suitcase walk', 'single arm farmer carry', 'one arm carry']);

// Carries, Olympic lifts, kettlebells, strongman ──
x('FARMER CARRY', FARMER, 'carry', 'dumbbell', ["farmer's walk", 'farmers walk', 'farmer walk', 'farmers carry', 'trap bar carry', 'kb farmer carry', 'loaded carry', 'rickshaw carry', 'rickshaw'], ST);
x('OVERHEAD CARRY', OVERHEAD_CARRY, 'carry', 'dumbbell', ['waiter walk', 'overhead walk', 'kb overhead carry']);
x('FRONT RACK CARRY', { ...FARMER, ...ABS(0.6), 'forearm.flex': 0.5, biceps: 0.4, 'delt.front': 0.4, erector: 0.6 }, 'carry', 'dumbbell', ['rack carry', 'goblet carry']);
x('SANDBAG CARRY', BEAR_HUG_CARRY, 'carry', 'bodyweight', ['bear hug carry', 'sandbag bear hug', 'zercher carry', 'conans wheel', 'husafell stone']);
x('YOKE WALK', YOKE, 'carry', 'machine', ['yoke carry', 'yoke']);
x('POWER CLEAN', CLEAN, 'clean', 'barbell', ['clean', 'power cleans', 'hang power clean', 'squat clean', 'cleans', 'hang clean', 'muscle clean', 'clean from blocks'], ST);
x('DB CLEAN', CLEAN, 'clean', 'dumbbell', ['dumbbell clean', 'kettlebell clean', 'kb clean', 'dumbbell hang clean']);
x('CLEAN AND JERK', CLEAN_JERK, 'clean', 'barbell', ['clean & jerk', 'c and j', 'clean and jerks']);
x('CLEAN AND PRESS', CLEAN_PRESS, 'clean', 'barbell', ['clean & press', 'kb clean and press', 'db clean and press', 'man maker', 'man makers']);
x('SNATCH', SNATCH, 'clean', 'barbell', ['power snatch', 'hang snatch', 'squat snatch', 'muscle snatch', 'snatches', 'split snatch']);
x('DB SNATCH', SNATCH, 'clean', 'dumbbell', ['dumbbell snatch', 'kettlebell snatch', 'kb snatch', 'single arm db snatch']);
x('CLEAN PULL', HIGH_PULL, 'clean', 'barbell', ['snatch pull', 'clean high pull', 'snatch high pull', 'high pull', 'sumo deadlift high pull', 'sdhp', 'kb high pull']);
x('PUSH JERK', JERK, 'ohp', 'barbell', ['split jerk', 'jerk', 'power jerk', 'kb jerk', 'jerks']);
x('THRUSTER', THRUSTER, 'squat', 'barbell', ['thrusters', 'db thruster', 'kb thruster', 'barbell thruster', 'squat to press', 'wall ball', 'wall balls'], ST);
x('TURKISH GET UP', TGU, 'stand', 'dumbbell', ['tgu', 'get up', 'turkish getup', 'kb get up']);
x('KETTLEBELL WINDMILL', WINDMILL, 'twist', 'dumbbell', ['windmill', 'kb windmill', 'db windmill']);
x('KETTLEBELL HALO', HALO, 'raise', 'dumbbell', ['halo', 'kb halo', 'plate halo']);
x('KETTLEBELL FIGURE 8', { ...SWING, oblique: 0.5, ...ABS(0.4) }, 'swing', 'dumbbell', ['figure 8', 'figure eight', 'around the world']);
x('ATLAS STONE', ATLAS, 'hinge', 'bodyweight', ['atlas stones', 'stone load', 'stone to shoulder']);
x('SANDBAG LOAD', SANDBAG_LOAD, 'hinge', 'bodyweight', ['sandbag to shoulder', 'sandbag over shoulder', 'keg load']);
x('TIRE FLIP', TIRE_FLIP, 'hinge', 'bodyweight', ['tyre flip', 'tire flips', 'tyre flips']);
x('SLED PUSH', SLED_PUSH, 'run', 'machine', ['prowler push', 'sled pushes', 'prowler', 'prowler sprint']);
x('SLED PULL', SLED_BACKWARD, 'run', 'machine', ['backward sled drag', 'backward drag', 'sled drag', 'reverse sled drag', 'sled row']);
x('SLED HARNESS DRAG', SLED_FORWARD, 'run', 'machine', ['forward sled drag', 'forward drag', 'harness drag', 'sled sprint', 'sled drag harness']);
x('LOG PRESS', PUSH_PRESS, 'ohp', 'barbell', ['log clean and press', 'log lift', 'axle press', 'circus dumbbell', 'circus bell']);
x('AXLE DEADLIFT', { ...DEADLIFT, 'forearm.flex': 0.8 }, 'hinge', 'barbell', ['axle pull', 'fat bar deadlift']);
x('BATTLE ROPES', BATTLE_ROPES, 'stand', 'bodyweight', ['battle rope', 'battling ropes', 'rope waves', 'rope slams'], { cardio: true });
x('MED BALL SLAM', SLAM, 'stand', 'bodyweight', ['ball slam', 'slam ball', 'ball slams', 'medicine ball slam', 'overhead slam']);
x('MED BALL CHEST PASS', MED_BALL_THROW, 'stand', 'bodyweight', ['chest pass', 'medicine ball chest pass', 'med ball throw', 'medicine ball throw', 'chest throw', 'overhead throw', 'scoop toss']);
x('MED BALL ROTATIONAL THROW', ROTATIONAL_THROW, 'twist', 'bodyweight', ['rotational throw', 'side toss', 'med ball side throw', 'rotational med ball throw']);
x('SLEDGEHAMMER SWING', SLEDGEHAMMER, 'twist', 'bodyweight', ['sledgehammer', 'tire hammer', 'hammer slam']);
x('ROPE CLIMB', ROPE_CLIMB, 'pullup', 'bodyweight', ['rope climbs', 'legless rope climb']);
x('MUSCLE UP', MUSCLE_UP, 'pullup', 'bodyweight', ['muscle ups', 'bar muscle up', 'ring muscle up', 'kipping muscle up']);
x('FRONT LEVER', FRONT_LEVER, 'pullup', 'bodyweight', ['front lever hold', 'tuck front lever', 'front lever raise']);
x('BACK LEVER', BACK_LEVER, 'pullup', 'bodyweight', ['back lever hold', 'tuck back lever']);
x('PLANCHE', PLANCHE, 'plank', 'bodyweight', ['planche hold', 'tuck planche', 'planche lean']);
x('HANDSTAND', { 'delt.front': 1, 'traps.upper': 0.6, serratus: 0.6, ...TRI(0.5, 0.3), ...ABS(0.4), 'forearm.flex': 0.4, 'traps.lower': 0.3 }, 'ohp', 'bodyweight', ['handstand hold', 'wall handstand', 'freestanding handstand']);
x('SUPPORT HOLD', BAR_HOLD_DIP_SUPPORT, 'dip', 'bodyweight', ['dip hold', 'ring support', 'top dip hold']);

// Plyometrics, bodyweight conditioning ──
x('BOX JUMP', JUMP, 'jump', 'bodyweight', ['box jumps', 'seated box jump', 'step down box jump', 'vertical jump', 'jump', 'jumps'], ST);
x('DEPTH JUMP', { ...JUMP, ...CALF(0.9, 0.8) }, 'jump', 'bodyweight', ['depth jumps', 'drop jump', 'depth drop']);
x('BROAD JUMP', BROAD_JUMP, 'jump', 'bodyweight', ['standing long jump', 'long jump', 'broad jumps']);
x('TUCK JUMP', TUCK_JUMP, 'jump', 'bodyweight', ['tuck jumps', 'knee tuck jump']);
x('BOUNDING', BOUND, 'run', 'bodyweight', ['bounds', 'bound', 'single leg bound', 'alternate leg bound']);
x('LATERAL BOX JUMP', LATERAL_JUMP, 'jump', 'bodyweight', ['lateral jumps', 'lateral hops', 'side hops', 'lateral bound', 'cone hops', 'hurdle hops']);
x('SKATER JUMP', SKATER, 'jump', 'bodyweight', ['skaters', 'skater hops', 'speed skater']);
x('POGO JUMP', POGO, 'jump', 'bodyweight', ['pogo hops', 'pogos', 'ankle hops', 'pogo jumps']);
x('JUMPING JACK', JACKS, 'jacks', 'bodyweight', ['jumping jacks', 'star jumps', 'jacks', 'seal jacks'], { cardio: true });
x('BURPEE', BURPEE, 'burpee', 'bodyweight', ['burpees', 'burpee box jump', 'burpee pull up', 'bar facing burpee', 'chest to floor burpee'], { staple: true, cardio: true });
x('SPRAWL', SPRAWL, 'burpee', 'bodyweight', ['sprawls', 'half burpee', 'squat thrust', 'squat thrusts']);
x('JUMP ROPE', ROPE_SKIP, 'jacks', 'bodyweight', ['skipping', 'skipping rope', 'rope jumping', 'jump rope skips', 'double unders', 'double under', 'single unders'], { cardio: true });
x('HIGH KNEES', HIGH_KNEES, 'run', 'bodyweight', ['high knee', 'high knee run', 'running in place', 'a skips', 'a skip', 'fast feet'], { cardio: true });
x('BUTT KICKS', BUTT_KICKS, 'run', 'bodyweight', ['butt kickers', 'heel flicks', 'butt kick'], { cardio: true });
x('BEAR CRAWL', BEAR_CRAWL, 'plank', 'bodyweight', ['bear crawls', 'bear plank', 'bear hold']);
x('CRAB WALK', CRAB_WALK, 'plank', 'bodyweight', ['crab walks', 'crab crawl', 'reverse plank', 'tabletop hold']);
x('INCHWORM', INCHWORM, 'plank', 'bodyweight', ['inchworms', 'walkout', 'walk outs']);
x('SHADOW BOXING', SHADOW_BOX, 'stand', 'bodyweight', ['shadow box', 'boxing', 'heavy bag', 'bag work', 'punching bag', 'pad work', 'kickboxing'], { cardio: true });

// Cardio ──
x('SPRINT', SPRINT, 'run', 'bodyweight', ['sprints', 'sprinting', 'hill sprint', 'hill sprints', 'shuttle run', 'shuttle runs', 'suicides', 'wind sprints'], { cardio: true });
x('ROWING MACHINE', ROWER, 'rower', 'machine', ['rower', 'rowing', 'erg', 'ergometer', 'concept 2', 'concept2', 'indoor rowing', 'row erg', 'rowing erg'], { cardio: true });
x('EXERCISE BIKE', BIKE, 'bike', 'machine', ['bike', 'stationary bike', 'cycling', 'spin bike', 'spin class', 'spinning', 'peloton', 'recumbent bike', 'indoor cycling', 'bicycling'], { cardio: true });
x('AIR BIKE', AIR_BIKE, 'bike', 'machine', ['assault bike', 'echo bike', 'fan bike', 'airdyne'], { cardio: true });
x('ELLIPTICAL', ELLIPTICAL, 'run', 'machine', ['cross trainer', 'elliptical trainer', 'elliptical machine'], { cardio: true });
x('STAIRMASTER', STAIRS, 'lunge', 'machine', ['stair climber', 'stairs', 'step mill', 'stepmill', 'stair machine', 'stair climbing'], { cardio: true });
x('INCLINE WALK', INCLINE_WALK, 'run', 'machine', ['incline treadmill walk', 'treadmill incline walk', 'incline treadmill', 'uphill walk'], { cardio: true });
x('SKI ERG', SKI_ERG, 'pulldown', 'machine', ['skierg', 'ski machine', 'ski'], { cardio: true });
x('SWIMMING', SWIM, 'stand', 'bodyweight', ['swim', 'laps', 'freestyle swim', 'pool'], { cardio: true });
x('HIKING', HIKE, 'run', 'bodyweight', ['hike', 'rucking', 'ruck', 'trail walk'], { cardio: true });
x('RUN', RUN_SHARE, 'run', 'bodyweight', ['running', 'jog', 'jogging', 'treadmill run', 'treadmill', 'outdoor run', 'trail running', 'treadmill running', 'treadmill jogging'], { cardio: true });
x('WALKING', WALK_SHARE, 'run', 'bodyweight', ['walk', 'treadmill walk', 'brisk walk'], { cardio: true });

export const LIBRARY: readonly LibraryExercise[] = LIST;

// ── finding an exercise by whatever someone calls it ─────────────────────

// Spellings folded together before words are compared.
const PHRASES: [RegExp, string][] = [
  [/\bdumb ?bells?\b|\bdbs\b/g, 'db'], [/\bbar ?bells?\b/g, 'bb'], [/\bkettle ?bells?\b|\bkbs\b/g, 'kb'],
  [/\be ?z[ -]?bar\b|\bez\b/g, 'ez'], [/\bsmith machine\b/g, 'smith'],
  [/\bhammer strength\b|\bleverage\b|\bplate loaded\b|\bnautilus\b|\blife fitness\b|\btechnogym\b/g, 'machine'], [/\bmachine(?: machine)+\b/g, 'machine'],
  [/\bpress[ -]?ups?\b|\bpush[ -]?ups?\b/g, 'push up'], [/\bpull[ -]?ups?\b/g, 'pull up'], [/\bchin[ -]?ups?\b/g, 'chin up'],
  [/\bsit[ -]?ups?\b/g, 'sit up'], [/\bstep[ -]?ups?\b/g, 'step up'], [/\bv[ -]?ups?\b/g, 'v up'], [/\bget[ -]?ups?\b/g, 'get up'],
  [/\bpull ?downs?\b/g, 'pulldown'], [/\bpush ?downs?\b/g, 'pushdown'], [/\bpress ?downs?\b/g, 'pushdown'], [/\bpull ?overs?\b/g, 'pullover'],
  [/\bfl(?:ye|ie|y)s?\b|\bflyes\b/g, 'fly'], [/\bt[ -]?bar\b/g, 't bar'], [/\bv[ -]?bar\b/g, 'v bar'],
  [/\b(?:1|one|single)[ -]?(?:arm(?:ed)?|hand(?:ed)?)\b/g, 'onearm'], [/\b(?:1|one|single)[ -]?leg(?:ged)?\b/g, 'oneleg'],
  [/\bstiff[ -]?leg(?:ged)?\b/g, 'stiff leg'], [/\bassist(?:ed|ance)?\b/g, 'assist'], [/\bhyper ?extensions?\b|\bhypers?\b/g, 'hyperextension'],
  [/\bdead ?lifts?\b/g, 'deadlift'], [/\bskull ?crushers?\b/g, 'skull crusher'], [/\bcross ?overs?\b/g, 'crossover'],
  [/\bbi(?:cep)?s\b|\bbicep\b/g, 'bicep'], [/\btri(?:cep)?s\b|\btricep\b/g, 'tricep'], [/\bcalves\b/g, 'calf'],
  [/\bwood ?chop(?:per)?s?\b/g, 'woodchop'], [/\bab ?wheel\b/g, 'ab wheel'], [/\bsit ?ups?\b/g, 'sit up'],
];
// Words that never decide which exercise it is.
const FILLER = new Set(['the', 'a', 'an', 'of', 'on', 'with', 'using', 'my', 'some', 'set', 'sets', 'rep', 'reps', 'kg', 'kgs', 'lb', 'lbs', 'pound', 'pounds', 'kilo', 'kilos', 'x', 'for', 'did', 'just', 'exercise', 'exercises', 'alternating', 'alternate', 'alt', 'weighted', 'heavy', 'light', 'grip', 'and', 'to', 'in', 'at', 'style', 'from']);

function stem(w: string): string {
  if (w.length <= 3) return w;
  if (/(ch|sh|ss|x)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) return w.slice(0, -1);
  return w;
}

/** Name → its comparable words: lower-case, spellings folded, plurals and filler dropped. */
export function tokens(name: string): string[] {
  let t = ` ${name.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ')} `;
  for (const [re, to] of PHRASES) t = t.replace(re, to);
  return t.split(' ').filter(w => w && !/^\d+$/.test(w)).map(stem).filter(w => !FILLER.has(w));
}

// Words that change which exercise it is (incline vs flat, seated vs standing…)
// count double; kit words count less (a cable fly is still a fly).
const DECIDING = new Set(['incline', 'decline', 'reverse', 'seated', 'standing', 'lying', 'close', 'wide', 'sumo', 'front', 'overhead', 'hammer', 'preacher', 'romanian', 'stiff', 'bulgarian', 'split', 'hack', 'goblet', 'rear', 'face', 'lateral', 'upright', 'hip', 'leg', 'calf', 'glute', 'nordic', 'concentration', 'spider', 'neutral', 'underhand', 'assist', 'chest', 'high', 'low', 'pause', 'box', 'jump', 'walking', 'side', 'knee', 'hanging', 'oblique', 'donkey', 'trap', 'hex', 'deficit', 'snatch', 'clean', 'push', 'pull', 'chin', 'crunch', 'plank', 'curl', 'row', 'fly', 'raise', 'squat', 'lunge', 'press', 'deadlift', 'extension', 'dip', 'shrug', 'thrust', 'bridge', 'kickback', 'pulldown', 'pushdown', 'pullover']);
const KIT = new Set(['db', 'bb', 'kb', 'cable', 'machine', 'smith', 'band', 'ez', 'plate', 'rope', 'bar', 'landmine', 'trx', 'ring', 'bench', 'onearm', 'oneleg']);
// Posture changes less than grip or angle (a standing reverse curl is a reverse curl);
// one arm or one leg less still, but more than the kit.
const POSTURE = new Set(['standing', 'seated', 'lying', 'kneeling']);
const weight = (w: string) => (w === 'onearm' || w === 'oneleg' ? 0.8 : KIT.has(w) ? 0.6 : POSTURE.has(w) ? 1.5 : DECIDING.has(w) ? 2 : 1);

type Key = { ex: LibraryExercise; words: string[]; joined: string };
let INDEX: Key[] | null = null;
const index = (): Key[] => (INDEX ??= LIBRARY.flatMap(ex => [ex.name, ...ex.aka].map(n => {
  const words = tokens(n);
  return { ex, words, joined: words.join(' ') };
})));

const cache = new Map<string, LibraryExercise | null>();

/** The library's exercise for a name as people say it ("pec fly machine",
 *  "DB RDLs", "chin assist machine pullup"), or null when nothing fits well
 *  enough to trust. Exact wording first; otherwise the name whose words are
 *  all present and say the most (deciding words count double, kit words
 *  less), ties going to the one nearest the end — English puts the
 *  exercise last ("leg press CALF RAISE"). */
export function findExercise(name: string): LibraryExercise | null {
  const key = name.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key)!;
  const words = tokens(name);
  const joined = words.join(' ');
  let best: { ex: LibraryExercise; score: number; end: number } | null = null;
  if (words.length) {
    const have = new Set(words);
    for (const k of index()) {
      if (!k.words.length) continue;
      let score: number, end: number;
      if (k.joined === joined) { score = 1000; end = words.length; }
      else if (k.words.every(w => have.has(w))) {
        score = k.words.reduce((a, w) => a + weight(w), 0) - 0.15 * (words.length - k.words.length);
        end = Math.max(...k.words.map(w => words.lastIndexOf(w)));
        // A lone kit word ("cable") is not a match.
        if (k.words.every(w => KIT.has(w)) || score < 1) continue;
        // A deciding word the key lacks rules it out when the library has that variant of it.
        if (words.some(w => DECIDING.has(w) && !k.words.includes(w) && hasVariant(k, w, have))) continue;
      } else continue;
      if (!best || score > best.score || (score === best.score && end > best.end)) best = { ex: k.ex, score, end };
    }
  }
  const out = best?.ex ?? null;
  cache.set(key, out);
  return out;
}

// "dumbbell seated one leg calf raise" must not settle for STANDING CALF
// RAISE's "one leg calf raise": SEATED CALF RAISE is that lift plus "seated".
// A word with no such variant ("smith calf raise") doesn't rule anything out.
// The variant must also be on kit the query allows (LYING CABLE CURL is no
// variant of "lying barbell curl").
function hasVariant(k: Key, word: string, query: Set<string>): boolean {
  return index().some(o => o.ex !== k.ex && o.words.includes(word)
    && k.words.every(w => KIT.has(w) || o.words.includes(w))
    && o.words.every(w => !KIT.has(w) || query.has(w) || w === 'onearm' || w === 'oneleg'));
}

/** Staples, as [name, groups] — the coach's ADD tray and the GO list draw from these. */
export const STAPLES: [string, MuscleGroup[]][] = LIBRARY.filter(e => e.staple && !e.cardio).map(e => [e.name, e.groups]);
