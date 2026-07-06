import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';
import { sortActiveTasks, type Priority, type Task, type TaskMap } from '@/lib/tasks-core';
import { DEFAULT_TASK_DURATION_MINS } from '@/lib/task-schedule';
import { toDateKey, fromDateKey } from '@/lib/dateKey';

const LEGACY_REMINDER_NOTES = new Set(['habit-tracker', 'habit tracker']);

// The app stamps every reminder/event it creates with a priority note. Used to
// match app-managed reminders when appleReminderId isn't stored locally.
const APP_MANAGED_NOTES = new Set(['high priority', 'medium priority', 'low priority']);
const isAppManagedNote = (notes?: string | null): boolean =>
  APP_MANAGED_NOTES.has((notes ?? '').trim().toLowerCase());

/** Shown in Reminders notes — task title stays in the title field. */
export function reminderNotesForPriority(priority?: Priority): string {
  switch (priority) {
    case 'HIGH':
      return 'high priority';
    case 'LOW':
      return 'low priority';
    case 'MEDIUM':
    default:
      return 'medium priority';
  }
}

export type AppleSyncMode = 'reminders-only' | 'reminders-and-calendar';

/** dateKey format: zero-padded YYYY-MM-DD (1-indexed month) — see lib/dateKey.ts. */
export function dateFromTaskKey(dateKey: string): Date | null {
  return fromDateKey(dateKey);
}

export function buildTaskDueDate(dateKey: string, hour: number, minute: number): Date | null {
  const d = dateFromTaskKey(dateKey);
  if (!d) return null;
  d.setHours(hour, minute, 0, 0);
  return d;
}

let reminderListId: string | null = null;
let eventCalendarId: string | null = null;

async function ensureReminderAccess(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  const { status } = await Calendar.requestRemindersPermissionsAsync();
  return status === 'granted';
}

async function ensureCalendarAccess(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}

async function getWritableReminderListId(): Promise<string | null> {
  if (reminderListId) return reminderListId;
  const lists = await Calendar.getCalendarsAsync(Calendar.EntityTypes.REMINDER);
  const list = lists.find(c => c.allowsModifications) ?? lists[0];
  reminderListId = list?.id ?? null;
  return reminderListId;
}

async function getWritableEventCalendarId(): Promise<string | null> {
  if (eventCalendarId) return eventCalendarId;
  const defaultCal = await Calendar.getDefaultCalendarAsync();
  if (defaultCal?.allowsModifications) {
    eventCalendarId = defaultCal.id;
    return eventCalendarId;
  }
  const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const list = cals.find(c => c.allowsModifications) ?? cals[0];
  eventCalendarId = list?.id ?? null;
  return eventCalendarId;
}

export type AppleSyncIds = {
  appleReminderId?: string;
  appleEventId?: string;
};

export function mergeAppleIdsIntoTaskMap(
  map: TaskMap,
  dateKey: string,
  taskId: string,
  ids: AppleSyncIds,
): TaskMap {
  const day = map[dateKey];
  if (!day) return map;
  return {
    ...map,
    [dateKey]: day.map(t => {
      if (t.id !== taskId) return t;
      return {
        ...t,
        ...(ids.appleReminderId != null ? { appleReminderId: ids.appleReminderId } : {}),
        ...(ids.appleEventId != null ? { appleEventId: ids.appleEventId } : {}),
      };
    }),
  };
}

/** Create Apple Reminder (and optionally all-day Calendar event) for a new task. */
export type TaskScheduleInput = {
  dateKey: string;
  hour?: number;
  minute?: number;
  durationMins?: number;
  location?: string;
  hasTime?: boolean;
};

function eventWindowFromSchedule(
  dateKey: string,
  schedule: TaskScheduleInput,
): { start: Date; end: Date } | null {
  const hasTime = schedule.hasTime !== false && schedule.hour != null && schedule.minute != null;
  const base = dateFromTaskKey(dateKey);
  if (!base) return null;
  const start = new Date(base);
  if (hasTime) {
    start.setHours(schedule.hour!, schedule.minute!, 0, 0);
  } else {
    start.setHours(9, 0, 0, 0);
  }
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + (schedule.durationMins ?? DEFAULT_TASK_DURATION_MINS));
  return { start, end };
}

