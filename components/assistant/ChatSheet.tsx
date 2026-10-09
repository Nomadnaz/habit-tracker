// Chat window + saved chats. Springs up from the PUCK dot; the list view is
// the "saved chats" drawer (pinned first, then most recent). Holding the
// square in the composer records exactly like holding the tab-bar dot.
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated, ScrollView, TextInput,
  KeyboardAvoidingView, Platform, Dimensions, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { C, F, SPRING, numFace } from '@/lib/theme';
import {
  useAssistant, closeSheet, openList, openChat, newChat, send, confirmPending,
  togglePin, deleteThread, type Msg, type Thread,
} from '@/lib/assistant';
import { useHoldToTalk } from './useHoldToTalk';
import { PuckMark } from '@/components/PuckMark';

const H = Dimensions.get('window').height;

export function ChatSheet() {
  const { sheet, threads, activeId, busy } = useAssistant();
  const open = sheet !== 'closed';
  const y = useRef(new Animated.Value(H)).current;
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.spring(y, { toValue: 0, ...SPRING.settle }).start();
    } else {
      Animated.timing(y, { toValue: H, duration: 220, useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [open]);

  if (!mounted) return null;
  const thread = threads.find(t => t.id === activeId) ?? null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.sheet, { transform: [{ translateY: y }] }]}>
      {sheet === 'list' ? <ThreadList threads={threads} /> : <Conversation thread={thread} busy={busy} />}
    </Animated.View>
  );
}

// Thread titles are the user's own words, which can hold . ? / that the
// dot face lacks — those render in MONO.
function Header({ title, left, right, mono }: { title: string; left: React.ReactNode; right: React.ReactNode; mono?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerSide}>{left}</View>
      <Text style={[styles.headerTitle, mono && { fontFamily: F.mono }]} numberOfLines={1}>{title}</Text>
      <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );
}

const IconBtn = ({ name, onPress }: { name: keyof typeof MaterialCommunityIcons.glyphMap; onPress: () => void }) => (
  <Pressable onPress={onPress} hitSlop={10} style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: C.raised }]}>
    <MaterialCommunityIcons name={name} size={20} color={C.ink} />
  </Pressable>
);

// ── conversation ─────────────────────────────────────────────────────────

function Conversation({ thread, busy }: { thread: Thread | null; busy: boolean }) {
  const [text, setText] = useState('');
  const scroll = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const talk = useHoldToTalk();
  const msgs = thread?.messages ?? [];

  const submit = () => {
    const t = text.trim();
    if (!t || busy) return;
    setText('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void send(t);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header
        title={thread?.title ?? 'NEW CHAT'}
        mono={!!thread}
        left={<IconBtn name="format-list-bulleted" onPress={openList} />}
        right={
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <IconBtn name="plus" onPress={newChat} />
            <IconBtn name="close" onPress={closeSheet} />
          </View>
        }
      />
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={styles.msgs}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      >
        {msgs.length === 0 && <Empty />}
        {msgs.map(m => <Bubble key={m.id} msg={m} threadId={thread!.id} />)}
        {busy && <Thinking />}
      </ScrollView>
      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable
          onPressIn={talk.start}
          onPressOut={talk.stop}
          style={({ pressed }) => [styles.holdBtn, pressed && { backgroundColor: C.raised }]}
          hitSlop={6}
        >
          <View style={styles.holdSquare} />
        </Pressable>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Log something, or ask…"
          placeholderTextColor={C.faint}
          onSubmitEditing={submit}
          returnKeyType="send"
          multiline
          blurOnSubmit
        />
        <Pressable onPress={submit} disabled={!text.trim() || busy} style={[styles.sendBtn, (!text.trim() || busy) && { opacity: 0.25 }]}>
          <MaterialCommunityIcons name="arrow-up" size={20} color={C.onHot} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Empty() {
  return (
    <View style={styles.empty}>
      <View style={{ marginBottom: 28 }}><PuckMark size={54} lit={4} /></View>
      <Text style={styles.emptyTitle}>HOLD TO TALK</Text>
      <Text style={styles.emptyBody}>
        Hold the square and say it — "two eggs on toast", "add call mum tomorrow at six", "how did I sleep this week". Or type.
      </Text>
    </View>
  );
}

function Thinking() {
  const a = useRef(new Animated.Value(0.2)).current;
  useEffect(() => {
    const l = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(a, { toValue: 0.2, duration: 500, useNativeDriver: true }),
    ]));
    l.start();
    return () => l.stop();
  }, []);
  return <Animated.View style={[styles.thinking, { opacity: a }]} />;
}

