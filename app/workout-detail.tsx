// Workout detail — exercise list, PB tracking per exercise, mark done today.

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Modal, Pressable, TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, { Polyline, Circle } from 'react-native-svg';
import {
  ensureSeeded, getTemplates, getExercises, getJunctions,
  getTemplateExercises, isDoneToday, markDoneToday, unmarkDoneToday,
  createExercise, addExerciseToTemplate, removeExerciseFromTemplate,
  updateExercise, getPBHistory, logPB, deletePB, getSetsForDay,
  type WorkoutTemplate, type Exercise, type WorkoutExercise, type PBEntry, type SetEntry,
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

import { C, F } from '@/lib/theme';
import { useInFlight } from '@/lib/use-in-flight';
import { TAP, hit } from '@/lib/hit';
import { bleBridge } from '@/lib/ble-bridge';
import { toDateKey } from '@/lib/dateKey';
import { ScreenHeader, HeaderPill } from '@/components/ScreenHeader';
import { UndoToast } from '@/components/UndoToast';
import { removeWithUndo, usePendingRemovals } from '@/lib/undo';
const ORANGE = C.hot;
const INK    = C.ink;
const GREEN  = C.live;

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
          placeholderTextColor={C.faint}
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
          placeholderTextColor={C.faint}
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
        hitSlop={hit(48, 22)}
        onPress={() => setUnitSystem('metric')}
        activeOpacity={0.85}
      >
        <Text style={[s.unitPillText, unitSystem === 'metric' && s.unitPillTextActive]}>KG</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.unitPill, s.unitPillRight, unitSystem === 'imperial' && s.unitPillActive]}
        hitSlop={hit(48, 22)}
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
          color={C.dim}
        />
      </TouchableOpacity>

      {open && (
        <View style={s.musclePanel}>
          <TextInput
            style={s.muscleSearch}
            value={query}
            onChangeText={setQuery}
            placeholder="SEARCH MUSCLES..."
            placeholderTextColor={C.faint}
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
                    <MaterialCommunityIcons name="check" size={14} color={C.onHot} />
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
            stroke={C.hot}
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
          fill={i === pts.length - 1 ? C.hot : C.surface}
          stroke={C.hot}
          strokeWidth={2}
        />
      ))}
    </Svg>
  );
}