export async function syncNewTaskToApple(opts: {
  label: string;
  dateKey: string;
  mode: AppleSyncMode;
  hour?: number;
  minute?: number;
  durationMins?: number;
  location?: string;
  hasTime?: boolean;
  priority?: Priority;
}): Promise<AppleSyncIds> {
  if (Platform.OS !== 'ios') return {};

  const schedule: TaskScheduleInput = {
    dateKey: opts.dateKey,
    hour: opts.hour,
    minute: opts.minute,
    durationMins: opts.durationMins,
    location: opts.location,
    hasTime: opts.hasTime,
  };
  const window = eventWindowFromSchedule(opts.dateKey, schedule);
  if (!window) return {};

  const out: AppleSyncIds = {};
  const title = opts.label.trim() || 'Task';
  const notes = reminderNotesForPriority(opts.priority);
  const location = opts.location?.trim() || undefined;

  try {
    const existingReminderId = await findAppManagedReminderId(title, opts.dateKey);
    if (existingReminderId) {
      out.appleReminderId = existingReminderId;
    } else if (await ensureReminderAccess()) {
      const listId = await getWritableReminderListId();
      if (listId) {
        out.appleReminderId = await Calendar.createReminderAsync(listId, {
          title,
          dueDate: window.start,
          completed: false,
          notes,
          location,
        });
      }
    }

    if (opts.mode === 'reminders-and-calendar') {
      const existingEventId = await findAppManagedEventId(title, opts.dateKey);
      if (existingEventId) {
        out.appleEventId = existingEventId;
      } else if (await ensureCalendarAccess()) {
        const calId = await getWritableEventCalendarId();
        if (calId) {
          out.appleEventId = await Calendar.createEventAsync(calId, {
            title,
            startDate: window.start,
            endDate: window.end,
            allDay: false,
            notes,
            location,
          });
        }
      }
    }
  } catch (e) {
    console.warn('[apple-sync] create failed:', e);
  }

  return out;
}

/** Push label, date/time, length, and location to linked Reminder / Calendar event. */
export async function syncTaskScheduleToApple(
  task: Task,
  context: { dateKey: string },
): Promise<void> {
  if (Platform.OS !== 'ios') return;

  const schedule: TaskScheduleInput = {
    dateKey: context.dateKey,
    hour: task.hour,
    minute: task.minute,
    durationMins: task.durationMins,
    location: task.location,
    hasTime: task.hour != null && task.minute != null,
  };
  const window = eventWindowFromSchedule(context.dateKey, schedule);
  if (!window) return;

  const title = task.label?.trim() || 'Task';
  const notes = reminderNotesForPriority(task.priority);
  const location = task.location?.trim() || undefined;

  try {
    if (task.appleReminderId && (await ensureReminderAccess())) {
      await Calendar.updateReminderAsync(task.appleReminderId, {
        ...reminderUpdateForDone(task.done, { title, dueDate: window.start, notes }),
        location,
      });
    }
    if (task.appleEventId && (await ensureCalendarAccess())) {
      await Calendar.updateEventAsync(task.appleEventId, {
        title,
        startDate: window.start,
        endDate: window.end,
        location,
        notes,
      });
    }
  } catch (e) {
    console.warn('[apple-sync] schedule update failed:', e);
  }
}

export type AppleReminderSyncContext = {
  dateKey: string;
  hour?: number;
  minute?: number;
};

async function reminderPayloadForTask(
  task: Task,
  context?: AppleReminderSyncContext,
): Promise<{ title: string; dueDate: Date; notes: string } | null> {
  let dueDate: Date | null = null;
  let existingTitle = '';

  if (task.appleReminderId) {
    try {
      const existing = await Calendar.getReminderAsync(task.appleReminderId);
      if (existing.dueDate) dueDate = new Date(existing.dueDate);
      existingTitle = typeof existing.title === 'string' ? existing.title.trim() : '';
      if (existingTitle && LEGACY_REMINDER_NOTES.has(existingTitle.toLowerCase())) {
        existingTitle = '';
      }
    } catch {
      // Reminder id may be invalid after completion — rebuild from context.
    }
  }

  if (!dueDate && context?.dateKey) {
    const h = task.hour ?? context.hour ?? 9;
    const m = task.minute ?? context.minute ?? 0;
    dueDate = buildTaskDueDate(context.dateKey, h, m);
  }

  if (!dueDate) return null;

  const title = task.label?.trim() || existingTitle || 'Task';
  const notes = reminderNotesForPriority(task.priority);
  return { title, dueDate, notes };
}

