// ─────────────────────────────────────────────────────────────────────────
// LOG — where you talk to it and see what's gone in. Three views:
//   TALK   the conversation, inline: type it ("two eggs on toast", "bench
//          60 for 8") or, with the box empty, hold the button on the right
//          and say it; once there's text the same button sends. Same
//          threads as the chat sheet (lib/assistant.ts).
//   CHATS  saved conversations, pinned first — tap one to carry on.
//   LOGS   what the twin picked up today (its signals), then everything
//          logged this week, newest first (lib/log-feed.ts): meals, lifts,
//          water, weigh-ins, sleep, mood — typed, scanned, or said to the
//          puck or the chat. Tap a meal or water to open FUEL on its day.
// The day's numbers themselves live on BODY.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { C, F, MOD, numFace } from '@/lib/theme';
import { hit } from '@/lib/hit';
import {
  useAssistant, loadThreads, send, setActive, resumeRecent, togglePin, deleteThread, type Thread,
} from '@/lib/assistant';
import { useHoldToTalk } from '@/components/assistant/useHoldToTalk';
import { Bubble, Empty, Thinking } from '@/components/assistant/ChatSheet';
import { DotIcon } from '@/components/today/DotIcon';
import { onWrite } from '@/lib/postWrite';
import { removeWithUndo, usePendingRemovals } from '@/lib/undo';
import { useRevalidate } from '@/lib/revalidate';
import { buildFeed, type FeedDay, type FeedItem } from '@/lib/log-feed';
import { Bone, BoneText, Loading, useLate } from '@/components/Skeleton';
import { BALANCE } from '@/lib/text-wrap';
import { getMealMap } from '@/lib/meals-data';
import { getTrainingSessions } from '@/lib/workout-data';
import { loadBodyData } from '@/lib/body-data';
import { getRecentSleepLogs } from '@/lib/sleep-data';
import { getTodayMood } from '@/lib/mood-data';
import { cachedView, type TodayView } from '@/lib/twin-data';

type View3 = 'talk' | 'chats' | 'logs';
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const hhmm = (at: number) => { const d = new Date(at); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

async function readFeed(): Promise<FeedDay[]> {
  const [meals, sessions, body, sleep, mood] = await Promise.all([
    getMealMap(), getTrainingSessions(7).catch(() => []), loadBodyData(), getRecentSleepLogs(7), getTodayMood(),
  ]);
  return buildFeed({
    meals: Object.values(meals).flat(),
    sessions,
    water: body.waterLogs,
    weight: body.weightLogs,
    sleep,
    mood: mood ? [mood] : [],
  });
}

export default function LogScreen() {
  const { threads: all, ready, activeId, busy } = useAssistant();
  // A chat waiting on UNDO is gone everywhere already.
  const gone = usePendingRemovals();
  const threads = all.filter(t => !gone.has(t.id));
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<View3>('talk');
  const [feed, setFeed] = useState<FeedDay[] | null>(null); // null until first read
  const [signals, setSignals] = useState<TodayView['twin']['log']>([]);
  // BODY's TWIN LOG readout opens straight on LOGS.
  useEffect(() => { if (params.tab === 'logs' || params.tab === 'chats' || params.tab === 'talk') setTab(params.tab); }, [params.tab]);
  const thread = threads.find(t => t.id === activeId) ?? null;

  useEffect(() => { void loadThreads(); }, []);
  useEffect(() => { resumeRecent(); }, [threads.length > 0]);

  const refreshFeed = useCallback(() => {
    void readFeed().then(setFeed).catch(() => {});
    void cachedView().then(v => setSignals(v?.twin.log ?? []));
  }, []);
  useFocusEffect(useCallback(() => {
    refreshFeed();
    return onWrite(() => refreshFeed());
  }, [refreshFeed]));
  useRevalidate(refreshFeed);

  const n = new Date();
  const todayCount = feed?.[0]?.word === 'TODAY' ? feed[0].items.length : 0;
  const tabs: { id: View3; word: string; count?: number }[] = [
    { id: 'talk', word: 'TALK' },
    { id: 'chats', word: 'CHATS', count: threads.length },
    { id: 'logs', word: 'LOGS', count: todayCount },
  ];

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <View style={st.header}>
        <View style={{ flex: 1 }}>
          <Text style={st.eyebrow}>{`${DAYS[n.getDay()]} ${String(n.getDate()).padStart(2, '0')} ${MONTHS[n.getMonth()]}`}</Text>
          <Text style={st.title}>LOG</Text>
        </View>
        <Pressable
          onPress={() => { Haptics.selectionAsync(); setActive(null); setTab('talk'); }}
          hitSlop={8} style={st.key} accessibilityLabel="New chat"
        >
          <Text style={st.keyText}>NEW</Text>
        </Pressable>
      </View>

      <View style={st.tabs}>
        {tabs.map(x => {
          const on = tab === x.id;
          return (
            <Pressable key={x.id} onPress={() => { if (!on) { Haptics.selectionAsync(); setTab(x.id); } }} hitSlop={hit(100, 40)} style={[st.tab, on && st.tabOn]}>
              <Text style={[st.tabText, on && { color: C.onHot }]}>{x.word}</Text>
              {!!x.count && <Text style={[st.tabCount, on && { color: C.onHot }]}>{x.count}</Text>}
            </Pressable>
          );
        })}
      </View>

      {tab === 'talk' && <Talk thread={thread} busy={busy} />}
      {tab === 'chats' && <Chats threads={threads} ready={ready} activeId={activeId} onOpen={id => { setActive(id); setTab('talk'); }} />}
      {tab === 'logs' && <Logs feed={feed} signals={signals} />}
    </SafeAreaView>
  );
}

