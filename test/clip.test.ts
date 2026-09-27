import { describe, expect, it } from 'vitest';
import { layoutScore } from '@polyhymnia/notation-engine';
import type { MnxDocument } from '@polyhymnia/notation-model';
import { eventsFromTimeMap } from '../src/index.js';

const half = { base: 'half' };
const quarter = { base: 'quarter' };
const pitch = (step: string, octave: number) => ({ step, octave });

const doc = {
  mnx: { version: 1 },
  global: {
    measures: [
      { repeatStart: {}, time: { count: 4, unit: 4 }, tempos: [{ bpm: 60, value: quarter }] },
      { repeatEnd: {} },
      {},
    ],
  },
  parts: [
    {
      measures: [
        {
          clefs: [{ clef: { sign: 'G', staffPosition: -2 } }],
          sequences: [
            {
              content: [
                { duration: quarter, rest: {} },
                { duration: quarter, notes: [{ id: 'c', pitch: pitch('C', 4) }, { id: 'e', pitch: pitch('E', 4) }] },
                { duration: half, notes: [{ id: 'd', pitch: pitch('D', 4) }] },
              ],
            },
          ],
        },
        {
          sequences: [
            {
              content: [
                { duration: half, notes: [{ id: 'f', pitch: pitch('F', 4) }] },
                { duration: half, notes: [{ id: 'g', pitch: pitch('G', 4), ties: [{ target: 'g2' }] }] },
              ],
            },
          ],
        },
        {
          sequences: [
            { content: [{ duration: { base: 'whole' }, notes: [{ id: 'g2', pitch: pitch('G', 4) }] }] },
          ],
        },
      ],
    },
  ],
} as unknown as MnxDocument;

describe('eventsFromTimeMap', () => {
  it('unrolls repeats, clips the tie at the segment end, fans out chords, skips rests', () => {
    const layout = layoutScore(doc);
    expect(layout.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const tm = layout.timemap;
    const clip = eventsFromTimeMap(tm);
    const summary = clip.events.map((e) => [e.id, e.midi, +e.start.toFixed(6), +e.duration.toFixed(6)]);
    expect(summary).toEqual([
      ['c', 60, 1, 1],
      ['e', 64, 1, 1],
      ['d', 62, 2, 2],
      ['f', 65, 4, 2],
      ['g', 67, 6, 2],
      ['c', 60, 9, 1],
      ['e', 64, 9, 1],
      ['d', 62, 10, 2],
      ['f', 65, 12, 2],
      ['g', 67, 14, 6],
    ]);
    expect(clip.durationSeconds).toBeCloseTo(20);
    const c = tm.byId('c')!;
    expect(clip.tickAtSeconds(9)).toBeCloseTo(c.tick);
  });
});