/** Public helper — find an app-managed reminder by label + date. */
export async function findExistingAppleReminder(
  label: string,
  dateKey: string,
): Promise<string | undefined> {
  return findAppManagedReminderId(label, dateKey);
}

async function findAppManagedReminderId(label: string, dateKey: string): Promise<string | undefined> {
  if (Platform.OS !== 'ios') return undefined;
  if (!(await ensureReminderAccess())) return undefined;

  const targetTitle = label.trim().toLowerCase();
  if (!targetTitle || !dateKey) return undefined;

  const listIds = await getReminderListIds();
  if (!listIds.length) return undefined;

  const today = startOfToday();
  const all = await fetchAllIosReminders(listIds);
  for (const r of all) {
    if (!r.id) continue;
    if (!isAppManagedNote(r.notes)) continue;
    const title = (r.title ?? '').trim().toLowerCase();
    if (title !== targetTitle) continue;
    if (dateKeyForReminder(r, today) === dateKey) return r.id;
  }
  return undefined;
}

/** Find an app-created calendar event matching label + date. */
async function findAppManagedEventId(label: string, dateKey: string): Promise<string | undefined> {
  if (Platform.OS !== 'ios') return undefined;
  if (!(await ensureCalendarAccess())) return undefined;

  const targetTitle = label.trim().toLowerCase();
  if (!targetTitle || !dateKey) return undefined;

  const calendarIds = await getUserOwnedEventCalendarIds();
  if (!calendarIds.length) return undefined;

  const allowed = new Set(calendarIds);
  const events = await fetchIosCalendarEvents(calendarIds);
  for (const e of events) {
    if (!e.id || !allowed.has(e.calendarId)) continue;
    if (!isAppManagedNote(e.notes)) continue;
    const title = (e.title ?? '').trim().toLowerCase();
    if (title !== targetTitle) continue;
    if (dateKeyForEvent(e) === dateKey) return e.id;
  }
  return undefined;
}

/** Find an app-created reminder matching this task when appleReminderId is missing. */
async function findReminderIdForTask(
  task: Task,
  context?: AppleReminderSyncContext,
): Promise<string | undefined> {
  const dateKey = context?.dateKey;
  if (!task.label?.trim() || !dateKey) return undefined;
  return findAppManagedReminderId(task.label, dateKey);
}

function reminderUpdateForDone(
  done: boolean,
  payload: { title: string; dueDate: Date; notes: string },
): Calendar.Reminder {
  if (done) {
    return {
      title: payload.title,
      dueDate: payload.dueDate,
      notes: payload.notes,
      completed: true,
      completionDate: new Date(),
    };
  }
  return {
    title: payload.title,
    dueDate: payload.dueDate,
    notes: payload.notes,
    completed: false,
    completionDate: undefined,
  };
}

/**
 * Sync done state to the linked iOS Reminder. Returns the reminder id (existing or
 * discovered) so callers can persist appleReminderId when it was missing.
 */
export async function syncTaskDoneToApple(
  task: Task,
  done: boolean,
  context?: AppleReminderSyncContext,
): Promise<string | undefined> {
  if (Platform.OS !== 'ios') return undefined;

  try {
    if (!(await ensureReminderAccess())) return undefined;

    const payload = await reminderPayloadForTask(task, context);
    if (!payload) return task.appleReminderId;

    let reminderId = task.appleReminderId ?? (await findReminderIdForTask(task, context));

    if (!reminderId) {
      // No linked reminder — only recreate when marking un-done (legacy path).
      if (done) return undefined;
      const listId = await getWritableReminderListId();
      if (!listId) return undefined;
      return Calendar.createReminderAsync(listId, {
        title: payload.title,
        dueDate: payload.dueDate,
        notes: payload.notes,
        completed: false,
      });
    }

    if (done) {
      try {
        await Calendar.deleteReminderAsync(reminderId);
        return undefined;
      } catch {
        // Delete failed (e.g. already gone) — keep the id so a later sync can retry.
        return task.appleReminderId;
      }
    }

    try {
      await Calendar.updateReminderAsync(reminderId, reminderUpdateForDone(done, payload));
      return reminderId;
    } catch {
      const listId = await getWritableReminderListId();
      if (!listId) return task.appleReminderId;
      return Calendar.createReminderAsync(listId, {
        title: payload.title,
        dueDate: payload.dueDate,
        notes: payload.notes,
        completed: false,
      });
    }
  } catch (e) {
    console.warn('[apple-sync] reminder update failed:', e);
    return task.appleReminderId;
  }
}