// ── talk ─────────────────────────────────────────────────────────────────

function Talk({ thread, busy }: { thread: Thread | null; busy: boolean }) {
  const { phase } = useAssistant();
  const [text, setText] = useState('');
  const scroll = useRef<ScrollView>(null);
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
      {thread && <Text style={st.threadTitle} numberOfLines={1}>{thread.title}</Text>}
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={st.msgs}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      >
        {msgs.length === 0 && <Empty />}
        {msgs.map(m => <Bubble key={m.id} msg={m} threadId={thread!.id} />)}
        {busy && <Thinking />}
      </ScrollView>
      <View style={st.composer}>
        <TextInput
          style={st.input}
          value={text}
          onChangeText={setText}
          placeholder="Type, or hold to talk"
          placeholderTextColor={C.faint}
          onSubmitEditing={submit}
          returnKeyType="send"
          multiline
          blurOnSubmit
        />
        {/* One button: with text it sends; with the box empty, hold it to talk. */}
        {text.trim()
          ? (
            <Pressable onPress={submit} disabled={busy} style={[st.sendBtn, busy && { opacity: 0.25 }]} accessibilityLabel="Send">
              <MaterialCommunityIcons name="arrow-up" size={20} color={C.onHot} />
            </Pressable>
          ) : (
            <Pressable
              onPressIn={talk.start}
              onPressOut={talk.stop}
              style={({ pressed }) => [st.hold, (pressed || phase === 'rec') && st.holdOn]}
              accessibilityLabel="Hold to talk"
              accessibilityHint="Hold, say it, then let go to send"
            >
              {({ pressed }) => <View style={[st.holdSquare, (pressed || phase === 'rec') && { backgroundColor: C.onHot }]} />}
            </Pressable>
          )}
      </View>
    </KeyboardAvoidingView>
  );
}

// ── saved chats ──────────────────────────────────────────────────────────

function Chats({ threads, ready, activeId, onOpen }: { threads: Thread[]; ready: boolean; activeId: string | null; onOpen: (id: string) => void }) {
  // Until the chats are read, nothing for 300 ms, then rows of bones, never a false "no chats".
  const late = useLate(!ready);
  if (!ready) {
    return late ? (
      <Loading>
        <BoneText style={st.section} w={120} />
        {[0, 1, 2, 3, 4].map(i => <ChatRow key={i} index={i} />)}
      </Loading>
    ) : null;
  }
  if (!threads.length) return <Text style={st.blank} {...BALANCE}>NO CHATS YET · HOLD THE SQUARE ON TALK AND SAY SOMETHING</Text>;
  const pinned = threads.filter(t => t.pinned);
  const rest = threads.filter(t => !t.pinned);
  const row = (t: Thread, i: number) => <ChatRow key={t.id} t={t} index={i} active={t.id === activeId} onOpen={onOpen} />;
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      {pinned.length > 0 && <Text style={st.section}>PINNED</Text>}
      {pinned.map(row)}
      {rest.length > 0 && <Text style={st.section}>RECENT</Text>}
      {rest.map((t, i) => row(t, pinned.length + i))}
    </ScrollView>
  );
}

