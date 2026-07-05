// ─────────────────────────────────────────────────────────────────────────
// FINANCE MODAL (task 065) — Spending/Bills/Budgets as a segmented toggle
// inside one screen rather than a new tab (same reasoning as Habits/
// Medication and the other modals added this session — the tab bar is
// already crowded and system-model.md's nav decision doesn't call for a
// Finance tab). Manual entry only; bank connection stays with task 051.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  Modal, Pressable, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import {
  getExpensesForMonth, addExpense, getActiveBills, addBill, markBillPaid,
  getBudgets, setBudget, budgetStatus, monthKey, CATEGORIES,
  type Expense, type Bill, type Budgets, type Category,
} from '@/lib/finance-data';
import { toDateKey } from '@/lib/dateKey';

const ORANGE = '#FF4D00';
const INK    = '#1A1714';
const MUTED  = '#8C857B';
const BORDER = '#E5E1DA';
const CARD   = '#FCFBF9';
const BG     = '#F4F2EE';
const RED    = '#C0432B';
const BOLD   = 'PixeloidSans_700Bold';
const REG    = 'PixeloidSans_400Regular';

type Section = 'spending' | 'bills' | 'budgets';

export default function FinanceModal() {
  const router = useRouter();
  const [section, setSection] = useState<Section>('spending');

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [budgets, setBudgets] = useState<Budgets>({});

  const [addExpenseVisible, setAddExpenseVisible] = useState(false);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<Category>('other');
  const [note, setNote] = useState('');

  const [addBillVisible, setAddBillVisible] = useState(false);
  const [billName, setBillName] = useState('');
  const [billAmount, setBillAmount] = useState('');

  const refresh = useCallback(async () => {
    const [e, b, bu] = await Promise.all([getExpensesForMonth(monthKey()), getActiveBills(), getBudgets()]);
    setExpenses(e);
    setBills(b);
    setBudgets(bu);
  }, []);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  async function saveExpense() {
    const amt = parseFloat(amount);
    if (!amt) return;
    await addExpense({ amount: amt, category, note: note.trim() || undefined, date: toDateKey(new Date()) });
    setAmount(''); setNote(''); setCategory('other'); setAddExpenseVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refresh();
  }

  async function saveBill() {
    const amt = parseFloat(billAmount);
    if (!billName.trim() || !amt) return;
    await addBill({ name: billName.trim(), amount: amt, dueDate: toDateKey(new Date()), frequency: 'monthly' });
    setBillName(''); setBillAmount(''); setAddBillVisible(false);
    refresh();
  }

  const status = budgetStatus(expenses, budgets);
  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="close" size={22} color={INK} />
        </TouchableOpacity>
        <Text style={styles.title}>FINANCE</Text>
        <TouchableOpacity onPress={() => (section === 'bills' ? setAddBillVisible(true) : setAddExpenseVisible(true))} hitSlop={12}>
          <MaterialCommunityIcons name="plus" size={22} color={INK} />
        </TouchableOpacity>
      </View>

      <View style={styles.segmentRow}>
        {(['spending', 'bills', 'budgets'] as Section[]).map(s => (
          <TouchableOpacity key={s} style={[styles.segment, section === s && styles.segmentActive]} onPress={() => setSection(s)}>
            <Text style={[styles.segmentText, section === s && styles.segmentTextActive]}>{s.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {section === 'spending' && (
          <>
            <Text style={styles.totalText}>THIS MONTH: ${totalSpent.toFixed(2)}</Text>
            {expenses.length === 0 && <Text style={styles.empty}>No expenses logged this month.</Text>}
            {expenses.slice().reverse().map(e => (
              <View key={e.id} style={styles.row}>
                <Text style={styles.rowLabel}>{e.category}{e.note ? ` — ${e.note}` : ''}</Text>
                <Text style={styles.rowAmount}>${e.amount.toFixed(2)}</Text>
              </View>
            ))}
          </>
        )}

        {section === 'bills' && (
          <>
            {bills.length === 0 && <Text style={styles.empty}>No bills tracked yet.</Text>}
            {bills.map(b => (
              <View key={b.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>{b.name}</Text>
                  <Text style={styles.rowSub}>Due {b.dueDate} · {b.frequency}</Text>
                </View>
                <Text style={styles.rowAmount}>${b.amount.toFixed(2)}</Text>
                <TouchableOpacity style={styles.paidBtn} onPress={() => markBillPaid(b.id).then(refresh)}>
                  <Text style={styles.paidBtnText}>PAID</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        {section === 'budgets' && (
          <>
            {CATEGORIES.map(c => {
              const s = status.find(x => x.category === c);
              return (
                <View key={c} style={styles.budgetRow}>
                  <Text style={styles.rowLabel}>{c}</Text>
                  <TextInput
                    style={styles.budgetInput}
                    placeholder="target"
                    placeholderTextColor={MUTED}
                    keyboardType="decimal-pad"
                    defaultValue={budgets[c] ? String(budgets[c]) : ''}
                    onEndEditing={e => {
                      const v = parseFloat(e.nativeEvent.text);
                      if (!Number.isNaN(v)) setBudget(c, v).then(refresh);
                    }}
                  />
                  {s && (
                    <Text style={[styles.rowAmount, s.over && { color: RED }]}>
                      ${s.spent.toFixed(0)}{s.target ? ` / $${s.target}` : ''}
                    </Text>
                  )}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      <Modal visible={addExpenseVisible} transparent animationType="fade" onRequestClose={() => setAddExpenseVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
          <Pressable style={styles.backdrop} onPress={() => setAddExpenseVisible(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>NEW EXPENSE</Text>
            <TextInput style={styles.input} placeholder="Amount" placeholderTextColor={MUTED} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" autoFocus />
            <View style={styles.chipRow}>
              {CATEGORIES.map(c => (
                <TouchableOpacity key={c} style={[styles.chip, category === c && styles.chipActive]} onPress={() => setCategory(c)}>
                  <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.input} placeholder="Note (optional)" placeholderTextColor={MUTED} value={note} onChangeText={setNote} />
            <TouchableOpacity style={styles.saveBtn} onPress={saveExpense}>
              <Text style={styles.saveBtnText}>ADD EXPENSE</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={addBillVisible} transparent animationType="fade" onRequestClose={() => setAddBillVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
          <Pressable style={styles.backdrop} onPress={() => setAddBillVisible(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>NEW BILL</Text>
            <TextInput style={styles.input} placeholder="Name" placeholderTextColor={MUTED} value={billName} onChangeText={setBillName} autoFocus />
            <TextInput style={styles.input} placeholder="Amount" placeholderTextColor={MUTED} value={billAmount} onChangeText={setBillAmount} keyboardType="decimal-pad" />
            <TouchableOpacity style={styles.saveBtn} onPress={saveBill}>
              <Text style={styles.saveBtnText}>ADD BILL</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { fontFamily: BOLD, fontSize: 16, color: INK },
  segmentRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  segment: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: BORDER, alignItems: 'center' },
  segmentActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  segmentText: { fontFamily: REG, fontSize: 9, color: MUTED },
  segmentTextActive: { color: '#FFFFFF' },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
  totalText: { fontFamily: BOLD, fontSize: 14, color: INK, marginBottom: 6 },
  empty: { fontFamily: REG, fontSize: 12, color: MUTED, textAlign: 'center', marginTop: 20 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: CARD,
    borderRadius: 10, borderWidth: 1, borderColor: BORDER, padding: 12,
  },
  rowLabel: { fontFamily: REG, fontSize: 12, color: INK, textTransform: 'capitalize', flex: 1 },
  rowSub: { fontFamily: REG, fontSize: 10, color: MUTED, marginTop: 2 },
  rowAmount: { fontFamily: BOLD, fontSize: 12, color: INK },
  paidBtn: { backgroundColor: ORANGE, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginLeft: 8 },
  paidBtnText: { fontFamily: BOLD, fontSize: 9, color: '#FFFFFF' },
  budgetRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: CARD,
    borderRadius: 10, borderWidth: 1, borderColor: BORDER, padding: 12,
  },
  budgetInput: { borderWidth: 1, borderColor: BORDER, borderRadius: 8, padding: 8, width: 70, fontFamily: REG, fontSize: 11, color: INK },
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { backgroundColor: CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14 },
  sheetTitle: { fontFamily: BOLD, fontSize: 14, color: INK },
  input: { borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 12, fontFamily: REG, fontSize: 13, color: INK },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: BORDER },
  chipActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  chipText: { fontFamily: REG, fontSize: 11, color: MUTED, textTransform: 'capitalize' },
  chipTextActive: { color: '#FFFFFF', fontFamily: BOLD },
  saveBtn: { backgroundColor: ORANGE, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontFamily: BOLD, fontSize: 12, color: '#FFFFFF' },
});
