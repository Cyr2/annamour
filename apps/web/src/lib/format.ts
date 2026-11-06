/* French formatting for times and lists of people. */

/** 4360 → "1:12:40"; always with hours, so a film's clock never changes width. */
export function formatClock(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/** 7826 → "2 h 10", 2520 → "42 min". */
export function formatDuration(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} h ${String(minutes % 60).padStart(2, "0")}` : `${minutes} min`;
}

/** ["Anna"] → "Anna", ["Anna", "Léo", "Inès"] → "Anna, Léo et Inès". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} et ${names.at(-1)}`;
}

/** "1 séance", "3 séances". */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}
