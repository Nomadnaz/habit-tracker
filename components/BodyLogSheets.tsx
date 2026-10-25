// Water + weight quick-log sheets. They live on BODY's vitals grid (they used
// to sit at the bottom of TRAIN). Each writes through lib/body-data.ts and
// hands the updated store back so the caller can re-render its numbers.
// Both are the shared bottom Sheet, so they swipe down to close.
import { useState, type ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import * as Haptics from 'expo-haptics';
import { addWater, logWeight, todayWaterMl, latestWeight, type BodyData } from '@/lib/body-data';
import { C, F } from '@/lib/theme';
import { Sheet } from '@/components/today/bits';

/** `spot` floats above the dimmed screen (BODY's tapped readout, still lit). */
export function WaterSheet({ visible, data, onData, onClose, spot }: {
  visible: boolean; data: BodyData; onData: (d: BodyData) => void; onClose: () => void; spot?: ReactNode;
}) {
  const waterMl = todayWaterMl(data);

  async function quickWater(ml: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const d = await addWater(ml);
    onData({ ...d });
  }

  return (
    <Sheet visible={visible} onClose={onClose} spot={spot}>
      <View style={styles.sheet}>
        <Text style={styles.sheetLabel}>ADD WATER</Text>
        <Text style={styles.sheetTotal}>{(waterMl / 1000).toFixed(2)}L <Text style={styles.sheetTotalSub}>/ {(data.waterGoalMl / 1000).toFixed(1)}L</Text></Text>
        <View style={styles.waterBtnRow}>
          {[250, 500, 750].map(ml => (
            <TouchableOpacity key={ml} style={styles.waterBtn} onPress={() => quickWater(ml)} activeOpacity={0.8}>
              <Text style={styles.waterBtnText}>+{ml}</Text>
              <Text style={styles.waterBtnUnit}>ML</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
          <Text style={styles.doneBtnText}>DONE</Text>
        </TouchableOpacity>
      </View>
    </Sheet>
  );
}

export function WeightSheet({ visible, data, onData, onClose, spot }: {
  visible: boolean; data: BodyData; onData: (d: BodyData) => void; onClose: () => void; spot?: ReactNode;
}) {
  const [input, setInput] = useState('');
  const weight = latestWeight(data);

  async function save() {
    const kg = parseFloat(input);
    if (!kg || kg <= 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const d = await logWeight(kg);
    onData({ ...d });
    setInput('');
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={onClose} spot={spot}>
      <View style={styles.sheet}>
        <Text style={styles.sheetLabel}>LOG WEIGHT</Text>
        <Text style={styles.sheetTotal}>{weight.toFixed(1)}<Text style={styles.sheetTotalSub}> KG NOW</Text></Text>
        <TextInput
          style={styles.weightInput}
          value={input}
          onChangeText={setInput}
          placeholder="ENTER KG"
          placeholderTextColor={C.faint}
          keyboardType="decimal-pad"
          autoFocus
        />
        <TouchableOpacity style={styles.doneBtn} onPress={save}>
          <Text style={styles.doneBtnText}>SAVE</Text>
        </TouchableOpacity>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 2, paddingBottom: 4 },
  sheetLabel: { fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 2, marginBottom: 10 },
  sheetTotal: { fontFamily: F.dot, fontSize: 25, color: C.ink, marginBottom: 18 },
  sheetTotalSub: { fontFamily: F.mono, fontSize: 12, color: C.dim },
  waterBtnRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  waterBtn: { flex: 1, backgroundColor: C.raised, borderWidth: 1, borderColor: C.lineHi, borderRadius: 14, borderCurve: 'continuous', paddingVertical: 16, alignItems: 'center' },
  waterBtnText: { fontFamily: F.dot, fontSize: 18, color: C.ink },
  waterBtnUnit: { fontFamily: F.dot, fontSize: 9, color: C.dim, marginTop: 2, letterSpacing: 1 },
  weightInput: { fontFamily: F.dot, fontSize: 19, color: C.ink, borderBottomWidth: 1, borderBottomColor: C.lineHi, paddingVertical: 10, marginBottom: 20 },
  doneBtn: { backgroundColor: C.hot, borderRadius: 999, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  doneBtnText: { fontFamily: F.dot, fontSize: 12, color: C.onHot, letterSpacing: 2 },
});