export default function WorkoutDetailScreen() {
  // exerciseId (optional): open that exercise's sheet straight away -- TRAIN's
  // exercise rows link here with it.
  const { templateId, exerciseId } = useLocalSearchParams<{ templateId: string; exerciseId?: string }>();
  const openedParam = useRef(false);
  const { unitSystem, setUnitSystem } = useUnitPreference();
  const prevUnitRef = useRef<UnitSystem>(unitSystem);

  const [template,  setTemplate]  = useState<WorkoutTemplate | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [junctions, setJunctions] = useState<WorkoutExercise[]>([]);
  // Lifts and PBs removed here are gone at once; the toast's UNDO brings them back.
  const gone = usePendingRemovals();
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
  const [puck,        setPuck]        = useState<'idle' | 'sending' | 'sent'>('idle');
  const [sets,        setSets]        = useState<SetEntry[]>([]);

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
    if (exerciseId && !openedParam.current && exMap[exerciseId]) {
      openedParam.current = true;
      openEdit(exMap[exerciseId]);
    }
  }

  async function toggleDone() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Shows now; the write follows, and a failure puts it back.
    const was = done;
    setDone(!was);
    try {
      if (was) await unmarkDoneToday(templateId);
      else { await markDoneToday(templateId); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
    } catch {
      setDone(was);
      Alert.alert("Couldn't save that", "It's back how it was. Try again.");
    }
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
    setPuck('idle');
    setSets([]);
    getSetsForDay(ex.id, toDateKey(new Date())).then(setSets);
  }

  // Sets the puck sends back for the open exercise refresh its list live.
  useEffect(() => {
    if (!editEx) return;
    return bleBridge.onSetLogged(id => {
      if (id !== editEx.id) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      getSetsForDay(id, toDateKey(new Date())).then(setSets);
    });
  }, [editEx]);

  // SEND TO PUCK: the puck jumps to LIFT with this exercise and starts the
  // countdown; the set it measures comes back tagged with this exercise and
  // today (lib/ble-bridge.ts) and lands in the list below.
  async function sendToPuck() {
    if (!editEx || puck === 'sending') return;
    const name = editName.trim().toUpperCase() || editEx.name;
    const kg = parseWeightToKg(editWeight, unitSystem) ?? editEx.weightKg ?? 0;
    setPuck('sending');
    const ok = await bleBridge.sendToPuck(editEx.id, name, kg).catch(() => false);
    if (!ok) {
      setPuck('idle');
      Alert.alert('Puck not connected', 'Turn the puck on and keep it near your phone, then try again.', [
        { text: 'OK', style: 'cancel' },
        { text: 'Open Puck', onPress: () => { closeEditModal(); router.push('/ble-bridge'); } },
      ]);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPuck('sent');
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

  const [logging, once] = useInFlight(); // a double tap logs one PB

  async function handleLogPB() {
    if (!editEx || !pbInput.trim()) return;
    const kg = parseWeightToKg(pbInput, unitSystem);
    if (kg == null || kg <= 0) return;
    const entry = await logPB(editEx.id, kg);
    setPbHistory(prev => [...prev, entry].sort((a, b) => a.date.localeCompare(b.date)));
    setPbInput('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function handleDeletePB(id: string) {
    const ex = editEx;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    removeWithUndo({ key: id, label: 'PB DELETED', commit: () => deletePB(id), after: async () => { if (ex) setPbHistory(await getPBHistory(ex.id)); } });
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

  function handleRemove(jct: WorkoutExercise, name: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    removeWithUndo({ key: jct.id, label: `${name.toUpperCase()} REMOVED`, commit: () => removeExerciseFromTemplate(jct.id), after: load });
  }

  const listed = exercises.map((ex, i) => ({ ex, jct: junctions[i] })).filter(x => !x.jct || !gone.has(x.jct.id));
  const pbs = pbHistory.filter(e => !gone.has(e.id));
  const currentPB = pbs.length > 0 ? Math.max(...pbs.map(e => e.weightKg)) : null;
  const inTemplate = new Set(junctions.map(j => j.exerciseId));
  const filteredExs = allExs.filter(e =>
    !inTemplate.has(e.id) &&
    (search === '' || e.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <SafeAreaView style={s.container} edges={['top']}>

      {/* Header */}
      <ScreenHeader
        title={template?.name ?? '...'}
        right={<HeaderPill label={done ? 'DONE' : 'MARK DONE'} on={done} onPress={toggleDone} />}
      />

      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.countLabel}>{listed.length} EXERCISES · TAP TO EDIT OR LOG PB</Text>

        {listed.length === 0 && (
          <Text style={s.empty}>No exercises yet — tap + to add some.</Text>
        )}

        {listed.map(({ ex, jct }, i) => {
          return (
            <View key={ex.id} style={s.exRow}>
              <View style={[s.indexBubble, { backgroundColor: template?.colour ?? C.hot }]}>
                <Text style={s.indexText}>{i + 1}</Text>
              </View>
              {/* Tap name → edit + PB modal */}
              <TouchableOpacity style={s.exBody} onPress={() => openEdit(ex)} activeOpacity={0.75} hitSlop={hit(200, 34)}>
                <Text style={s.exName}>{ex.name}</Text>
                <Text style={s.exMeta}>
                  {(ex.muscleGroups ?? []).join(', ').toUpperCase()}  ·  {ex.sets} × {ex.reps}  ·  {formatWeightWithUnit(ex.weightKg ?? 0, unitSystem)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleRemove(jct, ex.name)}
                hitSlop={hit(20)}
                accessibilityLabel={`Remove ${ex.name}`}
              >
                <MaterialCommunityIcons name="minus-circle-outline" size={20} color={C.faint} />
              </TouchableOpacity>
            </View>
          );
        })}

        <TouchableOpacity style={s.addRow} onPress={() => setAddOpen(true)} activeOpacity={0.8}>
          <MaterialCommunityIcons name="plus-circle-outline" size={18} color={C.hot} />
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
                  placeholderTextColor={C.faint}
                />

                <WeightRepsInputs
                  weight={editWeight}
                  reps={editReps}
                  unitLabel={weightUnitLabel(unitSystem)}
                  onWeightChange={setEditWeight}
                  onRepsChange={setEditReps}
                />

                <TouchableOpacity style={s.puckBtn} onPress={sendToPuck} activeOpacity={0.85} accessibilityLabel="Send to puck">
                  <MaterialCommunityIcons name={puck === 'sent' ? 'check' : 'send'} size={16} color={C.onHot} />
                  <Text style={s.puckBtnText}>{puck === 'sending' ? 'SENDING' : puck === 'sent' ? 'SENT  -  SEND AGAIN' : 'SEND TO PUCK'}</Text>
                </TouchableOpacity>
                <Text style={s.puckHint}>
                  {puck === 'sent'
                    ? 'Countdown is on the puck. Hold it still, then lift. Sets appear here when you finish.'
                    : 'Starts the countdown on the puck and logs what it measures to this exercise, today.'}
                </Text>

                {sets.length > 0 && (
                  <View style={s.loggedList}>
                    <Text style={s.fieldLabel}>TODAY · {sets.length} SET{sets.length === 1 ? '' : 'S'}</Text>
                    {sets.map((st, i) => (
                      <View key={st.id} style={s.loggedRow}>
                        <Text style={s.loggedIdx}>{i + 1}</Text>
                        <Text style={s.loggedMain}>{formatWeightWithUnit(st.weightKg, unitSystem)} × {st.reps}</Text>
                        <Text style={s.loggedMeasured} numberOfLines={1}>
                          {[st.romCm != null ? `${Math.round(st.romCm)} cm` : null,
                            st.peakVelocityMps != null ? `${st.peakVelocityMps.toFixed(2)} m/s` : null].filter(Boolean).join('  ·  ')}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

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
                  <MaterialCommunityIcons name={pbOpen ? 'chevron-up' : 'chevron-down'} size={18} color={C.dim} />
                </TouchableOpacity>

                {pbOpen && (
                  <>
                    {pbs.length >= 2 && (
                      <View style={s.chartWrap}>
                        <PBChart entries={pbs} />
                      </View>
                    )}

                    <View style={s.pbInputRow}>
                      <TextInput
                        style={s.pbWeightInput}
                        value={pbInput}
                        onChangeText={setPbInput}
                        placeholder={weightUnitLabel(unitSystem)}
                        placeholderTextColor={C.faint}
                        keyboardType="decimal-pad"
                      />
                      <TouchableOpacity style={[s.pbLogBtn, logging && { opacity: 0.5 }]} onPress={() => once(handleLogPB)} disabled={logging}>
                        <Text style={s.pbLogBtnText}>LOG PB</Text>
                      </TouchableOpacity>
                    </View>

                    {pbs.length > 0 && (
                      <View style={s.pbList}>
                        {[...pbs].reverse().map(entry => (
                          <View key={entry.id} style={s.pbRow}>
                            <Text style={s.pbDate}>{entry.date}</Text>
                            <Text style={[s.pbWeight, entry.weightKg === currentPB && s.pbWeightBest]}>
                              {formatWeightWithUnit(entry.weightKg, unitSystem)}{entry.weightKg === currentPB ? ' 🏆' : ''}
                            </Text>
                            <TouchableOpacity onPress={() => handleDeletePB(entry.id)} hitSlop={hit(14)} accessibilityLabel={`Delete PB ${entry.date}`}>
                              <MaterialCommunityIcons name="close" size={14} color={C.faint} />
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
        {/* A modal covers the root toast, so a PB deleted in here gets its own. */}
        <UndoToast nested />
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
                    <TouchableOpacity key={tab} style={[s.tab, addTab === tab && s.tabActive]} onPress={() => setAddTab(tab)} hitSlop={hit(100, 30)}>
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
                      placeholderTextColor={C.faint}
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
                            <MaterialCommunityIcons name="plus" size={20} color={C.hot} />
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
                      placeholderTextColor={C.faint}
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
  container: { flex: 1, backgroundColor: C.surface },


  scroll: { padding: 16, paddingBottom: 40 },
  countLabel: { fontFamily: F.mono, fontSize: 9, color: C.faint, letterSpacing: 1, marginBottom: 14 },
  empty: { fontFamily: F.mono, fontSize: 11, color: C.dim, textAlign: 'center', marginVertical: 16 },

  exRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 10, borderCurve: 'continuous', borderWidth: 1, borderColor: C.line, padding: 14, marginBottom: 10 },
  indexBubble: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  indexText: { fontFamily: F.mono, fontSize: 12, color: C.onHot },
  exBody: { flex: 1 },
  exName: { fontFamily: F.mono, fontSize: 12, color: C.ink, letterSpacing: 1 },
  exMeta: { fontFamily: F.mono, fontSize: 9, color: C.dim, marginTop: 4, letterSpacing: 1 },

  addRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: TAP, borderWidth: 1.5, borderColor: C.hot, borderStyle: 'dashed', borderRadius: 10, borderCurve: 'continuous', paddingVertical: 14, marginTop: 6 },
  addText: { fontFamily: F.mono, fontSize: 11, color: C.hot, letterSpacing: 1 },

  // ── Shared modal shell ─────────────────────────────────────────────────
  kvFill: { flex: 1 },
  centreBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  centreCard: {
    width: '100%',
    backgroundColor: C.surface,
    borderRadius: 16, borderCurve: 'continuous',
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
    borderColor: C.hot,
    overflow: 'hidden',
    backgroundColor: C.surface,
  },
  unitPill: { paddingHorizontal: 15, paddingVertical: 5, backgroundColor: C.surface },
  unitPillLeft: { borderTopLeftRadius: 999, borderBottomLeftRadius: 999 },
  unitPillRight: { borderTopRightRadius: 999, borderBottomRightRadius: 999 },
  unitPillActive: { backgroundColor: ORANGE },
  unitPillText: { fontFamily: F.mono, fontSize: 9, color: C.dim, letterSpacing: 1 },
  unitPillTextActive: { color: C.surface },

  // ── Edit form fields ───────────────────────────────────────────────────
  editNameInput: {
    fontFamily: F.mono,
    fontSize: 15,
    color: C.ink,
    borderBottomWidth: 2,
    borderBottomColor: C.line,
    paddingVertical: 8,
    marginBottom: 18,
    paddingRight: 76,
  },
  createNameInput: {
    fontFamily: F.mono,
    fontSize: 22,
    color: C.ink,
    paddingVertical: 10,
    marginBottom: 18,
    paddingHorizontal: 76,
    textAlign: 'center',
    alignSelf: 'stretch',
    width: '100%',
  },
  fieldLabel: { fontFamily: F.mono, fontSize: 9, color: C.dim, letterSpacing: 1, marginBottom: 8 },
  fieldLabelCenter: { textAlign: 'center', alignSelf: 'stretch' },
  weightRepsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 18 },
  weightBox: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-end', minWidth: 100 },
  weightInput: {
    fontFamily: F.dot,
    fontSize: 28,
    color: C.ink,
    paddingVertical: 0,
    paddingHorizontal: 0,
    minWidth: 56,
    textAlign: 'right',
  },
  weightUnit: { fontFamily: F.mono, fontSize: 14, color: C.dim, marginLeft: 4, paddingBottom: 4 },
  weightRepsX: { fontFamily: F.mono, fontSize: 28, color: C.dim, paddingTop: 6 },
  repsField: { flexDirection: 'row', alignItems: 'baseline', minWidth: 72 },
  repsInput: {
    fontFamily: F.dot,
    fontSize: 28,
    color: C.ink,
    paddingVertical: 0,
    paddingHorizontal: 0,
    minWidth: 40,
    textAlign: 'left',
    marginTop: 6,
  },
  repsUnit: { fontFamily: F.mono, fontSize: 12, color: C.dim, marginLeft: 4, paddingBottom: 2 },
  repsInputStandalone: {
    fontFamily: F.dot,
    fontSize: 22,
    color: C.ink,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8, borderCurve: 'continuous',
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
    borderColor: C.line,
    borderRadius: 8, borderCurve: 'continuous',
    backgroundColor: C.surface,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  muscleDropdownText: { flex: 1, fontFamily: F.mono, fontSize: 12, color: C.ink, marginRight: 8 },
  musclePanel: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8, borderCurve: 'continuous',
    backgroundColor: C.surface,
    overflow: 'hidden',
  },
  muscleSearch: {
    fontFamily: F.mono,
    fontSize: 12,
    color: C.ink,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  muscleList: { maxHeight: 160 },
  muscleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: TAP,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  muscleOptionOn: { backgroundColor: ORANGE },
  muscleOptionText: { fontFamily: F.mono, fontSize: 12, color: C.ink },
  muscleOptionTextOn: { color: C.surface, fontFamily: F.mono },
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
    fontFamily: F.mono,
    fontSize: 10,
    color: C.ink,
    textAlign: 'center',
    minWidth: 28,
    lineHeight: Platform.OS === 'android' ? 28 : 12,
    ...(Platform.OS === 'android' ? { includeFontPadding: false, textAlignVertical: 'center' as const } : {}),
  },
  setChipTextActive: { color: C.surface },
  saveBtn: { backgroundColor: ORANGE, borderRadius: 10, borderCurve: 'continuous', minHeight: TAP, justifyContent: 'center', paddingVertical: 13, alignItems: 'center', marginBottom: 2 },
  saveBtnText: { fontFamily: F.mono, fontSize: 12, color: C.onHot, letterSpacing: 1 },

  // ── PB section ─────────────────────────────────────────────────────────
  pbDivider: { height: 1, backgroundColor: C.line, marginVertical: 14 },
  puckBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.hot, borderRadius: 999, minHeight: 48, marginBottom: 8 },
  puckBtnText: { fontFamily: F.dot, fontSize: 13, color: C.onHot, letterSpacing: 2 },
  puckHint: { fontFamily: F.mono, fontSize: 11, color: C.dim, textAlign: 'center', lineHeight: 16, marginBottom: 16 },
  loggedList: { borderWidth: 1, borderColor: C.line, borderRadius: 12, borderCurve: 'continuous', padding: 12, marginBottom: 18, backgroundColor: C.bg },
  loggedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  loggedIdx: { fontFamily: F.dot, fontSize: 12, color: C.faint, width: 16 },
  loggedMain: { fontFamily: F.mono, fontSize: 14, color: C.ink },
  loggedMeasured: { fontFamily: F.mono, fontSize: 11, color: C.dim, flex: 1, textAlign: 'right' },
  pbDropdownBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  pbDropdownLabel: { fontFamily: F.mono, fontSize: 11, color: C.ink, letterSpacing: 1 },
  chartWrap: { alignItems: 'center', marginBottom: 12 },
  pbInputRow: { flexDirection: 'row', gap: 10, marginBottom: 12, alignItems: 'center' },
  pbWeightInput: { flex: 1, fontFamily: F.dot, fontSize: 15, color: C.ink, borderBottomWidth: 2, borderBottomColor: C.line, paddingVertical: 8, textAlign: 'center' },
  pbLogBtn: { backgroundColor: ORANGE, borderRadius: 20, borderCurve: 'continuous', minHeight: TAP, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 10 },
  pbLogBtnText: { fontFamily: F.mono, fontSize: 11, color: C.onHot, letterSpacing: 1 },
  pbList: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 },
  pbRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line },
  pbDate: { fontFamily: F.mono, fontSize: 10, color: C.dim, flex: 1 },
  pbWeight: { fontFamily: F.mono, fontSize: 12, color: C.ink, marginRight: 12 },
  pbWeightBest: { color: ORANGE },

  // ── Add exercise modal ─────────────────────────────────────────────────
  tabRow: { flexDirection: 'row', marginBottom: 16, borderRadius: 8, borderCurve: 'continuous', backgroundColor: C.surface, padding: 4 },
  tabRowBelowToggle: { marginTop: 34 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6, borderCurve: 'continuous' },
  tabActive: { backgroundColor: C.surface },
  tabText: { fontFamily: F.mono, fontSize: 10, color: C.dim, letterSpacing: 1 },
  tabTextActive: { color: INK },
  search: { fontFamily: F.mono, fontSize: 12, color: C.ink, borderBottomWidth: 2, borderBottomColor: C.line, paddingVertical: 8, marginBottom: 10 },
  libRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  libName: { fontFamily: F.mono, fontSize: 12, color: C.ink },
  libMeta: { fontFamily: F.mono, fontSize: 9, color: C.dim, marginTop: 3, letterSpacing: 1 },
});
