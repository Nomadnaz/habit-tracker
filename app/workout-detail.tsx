// Workout detail — exercise list, PB tracking per exercise, mark done today.

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Modal, Pressable, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, { Polyline, Circle } from 'react-native-svg';
import {
  ensureSeeded, getTemplates, getExercises, getJunctions,
  getTemplateExercises, isDoneToday, markDoneToday, unmarkDoneToday,
  createExercise, addExerciseToTemplate, removeExerciseFromTemplate,
  updateExercise, getPBHistory, logPB, deletePB,
  type WorkoutTemplate, type Exercise, type WorkoutExercise, type PBEntry,
} from '@/lib/workout-data';
import {
  useUnitPreference,
  convertWeightText,
  formatWeightFromKg,
  formatWeightWithUnit,
  parseWeightToKg,
  weightUnitLabel,
  type UnitSystem,
} from '@/lib/unit-preference';

const ORANGE = '#FF4D00';
const INK    = '#1A1714';
const MUTED  = '#8C857B';
const FAINT  = '#C7C1B8';
const BORDER = '#E5E1DA';
const CARD   = '#FCFBF9';
const GREEN  = '#4CAF50';

const MUSCLE_GROUPS = [
  'chest','lats','upper back','traps','shoulders',
  'biceps','triceps','forearms',
  'quads','hamstrings','glutes','calves',
  'abs','lower back','hip flexors',
] as const;
const SETS_OPTIONS = ['1','2','3','4','5','6','7','8'] as const;

function sanitizeWeight(text: string) {
  const cleaned = text.replace(/[^0-9.]/g, '');
  const dot = cleaned.indexOf('.');
  if (dot === -1) return cleaned;
  return cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '');
}

function sanitizeReps(text: string) {
  return text.replace(/[^0-9]/g, '');
}

function repsFromStored(reps: string) {
  return sanitizeReps(String(reps));
}

function WeightRepsInputs({
  weight,
  reps,
  unitLabel,
  onWeightChange,
  onRepsChange,
}: {
  weight: string;
  reps: string;
  unitLabel: string;
  onWeightChange: (v: string) => void;
  onRepsChange: (v: string) => void;
}) {
  return (
    <View style={s.weightRepsRow}>
      <View style={s.weightBox}>
        <TextInput
          style={s.weightInput}
          value={weight}
          onChangeText={t => onWeightChange(sanitizeWeight(t))}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={FAINT}
        />
        <Text style={s.weightUnit}>{unitLabel}</Text>
      </View>
      <Text style={s.weightRepsX}>×</Text>
      <View style={s.repsField}>
        <TextInput
          style={s.repsInput}
          value={reps}
          onChangeText={t => onRepsChange(sanitizeReps(t))}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={FAINT}
          maxLength={3}
        />
        <Text style={s.repsUnit}>REPS</Text>
      </View>
    </View>
  );
}

function UnitToggle({
  unitSystem,
  setUnitSystem,
}: {
  unitSystem: UnitSystem;
  setUnitSystem: (u: UnitSystem) => void;
}) {
  return (
    <View style={s.unitToggle}>
      <TouchableOpacity
        style={[s.unitPill, s.unitPillLeft, unitSystem === 'metric' && s.unitPillActive]}
        onPress={() => setUnitSystem('metric')}
        activeOpacity={0.85}
      >
        <Text style={[s.unitPillText, unitSystem === 'metric' && s.unitPillTextActive]}>KG</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.unitPill, s.unitPillRight, unitSystem === 'imperial' && s.unitPillActive]}
        onPress={() => setUnitSystem('imperial')}
        activeOpacity={0.85}
      >
        <Text style={[s.unitPillText, unitSystem === 'imperial' && s.unitPillTextActive]}>LB</Text>
      </TouchableOpacity>
    </View>
  );
}

