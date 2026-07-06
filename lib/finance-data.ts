// ─────────────────────────────────────────────────────────────────────────
// FINANCE — LOCAL DATA LAYER, manual only (task 065). Bank connection stays
// with task 051 (Open Banking / TrueLayer) — nothing here reads accounts.
// ─────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { toDateKey, fromDateKey } from './dateKey';
import { postWrite } from './postWrite';
import { withStorageLock } from './storageLock';

function genId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
async function getUid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
function bg(fn: () => Promise<unknown>) { fn().catch(() => {}); }

const EXPENSES_KEY = '@expenses';
const BILLS_KEY = '@bills';
const BUDGETS_KEY = '@budgets';

export const CATEGORIES = ['groceries', 'dining', 'transport', 'housing', 'entertainment', 'health', 'other'] as const;
export type Category = typeof CATEGORIES[number];

export type Expense = { id: string; amount: number; category: Category; note?: string; date: string; createdAt: string };
export type Bill = { id: string; name: string; amount: number; dueDate: string; frequency: 'weekly' | 'monthly' | 'yearly'; active: boolean };
export type Budgets = Partial<Record<Category, number>>;

async function loadList<T>(key: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through */ }
  return [];
}

// ── Expenses ─────────────────────────────────────────────────────────────────

export async function getExpensesForMonth(monthKey: string): Promise<Expense[]> {
  const list = await loadList<Expense>(EXPENSES_KEY);
  return list.filter(e => e.date.startsWith(monthKey));
}

export async function addExpense(input: { amount: number; category: Category; note?: string; date: string }): Promise<Expense> {
  const expense: Expense = { id: genId(), createdAt: new Date().toISOString(), ...input };
  await withStorageLock(EXPENSES_KEY, async () => {
    const list = await loadList<Expense>(EXPENSES_KEY);
    await AsyncStorage.setItem(EXPENSES_KEY, JSON.stringify([...list, expense]));
  });
  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    await supabase.from('expenses').insert({
      id: expense.id, user_id: userId, amount: expense.amount, currency: 'USD',
      category: expense.category, note: expense.note ?? null, date: expense.date,
    });
  });
  postWrite('expense', { amount: expense.amount, category: expense.category, date: expense.date }, 'create');
  return expense;
}

// ── Bills ────────────────────────────────────────────────────────────────────

export async function getActiveBills(): Promise<Bill[]> {
  const list = await loadList<Bill>(BILLS_KEY);
  return list.filter(b => b.active).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export async function addBill(input: { name: string; amount: number; dueDate: string; frequency: Bill['frequency'] }): Promise<Bill> {
  const bill: Bill = { id: genId(), active: true, ...input };
  await withStorageLock(BILLS_KEY, async () => {
    const list = await loadList<Bill>(BILLS_KEY);
    await AsyncStorage.setItem(BILLS_KEY, JSON.stringify([...list, bill]));
  });
  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    await supabase.from('bills').insert({
      id: bill.id, user_id: userId, name: bill.name, amount: bill.amount,
      due_date: bill.dueDate, frequency: bill.frequency, active: true,
    });
  });
  return bill;
}

export async function markBillPaid(billId: string): Promise<void> {
  const nextDue = await withStorageLock(BILLS_KEY, async () => {
    const list = await loadList<Bill>(BILLS_KEY);
    const bill = list.find(b => b.id === billId);
    if (!bill) return null;
    const nextDue = advanceDate(bill.dueDate, bill.frequency);
    const updated = list.map(b => (b.id === billId ? { ...b, dueDate: nextDue } : b));
    await AsyncStorage.setItem(BILLS_KEY, JSON.stringify(updated));
    return nextDue;
  });
  if (!nextDue) return;
  bg(async () => {
    await supabase.from('bills').update({ due_date: nextDue, last_paid: toDateKey(new Date()) }).eq('id', billId);
  });
}

/**
 * Was parsing dateKey with `new Date(dateKey)` — UTC midnight — then calling
 * setDate/setMonth/setFullYear on it, which mutate based on the LOCAL
 * representation of that UTC instant. For negative-offset timezones that
 * local representation is the evening before, so every advance landed one
 * day early (a monthly bill due the 1st would drift to the ~19th of the
 * prior month over a year). Fixed by parsing via fromDateKey (local
 * midnight) instead — an audit (2026-07-06) finding, M3.
 */
function advanceDate(dateKey: string, frequency: Bill['frequency']): string {
  const d = fromDateKey(dateKey);
  if (!d) throw new Error(`advanceDate: invalid date key "${dateKey}"`);
  if (frequency === 'weekly') d.setDate(d.getDate() + 7);
  else if (frequency === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return toDateKey(d);
}

// ── Budgets ──────────────────────────────────────────────────────────────────

export async function getBudgets(): Promise<Budgets> {
  try {
    const raw = await AsyncStorage.getItem(BUDGETS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through */ }
  return {};
}

export async function setBudget(category: Category, monthlyTarget: number): Promise<void> {
  await withStorageLock(BUDGETS_KEY, async () => {
    const budgets = await getBudgets();
    const next = { ...budgets, [category]: monthlyTarget };
    await AsyncStorage.setItem(BUDGETS_KEY, JSON.stringify(next));
  });
  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    await supabase.from('budgets').upsert({ user_id: userId, category, monthly_target_amount: monthlyTarget });
  });
}

/** Spend-vs-budget per category for the given month; over === spent > target. */
export function budgetStatus(expenses: Expense[], budgets: Budgets): Array<{ category: Category; spent: number; target?: number; over: boolean }> {
  return CATEGORIES.map(category => {
    const spent = expenses.filter(e => e.category === category).reduce((s, e) => s + e.amount, 0);
    const target = budgets[category];
    return { category, spent, target, over: target != null && spent > target };
  }).filter(s => s.spent > 0 || s.target != null);
}

export function monthKey(d = new Date()): string {
  return toDateKey(d).slice(0, 7); // 'YYYY-MM'
}
