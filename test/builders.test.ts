import { describe, expect, it } from 'vitest';
import { harmonic, melodic } from '../src/index.js';

describe('builders', () => {
  it.each([
    ['melodic', () => melodic(['C4', 'F#4'], { noteDuration: 1, gap: 0.5 }), [[60, 0, 1], [66, 1.5, 1]]],
    ['harmonic', () => harmonic([{ step: 'C', octave: 4 }, 'F#4'], { duration: 2 }), [[60, 0, 2], [66, 0, 2]]],
  ] as const)('%s', (_name, build, expected) => {
    expect(build().map((e) => [e.midi, e.start, e.duration])).toEqual(expected);
  });
});
