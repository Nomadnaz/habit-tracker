// BODY's lift box: type any exercise and the figure lights the muscles it
// works (the library's per-muscle shares, lib/exercise-library.ts), with
// the main ones named underneath. SEND TO PUCK starts it on the puck — the
// same command as LOG WORKOUT's, so the sets the puck measures log to that
// lift today. HOW TO opens its exercise card.

import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, F } from '@/lib/theme';
import { LIBRARY, findExercise, tokens, type Share } from '@/lib/exercise-library';
import { muscleWord } from '@/lib/coach';
import { exerciseFor } from '@/lib/routine';
import { bleBridge } from '@/lib/ble-bridge';
import { DotIcon } from '@/components/today/DotIcon';

/** Up to four library lifts whose names contain every word typed, staples first. */
function suggest(q: string): string[] {
  const words = tokens(q);
  if (!words.length) return [];
  const hits = LIBRARY.filter(e => !e.cardio && words.every(w => tokens(e.name).some(t => t.startsWith(w))));
  return [...hits].sort((a, b) => Number(b.staple) - Number(a.staple) || a.name.length - b.name.length).slice(0, 4).map(e => e.name);
}

export function LiftFinder({ onMuscles, onHowTo }: {
  /** The muscles the typed lift works, for the figure — null when the box is empty. */
  onMuscles: (share: Share | null) => void;
  onHowTo: (name: string) => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [sent, setSent] = useState<'idle' | 'sending' | 'sent'>('idle');
  const match = useMemo(() => (q.trim().length >= 3 ? findExercise(q) : null), [q]);
  const options = useMemo(() => suggest(q).filter(n => n !== match?.name), [q, match]);
  const name = (match?.name ?? q.trim()).toUpperCase();
  const top = match ? Object.entries(match.muscles).sort((a, b) => b[1] - a[1]).slice(0, 4) : [];

  useEffect(() => { onMuscles(match ? match.muscles : null); }, [match]);
  useEffect(() => { setSent('idle'); }, [name]);

  async function send() {
    if (!name || sent === 'sending') return;
    setSent('sending');
    const ex = await exerciseFor(name, match?.groups);
    const ok = await bleBridge.sendToPuck(ex.id, ex.name, ex.weightKg).catch(() => false);
    if (!ok) {
      setSent('idle');
      Alert.alert('Puck not connected', 'Turn the puck on and keep it near your phone, then try again.', [
        { text: 'OK', style: 'cancel' },
        { text: 'Open Puck', onPress: () => router.push('/ble-bridge') },
      ]);
      return;
    }
    setSent('sent');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  return (
    <View style={st.wrap}>
      <View style={st.field}>
        <DotIcon kind="train" tone={C.hot} dot={1.6} gap={0.4} />
        <TextInput
          value={q} onChangeText={setQ} placeholder="TYPE A LIFT" placeholderTextColor={C.faint}
          style={st.input} autoCapitalize="characters" autoCorrect={false} returnKeyType="done"
        />
        {!!q && <Pressable onPress={() => setQ('')} hitSlop={10}><Text style={st.clear}>CLEAR</Text></Pressable>}
      </View>

      {options.length > 0 && (
        <View style={st.options}>
          {options.map(n => (
            <Pressable key={n} onPress={() => { Haptics.selectionAsync(); setQ(n); }} style={({ pressed }) => [st.option, pressed && { backgroundColor: C.raised }]}>
              <Text style={st.optionText} numberOfLines={1}>{n.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {!!q.trim() && (
        <View style={st.result}>
          <Text style={st.name} numberOfLines={2}>{name}</Text>
          {match ? (
            <View style={st.muscles}>
              {top.map(([m, share]) => (
                <View key={m} style={st.muscle}>
                  <View style={[st.share, { opacity: 0.35 + share * 0.65 }]} />
                  <Text style={st.muscleText}>{muscleWord(m)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={st.none}>Not in the library yet. It still sends; its muscles are guessed from the name.</Text>
          )}
          <View style={st.actions}>
            <Pressable onPress={send} style={({ pressed }) => [st.puck, pressed && { opacity: 0.8 }]} accessibilityLabel="Send to puck">
              <View style={st.puckSquare} />
              <Text style={st.puckText}>{sent === 'sending' ? 'SENDING' : sent === 'sent' ? 'SENT · AGAIN' : 'SEND TO PUCK'}</Text>
            </Pressable>
            {match && (
              <Pressable onPress={() => onHowTo(match.name)} style={({ pressed }) => [st.howTo, pressed && { backgroundColor: C.raised }]}>
                <Text style={st.howToText}>HOW TO</Text>
              </Pressable>
            )}
          </View>
          {sent === 'sent' && <Text style={st.hint}>Countdown is on the puck. Hold it still, then lift. Sets log to this lift today.</Text>}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginTop: 6 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: C.lineHi, paddingHorizontal: 4, minHeight: 46 },
  input: { flex: 1, fontFamily: F.dot, fontSize: 15, color: C.ink, letterSpacing: 1.5, paddingVertical: 10, minWidth: 0 },
  clear: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 2 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  option: { borderWidth: 1, borderColor: C.line, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 6, maxWidth: '100%' },
  optionText: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 1 },
  result: { marginTop: 14, gap: 10 },
  name: { fontFamily: F.dot, fontSize: 20, color: C.live, letterSpacing: 1 },
  muscles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  muscle: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  share: { width: 7, height: 7, backgroundColor: C.live },
  muscleText: { fontFamily: F.dot, fontSize: 10, color: C.ink, letterSpacing: 1 },
  none: { fontFamily: F.mono, fontSize: 12, color: C.dim, lineHeight: 17 },
  actions: { flexDirection: 'row', gap: 8 },
  puck: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.hot, borderRadius: 999, minHeight: 46 },
  puckSquare: { width: 9, height: 9, backgroundColor: C.onHot },
  puckText: { fontFamily: F.dot, fontSize: 12, color: C.onHot, letterSpacing: 2 },
  howTo: { borderWidth: 1, borderColor: C.lineHi, borderRadius: 999, paddingHorizontal: 18, justifyContent: 'center', minHeight: 46 },
  howToText: { fontFamily: F.dot, fontSize: 12, color: C.ink, letterSpacing: 2 },
  hint: { fontFamily: F.mono, fontSize: 11, color: C.dim, lineHeight: 16 },
});