/** One saved chat, or with no `t` its skeleton: the same row with bones for its text. */
function ChatRow({ t, index, active, onOpen }: { t?: Thread; index: number; active?: boolean; onOpen?: (id: string) => void }) {
  if (!t) {
    return (
      <View style={[st.row, index === 0 && { borderTopWidth: 0 }]}>
        <BoneText style={st.rowIdx} w={22} />
        <View style={{ flex: 1 }}>
          <BoneText style={st.rowTitle} w="55%" />
          <BoneText style={st.rowSub} w="85%" />
        </View>
        <BoneText style={st.rowStamp} w={44} />
        <Bone w={16} h={16} />
      </View>
    );
  }
  const i = index;
  const last = t.messages[t.messages.length - 1];
  const logs = t.messages.filter(m => m.logged).length;
  const when = new Date(t.updatedAt);
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); onOpen?.(t.id); }}
      onLongPress={() => Alert.alert(t.title, undefined, [
        { text: t.pinned ? 'Unpin' : 'Pin', onPress: () => togglePin(t.id) },
        { text: 'Delete', style: 'destructive', onPress: () => removeWithUndo({ key: t.id, label: 'CHAT DELETED', commit: () => deleteThread(t.id) }) },
        { text: 'Cancel', style: 'cancel' },
      ])}
      style={({ pressed }) => [st.row, i === 0 && { borderTopWidth: 0 }, pressed && { backgroundColor: C.surface }]}
    >
      <Text style={[st.rowIdx, active && { color: C.live }]}>{String(i + 1).padStart(2, '0')}</Text>
      <View style={{ flex: 1 }}>
        <Text style={st.rowTitle} numberOfLines={1}>{t.title}</Text>
        <Text style={st.rowSub} numberOfLines={1}>{last?.text ?? ''}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={st.rowStamp}>{`${String(when.getDate()).padStart(2, '0')} ${MONTHS[when.getMonth()]}`}</Text>
        {logs > 0 && <Text style={st.rowLogs}>{`${logs} LOGGED`}</Text>}
      </View>
      <Pressable onPress={() => togglePin(t.id)} hitSlop={hit(16)} accessibilityLabel={t.pinned ? 'Unpin' : 'Pin'}>
        <MaterialCommunityIcons name={t.pinned ? 'pin' : 'pin-outline'} size={16} color={t.pinned ? C.hot : C.faint} />
      </Pressable>
    </Pressable>
  );
}

// ── logs ─────────────────────────────────────────────────────────────────