function Bubble({ msg, threadId }: { msg: Msg; threadId: string }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.spring(a, { toValue: 1, ...SPRING.pop }).start(); }, []);
  const mine = msg.role === 'user';
  return (
    <Animated.View style={[
      mine ? styles.mineWrap : styles.theirsWrap,
      { opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }, { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] },
    ]}>
      {mine ? (
        <View style={styles.mine}>
          {msg.voice && <View style={styles.voiceDot} />}
          <Text style={styles.mineText}>{msg.text}</Text>
        </View>
      ) : (
        <View style={styles.theirs}>
          <View style={[styles.avatar, msg.logged && { backgroundColor: C.live }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.theirsText}>{msg.text}</Text>
            {!!msg.stats?.length && (
              <View style={styles.statRow}>
                {msg.stats.map((s, i) => (
                  <View key={i}>
                    <Text style={[styles.statVal, numFace(s.value, 26)]}>{s.value}</Text>
                    <Text style={styles.statUnit}>{s.unit}</Text>
                  </View>
                ))}
              </View>
            )}
            {msg.pending?.map((p, i) => (
              <Pressable key={i} style={styles.pending} onPress={() => confirmPending(threadId, msg.id, p)}>
                <Text style={styles.pendingType}>{p.type.replace(/_/g, ' ').toUpperCase()}</Text>
                <Text style={styles.pendingBody} numberOfLines={2}>
                  {String(p.data?.label ?? p.data?.name ?? p.data?.title ?? p.message ?? '')}
                </Text>
                <Text style={styles.pendingCta}>TAP TO CONFIRM</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </Animated.View>
  );
}

// ── saved chats ──────────────────────────────────────────────────────────

function ThreadList({ threads }: { threads: Thread[] }) {
  const pinned = threads.filter(t => t.pinned);
  const rest = threads.filter(t => !t.pinned);
  return (
    <View style={{ flex: 1 }}>
      <Header
        title="SAVED CHATS"
        left={<IconBtn name="arrow-left" onPress={() => openChat()} />}
        right={<IconBtn name="plus" onPress={newChat} />}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        {threads.length === 0 && <Text style={styles.listEmpty}>NO SAVED CHATS YET</Text>}
        {pinned.length > 0 && <Text style={styles.listSection}>PINNED</Text>}
        {pinned.map((t, i) => <ThreadRow key={t.id} t={t} index={i} />)}
        {rest.length > 0 && <Text style={styles.listSection}>RECENT</Text>}
        {rest.map((t, i) => <ThreadRow key={t.id} t={t} index={pinned.length + i} />)}
      </ScrollView>
    </View>
  );
}

function ThreadRow({ t, index }: { t: Thread; index: number }) {
  const last = t.messages[t.messages.length - 1];
  const logs = t.messages.filter(m => m.logged).length;
  const when = new Date(t.updatedAt);
  const stamp = `${String(when.getDate()).padStart(2, '0')} ${when.toLocaleString('en-GB', { month: 'short' }).toUpperCase()}`;
  return (
    <Pressable
      onPress={() => openChat(t.id)}
      onLongPress={() => Alert.alert(t.title, undefined, [
        { text: t.pinned ? 'Unpin' : 'Pin', onPress: () => togglePin(t.id) },
        { text: 'Delete', style: 'destructive', onPress: () => deleteThread(t.id) },
        { text: 'Cancel', style: 'cancel' },
      ])}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.surface }]}
    >
      <Text style={styles.rowIdx}>{String(index + 1).padStart(2, '0')}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{t.title}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>{last?.text ?? ''}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={styles.rowStamp}>{stamp}</Text>
        {logs > 0 && <Text style={styles.rowLogs}>{logs} LOGGED</Text>}
      </View>
      <Pressable onPress={() => togglePin(t.id)} hitSlop={10}>
        <MaterialCommunityIcons name={t.pinned ? 'pin' : 'pin-outline'} size={16} color={t.pinned ? C.hot : C.faint} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: C.bg, zIndex: 900, elevation: 900 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.line },
  headerSide: { width: 84 },
  headerTitle: { flex: 1, textAlign: 'center', fontFamily: F.dot, fontSize: 15, color: C.ink, letterSpacing: 2 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  msgs: { padding: 16, paddingBottom: 24, gap: 14 },
  mineWrap: { alignItems: 'flex-end' },
  theirsWrap: { alignItems: 'stretch' },
  mine: { maxWidth: '82%', borderWidth: 1, borderColor: C.lineHi, borderRadius: 18, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  mineText: { fontFamily: F.mono, fontSize: 15, color: C.ink, lineHeight: 21, flexShrink: 1 },
  voiceDot: { width: 6, height: 6, backgroundColor: C.hot },
  theirs: { flexDirection: 'row', gap: 12, paddingRight: 24 },
  avatar: { width: 8, height: 8, backgroundColor: C.hot, marginTop: 7 },
  theirsText: { fontFamily: F.mono, fontSize: 15, color: C.ink, lineHeight: 22 },
  statRow: { flexDirection: 'row', gap: 20, marginTop: 12 },
  statVal: { fontFamily: F.num, fontSize: 26, color: C.hot },
  statUnit: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 2 },
  pending: { marginTop: 10, borderWidth: 1, borderColor: C.hot, borderRadius: 14, padding: 12, gap: 4 },
  pendingType: { fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 2 },
  pendingBody: { fontFamily: F.mono, fontSize: 14, color: C.ink },
  pendingCta: { fontFamily: F.dot, fontSize: 11, color: C.hot, letterSpacing: 2, marginTop: 4 },
  thinking: { width: 8, height: 8, backgroundColor: C.hot, marginLeft: 0 },

  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 24 },
  emptyTitle: { fontFamily: F.dot, fontSize: 20, color: C.ink, letterSpacing: 3 },
  emptyBody: { fontFamily: F.mono, fontSize: 14, color: C.dim, textAlign: 'center', lineHeight: 21, marginTop: 12 },

  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line },
  holdBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center' },
  holdSquare: { width: 12, height: 12, backgroundColor: C.hot },
  input: { flex: 1, minHeight: 44, maxHeight: 120, backgroundColor: C.surface, borderRadius: 22, borderWidth: 1, borderColor: C.line, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontFamily: F.mono, fontSize: 15, color: C.ink },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.hot, alignItems: 'center', justifyContent: 'center' },

  listSection: { fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 3, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 8 },
  listEmpty: { fontFamily: F.dot, fontSize: 13, color: C.faint, letterSpacing: 2, textAlign: 'center', marginTop: 80 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line },
  rowIdx: { fontFamily: F.dot, fontSize: 14, color: C.faint, width: 22 },
  rowTitle: { fontFamily: F.mono, fontSize: 14, color: C.ink, letterSpacing: 1 },
  rowSub: { fontFamily: F.mono, fontSize: 12, color: C.dim, marginTop: 3 },
  rowStamp: { fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 1 },
  rowLogs: { fontFamily: F.dot, fontSize: 9, color: C.live, letterSpacing: 1 },
});
