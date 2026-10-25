// One day's tick flipped, for habits (`completed`) and meds (`taken`) alike:
// the log for that date toggles, or a new ticked one is added. The data layer
// writes exactly this, and screens apply the same function to show the tick
// the moment you tap, before the write lands.

export function flipDay<L extends { id: string; date: string }, K extends keyof L>(
  logs: L[],
  date: string,
  field: K,
  fresh: () => L,
): { logs: L[]; record: L; existed: boolean } {
  const existing = logs.find(l => l.date === date);
  if (existing) {
    const record = { ...existing, [field]: !existing[field] } as L;
    return { logs: logs.map(l => (l === existing ? record : l)), record, existed: true };
  }
  const record = fresh();
  return { logs: [...logs, record], record, existed: false };
}