function Logs({ feed, signals }: { feed: FeedDay[] | null; signals: TodayView['twin']['log'] }) {
  const router = useRouter();
  // First read: nothing for 300 ms, then a day of bones, never a false "nothing logged".
  const late = useLate(feed === null);
  if (feed === null) {
    return late ? (
      <Loading>
        <View style={st.dayHead}><BoneText style={st.section} w={110} /></View>
        {[0, 1, 2, 3, 4, 5].map(i => <Entry key={i} first={i === 0} />)}
      </Loading>
    ) : null;
  }
  if (!feed.length && !signals.length) return <Text style={st.blank} {...BALANCE}>NOTHING LOGGED THIS WEEK YET</Text>;
  // Food and water open FUEL on their day, to see the rest of it or change it.
  const fuelOn = (date: string) => () => { Haptics.selectionAsync(); router.push({ pathname: '/calorie', params: { date } }); };
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      {signals.length > 0 && (
        <View>
          <View style={st.dayHead}>
            <Text style={st.section}>TWIN · TODAY</Text>
            <Text style={st.dayCount}>{`${signals.length} SIGNALS`}</Text>
          </View>
          {signals.map((l, i) => (
            <View key={`sig${i}`} style={[st.entry, i === 0 && { borderTopWidth: 0 }]}>
              <Text style={st.sigTag}>{l.tag}</Text>
              <Text style={[st.entryText, { flex: 1 }]}>{l.text}</Text>
            </View>
          ))}
        </View>
      )}
      {feed.map(day => (
        <View key={day.date}>
          <View style={st.dayHead}>
            <Text style={st.section}>{day.word}</Text>
            <Text style={st.dayCount}>{`${day.items.length} ${day.items.length === 1 ? 'ENTRY' : 'ENTRIES'}`}</Text>
          </View>
          {day.items.map((it, i) => (
            <Entry key={it.key} it={it} first={i === 0} onPress={it.kind === 'fuel' || it.kind === 'water' ? fuelOn(day.date) : undefined} />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

/** One logged thing, or with no `it` its skeleton: the same row with bones for its text. */
function Entry({ it, first, onPress }: { it?: FeedItem; first: boolean; onPress?: () => void }) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={({ pressed }) => [st.entry, first && { borderTopWidth: 0 }, pressed && { backgroundColor: C.surface }]}>
      {it ? <Text style={st.time}>{hhmm(it.at)}</Text> : <BoneText style={st.time} w={38} />}
      {it ? <DotIcon kind={it.kind} tone={MOD[it.kind]} dot={1.8} gap={0.45} /> : <Bone w={15.3} h={15.3} />}
      <View style={{ flex: 1 }}>
        {it ? <Text style={st.entryText} numberOfLines={1}>{it.text}</Text> : <BoneText style={st.entryText} w="70%" />}
        {!!it?.via && <Text style={[st.via, { color: MOD[it.kind] }]}>{it.via}</Text>}
      </View>
      {it
        ? <Text style={[st.entryValue, numFace(it.value, 13)]} numberOfLines={1}>{it.value}</Text>
        : <BoneText style={[st.entryValue, numFace('0', 13)]} w={34} />}
      {!!onPress && <MaterialCommunityIcons name="chevron-right" size={14} color={C.faint} />}
    </Pressable>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 20, paddingTop: 10, marginBottom: 12 },
  eyebrow: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 3 },
  title: { fontFamily: F.dot, fontSize: 40, color: C.ink, letterSpacing: 2, marginTop: 4 },
  key: { height: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  keyText: { fontFamily: F.dot, fontSize: 10, color: C.ink, letterSpacing: 2 },

  tabs: { flexDirection: 'row', gap: 6, marginHorizontal: 16, marginBottom: 6 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, borderWidth: 1, borderColor: C.line, borderRadius: 8, borderCurve: 'continuous' },
  tabOn: { backgroundColor: C.hot, borderColor: C.hot },
  tabText: { fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 2 },
  tabCount: { fontFamily: F.dot, fontSize: 9, color: C.faint },

  threadTitle: { fontFamily: F.mono, fontSize: 11, color: C.dim, letterSpacing: 1, textAlign: 'center', marginTop: 6 },
  msgs: { padding: 16, paddingBottom: 24, gap: 14 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, borderTopColor: C.line },
  hold: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center' },
  holdOn: { backgroundColor: C.hot, borderColor: C.hot },
  holdSquare: { width: 12, height: 12, backgroundColor: C.hot },
  input: { flex: 1, minHeight: 44, maxHeight: 120, backgroundColor: C.surface, borderRadius: 22, borderWidth: 1, borderColor: C.line, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontFamily: F.mono, fontSize: 15, color: C.ink },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.hot, alignItems: 'center', justifyContent: 'center' },

  blank: { fontFamily: F.dot, fontSize: 11, color: C.faint, letterSpacing: 2, textAlign: 'center', marginTop: 80, marginHorizontal: 32, lineHeight: 18 },
  section: { fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 3, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: C.line },
  rowIdx: { fontFamily: F.dot, fontSize: 13, color: C.faint, width: 22 },
  rowTitle: { fontFamily: F.mono, fontSize: 14, color: C.ink, letterSpacing: 1 },
  rowSub: { fontFamily: F.mono, fontSize: 12, color: C.dim, marginTop: 3 },
  rowStamp: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 1 },
  rowLogs: { fontFamily: F.dot, fontSize: 9, color: C.live, letterSpacing: 1 },

  dayHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingRight: 20 },
  dayCount: { fontFamily: F.dot, fontSize: 8, color: C.faint, letterSpacing: 1.5, paddingBottom: 10 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 11, borderTopWidth: 1, borderTopColor: C.line },
  time: { fontFamily: F.dot, fontSize: 10, color: C.faint, width: 38, letterSpacing: 0.5 },
  entryText: { fontFamily: F.mono, fontSize: 13, color: C.ink },
  via: { fontFamily: F.dot, fontSize: 8, letterSpacing: 1.5, marginTop: 2 },
  entryValue: { color: C.hot, maxWidth: '40%' },
  sigTag: { fontFamily: F.dot, fontSize: 9, color: C.live, letterSpacing: 1.5, width: 64 },
});
