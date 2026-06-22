import type { Task, TaskMap } from '@/lib/tasks-core';
import { toDateKey, fromDateKey } from '@/lib/dateKey';

export const DEFAULT_TASK_DURATION_MINS = 30;
export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180] as const;

export function parseDateKey(key: string): Date | null {
  return fromDateKey(key);
}

export function addDays(base: Date, delta: number): Date {
  const d = new Date(base);
  d.setDate(base.getDate() + delta);
  return d;
}

export type DateOption = { key: string; label: string };

export function buildDateOptions(anchor: Date, daysBack = 30, daysForward = 120): DateOption[] {
  const monthNames = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
  ];
  const out: DateOption[] = [];
  for (let i = -daysBack; i <= daysForward; i++) {
    const d = addDays(anchor, i);
    const key = toDateKey(d);
    const label = `${monthNames[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`;
    out.push({ key, label });
  }
  return out;
}

export function taskHasScheduledTime(task: Task): boolean {
  return task.hour != null && task.minute != null;
}

export function formatTime12h(hour: number, minute: number): string {
  const h = hour % 12 || 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `${h}:${String(minute).padStart(2, '0')} ${ampm}`;
}

export function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} MIN`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${h} HR`;
  return `${h} HR ${m} MIN`;
}

export type TaskMetaParts = {
  timeAndDuration: string;
  location?: string;
};

export function getTaskMetaParts(task: Task): TaskMetaParts {
  const segments: string[] = [];
  if (taskHasScheduledTime(task)) {
    segments.push(formatTime12h(task.hour!, task.minute!));
  } else {
    segments.push('ANYTIME');
  }
  if (task.durationMins != null && task.durationMins > 0) {
    segments.push(formatDuration(task.durationMins));
  }
  const loc = task.location?.trim();
  return {
    timeAndDuration: segments.join(' · '),
    location: loc ? loc.toUpperCase() : undefined,
  };
}

/** One-line summary for task rows (legacy / edit mode). */
export function formatTaskMetaLine(task: Task): string {
  const { timeAndDuration, location } = getTaskMetaParts(task);
  return location ? `${timeAndDuration} · ${location}` : timeAndDuration;
}

export function normalizeTask(task: Task): Task {
  return {
    ...task,
    hour: task.hour,
    minute: task.minute,
    durationMins: task.durationMins,
    location: task.location?.trim() || undefined,
  };
}

export function scheduleFieldsFromForm(opts: {
  hour: number;
  minute: number;
  durationMins: number;
  location: string;
  hasTime: boolean;
}): Pick<Task, 'hour' | 'minute' | 'durationMins' | 'location'> {
  const location = opts.location.trim() || undefined;
  if (!opts.hasTime) {
    return { hour: undefined, minute: undefined, durationMins: opts.durationMins, location };
  }
  return {
    hour: opts.hour,
    minute: opts.minute,
    durationMins: opts.durationMins,
    location,
  };
}

export function findTaskDateKey(map: TaskMap, taskId: string): string | null {
  for (const key of Object.keys(map)) {
    if ((map[key] ?? []).some(t => t.id === taskId)) return key;
  }
  return null;
}

export function moveTaskInMap(
  map: Record<string, Task[]>,
  fromKey: string,
  toKey: string,
  taskId: string,
  patch: Partial<Task>,
  sortFn: (tasks: Task[]) => Task[],
): Record<string, Task[]> {
  const fromList = map[fromKey] ?? [];
  const existing = fromList.find(t => t.id === taskId);
  if (!existing) return map;

  const updated = normalizeTask({ ...existing, ...patch });

  if (fromKey === toKey) {
    return {
      ...map,
      [fromKey]: fromList.map(t => (t.id === taskId ? updated : t)),
    };
  }

  const nextFrom = fromList.filter(t => t.id !== taskId);
  const toList = map[toKey] ?? [];
  const archived = toList.filter(t => t.archived);
  const active = toList.filter(t => !t.archived && t.id !== taskId);
  return {
    ...map,
    [fromKey]: nextFrom,
    [toKey]: [...sortFn([...active, updated]), ...archived],
  };
}
