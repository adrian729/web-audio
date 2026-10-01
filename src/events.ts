import type { TempoOverride, TimeMap } from '@polyhymnia/notation-engine';

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
  tickAtSeconds(seconds: number): number;
}

export interface EventsOptions {
  tempo?: TempoOverride;
}

export function eventsFromTimeMap(timemap: TimeMap, options: EventsOptions = {}): Clip {
  const { tempo } = options;
  const events: NoteEvent[] = [];
  let offset = 0;
  for (const segment of timemap.playOrder()) {
    const base = timemap.tickToSeconds(segment.fromTick, tempo);
    for (const entry of timemap.entries) {
      if (entry.kind === 'rest' || entry.tick < segment.fromTick || entry.tick >= segment.toTick) continue;
      const start = offset + timemap.tickToSeconds(entry.tick, tempo) - base;
      const end = timemap.tickToSeconds(Math.min(entry.tick + entry.durationTicks, segment.toTick), tempo);
      const duration = end - timemap.tickToSeconds(entry.tick, tempo);
      const midis = entry.midiNotes ?? (entry.midi === undefined ? [] : [entry.midi]);
      midis.forEach((midi, i) => events.push({ id: entry.ids[i], midi, start, duration }));
    }
    offset += timemap.tickToSeconds(segment.toTick, tempo) - base;
  }
  events.sort((a, b) => a.start - b.start);
  return {
    events,
    durationSeconds: offset,
    tickAtSeconds: (seconds) => timemap.writtenTickAtSeconds(seconds, tempo),
  };
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