export type ReminderPullChange = {
  dateKey: string;
  taskId: string;
  done: boolean;
};

export type ReminderImportChange = {
  dateKey: string;
  taskId: string;
  label: string;
  done: boolean;
  priority?: Priority;
};

function genTaskId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function dateKeyFromDate(d: Date): string {
  return toDateKey(d);
}

function addDays(base: Date, delta: number): Date {
  const d = new Date(base);
  d.setDate(base.getDate() + delta);
  return d;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function priorityFromReminderNotes(notes?: string): Priority | undefined {
  const n = (notes ?? '').trim().toLowerCase();
  if (n === 'high priority') return 'HIGH';
  if (n === 'low priority') return 'LOW';
  if (n === 'medium priority') return 'MEDIUM';
  return undefined;
}

function reminderDueDate(reminder: Calendar.Reminder): Date | null {
  if (reminder.dueDate) return new Date(reminder.dueDate);
  if (reminder.startDate) return new Date(reminder.startDate);
  return null;
}

/** Date bucket for a Reminder — due/start, else created, else today. */
function dateKeyForReminder(reminder: Calendar.Reminder, today: Date): string {
  const due = reminderDueDate(reminder);
  if (due) return dateKeyFromDate(due);
  if (reminder.creationDate) return dateKeyFromDate(new Date(reminder.creationDate));
  return dateKeyFromDate(today);
}

function dateKeyForEvent(event: Calendar.Event): string {
  return dateKeyFromDate(new Date(event.startDate));
}

async function getReminderListIds(): Promise<string[]> {
  const lists = await Calendar.getCalendarsAsync(Calendar.EntityTypes.REMINDER);
  return lists.map(l => l.id).filter((id): id is string => !!id);
}

/** iOS pre-loaded / subscribed calendars (bank holidays, birthdays, etc.). */
const BLOCKED_CALENDAR_TITLES = new Set([
  'birthdays',
  'birthdays & anniversaries',
  'siri suggestions',
  'scheduled reminders',
  'found in mail',
  'found in natural language',
  'holidays in united kingdom',
  'uk holidays',
  'us holidays',
  'canadian holidays',
  'australian holidays',
  'irish holidays',
  'german holidays',
  'french holidays',
]);

function isUserOwnedEventCalendar(cal: Calendar.Calendar): boolean {
  if (!cal.allowsModifications) return false;

  const calType = cal.type;
  if (
    calType === Calendar.CalendarType.SUBSCRIBED ||
    calType === Calendar.CalendarType.BIRTHDAYS
  ) {
    return false;
  }

  const sourceType = String(cal.source?.type ?? '').toLowerCase();
  if (
    sourceType === Calendar.SourceType.SUBSCRIBED ||
    sourceType === Calendar.SourceType.BIRTHDAYS
  ) {
    return false;
  }

  const title = (cal.title ?? '').trim().toLowerCase();
  if (BLOCKED_CALENDAR_TITLES.has(title)) return false;
  if (title.startsWith('holidays in ')) return false;
  if (title.endsWith(' holidays') && title.length < 40) return false;

  return true;
}

async function getUserOwnedEventCalendars(): Promise<Calendar.Calendar[]> {
  const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  return cals.filter(isUserOwnedEventCalendar);
}

async function getUserOwnedEventCalendarIds(): Promise<string[]> {
  const cals = await getUserOwnedEventCalendars();
  return cals.map(c => c.id).filter((id): id is string => !!id);
}

export type CalendarImportRemoval = {
  dateKey: string;
  taskId: string;
};

/**
 * Remove tasks that were auto-imported from iOS system/subscribed calendars
 * (bank holidays, national days, etc.). Keeps tasks the user created in Reminders or the app.
 */
export async function purgeSystemCalendarImportsFromTaskMap(
  taskMap: TaskMap,
): Promise<{ map: TaskMap; removals: CalendarImportRemoval[] }> {
  if (Platform.OS !== 'ios') return { map: taskMap, removals: [] };
  if (!(await ensureCalendarAccess())) return { map: taskMap, removals: [] };

  const allowedCalendarIds = new Set(await getUserOwnedEventCalendarIds());
  const removals: CalendarImportRemoval[] = [];
  let map: TaskMap = { ...taskMap };

  for (const dayKey of Object.keys(map)) {
    const dayTasks = map[dayKey] ?? [];
    if (dayTasks.length === 0) continue;

    const kept: Task[] = [];
    for (const task of dayTasks) {
      if (!task.appleEventId) {
        kept.push(task);
        continue;
      }

      // Task also tied to Reminders / app — keep it, only drop the calendar link if needed.
      if (task.appleReminderId) {
        try {
          const event = await Calendar.getEventAsync(task.appleEventId);
          if (!allowedCalendarIds.has(event.calendarId)) {
            kept.push({ ...task, appleEventId: undefined });
          } else {
            kept.push(task);
          }
        } catch {
          kept.push(task);
        }
        continue;
      }

      try {
        const event = await Calendar.getEventAsync(task.appleEventId);
        if (allowedCalendarIds.has(event.calendarId)) {
          kept.push(task);
        } else {
          removals.push({ dateKey: dayKey, taskId: task.id });
        }
      } catch {
        kept.push(task);
      }
    }

    if (kept.length !== dayTasks.length) {
      const archived = kept.filter(t => t.archived);
      const active = kept.filter(t => !t.archived);
      map = { ...map, [dayKey]: [...sortActiveTasks(active), ...archived] };
    }
  }

  return { map, removals };
}

function collectLinkedReminderIds(taskMap: TaskMap): Set<string> {
  const ids = new Set<string>();
  for (const day of Object.values(taskMap)) {
    for (const t of day) {
      if (t.appleReminderId) ids.add(t.appleReminderId);
    }
  }
  return ids;
}

function collectLinkedEventIds(taskMap: TaskMap): Set<string> {
  const ids = new Set<string>();
  for (const day of Object.values(taskMap)) {
    for (const t of day) {
      if (t.appleEventId) ids.add(t.appleEventId);
    }
  }
  return ids;
}

const IMPORT_DAYS_BACK = 30;
const IMPORT_DAYS_FORWARD = 365;

async function fetchAllIosReminders(listIds: string[]): Promise<Calendar.Reminder[]> {
  const today = startOfToday();
  const rangeStart = addDays(today, -IMPORT_DAYS_BACK);
  const rangeEnd = addDays(today, IMPORT_DAYS_FORWARD);
  const byId = new Map<string, Calendar.Reminder>();

  const queries: Promise<Calendar.Reminder[]>[] = [
    Calendar.getRemindersAsync(
      listIds,
      Calendar.ReminderStatus.INCOMPLETE,
      rangeStart,
      rangeEnd,
    ),
    Calendar.getRemindersAsync(
      listIds,
      Calendar.ReminderStatus.COMPLETED,
      rangeStart,
      rangeEnd,
    ),
  ];

  // Also fetch without a date filter so undated reminders still appear.
  try {
    queries.push(Calendar.getRemindersAsync(listIds, null, null, null));
  } catch {
    // Older iOS builds may require a date range only.
  }

  const batches = await Promise.all(queries.map(q => q.catch(() => [] as Calendar.Reminder[])));
  for (const list of batches) {
    for (const r of list) {
      if (r.id) byId.set(r.id, r);
    }
  }
  return [...byId.values()];
}

async function fetchIosCalendarEvents(calendarIds: string[]): Promise<Calendar.Event[]> {
  const today = startOfToday();
  const rangeStart = addDays(today, -IMPORT_DAYS_BACK);
  const rangeEnd = addDays(today, IMPORT_DAYS_FORWARD);
  try {
    return await Calendar.getEventsAsync(calendarIds, rangeStart, rangeEnd);
  } catch (e) {
    console.warn('[apple-sync] getEventsAsync failed:', e);
    return [];
  }
}

type ImportKind = 'reminder' | 'event';

type ImportedSchedule = Pick<Task, 'hour' | 'minute' | 'durationMins' | 'location'>;

function scheduleFromReminder(reminder: Calendar.Reminder): ImportedSchedule {
  const location =
    typeof reminder.location === 'string' && reminder.location.trim()
      ? reminder.location.trim()
      : undefined;
  if (!reminder.dueDate) return { location };
  const d = new Date(reminder.dueDate);
  return { hour: d.getHours(), minute: d.getMinutes(), location };
}

function scheduleFromEvent(event: Calendar.Event): ImportedSchedule {
  const location =
    typeof event.location === 'string' && event.location.trim()
      ? event.location.trim()
      : undefined;
  if (event.allDay) return { location };
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  const durationMins = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 60000),
  );
  return {
    hour: start.getHours(),
    minute: start.getMinutes(),
    durationMins,
    location,
  };
}

