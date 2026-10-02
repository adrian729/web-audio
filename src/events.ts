export interface NoteEvent {
  id?: string;
  midi: number;
  start: number;
  duration: number;
  velocity?: number;
}

export interface Clip {
  events: readonly NoteEvent[];
  durationSeconds: number;
}

export function melodic(
  midis: readonly number[],
  { noteDuration = 0.5, gap = 0 }: { noteDuration?: number; gap?: number } = {},
): NoteEvent[] {
  return midis.map((midi, i) => ({ midi, start: i * (noteDuration + gap), duration: noteDuration }));
}

export function harmonic(midis: readonly number[], { duration = 1 }: { duration?: number } = {}): NoteEvent[] {
  return midis.map((midi) => ({ midi, start: 0, duration }));
}

export function shift(events: readonly NoteEvent[], dt: number): NoteEvent[] {
  return events.map((e) => ({ ...e, start: e.start + dt }));
}

export function concat(...lists: readonly (readonly NoteEvent[])[]): NoteEvent[] {
  let offset = 0;
  const out: NoteEvent[] = [];
  for (const list of lists) {
    out.push(...shift(list, offset));
    offset += list.reduce((end, e) => Math.max(end, e.start + e.duration), 0);
  }
  return out;
}

export function transpose(events: readonly NoteEvent[], semitones: number): NoteEvent[] {
  return events.map((e) => ({ ...e, midi: e.midi + semitones }));
}
