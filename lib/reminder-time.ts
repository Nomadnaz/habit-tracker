/** Default hour/minute when opening the task sheet (current local time). */
export function defaultReminderTime() {
  const now = new Date();
  return { hour: now.getHours(), minute: now.getMinutes() };
}

export function pad2(n: number) {
  return String(n).padStart(2, '0');
}
