/**
 * IMA ADPCM decoder — mirrors main/adpcm.c and tools/adpcm_decode.py exactly.
 * Low nibble first, then high nibble. Tables must stay in lockstep with the firmware.
 */

const INDEX_TABLE = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8];

const STEP_TABLE = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17,
  19, 21, 23, 25, 28, 31, 34, 37, 41, 45,
  50, 55, 60, 66, 73, 80, 88, 97, 107, 118,
  130, 143, 157, 173, 190, 209, 230, 253, 279, 307,
  337, 371, 408, 449, 494, 544, 598, 658, 724, 796,
  876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066,
  2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358,
  5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899,
  15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767,
];

export interface AdpcmState {
  predictor: number;
  index: number;
}

export function makeAdpcmState(): AdpcmState {
  return { predictor: 0, index: 0 };
}

function decodeNibble(nibble: number, state: AdpcmState): number {
  const step = STEP_TABLE[state.index];
  const sign = nibble & 8;
  const delta = nibble & 7;

  let vpdiff = step >> 3;
  if (delta & 4) vpdiff += step;
  const step1 = step >> 1;
  if (delta & 2) vpdiff += step1;
  const step2 = step1 >> 1;
  if (delta & 1) vpdiff += step2;

  let predictor = sign ? state.predictor - vpdiff : state.predictor + vpdiff;
  if (predictor > 32767) predictor = 32767;
  if (predictor < -32768) predictor = -32768;
  state.predictor = predictor;

  let index = state.index + INDEX_TABLE[nibble];
  if (index < 0) index = 0;
  if (index > 88) index = 88;
  state.index = index;

  return predictor;
}

/** Decode one ADPCM frame into PCM int16 samples (two per byte, low nibble first). */
export function adpcmDecode(data: Uint8Array, state: AdpcmState): number[] {
  const samples: number[] = [];
  for (let i = 0; i < data.length; i++) {
    samples.push(decodeNibble(data[i] & 0x0f, state));
    samples.push(decodeNibble((data[i] >> 4) & 0x0f, state));
  }
  return samples;
}
