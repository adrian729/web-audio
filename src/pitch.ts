import { parsePitch, type Pitch } from '@polyhymnia/notation-model';

export type PitchLike = number | Pitch | string;

const SEMITONES: Record<Pitch['step'], number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function midiOfPitch(pitch: PitchLike): number {
  const midi =
    typeof pitch === 'number'
      ? pitch
      : (() => {
          const p = typeof pitch === 'string' ? parsePitch(pitch) : pitch;
          return 12 * (p.octave + 1) + SEMITONES[p.step] + (p.alter ?? 0);
        })();
  if (!Number.isFinite(midi)) throw new RangeError('invalid pitch');
  return midi;
}

export function midiToFrequency(midi: number, a4 = 440): number {
  return a4 * 2 ** ((midi - 69) / 12);
}
