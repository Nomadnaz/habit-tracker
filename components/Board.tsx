// Arrival-board list: a numbered stack of rows in the dot face, the app's
// recurring "station board" motif (BODY targets/systems, LIFE, TODAY next-up).
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { C, F } from '@/lib/theme';

export function Board({ title, empty, right, children }: { title: string; empty?: string; right?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <View style={styles.board}>
      <View style={styles.head}>
        <Text style={styles.boardTitle}>{title}</Text>
        {right}
      </View>
      <View style={styles.boardBody}>
        {empty ? <Text style={styles.boardEmpty}>{empty}</Text> : children}
      </View>
    </View>
  );
}

export function BoardRow({ index, label, sub, right, onPress, last }: {
  index: number | string; label: string; sub?: string; right?: React.ReactNode; onPress?: () => void; last?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, last && { borderBottomWidth: 0 }, pressed && { backgroundColor: C.raised }]}>
      <Text style={styles.rowIdx}>{index}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel} numberOfLines={1}>{label}</Text>
        {!!sub && <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text>}
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  board: { marginHorizontal: 16, marginTop: 14 },
  boardTitle: { fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 3 },
  boardBody: { borderWidth: 1, borderColor: C.line, borderRadius: 16, overflow: 'hidden', backgroundColor: C.surface },
  boardEmpty: { fontFamily: F.dot, fontSize: 12, color: C.faint, letterSpacing: 2, textAlign: 'center', paddingVertical: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line },
  rowIdx: { fontFamily: F.dot, fontSize: 14, color: C.signal, minWidth: 18 },
  rowLabel: { fontFamily: F.dot, fontSize: 15, color: C.ink, letterSpacing: 1 },
  rowSub: { fontFamily: F.mono, fontSize: 11, color: C.dim, marginTop: 3 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, marginHorizontal: 4 },
});
