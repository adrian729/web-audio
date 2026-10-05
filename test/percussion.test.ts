import { expect, it, vi } from 'vitest';
import { percussionInstrument, type PercussionSound } from '../src/webaudio/index.js';

it('bounds percussion decay, releases ended voices, and cancels live voices', () => {
  for (const sound of ['kick', 'snare', 'woodblock'] satisfies PercussionSound[]) {
    const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
    const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
    const source = { ...node(), start: vi.fn(), stop: vi.fn(), onended: undefined as (() => void) | undefined, frequency: param() };
    const gain = { ...node(), gain: param() };
    const ctx = { currentTime: 1, sampleRate: 48000, createGain: () => gain,
      createOscillator: () => source, createBufferSource: () => source,
      createBuffer: () => ({ getChannelData: () => new Float32Array(3600) }),
      createBiquadFilter: () => ({ ...node(), frequency: param() }) } as unknown as AudioContext;
    const instrument = percussionInstrument(ctx, { out: {} as AudioNode, sound });
    expect(() => instrument.noteOn(60, 1, -1)).toThrow(RangeError);
    expect(source.start).not.toHaveBeenCalled();
    instrument.noteOn(60, 1, 1, 0.7);
    expect(source.start).toHaveBeenCalledWith(1);
    expect(source.stop.mock.calls[0]![0]).toBeGreaterThan(1);
    expect(source.stop.mock.calls[0]![0]).toBeLessThanOrEqual(1.1);
    instrument.stopAll();
    expect(source.stop).toHaveBeenLastCalledWith(1);
    source.onended!();
    expect(source.disconnect).toHaveBeenCalled();
    expect(gain.disconnect).toHaveBeenCalled();
  }
});
