import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlayer } from '../src/webaudio/index.js';

afterEach(() => vi.unstubAllGlobals());

function fakeCtx(state = 'running', resume: () => Promise<void> = () => Promise.resolve()) {
  const oscs: { onended: (() => void) | null; stop: (t?: number) => void }[] = [];
  const node = () => ({ connect: () => {}, gain: { value: 0 } });
  const ctx = {
    currentTime: 10,
    state,
    outputLatency: 0.05,
    destination: {},
    resume,
    createGain: node,
    createOscillator: () => {
      const o = { ...node(), onended: null as (() => void) | null, start: () => {}, stop: (_t?: number) => {} };
      oscs.push(o);
      return o;
    },
  };
  return { ctx: ctx as unknown as AudioContext, raw: ctx, oscs };
}

describe('createPlayer', () => {
  it('replaces the previous play, stops the instrument, and settles finished', async () => {
    const { ctx, raw, oscs } = fakeCtx();
    const calls: string[] = [];
    const player = createPlayer(ctx, {
      noteOn: (midi, when) => calls.push(`on ${midi} ${when.toFixed(2)}`),
      stopAll: () => calls.push('stopAll'),
    });
    const events = [{ midi: 60, start: 0, duration: 1 }];
    const first = player.play(events);
    const second = player.play(events, { lead: 0 });
    expect(await first.finished).toBe('stopped');
    expect(calls).toEqual(['on 60 10.06', 'stopAll', 'on 60 10.00']);
    raw.currentTime = 10.55;
    expect(second.time()).toBeCloseTo(0.5);
    oscs.at(-1)!.onended!();
    expect(await second.finished).toBe('ended');
    const third = player.play(events);
    third.stop();
    expect(await third.finished).toBe('stopped');
  });

  it('settles blocked without scheduling when the context stays suspended with no user activation', async () => {
    vi.stubGlobal('navigator', { userActivation: { hasBeenActive: false } });
    const { ctx } = fakeCtx('suspended', () => new Promise(() => {}));
    const calls: string[] = [];
    const player = createPlayer(ctx, { noteOn: () => calls.push('on'), stopAll: () => calls.push('stopAll') });
    expect(await player.play([{ midi: 60, start: 0, duration: 1 }]).finished).toBe('blocked');
    expect(calls).not.toContain('on');
  });

  it('throws on an invalid event before scheduling anything', () => {
    const { ctx } = fakeCtx();
    const calls: string[] = [];
    const player = createPlayer(ctx, { noteOn: () => calls.push('on'), stopAll: () => {} });
    expect(() =>
      player.play([
        { midi: 60, start: 0, duration: 1 },
        { midi: NaN, start: 0, duration: 1 },
      ]),
    ).toThrow(RangeError);
    expect(calls).toEqual([]);
  });
});
