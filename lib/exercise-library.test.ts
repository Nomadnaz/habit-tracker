import { describe, expect, it } from 'vitest';
import { LIBRARY, findExercise, tokens } from './exercise-library';
import { RECOVERY_MUSCLES } from './muscle-recovery';

const named = (q: string) => findExercise(q)?.name ?? null;

describe('exercise library', () => {
  it('only uses muscles the BODY figure has, with shares in (0, 1]', () => {
    const known = new Set(RECOVERY_MUSCLES);
    for (const ex of LIBRARY) {
      for (const [m, v] of Object.entries(ex.muscles)) {
        expect(known.has(m), `${ex.name}: ${m}`).toBe(true);
        expect(v > 0 && v <= 1, `${ex.name}: ${m}=${v}`).toBe(true);
      }
      expect(Math.max(...Object.values(ex.muscles)), `${ex.name} has no prime mover`).toBeGreaterThanOrEqual(0.7);
    }
  });

  it('has one entry per name, and every name and alias finds its own exercise', () => {
    const names = LIBRARY.map(e => e.name);
    expect(new Set(names).size).toBe(names.length);
    const wrong: string[] = [];
    for (const ex of LIBRARY) for (const n of [ex.name, ...ex.aka]) {
      const got = named(n);
      if (got !== ex.name) wrong.push(`${n} → ${got} (want ${ex.name})`);
    }
    expect(wrong).toEqual([]);
  });

  it('folds spellings', () => {
    expect(tokens('Dumbbell Flyes')).toEqual(tokens('DB FLY'));
    expect(tokens('press-ups')).toEqual(tokens('push up'));
    expect(tokens('Pullups')).toEqual(tokens('pull up'));
  });

  it('finds lifts the way people say them', () => {
    expect(named('pec fly machine')).toBe('PEC DECK');
    expect(named('5 reps of 86kg pec fly machine')).toBe('PEC DECK');
    expect(named('CHIN ASSIST MACHINE PULLUP')).toBe('ASSISTED CHIN UP');
    expect(named('INCLINE PUSHUPS')).toBe('INCLINE PUSH UP');
    expect(named('DB RDLs')).toBe('DB ROMANIAN DEADLIFT');
    expect(named('leg press calf raise')).toBe('LEG PRESS CALF RAISE');
    expect(named('smith calf raise')).toBe('STANDING CALF RAISE');
    expect(named('seated calf raises')).toBe('SEATED CALF RAISE');
    expect(named('bodyweight squat')).toBe('BODYWEIGHT SQUAT');
    expect(named('lat pulldown machine')).toBe('LAT PULLDOWN');
    expect(named('reverse fly')).toBe('REAR DELT FLY');
    expect(named('incline dumbbell flyes')).toBe('INCLINE DB FLY');
    expect(named('hammer curls')).toBe('HAMMER CURL');
    expect(named('bulgarians')).toBe('BULGARIAN SPLIT SQUAT');
    expect(named('rope tricep pushdown')).toBe('ROPE PUSHDOWN');
    expect(named('Machine Fly')).toBe('PEC DECK');
    expect(named('farmers walk')).toBe('FARMER CARRY');
    expect(named('hex bar deadlift')).toBe('TRAP BAR DEADLIFT');
    expect(named('one arm dumbbell bench press')).toBe('DUMBBELL BENCH PRESS');
    expect(named('hammer strength chest press')).toBe('MACHINE CHEST PRESS');
    expect(named('standing dumbbell reverse curl')).toBe('REVERSE CURL');
    expect(named('dumbbell seated one-leg calf raise')).toBe('SEATED CALF RAISE');
    expect(named('lying high bench barbell curl')).not.toBe('BENCH PRESS');
    expect(named('MYSTERY MACHINE')).toBeNull();
  });

  it('gets the contested ones right', () => {
    const m = (q: string) => findExercise(q)!.muscles;
    // Hands up is the easier, lower-chest push-up; feet up is the upper-chest one.
    expect(m('incline push up')['pec.lower']).toBeGreaterThan(m('incline push up')['pec.upper']);
    expect(m('decline push up')['pec.upper']).toBeGreaterThan(m('decline push up')['pec.lower']);
    // Squats barely use rectus femoris; leg extensions do.
    expect(m('back squat')['quad.rf']).toBeLessThan(0.5);
    expect(m('leg extension')['quad.rf']).toBe(1);
    // Bent knee → soleus.
    expect(m('seated calf raise').soleus).toBe(1);
    expect(m('seated calf raise')['gastro.med']).toBeLessThan(0.5);
    // Arm overhead → long head.
    expect(m('overhead tricep extension')['triceps.long']).toBe(1);
    expect(m('reverse curl').brachiorad).toBe(1);
    expect(m('hip thrust')['glute.max']).toBe(1);
    expect(m('hip thrust')['ham.bf']).toBeLessThan(0.5);
  });

  it('marks assisted machines, and gives every cable move a pulley height', () => {
    expect(findExercise('assisted pull up')!.assisted).toBe(true);
    for (const ex of LIBRARY) if (ex.kit === 'cable' && !/PULLDOWN|SEATED CABLE ROW|WIDE GRIP CABLE ROW/.test(ex.name)) {
      expect(ex.pulley, ex.name).toBeTypeOf('number');
    }
  });
});
