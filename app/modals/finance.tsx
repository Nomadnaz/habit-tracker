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
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';

import {
  getExpensesForMonth, addExpense, getActiveBills, addBill, markBillPaid,
  getBudgets, setBudget, budgetStatus, monthKey, CATEGORIES,
  type Expense, type Bill, type Budgets, type Category,
} from '@/lib/finance-data';
import { toDateKey } from '@/lib/dateKey';

import { C, F } from '@/lib/theme';
import { ScreenHeader, HeaderIcon } from '@/components/ScreenHeader';
// Amounts follow the phone's region (en-GB → £, de-DE → €, en-US → $).
const REGION_CURRENCY: Record<string, string> = {
  GB: 'GBP', IE: 'EUR', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR', PT: 'EUR', AT: 'EUR', FI: 'EUR',
  US: 'USD', CA: 'CAD', AU: 'AUD', NZ: 'NZD', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', JP: 'JPY', IN: 'INR',
};
const LOCALE = Intl.NumberFormat().resolvedOptions().locale;
const CURRENCY = REGION_CURRENCY[LOCALE.split('-').pop()?.toUpperCase() ?? ''] ?? 'GBP';
function money(n: number, digits = 2) {
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

const ORANGE = C.hot;
const CARD   = C.surface;
const BOLD = F.mono;
const REG = F.mono;

type Section = 'spending' | 'bills' | 'budgets';

export default function FinanceModal() {
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
      <ScreenHeader title="FINANCE" close
        right={<>
          <HeaderIcon icon="plus" label="Add" onPress={() => (section === 'bills' ? setAddBillVisible(true) : setAddExpenseVisible(true))} />
        </>}
      />

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
            <Text style={styles.totalText}>THIS MONTH: {money(totalSpent)}</Text>
            {expenses.length === 0 && <Text style={styles.empty}>No expenses logged this month.</Text>}
            {expenses.slice().reverse().map(e => (
              <View key={e.id} style={styles.row}>
                <Text style={styles.rowLabel}>{e.category}{e.note ? ` — ${e.note}` : ''}</Text>
                <Text style={styles.rowAmount}>{money(e.amount)}</Text>
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
                <Text style={styles.rowAmount}>{money(b.amount)}</Text>
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
                    placeholderTextColor={C.dim}
                    keyboardType="decimal-pad"
                    defaultValue={budgets[c] ? String(budgets[c]) : ''}
                    onEndEditing={e => {
                      const v = parseFloat(e.nativeEvent.text);
                      if (!Number.isNaN(v)) setBudget(c, v).then(refresh);
                    }}
                  />
                  {s && (
                    <Text style={[styles.rowAmount, s.over && { color: C.alert }]}>
                      {money(s.spent, 0)}{s.target ? ` / ${money(s.target, 0)}` : ''}
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
            <TextInput style={styles.input} placeholder="Amount" placeholderTextColor={C.dim} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" autoFocus />
            <View style={styles.chipRow}>
              {CATEGORIES.map(c => (
                <TouchableOpacity key={c} style={[styles.chip, category === c && styles.chipActive]} onPress={() => setCategory(c)}>
                  <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.input} placeholder="Note (optional)" placeholderTextColor={C.dim} value={note} onChangeText={setNote} />
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
            <TextInput style={styles.input} placeholder="Name" placeholderTextColor={C.dim} value={billName} onChangeText={setBillName} autoFocus />
            <TextInput style={styles.input} placeholder="Amount" placeholderTextColor={C.dim} value={billAmount} onChangeText={setBillAmount} keyboardType="decimal-pad" />
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
  safe: { flex: 1, backgroundColor: C.bg },
  segmentRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  segment: { flex: 1, minHeight: 40, paddingHorizontal: 6, borderRadius: 999, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: ORANGE, borderColor: C.hot },
  segmentText: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 1.5 },
  segmentTextActive: { color: C.onHot },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
  totalText: { fontFamily: BOLD, fontSize: 14, color: C.ink, marginBottom: 6 },
  empty: { fontFamily: REG, fontSize: 12, color: C.dim, textAlign: 'center', marginTop: 20 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface,
    borderRadius: 10, borderCurve: 'continuous', borderWidth: 1, borderColor: C.line, padding: 12,
  },
  rowLabel: { fontFamily: REG, fontSize: 12, color: C.ink, textTransform: 'capitalize', flex: 1 },
  rowSub: { fontFamily: REG, fontSize: 11, color: C.dim, marginTop: 2 },
  rowAmount: { fontFamily: BOLD, fontSize: 12, color: C.ink },
  paidBtn: { backgroundColor: ORANGE, borderRadius: 8, borderCurve: 'continuous', paddingVertical: 6, paddingHorizontal: 10, marginLeft: 8 },
  paidBtnText: { fontFamily: BOLD, fontSize: 10, color: C.onHot },
  budgetRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface,
    borderRadius: 10, borderCurve: 'continuous', borderWidth: 1, borderColor: C.line, padding: 12,
  },
  budgetInput: { borderWidth: 1, borderColor: C.line, borderRadius: 8, borderCurve: 'continuous', padding: 8, width: 70, fontFamily: REG, fontSize: 12, color: C.ink },
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { backgroundColor: CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderCurve: 'continuous', padding: 20, gap: 14 },
  sheetTitle: { fontFamily: BOLD, fontSize: 14, color: C.ink },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 10, borderCurve: 'continuous', padding: 12, fontFamily: REG, fontSize: 13, color: C.ink },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderCurve: 'continuous', borderWidth: 1, borderColor: C.line },
  chipActive: { backgroundColor: ORANGE, borderColor: C.hot },
  chipText: { fontFamily: REG, fontSize: 12, color: C.dim, textTransform: 'capitalize' },
  chipTextActive: { color: C.surface, fontFamily: BOLD },
  saveBtn: { backgroundColor: ORANGE, borderRadius: 10, borderCurve: 'continuous', paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontFamily: BOLD, fontSize: 12, color: C.onHot },
});
