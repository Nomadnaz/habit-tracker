// BODY's edit panel, docked over the bottom of the screen while you arrange
// the readouts round the figure. Adding one takes three picks, in any
// order: a POINT (tap the body — that's where its line goes), a MODULE (the
// revolver) and a SLOT (tap an empty one beside the figure, or a readout to
// replace it). Once all three are in, it's placed. Tapping a readout picks
// it instead: tap the body to move its line, a slot to move it (another
// readout swaps), or change it to a different module or take it off.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C, F, MOD } from '@/lib/theme';
import { MODULES, type HudModule, type Spot } from '@/lib/body-hud';
import { DotIcon } from '@/components/today/DotIcon';
import { Revolver, type RevolverItem } from './Revolver';

export type Draft = { id?: HudModule; slot?: number; spot?: Spot };

const DRUM = 156;

export function EditPanel({ draft, pinOn, items, swapItems, onPick, onSwap, onUseHome, onRemove, onDeselect, onReset, onDone }: {
  draft: Draft;
  /** The readout picked for editing, if any. */
  pinOn: HudModule | null;
  /** Modules not on the body — the revolver's when adding. */
  items: RevolverItem[];
  /** Every other module — the revolver's when changing a picked readout. */
  swapItems: RevolverItem[];
  onPick: (id: HudModule) => void;
  onSwap: (id: HudModule) => void;
  onUseHome: () => void;
  onRemove: () => void;
  onDeselect: () => void;
  onReset: () => void;
  onDone: () => void;
}) {
  const [changing, setChanging] = useState(false);
  const [open, setOpen] = useState(true);

  const head = (
    <Pressable onPress={() => setOpen(o => !o)} style={st.head} hitSlop={6}>
      <View style={st.grab} />
      <View style={st.headRow}>
        <Text style={st.title}>{pinOn ? 'EDIT READOUT' : 'ADD A READOUT'}</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={onReset} hitSlop={8}><Text style={st.link}>RESET</Text></Pressable>
        <Pressable onPress={onDone} hitSlop={8} style={st.done}><Text style={st.doneText}>DONE</Text></Pressable>
      </View>
    </Pressable>
  );

  if (pinOn) {
    const tone = MOD[pinOn];
    return (
      <View style={st.panel}>
        {head}
        {open && (
          <>
            <View style={st.picked}>
              <DotIcon kind={pinOn} tone={tone} dot={2.4} gap={0.6} />
              <Text style={[st.pickedWord, { color: tone }]}>{MODULES[pinOn].word}</Text>
              <View style={{ flex: 1 }} />
              <Pressable onPress={onDeselect} hitSlop={8}><Text style={st.link}>CANCEL</Text></Pressable>
            </View>
            <Text style={st.hint}>Tap the body to move its line. Tap an empty slot to move it there, or another readout to swap the two.</Text>
            {changing && (
              <Revolver items={swapItems} height={DRUM} picked={null} onPick={id => { setChanging(false); onSwap(id); }} />
            )}
            <View style={st.buttons}>
              <Pressable onPress={() => setChanging(c => !c)} style={({ pressed }) => [st.btn, changing && st.btnOn, pressed && { opacity: 0.8 }]}>
                <Text style={[st.btnText, changing && { color: C.onHot }]}>{changing ? 'KEEP IT' : 'CHANGE MODULE'}</Text>
              </Pressable>
              <Pressable onPress={onRemove} style={({ pressed }) => [st.btn, st.btnAlert, pressed && { opacity: 0.8 }]}>
                <Text style={[st.btnText, { color: C.alert }]}>TAKE OFF</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    );
  }

  const steps: { n: string; word: string; done: boolean; value?: string; tone?: string }[] = [
    { n: '1', word: 'POINT', done: !!draft.spot },
    { n: '2', word: 'MODULE', done: !!draft.id, value: draft.id ? MODULES[draft.id].word : undefined, tone: draft.id ? MOD[draft.id] : undefined },
    { n: '3', word: 'SLOT', done: draft.slot != null, value: draft.slot != null ? String(draft.slot + 1).padStart(2, '0') : undefined },
  ];
  const next = !draft.spot ? 'Tap the body where its line should go.'
    : !draft.id ? 'Turn the revolver and tap a module.'
    : 'Tap an empty slot beside the figure, or a readout to replace it.';
  return (
    <View style={st.panel}>
      {head}
      {open && (
        <>
          <View style={st.steps}>
            {steps.map(s => (
              <View key={s.n} style={[st.step, s.done && { borderColor: s.tone ?? C.live }]}>
                {s.done
                  ? <View style={[st.stepDot, { backgroundColor: s.tone ?? C.live }]} />
                  : <Text style={st.stepN}>{s.n}</Text>}
                <View style={{ flexShrink: 1 }}>
                  <Text style={[st.stepWord, s.done && { color: C.ink }]}>{s.word}</Text>
                  {!!s.value && <Text style={[st.stepValue, { color: s.tone ?? C.ink }]} numberOfLines={1}>{s.value}</Text>}
                </View>
              </View>
            ))}
          </View>
          <View style={st.nextRow}>
            <Text style={[st.hint, { flex: 1 }]}>{next}</Text>
            {draft.id && !draft.spot && (
              <Pressable onPress={onUseHome} hitSlop={6} style={st.home}><Text style={st.homeText}>USUAL SPOT</Text></Pressable>
            )}
          </View>
          {items.length > 0
            ? <Revolver items={items} height={DRUM} picked={draft.id ?? null} onPick={onPick} />
            : <Text style={[st.hint, { paddingVertical: 18 }]}>Every module is on the body. Tap one to move, change or take it off.</Text>}
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  panel: {
    position: 'absolute', left: 8, right: 8, bottom: 8, borderRadius: 20, borderWidth: 1, borderColor: C.lineHi,
    backgroundColor: C.surface, paddingHorizontal: 12, paddingBottom: 12, gap: 8,
    shadowColor: C.bg, shadowOpacity: 0.7, shadowRadius: 20, shadowOffset: { width: 0, height: -6 },
  },
  head: { paddingTop: 6, gap: 6 },
  grab: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.lineHi },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: { fontFamily: F.dot, fontSize: 10, color: C.hot, letterSpacing: 2.5 },
  link: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 2 },
  done: { backgroundColor: C.hot, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  doneText: { fontFamily: F.dot, fontSize: 10, color: C.onHot, letterSpacing: 2 },
  steps: { flexDirection: 'row', gap: 6 },
  step: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, minHeight: 40 },
  stepN: { fontFamily: F.dot, fontSize: 12, color: C.faint, width: 8 },
  stepDot: { width: 8, height: 8 },
  stepWord: { fontFamily: F.dot, fontSize: 8, color: C.dim, letterSpacing: 1.5 },
  stepValue: { fontFamily: F.dot, fontSize: 9, letterSpacing: 1, marginTop: 2 },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hint: { fontFamily: F.mono, fontSize: 11, color: C.dim, lineHeight: 15 },
  home: { borderWidth: 1, borderColor: C.lineHi, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  homeText: { fontFamily: F.dot, fontSize: 8, color: C.ink, letterSpacing: 1.5 },
  picked: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 4 },
  pickedWord: { fontFamily: F.dot, fontSize: 18, letterSpacing: 1.5 },
  buttons: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, borderWidth: 1, borderColor: C.lineHi, borderRadius: 999, minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  btnOn: { backgroundColor: C.hot, borderColor: C.hot },
  btnAlert: { borderColor: C.alert },
  btnText: { fontFamily: F.dot, fontSize: 10, color: C.ink, letterSpacing: 2 },
});