function upsertImportedItem(
  map: TaskMap,
  opts: {
    kind: ImportKind;
    externalId: string;
    title: string;
    dateKey: string;
    done: boolean;
    priority?: Priority;
    schedule?: ImportedSchedule;
    linkedReminderIds: Set<string>;
    linkedEventIds: Set<string>;
    imports: ReminderImportChange[];
    doneUpdates: ReminderPullChange[];
  },
): TaskMap {
  const {
    kind,
    externalId,
    title,
    dateKey,
    done,
    priority,
    schedule,
    linkedReminderIds,
    linkedEventIds,
    imports,
    doneUpdates,
  } = opts;

  if (kind === 'reminder' && linkedReminderIds.has(externalId)) return map;
  if (kind === 'event' && linkedEventIds.has(externalId)) return map;

  const dayTasks = map[dateKey] ?? [];
  const archived = dayTasks.filter(t => t.archived);
  const active = dayTasks.filter(t => !t.archived);

  const normalizedTitle = title.trim().toLowerCase();
  const existingByLabel = active.find(t => t.label.trim().toLowerCase() === normalizedTitle);

  if (existingByLabel) {
    if (kind === 'reminder') linkedReminderIds.add(externalId);
    else linkedEventIds.add(externalId);

    const linkedId =
      kind === 'reminder' ? existingByLabel.appleReminderId : existingByLabel.appleEventId;
    if (linkedId) {
      if (linkedId !== externalId) {
        if (kind === 'reminder') void Calendar.deleteReminderAsync(externalId).catch(() => {});
        else void Calendar.deleteEventAsync(externalId).catch(() => {});
      }
      return map;
    }

    if (existingByLabel.done !== done) {
      doneUpdates.push({ dateKey, taskId: existingByLabel.id, done });
    }
    const nextActive = active.map(t => {
      if (t.id !== existingByLabel.id) return t;
      return {
        ...t,
        done,
        ...(priority != null ? { priority } : {}),
        ...(schedule ?? {}),
        ...(kind === 'reminder' ? { appleReminderId: externalId } : { appleEventId: externalId }),
      };
    });
    return {
      ...map,
      [dateKey]: [...sortActiveTasks(nextActive), ...archived],
    };
  }

  const task: Task = {
    id: genTaskId(),
    label: title.toUpperCase(),
    done,
    priority,
    ...(schedule ?? {}),
    ...(kind === 'reminder' ? { appleReminderId: externalId } : { appleEventId: externalId }),
  };
  if (kind === 'reminder') linkedReminderIds.add(externalId);
  else linkedEventIds.add(externalId);
  imports.push({ dateKey, taskId: task.id, label: title.toUpperCase(), done, priority });
  return {
    ...map,
    [dateKey]: [...sortActiveTasks([...active, task]), ...archived],
  };
}

