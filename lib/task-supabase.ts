import type { Task } from '@/lib/tasks-core';

/** Columns optional until migration is applied on Supabase. */
export type TaskDbRow = {
  id: string;
  user_id: string;
  date: string;
  label: string;
  done: boolean;
  archived?: boolean;
  priority?: string;
  hour?: number | null;
  minute?: number | null;
  duration_mins?: number | null;
  location?: string | null;
};

export function taskToDbRow(task: Task, dateKey: string, userId: string): TaskDbRow {
  return {
    id: task.id,
    user_id: userId,
    date: dateKey,
    label: task.label,
    done: task.done,
    archived: task.archived ?? false,
    priority: task.priority,
    hour: task.hour ?? null,
    minute: task.minute ?? null,
    duration_mins: task.durationMins ?? null,
    location: task.location ?? null,
  };
}

export function taskFromDbRow(row: Record<string, unknown>): Task {
  return {
    id: String(row.id),
    label: String(row.label),
    done: Boolean(row.done),
    archived: row.archived != null ? Boolean(row.archived) : undefined,
    priority: row.priority as Task['priority'],
    hour: row.hour != null ? Number(row.hour) : undefined,
    minute: row.minute != null ? Number(row.minute) : undefined,
    durationMins: row.duration_mins != null ? Number(row.duration_mins) : undefined,
    location: row.location != null ? String(row.location) : undefined,
  };
}

export const TASK_SELECT_COLUMNS =
  'id, label, done, date, archived, priority, hour, minute, duration_mins, location';
