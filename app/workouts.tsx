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

const ORANGE = '#FF4D00';
const INK    = '#1A1714';
const MUTED  = '#8C857B';
const FAINT  = '#C7C1B8';
const BORDER = '#E5E1DA';
const CARD   = '#FCFBF9';
const GREEN  = '#4CAF50';

const COLOUR_OPTIONS = ['#FF4D00', '#4A90D9', '#4CAF50', '#9B59B6', '#E67E22', '#E74C3C'];

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
          <MaterialCommunityIcons name="arrow-left" size={20} color={ORANGE} />
          <Text style={s.backLabel}>BODY</Text>
        </TouchableOpacity>
        <View style={s.titleWrap}>
          <View style={[s.corner, s.cornerTL]} />
          <Text style={s.title}>WORKOUTS</Text>
          <View style={[s.corner, s.cornerBR]} />
        </View>
        <TouchableOpacity onPress={() => setCreateOpen(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialCommunityIcons name="plus" size={26} color={ORANGE} />
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
                <MaterialCommunityIcons name="check" size={12} color="#FFFFFF" />
                <Text style={s.doneText}>DONE TODAY</Text>
              </View>
            )}
            <TouchableOpacity
              style={s.menuBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => handleArchive(t.id, t.name)}
            >
              <MaterialCommunityIcons name="dots-vertical" size={20} color={MUTED} />
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
              placeholderTextColor={FAINT}
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
  container: { flex: 1, backgroundColor: '#F5F2ED' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backLabel: { fontFamily: 'PixeloidSans_700Bold', fontSize: 10, color: ORANGE, letterSpacing: 1 },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 4 },
  corner: { width: 10, height: 10, borderColor: ORANGE, position: 'absolute' },
  cornerTL: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2 },
  title: { fontFamily: 'PixeloidSans_700Bold', fontSize: 18, color: INK, letterSpacing: 2 },
  scroll: { padding: 16, paddingBottom: 40 },
  empty: { fontFamily: 'PixeloidSans_400Regular', fontSize: 10, color: MUTED, textAlign: 'center', marginTop: 48 },

  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, borderLeftWidth: 4, marginBottom: 12, overflow: 'hidden' },
  colourBar: { width: 4, alignSelf: 'stretch' },
  cardBody: { flex: 1, paddingVertical: 16, paddingHorizontal: 14 },
  cardName: { fontFamily: 'PixeloidSans_700Bold', fontSize: 13, color: INK, letterSpacing: 1 },
  cardSub: { fontFamily: 'PixeloidSans_400Regular', fontSize: 9, color: MUTED, marginTop: 4, letterSpacing: 1 },
  doneBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: GREEN, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginRight: 8 },
  doneText: { fontFamily: 'PixeloidSans_700Bold', fontSize: 8, color: '#FFFFFF', letterSpacing: 1 },
  menuBtn: { padding: 12 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 40 },
  sheet: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 22, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 10 },
  sheetLabel: { fontFamily: 'PixeloidSans_400Regular', fontSize: 9, color: ORANGE, letterSpacing: 1, marginBottom: 12 },
  input: { fontFamily: 'PixeloidSans_700Bold', fontSize: 16, color: INK, borderBottomWidth: 2, borderBottomColor: BORDER, paddingVertical: 10, marginBottom: 24 },
  colourRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  colourDot: { width: 34, height: 34, borderRadius: 17 },
  colourDotSelected: { borderWidth: 3, borderColor: INK },
  createBtn: { backgroundColor: ORANGE, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  createBtnText: { fontFamily: 'PixeloidSans_700Bold', fontSize: 12, color: '#FFFFFF', letterSpacing: 1 },
});
