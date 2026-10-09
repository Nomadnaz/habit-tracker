// Workouts list — create templates, tap to view exercises, mark done today.

import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Modal, Pressable, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  ensureSeeded, getTemplates, getJunctions, isDoneToday,
  createTemplate, archiveTemplate,
  type WorkoutTemplate,
} from '@/lib/workout-data';

import { C, F } from '@/lib/theme';
const ORANGE = C.hot;

const COLOUR_OPTIONS = [C.hot, '#4A90D9', C.live, '#9B59B6', '#E67E22', C.alert];

export default function WorkoutsScreen() {
  const router = useRouter();
  const [templates,      setTemplates]      = useState<WorkoutTemplate[]>([]);
  const [exerciseCounts, setExerciseCounts] = useState<Record<string, number>>({});
  const [doneToday,      setDoneToday]      = useState<Record<string, boolean>>({});
  const [createOpen,     setCreateOpen]     = useState(false);
  const [newName,        setNewName]        = useState('');
  const [newColour,      setNewColour]      = useState(ORANGE);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    await ensureSeeded();
    const [tmpl, junctions] = await Promise.all([getTemplates(), getJunctions()]);
    const active = tmpl.filter(t => !t.isArchived);
    setTemplates(active);

    const counts: Record<string, number> = {};
    for (const j of junctions) counts[j.templateId] = (counts[j.templateId] ?? 0) + 1;
    setExerciseCounts(counts);

    const done: Record<string, boolean> = {};
    for (const t of active) done[t.id] = await isDoneToday(t.id);
    setDoneToday(done);
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await createTemplate(newName.trim(), newColour);
    setNewName(''); setNewColour(ORANGE); setCreateOpen(false);
    load();
  }

  function handleArchive(id: string, name: string) {
    Alert.alert('Archive Workout', `Archive "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: async () => { await archiveTemplate(id); load(); } },
    ]);
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>

      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={C.hot} />
          <Text style={s.backLabel}>BODY</Text>
        </TouchableOpacity>
        <View style={s.titleWrap}>
          <Text style={s.title}>WORKOUTS</Text>
        </View>
        <TouchableOpacity onPress={() => setCreateOpen(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialCommunityIcons name="plus" size={26} color={C.hot} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {templates.length === 0 && (
          <Text style={s.empty}>No workouts yet — tap + to create one.</Text>
        )}

        {templates.map(t => (
          <TouchableOpacity
            key={t.id}
            style={[s.card, { borderLeftColor: t.colour }]}
            activeOpacity={0.85}
            onPress={() => router.push({ pathname: '/workout-detail', params: { templateId: t.id } })}
          >
            <View style={[s.colourBar, { backgroundColor: t.colour }]} />
            <View style={s.cardBody}>
              <Text style={s.cardName}>{t.name}</Text>
              <Text style={s.cardSub}>{exerciseCounts[t.id] ?? 0} EXERCISES</Text>
            </View>
            {doneToday[t.id] && (
              <View style={s.doneBadge}>
                <MaterialCommunityIcons name="check" size={12} color={C.onHot} />
                <Text style={s.doneText}>DONE TODAY</Text>
              </View>
            )}
            <TouchableOpacity
              style={s.menuBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => handleArchive(t.id, t.name)}
            >
              <MaterialCommunityIcons name="dots-vertical" size={20} color={C.dim} />
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Create modal — the nice one */}
      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setCreateOpen(false)}>
          <Pressable style={s.sheet} onPress={e => e.stopPropagation()}>
            <Text style={s.sheetLabel}>NEW WORKOUT</Text>
            <TextInput
              style={s.input}
              value={newName}
              onChangeText={setNewName}
              placeholder="WORKOUT NAME"
              placeholderTextColor={C.faint}
              autoFocus
              autoCapitalize="characters"
            />
            <Text style={[s.sheetLabel, { marginBottom: 12 }]}>COLOUR</Text>
            <View style={s.colourRow}>
              {COLOUR_OPTIONS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[s.colourDot, { backgroundColor: c }, newColour === c && s.colourDotSelected]}
                  onPress={() => setNewColour(c)}
                />
              ))}
            </View>
            <TouchableOpacity style={s.createBtn} onPress={handleCreate}>
              <Text style={s.createBtnText}>CREATE</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backLabel: { fontFamily: F.mono, fontSize: 11, color: C.hot, letterSpacing: 1 },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 4 },
  title: { fontFamily: F.dot, fontSize: 18, color: C.ink, letterSpacing: 2 },
  scroll: { padding: 16, paddingBottom: 40 },
  empty: { fontFamily: F.mono, fontSize: 11, color: C.dim, textAlign: 'center', marginTop: 48 },

  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.line, borderLeftWidth: 4, marginBottom: 12, overflow: 'hidden' },
  colourBar: { width: 4, alignSelf: 'stretch' },
  cardBody: { flex: 1, paddingVertical: 16, paddingHorizontal: 14 },
  cardName: { fontFamily: F.mono, fontSize: 13, color: C.ink, letterSpacing: 1 },
  cardSub: { fontFamily: F.mono, fontSize: 10, color: C.dim, marginTop: 4, letterSpacing: 1 },
  doneBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.live, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginRight: 8 },
  doneText: { fontFamily: F.mono, fontSize: 9, color: C.onHot, letterSpacing: 1 },
  menuBtn: { padding: 12 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 40 },
  sheet: { width: '100%', backgroundColor: C.surface, borderRadius: 16, padding: 22, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 10 },
  sheetLabel: { fontFamily: F.mono, fontSize: 10, color: C.hot, letterSpacing: 1, marginBottom: 12 },
  input: { fontFamily: F.mono, fontSize: 16, color: C.ink, borderBottomWidth: 2, borderBottomColor: C.line, paddingVertical: 10, marginBottom: 24 },
  colourRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  colourDot: { width: 34, height: 34, borderRadius: 17 },
  colourDotSelected: { borderWidth: 3, borderColor: C.lineHi },
  createBtn: { backgroundColor: ORANGE, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  createBtnText: { fontFamily: F.mono, fontSize: 12, color: C.onHot, letterSpacing: 1 },
});
