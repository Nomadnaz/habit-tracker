// Canonical date-key helpers — the ONLY place this app generates or parses a
// date key. Format: zero-padded ISO YYYY-MM-DD, 1-indexed months, local
// timezone (system-model.md). Used for AsyncStorage keys and Supabase `date`
// columns alike.

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromDateKey(key: string): Date | null {
  const parts = key.split('-').map(Number);
  if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) return null;
  const [year, month, day] = parts; // month is 1-indexed in the key
  const d = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}