/**
 * Read completion state from iOS Reminders and merge into the local task map.
 * Call when the app becomes active or a task screen gains focus.
 */
export async function pullAppleReminderStatusIntoTaskMap(
  taskMap: TaskMap,
): Promise<{ map: TaskMap; changes: ReminderPullChange[] }> {
  if (Platform.OS !== 'ios') return { map: taskMap, changes: [] };
  if (!(await ensureReminderAccess())) return { map: taskMap, changes: [] };

  let map = taskMap;
  const changes: ReminderPullChange[] = [];

  for (const dateKey of Object.keys(taskMap)) {
    const dayTasks = taskMap[dateKey] ?? [];
    let dayChanged = false;
    const nextDay = [...dayTasks];

    for (let i = 0; i < nextDay.length; i++) {
      const task = nextDay[i];
      if (!task.appleReminderId || task.archived) continue;

      try {
        const reminder = await Calendar.getReminderAsync(task.appleReminderId);
        const completed = reminder.completed === true;
        if (completed === task.done) continue;

        changes.push({ dateKey, taskId: task.id, done: completed });
        nextDay[i] = { ...task, done: completed };
        dayChanged = true;
      } catch {
        // Reminder removed in Apple Reminders — leave the in-app task unchanged.
      }
    }

    if (dayChanged) {
      const archived = nextDay.filter(t => t.archived);
      const active = nextDay.filter(t => !t.archived);
      map = { ...map, [dateKey]: [...sortActiveTasks(active), ...archived] };
    }
  }

  return { map, changes };
}

