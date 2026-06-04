import { Platform } from 'react-native';
import { LayoutAnimation } from 'react-native';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH';
export type Task = {
  id: string;
  label: string;
  done: boolean;
  archived?: boolean;
  priority?: Priority;
  /** Scheduled start (local); omit for anytime tasks */
  hour?: number;
  minute?: number;
  /** Event length in minutes (calendar / timed blocks) */
  durationMins?: number;
  location?: string;
  /** iOS Reminders id when synced from the app */
  appleReminderId?: string;
  /** iOS Calendar event id when added from calendar day flow */
  appleEventId?: string;
};
export type TaskMap = Record<string, Task[]>;

export const TASK_ROW_SLOT_PX = 62;
export const AUTO_SCROLL_EDGE_PX = 80;
export const AUTO_SCROLL_STEP_PX = 10;
// Full width of the left bin column: row paddingLeft (16) + wheelWrap width (136) = 152.
// Finger anywhere inside the column triggers the bin zones.
export const DELETE_ZONE_X = 152;
export const COMPLETE_HOLD_MS = 450;
export const COMPLETE_FADE_MS = 400;
export const TASK_LABEL_COLOR_ACTIVE = '#000000';
export const TASK_LABEL_COLOR_DONE = '#8C857B';
export const TASK_ROW_DONE_OPACITY = 0.4;

export const LIST_MOVE_SPRING_MS = 620;

/** Bouncier spring when a completed task slides down to the bottom of the list. */
export const listMoveSpringDown = Platform.select({
  ios: {
    duration: LIST_MOVE_SPRING_MS,
    update: {
      type: LayoutAnimation.Types.spring,
      springDamping: 0.68,
      initialVelocity: 1.1,
    },
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
  },
  default: {
    duration: 520,
    update: {
      type: LayoutAnimation.Types.spring,
      springDamping: 0.72,
      initialVelocity: 0.85,
    },
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
  },
});

export const listMoveSpring = Platform.select({
  ios: {
    duration: LIST_MOVE_SPRING_MS,
    update: {
      type: LayoutAnimation.Types.spring,
      springDamping: 0.82,
      initialVelocity: 0.12,
    },
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
  },
  default: {
    duration: 520,
    update: { type: LayoutAnimation.Types.easeInEaseOut },
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
  },
});

export const smoothListAnim = {
  duration: 300,
  update: { type: LayoutAnimation.Types.easeInEaseOut },
  create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
};

export function sortActiveTasks(active: Task[]): Task[] {
  return [...active.filter(t => !t.done), ...active.filter(t => t.done)];
}

/** List index where a newly completed task should sit (bottom of undone block). */
export function completedTaskSinkIndex(active: Task[]): number {
  return active.filter(t => !t.done).length;
}

/** New active tasks: HIGH priority goes to slot #1 (index 0) among undone items. */
export function insertNewActiveTask(active: Task[], newTask: Task): Task[] {
  const undone = active.filter(t => !t.done);
  const done = active.filter(t => t.done);
  if (!newTask.done && newTask.priority === 'HIGH') {
    return [newTask, ...undone, ...done];
  }
  return [...undone, newTask, ...done];
}

export function buildTaskList(
  active: Task[],
  completingIds: Set<string>,
  pinIndex: Map<string, number>,
): Task[] {
  const sorted = sortActiveTasks(active);
  if (completingIds.size === 0) return sorted;

  const list = sorted.filter(t => !completingIds.has(t.id));
  for (const id of completingIds) {
    const task = active.find(t => t.id === id);
    if (!task) continue;
    const pin = pinIndex.get(id) ?? list.length;
    list.splice(Math.min(pin, list.length), 0, task);
  }
  return list;
}

export function taskIndexColor(i: number): string {
  if (i === 0) return '#FF4D00';
  if (i === 1) return '#FF9A6B';
  return '#C7C1B8';
}

export function generateTaskId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
