// The puck's ASK screen, on the phone. Same choreography as screen_ask.c:
// REC (blinking square, 425/425 ms) → square flies up on release → transcript
// types out at 26 ms/char → square breathes while thinking → checkmark pops
// and draws → reply types out → stat chips stagger in 70 ms apart → auto-close
// after 3.5 s. Tap anywhere to dismiss; OPEN CHAT continues in the thread.
import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { C, F, SPRING, numFace } from '@/lib/theme';
import { useAssistant, recDismiss, openChat } from '@/lib/assistant';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const TYPE_MS = 26;
const AUTO_CLOSE_MS = 3500;

export function useTypewriter(text: string, run: boolean, ms = TYPE_MS) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) { setN(0); return; }
    setN(0);
    const id = setInterval(() => setN(v => (v >= text.length ? (clearInterval(id), v) : v + 1)), ms);
    return () => clearInterval(id);
  }, [text, run, ms]);
  return text.slice(0, n);
}

export function RecOverlay() {
  const { phase, transcript, reply } = useAssistant();
  const visible = phase !== 'idle';

  const fade = useRef(new Animated.Value(0)).current;
  const sq = useRef(new Animated.Value(1)).current;      // square opacity (blink / breathe)
  const sqScale = useRef(new Animated.Value(0)).current; // pop-in
  const lift = useRef(new Animated.Value(0)).current;    // 0 = centre, 1 = parked up top
  const check = useRef(new Animated.Value(0)).current;   // 0..1 stroke draw
  const checkScale = useRef(new Animated.Value(0.4)).current;
  const [secs, setSecs] = useState(0);
  const loop = useRef<Animated.CompositeAnimation | null>(null);

  // overlay in/out
  useEffect(() => {
    Animated.timing(fade, { toValue: visible ? 1 : 0, duration: visible ? 160 : 220, useNativeDriver: true }).start();
    if (!visible) { lift.setValue(0); check.setValue(0); checkScale.setValue(0.4); sqScale.setValue(0); }
  }, [visible]);

  // per-phase motion
  useEffect(() => {
    loop.current?.stop();
    if (phase === 'rec') {
      setSecs(0);
      Animated.spring(sqScale, { toValue: 1, ...SPRING.pop }).start();
      loop.current = Animated.loop(Animated.sequence([
        Animated.timing(sq, { toValue: 1, duration: 0, useNativeDriver: true }),
        Animated.delay(425),
        Animated.timing(sq, { toValue: 0.08, duration: 0, useNativeDriver: true }),
        Animated.delay(425),
      ]));
      loop.current.start();
    } else if (phase === 'transcribe' || phase === 'think') {
      sq.setValue(1);
      Animated.spring(lift, { toValue: 1, ...SPRING.pop }).start();
      loop.current = Animated.loop(Animated.sequence([
        Animated.timing(sq, { toValue: 0.25, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(sq, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]));
      loop.current.start();
    } else if (phase === 'done' || phase === 'fail') {
      Animated.timing(sq, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      Animated.spring(lift, { toValue: 1, ...SPRING.pop }).start();
      Animated.parallel([
        Animated.spring(checkScale, { toValue: 1, ...SPRING.pop }),
        Animated.sequence([
          Animated.delay(100),
          Animated.timing(check, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        ]),
      ]).start();
    }
    return () => loop.current?.stop();
  }, [phase]);

  // REC timer
  useEffect(() => {
    if (phase !== 'rec') return;
    const id = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // auto-close
  useEffect(() => {
    if (phase !== 'done' && phase !== 'fail') return;
    const id = setTimeout(recDismiss, AUTO_CLOSE_MS);
    return () => clearTimeout(id);
  }, [phase, reply?.id]);

  const typedTranscript = useTypewriter(transcript, phase === 'think' || phase === 'done');
  const settled = phase === 'done' || phase === 'fail';
  const typedReply = useTypewriter(reply?.text ?? '', settled);

  if (!visible) return null;

  const liftY = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -150] });
  const failed = phase === 'fail';
  const answered = phase === 'done' && !reply?.logged; // a plain answer: no tick, the square just settles
  const label =
    phase === 'rec' ? 'LISTENING' :
    phase === 'transcribe' ? 'HEARING' :
    phase === 'think' ? 'THINKING' :
    reply?.logged ? 'LOGGED' : phase === 'fail' ? 'MISSED' : 'ANSWER';

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: fade }]} pointerEvents={phase === 'rec' ? 'none' : 'auto'}>
      <Pressable style={StyleSheet.absoluteFill} onPress={settled ? recDismiss : undefined}>
        <View style={styles.center}>
          <Animated.View style={{ alignItems: 'center', transform: [{ translateY: liftY }] }}>
            {settled && !answered ? (
              <Animated.View style={{ transform: [{ scale: checkScale }] }}>
                <Svg width={56} height={56} viewBox="0 0 56 56">
                  {failed ? (
                    <AnimatedPath d="M16 16 L40 40 M40 16 L16 40" stroke={C.dim} strokeWidth={5} strokeLinecap="square" fill="none"
                      strokeDasharray={[68, 68]} strokeDashoffset={check.interpolate({ inputRange: [0, 1], outputRange: [68, 0] })} />
                  ) : (
                    <AnimatedPath d="M12 29 L23 40 L44 17" stroke={C.hot} strokeWidth={5} strokeLinecap="square" fill="none"
                      strokeDasharray={[50, 50]} strokeDashoffset={check.interpolate({ inputRange: [0, 1], outputRange: [50, 0] })} />
                  )}
                </Svg>
              </Animated.View>
            ) : (
              <Animated.View style={[styles.square, { opacity: sq, transform: [{ scale: sqScale.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] }]} />
            )}
            <Text style={styles.label}>{label}</Text>
            {phase === 'rec' && <Text style={styles.timer}>{`0:${String(secs).padStart(2, '0')}`}</Text>}
          </Animated.View>

          {(phase === 'think' || settled) && !!transcript && (
            <Text style={[styles.transcript, settled && styles.transcriptDone]}>{typedTranscript}</Text>
          )}
          {settled && !!reply && (
            <View style={styles.replyWrap}>
              <Text style={styles.reply}>{typedReply}</Text>
              {!!reply.stats?.length && (
                <View style={styles.chips}>
                  {reply.stats.map((s, i) => <Chip key={i} index={i} value={s.value} unit={s.unit} />)}
                </View>
              )}
            </View>
          )}
        </View>

        {phase === 'rec' && <Text style={styles.hint}>RELEASE TO SEND</Text>}
        {settled && (
          <View style={styles.footer}>
            <Text style={styles.hint}>TAP TO DISMISS</Text>
            <Pressable onPress={() => { recDismiss(); openChat(); }} hitSlop={12} style={styles.openBtn}>
              <Text style={styles.openText}>OPEN CHAT</Text>
            </Pressable>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

function Chip({ value, unit, index }: { value: string; unit: string; index: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([Animated.delay(400 + index * 70), Animated.spring(a, { toValue: 1, ...SPRING.pop })]).start();
  }, []);
  return (
    <Animated.View style={[styles.chip, { opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
      <Text style={[styles.chipValue, numFace(value, 34)]}>{value}</Text>
      <Text style={styles.chipUnit}>{unit}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(0,0,0,0.96)', zIndex: 1000, elevation: 1000 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  square: { width: 40, height: 40, backgroundColor: C.hot },
  label: { fontFamily: F.dot, fontSize: 18, color: C.hot, letterSpacing: 3, marginTop: 22 },
  timer: { fontFamily: F.dot, fontSize: 16, color: C.dim, marginTop: 6 },
  transcript: { fontFamily: F.mono, fontSize: 20, color: C.ink, textAlign: 'center', lineHeight: 28, marginTop: -40 },
  transcriptDone: { color: C.dim, fontSize: 15, lineHeight: 22 },
  replyWrap: { alignItems: 'center', marginTop: 22 },
  reply: { fontFamily: F.mono, fontSize: 18, color: C.ink, textAlign: 'center', lineHeight: 26 },
  chips: { flexDirection: 'row', gap: 18, marginTop: 26, flexWrap: 'wrap', justifyContent: 'center' },
  chip: { alignItems: 'center' },
  chipValue: { fontFamily: F.num, fontSize: 34, color: C.hot },
  chipUnit: { fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 2, marginTop: 2 },
  hint: { fontFamily: F.dot, fontSize: 11, color: C.faint, letterSpacing: 3, textAlign: 'center', marginBottom: 56 },
  footer: { alignItems: 'center' },
  openBtn: { position: 'absolute', bottom: 18, borderWidth: 1, borderColor: C.lineHi, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8 },
  openText: { fontFamily: F.dot, fontSize: 12, color: C.ink, letterSpacing: 2 },
});