function SetCountPicker({ value, onChange }: { value: string; onChange: (n: string) => void }) {
  return (
    <View style={s.setRow}>
      {SETS_OPTIONS.map(n => {
        const active = value === n;
        return (
          <TouchableOpacity
            key={n}
            onPress={() => onChange(n)}
            activeOpacity={0.85}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <View style={[s.setCircle, active && s.setCircleActive]}>
              <Text style={[s.setChipText, active && s.setChipTextActive]}>{n}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function MusclePicker({
  selected,
  onChange,
  multiple = true,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  multiple?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = MUSCLE_GROUPS.filter(m =>
    query === '' || m.toLowerCase().includes(query.toLowerCase()),
  );

  const summary =
    selected.length === 0
      ? 'SELECT MUSCLE'
      : selected.map(m => m.toUpperCase()).join(', ');

  function pick(m: string) {
    if (multiple) {
      onChange(
        selected.includes(m) ? selected.filter(x => x !== m) : [...selected, m],
      );
    } else {
      onChange([m]);
      setOpen(false);
      setQuery('');
    }
  }

  return (
    <View style={s.musclePickerWrap}>
      <TouchableOpacity
        style={s.muscleDropdown}
        onPress={() => setOpen(o => !o)}
        activeOpacity={0.85}
      >
        <Text style={s.muscleDropdownText} numberOfLines={1}>
          {summary}
        </Text>
        <MaterialCommunityIcons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={MUTED}
        />
      </TouchableOpacity>

      {open && (
        <View style={s.musclePanel}>
          <TextInput
            style={s.muscleSearch}
            value={query}
            onChangeText={setQuery}
            placeholder="SEARCH MUSCLES..."
            placeholderTextColor={FAINT}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <ScrollView style={s.muscleList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {filtered.map(m => {
              const on = selected.includes(m);
              return (
                <TouchableOpacity
                  key={m}
                  style={[s.muscleOption, on && s.muscleOptionOn]}
                  onPress={() => pick(m)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.muscleOptionText, on && s.muscleOptionTextOn]}>
                    {m.toUpperCase()}
                  </Text>
                  {on && (
                    <MaterialCommunityIcons name="check" size={14} color="#FFFFFF" />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// Tiny sparkline for the PB chart.
function PBChart({ entries }: { entries: PBEntry[] }) {
  if (entries.length < 2) return null;
  const W = 260, H = 56, PAD = { l: 28, r: 12, t: 8, b: 8 };
  const weights = entries.map(e => e.weightKg);
  const min = Math.min(...weights), max = Math.max(...weights);
  const range = max - min || 1;
  const cw = W - PAD.l - PAD.r;
  const ch = H - PAD.t - PAD.b;
  const pts = entries.map((e, i) => ({
    x: PAD.l + (i / (entries.length - 1)) * cw,
    y: PAD.t + ch - ((e.weightKg - min) / range) * ch,
    w: e.weightKg,
  }));
  // Build pixel-style segments: horizontal then vertical steps between each point.
  const pixelPath = pts.slice(0, -1).map((p, i) => {
    const next = pts[i + 1];
    return `M${p.x},${p.y} L${next.x},${p.y} L${next.x},${next.y}`;
  }).join(' ');

  return (
    <Svg width={W} height={H}>
      {/* Dashed pixel-step line */}
      <Polyline
        points={pixelPath.replace(/M|L/g, '').replace(/,/g, ' ').trim()}
        fill="none" stroke="none"
      />
      {/* Draw each pixel segment manually as a path */}
      {pts.slice(0, -1).map((p, i) => {
        const next = pts[i + 1];
        return (
          <Polyline
            key={i}
            points={`${p.x},${p.y} ${next.x},${p.y} ${next.x},${next.y}`}
            fill="none"
            stroke={ORANGE}
            strokeWidth={2}
            strokeDasharray="3 2"
          />
        );
      })}
      {/* Square pixel dots at each data point */}
      {pts.map((p, i) => (
        <Circle
          key={i}
          cx={p.x} cy={p.y} r={3}
          fill={i === pts.length - 1 ? ORANGE : '#FCFBF9'}
          stroke={ORANGE}
          strokeWidth={2}
        />
      ))}
    </Svg>
  );
}

export default function WorkoutDetailScreen() {
  const router = useRouter();
  const { templateId } = useLocalSearchParams<{ templateId: string }>();
  const { unitSystem, setUnitSystem } = useUnitPreference();
  const prevUnitRef = useRef<UnitSystem>(unitSystem);

  const [template,  setTemplate]  = useState<WorkoutTemplate | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [junctions, setJunctions] = useState<WorkoutExercise[]>([]);
  const [done,      setDone]      = useState(false);

  // ── Exercise edit + PB modal ─────────────────────────────────────────────
  const [editEx,      setEditEx]      = useState<Exercise | null>(null);
  const [editName,    setEditName]    = useState('');
  const [editMuscles, setEditMuscles] = useState<string[]>([]);  // multiselect
  const [editSets,    setEditSets]    = useState('3');
  const [editReps,    setEditReps]    = useState('');
  const [editWeight,  setEditWeight]  = useState('');
  const [pbHistory,   setPbHistory]   = useState<PBEntry[]>([]);
  const [pbInput,     setPbInput]     = useState('');
  const [pbOpen,      setPbOpen]      = useState(false);  // dropdown toggle

  // ── Add exercise modal ───────────────────────────────────────────────────
  const [addOpen,   setAddOpen]   = useState(false);
  const [addTab,    setAddTab]    = useState<'existing' | 'new'>('existing');
  const [allExs,    setAllExs]    = useState<Exercise[]>([]);
  const [search,    setSearch]    = useState('');
  const [newName,    setNewName]    = useState('');
  const [newMuscles, setNewMuscles] = useState<string[]>(['back']);
  const [newSets,    setNewSets]    = useState('3');
  const [newReps,    setNewReps]    = useState('10');
  const [newWeight,  setNewWeight]  = useState('0');

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    await ensureSeeded();
    const [templates, exs, jcts] = await Promise.all([getTemplates(), getExercises(), getJunctions()]);
    const tmpl = templates.find(t => t.id === templateId) ?? null;
    setTemplate(tmpl);
    setAllExs(exs);
    const templateJcts = jcts.filter(j => j.templateId === templateId).sort((a, b) => a.orderIndex - b.orderIndex);
    setJunctions(templateJcts);
    const exMap = Object.fromEntries(exs.map(e => [e.id, e]));
    setExercises(templateJcts.map(j => exMap[j.exerciseId]).filter(Boolean));
    setDone(await isDoneToday(templateId));
  }

  async function toggleDone() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (done) { await unmarkDoneToday(templateId); setDone(false); }
    else       { await markDoneToday(templateId);  setDone(true);  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
  }

  // Open exercise edit + PB modal.
  async function openEdit(ex: Exercise) {
    const pbs = await getPBHistory(ex.id);
    prevUnitRef.current = unitSystem;
    setEditEx(ex);
    setEditName(ex.name);
    setEditMuscles(ex.muscleGroups ?? []);
    setEditSets(String(ex.sets));
    setEditReps(repsFromStored(ex.reps));
    setEditWeight(formatWeightFromKg(ex.weightKg ?? 0, unitSystem));
    setPbHistory(pbs);
    setPbInput('');
    setPbOpen(false);
  }

  useEffect(() => {
    const prev = prevUnitRef.current;
    if (prev === unitSystem) return;
    if (editEx) {
      setEditWeight(v => convertWeightText(v, prev, unitSystem));
    }
    if (addOpen && addTab === 'new') {
      setNewWeight(v => convertWeightText(v, prev, unitSystem));
    }
    prevUnitRef.current = unitSystem;
  }, [unitSystem, editEx, addOpen, addTab]);

  async function persistEditEx(ex: Exercise) {
    const name = editName.trim().toUpperCase() || ex.name;
    const parsedKg = parseWeightToKg(editWeight, unitSystem);
    let weightKg = ex.weightKg;
    if (editWeight.trim() !== '' && parsedKg != null) {
      weightKg = parsedKg;
    }
    await updateExercise(ex.id, {
      name,
      muscleGroups: (editMuscles.length > 0 ? editMuscles : ex.muscleGroups) as Exercise['muscleGroups'],
      sets: parseInt(editSets, 10) || ex.sets,
      reps: editReps || repsFromStored(ex.reps),
      weightKg,
    });
  }

  async function closeEditModal() {
    const ex = editEx;
    if (!ex) return;
    await persistEditEx(ex);
    setEditEx(null);
    setPbOpen(false);
    load();
  }

  async function saveEdit() {
    if (!editEx) return;
    await persistEditEx(editEx);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditEx(null);
    setPbOpen(false);
    load();
  }

  async function handleLogPB() {
    if (!editEx || !pbInput.trim()) return;
    const kg = parseWeightToKg(pbInput, unitSystem);
    if (kg == null || kg <= 0) return;
    const entry = await logPB(editEx.id, kg);
    setPbHistory(prev => [...prev, entry].sort((a, b) => a.date.localeCompare(b.date)));
    setPbInput('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function handleDeletePB(id: string) {
    await deletePB(id);
    if (editEx) setPbHistory(await getPBHistory(editEx.id));
  }

  async function openEditAfterAdd(ex: Exercise) {
    setAddOpen(false);
    setSearch('');
    await load();
    await openEdit(ex);
  }

  async function handleAddExisting(exerciseId: string) {
    const ex = allExs.find(e => e.id === exerciseId);
    if (!ex) return;
    await addExerciseToTemplate(templateId, exerciseId);
    await openEditAfterAdd(ex);
  }

  async function handleCreateAndAdd() {
    if (!newName.trim()) return;
    const parsedKg = parseWeightToKg(newWeight, unitSystem);
    const ex = await createExercise({
      name: newName.trim().toUpperCase(),
      muscleGroups: (newMuscles.length > 0 ? newMuscles : ['back']) as Exercise['muscleGroups'],
      movementType: 'push',
      sets: parseInt(newSets, 10) || 3,
      reps: newReps || '10',
      weightKg: parsedKg != null ? parsedKg : 0,
    });
    await addExerciseToTemplate(templateId, ex.id);
    setAddOpen(false);
    setNewName('');
    setNewMuscles(['back']);
    setNewSets('3');
    setNewReps('10');
    setNewWeight(formatWeightFromKg(0, unitSystem));
    load();
  }

  async function handleRemove(junctionId: string) {
    await removeExerciseFromTemplate(junctionId);
    load();
  }

  const currentPB = pbHistory.length > 0 ? Math.max(...pbHistory.map(e => e.weightKg)) : null;
  const inTemplate = new Set(junctions.map(j => j.exerciseId));
  const filteredExs = allExs.filter(e =>
    !inTemplate.has(e.id) &&
    (search === '' || e.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <SafeAreaView style={s.container} edges={['top']}>

      {/* Header */}
      <View style={[s.header, { borderBottomColor: template?.colour ?? BORDER }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={ORANGE} />
        </TouchableOpacity>
        <View style={s.titleWrap}>
          <View style={[s.colourDot, { backgroundColor: template?.colour ?? ORANGE }]} />
          <Text style={s.title}>{template?.name ?? '...'}</Text>
        </View>
        <TouchableOpacity
          style={[s.doneBtn, done && s.doneBtnActive]}
          onPress={toggleDone}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name={done ? 'check-circle' : 'circle-outline'} size={16} color={done ? '#FFFFFF' : ORANGE} />
          <Text style={[s.doneBtnText, done && s.doneBtnTextActive]}>
            {done ? 'DONE!' : 'MARK DONE'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.countLabel}>{exercises.length} EXERCISES · TAP TO EDIT OR LOG PB</Text>

        {exercises.length === 0 && (
          <Text style={s.empty}>No exercises yet — tap + to add some.</Text>
        )}

        {exercises.map((ex, i) => {
          const jct = junctions[i];
          return (
            <View key={ex.id} style={s.exRow}>
              <View style={[s.indexBubble, { backgroundColor: template?.colour ?? ORANGE }]}>
                <Text style={s.indexText}>{i + 1}</Text>
              </View>
              {/* Tap name → edit + PB modal */}
              <TouchableOpacity style={s.exBody} onPress={() => openEdit(ex)} activeOpacity={0.75}>
                <Text style={s.exName}>{ex.name}</Text>
                <Text style={s.exMeta}>
                  {(ex.muscleGroups ?? []).join(', ').toUpperCase()}  ·  {ex.sets} × {ex.reps}  ·  {formatWeightWithUnit(ex.weightKg ?? 0, unitSystem)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleRemove(jct.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialCommunityIcons name="minus-circle-outline" size={20} color={FAINT} />
              </TouchableOpacity>
            </View>
          );
        })}

        <TouchableOpacity style={s.addRow} onPress={() => setAddOpen(true)} activeOpacity={0.8}>
          <MaterialCommunityIcons name="plus-circle-outline" size={18} color={ORANGE} />
          <Text style={s.addText}>ADD EXERCISE</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Exercise edit + PB modal (centred, above keyboard) ────────────── */}
      <Modal visible={editEx !== null} transparent animationType="fade" onRequestClose={closeEditModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.kvFill}>
          <Pressable style={s.centreBackdrop} onPress={closeEditModal}>
            <Pressable style={s.centreCard} onPress={e => e.stopPropagation()}>
              <View style={s.modalUnitCorner}>
                <UnitToggle unitSystem={unitSystem} setUnitSystem={setUnitSystem} />
              </View>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                <TextInput
                  style={s.editNameInput}
                  value={editName}
                  onChangeText={setEditName}
                  autoCapitalize="characters"
                  placeholder="EXERCISE NAME"
                  placeholderTextColor={FAINT}
                />

                <WeightRepsInputs
                  weight={editWeight}
                  reps={editReps}
                  unitLabel={weightUnitLabel(unitSystem)}
                  onWeightChange={setEditWeight}
                  onRepsChange={setEditReps}
                />

                <Text style={[s.fieldLabel, s.fieldLabelCenter]}>SETS</Text>
                <SetCountPicker value={editSets} onChange={setEditSets} />

                <Text style={s.fieldLabel}>MUSCLES</Text>
                <MusclePicker selected={editMuscles} onChange={setEditMuscles} />

                <TouchableOpacity style={s.saveBtn} onPress={saveEdit}>
                  <Text style={s.saveBtnText}>SAVE CHANGES</Text>
                </TouchableOpacity>

                {/* ── PB section — collapsible dropdown ─────── */}
                <View style={s.pbDivider} />
                <TouchableOpacity style={s.pbDropdownBtn} onPress={() => setPbOpen(o => !o)}>
                  <Text style={s.pbDropdownLabel}>
                    PERSONAL BEST{currentPB !== null ? `  ·  ${formatWeightWithUnit(currentPB, unitSystem)}` : ''}
                  </Text>
                  <MaterialCommunityIcons name={pbOpen ? 'chevron-up' : 'chevron-down'} size={18} color={MUTED} />
                </TouchableOpacity>

                {pbOpen && (
                  <>
                    {pbHistory.length >= 2 && (
                      <View style={s.chartWrap}>
                        <PBChart entries={pbHistory} />
                      </View>
                    )}

                    <View style={s.pbInputRow}>
                      <TextInput
                        style={s.pbWeightInput}
                        value={pbInput}
                        onChangeText={setPbInput}
                        placeholder={weightUnitLabel(unitSystem)}
                        placeholderTextColor={FAINT}
                        keyboardType="decimal-pad"
                      />
                      <TouchableOpacity style={s.pbLogBtn} onPress={handleLogPB}>
                        <Text style={s.pbLogBtnText}>LOG PB</Text>
                      </TouchableOpacity>
                    </View>

                    {pbHistory.length > 0 && (
                      <View style={s.pbList}>
                        {[...pbHistory].reverse().map(entry => (
                          <View key={entry.id} style={s.pbRow}>
                            <Text style={s.pbDate}>{entry.date}</Text>
                            <Text style={[s.pbWeight, entry.weightKg === currentPB && s.pbWeightBest]}>
                              {formatWeightWithUnit(entry.weightKg, unitSystem)}{entry.weightKg === currentPB ? ' 🏆' : ''}
                            </Text>
                            <TouchableOpacity onPress={() => handleDeletePB(entry.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <MaterialCommunityIcons name="close" size={14} color={FAINT} />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                )}

              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Add exercise modal (centred, above keyboard) ───────────────────── */}
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.kvFill}>
          <Pressable style={s.centreBackdrop} onPress={() => setAddOpen(false)}>
            <Pressable style={s.centreCard} onPress={e => e.stopPropagation()}>
              {addTab === 'new' && (
                <View style={s.modalUnitCorner}>
                  <UnitToggle unitSystem={unitSystem} setUnitSystem={setUnitSystem} />
                </View>
              )}
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                <View style={[s.tabRow, addTab === 'new' && s.tabRowBelowToggle]}>
                  {(['existing','new'] as const).map(tab => (
                    <TouchableOpacity key={tab} style={[s.tab, addTab === tab && s.tabActive]} onPress={() => setAddTab(tab)}>
                      <Text style={[s.tabText, addTab === tab && s.tabTextActive]}>
                        {tab === 'existing' ? 'FROM LIBRARY' : 'CREATE NEW'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {addTab === 'existing' ? (
                  <>
                    <TextInput
                      style={s.search}
                      value={search}
                      onChangeText={setSearch}
                      placeholder="SEARCH..."
                      placeholderTextColor={FAINT}
                      autoCapitalize="characters"
                    />
                    <View style={{ maxHeight: 260 }}>
                      <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled>
                        {filteredExs.length === 0 && <Text style={s.empty}>Nothing matches.</Text>}
                        {filteredExs.map(e => (
                          <TouchableOpacity key={e.id} style={s.libRow} onPress={() => handleAddExisting(e.id)}>
                            <View>
                              <Text style={s.libName}>{e.name}</Text>
                              <Text style={s.libMeta}>{(e.muscleGroups ?? []).join(', ').toUpperCase()}  ·  {e.sets} × {e.reps}</Text>
                            </View>
                            <MaterialCommunityIcons name="plus" size={20} color={ORANGE} />
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  </>
                ) : (
                  <>
                    <TextInput
                      style={s.createNameInput}
                      value={newName}
                      onChangeText={setNewName}
                      placeholder="EXERCISE NAME"
                      placeholderTextColor={FAINT}
                      autoCapitalize="characters"
                      autoFocus
                    />

                    <WeightRepsInputs
                      weight={newWeight}
                      reps={newReps}
                      unitLabel={weightUnitLabel(unitSystem)}
                      onWeightChange={setNewWeight}
                      onRepsChange={setNewReps}
                    />

                    <Text style={[s.fieldLabel, s.fieldLabelCenter]}>SETS</Text>
                    <SetCountPicker value={newSets} onChange={setNewSets} />

                    <Text style={s.fieldLabel}>MUSCLES</Text>
                    <MusclePicker selected={newMuscles} onChange={setNewMuscles} />

                    <TouchableOpacity style={s.saveBtn} onPress={handleCreateAndAdd}>
                      <Text style={s.saveBtnText}>ADD TO WORKOUT</Text>
                    </TouchableOpacity>
                  </>
                )}

              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F2ED' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 2 },
  backBtn: { padding: 4 },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginLeft: 8 },
  colourDot: { width: 12, height: 12, borderRadius: 6 },
  title: { fontFamily: 'PixeloidSans_700Bold', fontSize: 16, color: INK, letterSpacing: 1 },
  doneBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: ORANGE, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  doneBtnActive: { backgroundColor: GREEN, borderColor: GREEN },
  doneBtnText: { fontFamily: 'PixeloidSans_700Bold', fontSize: 9, color: ORANGE, letterSpacing: 1 },
  doneBtnTextActive: { color: '#FFFFFF' },

  scroll: { padding: 16, paddingBottom: 40 },
  countLabel: { fontFamily: 'PixeloidSans_400Regular', fontSize: 8, color: FAINT, letterSpacing: 1, marginBottom: 14 },
  empty: { fontFamily: 'PixeloidSans_400Regular', fontSize: 10, color: MUTED, textAlign: 'center', marginVertical: 16 },

  exRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 10, borderWidth: 1, borderColor: BORDER, padding: 14, marginBottom: 10 },
  indexBubble: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  indexText: { fontFamily: 'PixeloidSans_700Bold', fontSize: 11, color: '#FFFFFF' },
  exBody: { flex: 1 },
  exName: { fontFamily: 'PixeloidSans_700Bold', fontSize: 12, color: INK, letterSpacing: 1 },
  exMeta: { fontFamily: 'PixeloidSans_400Regular', fontSize: 8, color: MUTED, marginTop: 4, letterSpacing: 1 },

  addRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: ORANGE, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 14, marginTop: 6 },
  addText: { fontFamily: 'PixeloidSans_700Bold', fontSize: 10, color: ORANGE, letterSpacing: 1 },

  // ── Shared modal shell ─────────────────────────────────────────────────
  kvFill: { flex: 1 },
  centreBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  centreCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    maxHeight: '88%',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 12,
  },
  modalUnitCorner: { position: 'absolute', top: 14, right: 14, zIndex: 2 },
  unitToggle: {
    flexDirection: 'row',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: ORANGE,
    overflow: 'hidden',
    backgroundColor: CARD,
  },
  unitPill: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: CARD },
  unitPillLeft: { borderTopLeftRadius: 999, borderBottomLeftRadius: 999 },
  unitPillRight: { borderTopRightRadius: 999, borderBottomRightRadius: 999 },
  unitPillActive: { backgroundColor: ORANGE },
  unitPillText: { fontFamily: 'PixeloidSans_700Bold', fontSize: 8, color: MUTED, letterSpacing: 1 },
  unitPillTextActive: { color: '#FFFFFF' },

  // ── Edit form fields ───────────────────────────────────────────────────
  editNameInput: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 15,
    color: INK,
    borderBottomWidth: 2,
    borderBottomColor: BORDER,
    paddingVertical: 8,
    marginBottom: 18,
    paddingRight: 76,
  },
  createNameInput: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 22,
    color: INK,
    paddingVertical: 10,
    marginBottom: 18,
    paddingHorizontal: 76,
    textAlign: 'center',
    alignSelf: 'stretch',
    width: '100%',
  },
  fieldLabel: { fontFamily: 'PixeloidSans_400Regular', fontSize: 8, color: MUTED, letterSpacing: 1, marginBottom: 8 },
  fieldLabelCenter: { textAlign: 'center', alignSelf: 'stretch' },
  weightRepsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 18 },
  weightBox: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-end', minWidth: 100 },
  weightInput: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 36,
    color: INK,
    paddingVertical: 0,
    paddingHorizontal: 0,
    minWidth: 56,
    textAlign: 'right',
  },
  weightUnit: { fontFamily: 'PixeloidSans_700Bold', fontSize: 14, color: MUTED, marginLeft: 4, paddingBottom: 4 },
  weightRepsX: { fontFamily: 'PixeloidSans_700Bold', fontSize: 28, color: MUTED, paddingTop: 6 },
  repsField: { flexDirection: 'row', alignItems: 'baseline', minWidth: 72 },
  repsInput: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 28,
    color: INK,
    paddingVertical: 0,
    paddingHorizontal: 0,
    minWidth: 40,
    textAlign: 'left',
    marginTop: 6,
  },
  repsUnit: { fontFamily: 'PixeloidSans_700Bold', fontSize: 11, color: MUTED, marginLeft: 4, paddingBottom: 2 },
  repsInputStandalone: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 22,
    color: INK,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
    textAlign: 'center',
  },
  musclePickerWrap: { marginBottom: 18 },
  muscleDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    backgroundColor: CARD,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  muscleDropdownText: { flex: 1, fontFamily: 'PixeloidSans_400Regular', fontSize: 11, color: INK, marginRight: 8 },
  musclePanel: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    backgroundColor: CARD,
    overflow: 'hidden',
  },
  muscleSearch: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 12,
    color: INK,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  muscleList: { maxHeight: 160 },
  muscleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  muscleOptionOn: { backgroundColor: ORANGE },
  muscleOptionText: { fontFamily: 'PixeloidSans_400Regular', fontSize: 11, color: INK },
  muscleOptionTextOn: { color: '#FFFFFF', fontFamily: 'PixeloidSans_700Bold' },
  setRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  setCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setCircleActive: { backgroundColor: ORANGE },
  setChipText: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 10,
    color: INK,
    textAlign: 'center',
    minWidth: 28,
    lineHeight: Platform.OS === 'android' ? 28 : 12,
    ...(Platform.OS === 'android' ? { includeFontPadding: false, textAlignVertical: 'center' as const } : {}),
  },
  setChipTextActive: { color: '#FCFBF9' },
  saveBtn: { backgroundColor: ORANGE, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginBottom: 2 },
  saveBtnText: { fontFamily: 'PixeloidSans_700Bold', fontSize: 11, color: '#FFFFFF', letterSpacing: 1 },

  // ── PB section ─────────────────────────────────────────────────────────
  pbDivider: { height: 1, backgroundColor: BORDER, marginVertical: 14 },
  pbDropdownBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  pbDropdownLabel: { fontFamily: 'PixeloidSans_700Bold', fontSize: 10, color: INK, letterSpacing: 1 },
  chartWrap: { alignItems: 'center', marginBottom: 12 },
  pbInputRow: { flexDirection: 'row', gap: 10, marginBottom: 12, alignItems: 'center' },
  pbWeightInput: { flex: 1, fontFamily: 'PixeloidSans_700Bold', fontSize: 18, color: INK, borderBottomWidth: 2, borderBottomColor: BORDER, paddingVertical: 8, textAlign: 'center' },
  pbLogBtn: { backgroundColor: ORANGE, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10 },
  pbLogBtnText: { fontFamily: 'PixeloidSans_700Bold', fontSize: 10, color: '#FFFFFF', letterSpacing: 1 },
  pbList: { borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 10 },
  pbRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER },
  pbDate: { fontFamily: 'PixeloidSans_400Regular', fontSize: 9, color: MUTED, flex: 1 },
  pbWeight: { fontFamily: 'PixeloidSans_700Bold', fontSize: 12, color: INK, marginRight: 12 },
  pbWeightBest: { color: ORANGE },

  // ── Add exercise modal ─────────────────────────────────────────────────
  tabRow: { flexDirection: 'row', marginBottom: 16, borderRadius: 8, backgroundColor: '#F5F2ED', padding: 4 },
  tabRowBelowToggle: { marginTop: 34 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  tabActive: { backgroundColor: '#FFFFFF' },
  tabText: { fontFamily: 'PixeloidSans_700Bold', fontSize: 9, color: MUTED, letterSpacing: 1 },
  tabTextActive: { color: INK },
  search: { fontFamily: 'PixeloidSans_400Regular', fontSize: 12, color: INK, borderBottomWidth: 2, borderBottomColor: BORDER, paddingVertical: 8, marginBottom: 10 },
  libRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER },
  libName: { fontFamily: 'PixeloidSans_700Bold', fontSize: 11, color: INK },
  libMeta: { fontFamily: 'PixeloidSans_400Regular', fontSize: 8, color: MUTED, marginTop: 3, letterSpacing: 1 },
});