/**
 * Import iOS Reminders (including undated) into the task map.
 */
export async function pullAppleRemindersIntoTaskMap(
  taskMap: TaskMap,
): Promise<{ map: TaskMap; imports: ReminderImportChange[]; doneUpdates: ReminderPullChange[] }> {
  if (Platform.OS !== 'ios') return { map: taskMap, imports: [], doneUpdates: [] };
  if (!(await ensureReminderAccess())) return { map: taskMap, imports: [], doneUpdates: [] };

  const listIds = await getReminderListIds();
  if (listIds.length === 0) return { map: taskMap, imports: [], doneUpdates: [] };

  const reminders = await fetchAllIosReminders(listIds);
  const today = startOfToday();
  const linkedReminderIds = collectLinkedReminderIds(taskMap);
  const linkedEventIds = collectLinkedEventIds(taskMap);
  let map = taskMap;
  const imports: ReminderImportChange[] = [];
  const doneUpdates: ReminderPullChange[] = [];

  for (const reminder of reminders) {
    const reminderId = reminder.id;
    if (!reminderId) continue;

    const title = (reminder.title ?? '').trim();
    if (!title || LEGACY_REMINDER_NOTES.has(title.toLowerCase())) continue;

    map = upsertImportedItem(map, {
      kind: 'reminder',
      externalId: reminderId,
      title,
      dateKey: dateKeyForReminder(reminder, today),
      done: reminder.completed === true,
      priority: priorityFromReminderNotes(reminder.notes),
      schedule: scheduleFromReminder(reminder),
      linkedReminderIds,
      linkedEventIds,
      imports,
      doneUpdates,
    });
  }

  return { map, imports, doneUpdates };
}

/**
 * Import iOS Calendar events into the task map (by event start date).
 */
export async function pullAppleCalendarEventsIntoTaskMap(
  taskMap: TaskMap,
): Promise<{ map: TaskMap; imports: ReminderImportChange[] }> {
  if (Platform.OS !== 'ios') return { map: taskMap, imports: [] };
  if (!(await ensureCalendarAccess())) return { map: taskMap, imports: [] };

  const calendarIds = await getUserOwnedEventCalendarIds();
  if (calendarIds.length === 0) return { map: taskMap, imports: [] };

  const allowedCalendarIds = new Set(calendarIds);
  const events = await fetchIosCalendarEvents(calendarIds);
  const linkedReminderIds = collectLinkedReminderIds(taskMap);
  const linkedEventIds = collectLinkedEventIds(taskMap);
  let map = taskMap;
  const imports: ReminderImportChange[] = [];
  const doneUpdates: ReminderPullChange[] = [];

  for (const event of events) {
    if (!event.id) continue;
    if (event.status === Calendar.EventStatus.CANCELED) continue;
    if (!allowedCalendarIds.has(event.calendarId)) continue;

    const title = (event.title ?? '').trim();
    if (!title) continue;
    // Only import calendar rows the app created (same note stamp as Reminders).
    if (!isAppManagedNote(event.notes)) continue;

    map = upsertImportedItem(map, {
      kind: 'event',
      externalId: event.id,
      title,
      dateKey: dateKeyForEvent(event),
      done: false,
      schedule: scheduleFromEvent(event),
      linkedReminderIds,
      linkedEventIds,
      imports,
      doneUpdates,
    });
  }

  return { map, imports };
}

