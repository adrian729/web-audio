import { parsePitch, pitchToMidi, type Pitch } from '@polyhymnia/notation-model';

export type PitchLike = number | Pitch | string;

export function midiOfPitch(pitch: PitchLike): number {
  const midi =
    typeof pitch === 'number'
      ? pitch
      : pitchToMidi(typeof pitch === 'string' ? parsePitch(pitch) : pitch);
  if (!Number.isFinite(midi)) throw new RangeError('invalid pitch');
  return midi;
}

export function midiToFrequency(midi: number, a4 = 440): number {
  return a4 * 2 ** ((midi - 69) / 12);
}