/** Completion sync + import Reminders and Calendar events from iOS. */
export async function syncTaskMapFromAppleReminders(taskMap: TaskMap): Promise<{
  map: TaskMap;
  changes: ReminderPullChange[];
  imports: ReminderImportChange[];
  removals: CalendarImportRemoval[];
}> {
  const { map: afterPurge, removals } = await purgeSystemCalendarImportsFromTaskMap(taskMap);
  const { map: afterStatus, changes } = await pullAppleReminderStatusIntoTaskMap(afterPurge);
  const { map: afterReminders, imports: reminderImports, doneUpdates } =
    await pullAppleRemindersIntoTaskMap(afterStatus);
  const { map: afterEvents, imports: eventImports } =
    await pullAppleCalendarEventsIntoTaskMap(afterReminders);

  const mergedChanges = [...changes];
  for (const u of doneUpdates) {
    if (!mergedChanges.some(c => c.taskId === u.taskId)) mergedChanges.push(u);
  }

  return {
    map: afterEvents,
    changes: mergedChanges,
    imports: [...reminderImports, ...eventImports],
    removals,
  };
}

/**
 * One-time cleanup: delete duplicate Apple Reminders/Events that were created by
 * the earlier device-sync bug. Conservative — only collapses entries with the
 * SAME normalized title on the SAME day, within the app's own reminder lists /
 * the user's editable calendars, keeping the earliest of each set.
 */
export async function deleteDuplicateAppleEntries(): Promise<{ reminders: number; events: number }> {
  if (Platform.OS !== 'ios') return { reminders: 0, events: 0 };
  let reminders = 0;
  let events = 0;

  try {
    if (await ensureReminderAccess()) {
      const listIds = await getReminderListIds();
      if (listIds.length) {
        const all = await fetchAllIosReminders(listIds);
        const groups = new Map<string, Calendar.Reminder[]>();
        for (const r of all) {
          if (!r.id) continue;
          if (!isAppManagedNote(r.notes)) continue; // only de-dup app-created reminders
          const title = (r.title ?? '').trim().toLowerCase();
          if (!title) continue;
          const due = reminderDueDate(r);
          const key = `${title}|${due ? dateKeyFromDate(due) : 'nodate'}`;
          const arr = groups.get(key) ?? [];
          arr.push(r);
          groups.set(key, arr);
        }
        for (const arr of groups.values()) {
          if (arr.length < 2) continue;
          arr.sort((a, b) => {
            const ca = a.creationDate ? new Date(a.creationDate).getTime() : 0;
            const cb = b.creationDate ? new Date(b.creationDate).getTime() : 0;
            return ca - cb;
          });
          for (const dup of arr.slice(1)) {
            try {
              await Calendar.deleteReminderAsync(dup.id!);
              reminders++;
            } catch {
              /* ignore individual delete failures */
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('[dedupe] reminder cleanup failed:', e);
  }

  try {
    if (await ensureCalendarAccess()) {
      const calIds = await getUserOwnedEventCalendarIds();
      if (calIds.length) {
        const all = await fetchIosCalendarEvents(calIds);
        const groups = new Map<string, Calendar.Event[]>();
        for (const ev of all) {
          if (!ev.id) continue;
          if (!isAppManagedNote(ev.notes)) continue; // only de-dup app-created events
          const title = (ev.title ?? '').trim().toLowerCase();
          if (!title) continue;
          const key = `${title}|${dateKeyFromDate(new Date(ev.startDate))}`;
          const arr = groups.get(key) ?? [];
          arr.push(ev);
          groups.set(key, arr);
        }
        for (const arr of groups.values()) {
          if (arr.length < 2) continue;
          // Keep the first encountered; delete the remaining copies.
          for (const dup of arr.slice(1)) {
            try {
              await Calendar.deleteEventAsync(dup.id!);
              events++;
            } catch {
              /* ignore individual delete failures */
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('[dedupe] event cleanup failed:', e);
  }

  return { reminders, events };
}

export async function syncTaskRemovedFromApple(task: Task): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    if (task.appleReminderId) {
      if (await ensureReminderAccess()) {
        await Calendar.deleteReminderAsync(task.appleReminderId);
      }
    }
    if (task.appleEventId) {
      if (await ensureCalendarAccess()) {
        await Calendar.deleteEventAsync(task.appleEventId);
      }
    }
  } catch (e) {
    console.warn('[apple-sync] delete failed:', e);
  }
}
