import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSampler } from '../src/sampler/index.js';

afterEach(() => vi.unstubAllGlobals());

// Each fetched URL decodes to its own buffer: a click 10 ms in, so onset measuring has a peak.
function fakeAudio(failing = new Set<string>()) {
  const fetched: string[] = [];
  const bodies = new WeakMap<ArrayBuffer, string>();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    fetched.push(url);
    const body = new ArrayBuffer(8);
    bodies.set(body, url);
    return { ok: !failing.has(url), status: failing.has(url) ? 500 : 200, arrayBuffer: async () => body };
  }));
  const param = () => ({ value: 0, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, cancelScheduledValues: () => {} });
  const node = () => ({ connect: () => {}, disconnect: () => {}, gain: param() });
  const sources: { buffer: { url: string } | null; playbackRate: { value: number }; stopAt?: number }[] = [];
  const ctx = {
    currentTime: 0,
    createGain: node,
    createDynamicsCompressor: node,
    createBufferSource: () => {
      const source = { ...node(), buffer: null, playbackRate: { value: 1 }, onended: null, stopAt: undefined as number | undefined,
        start: () => {}, stop(at: number) { source.stopAt = at; } };
      sources.push(source);
      return source;
    },
    decodeAudioData: async (body: ArrayBuffer) => {
      const data = new Float32Array(4410);
      data[441] = 1;
      return { url: bodies.get(body)!, numberOfChannels: 1, sampleRate: 44100, length: data.length, duration: data.length / 44100, getChannelData: () => data };
    },
  };
  return { ctx: ctx as unknown as AudioContext, fetched, sources };
}

// Three semitones apart, like the piano set, plus one beyond a tritone from the rest.
const samples = [60, 63, 66, 72].map((midi) => ({ midi, url: `/s/${midi}.mp3` }));

describe('createSampler', () => {
  it('loads only the samples the prepared notes play from, once each, and retries a failed load', async () => {
    const { ctx, fetched } = fakeAudio(new Set(['/s/72.mp3']));
    const sampler = createSampler(ctx, { out: {} as AudioNode, samples });
    expect(fetched).toEqual([]);
    await Promise.all([sampler.prepare([60, 61]), sampler.prepare([61])]);
    expect(fetched).toEqual(['/s/60.mp3']);
    expect(sampler.canPlay([59, 61, 66])).toBe(true);
    expect(sampler.canPlay([72])).toBe(false);
    await expect(sampler.prepare([72])).rejects.toThrow('/s/72.mp3');
    await expect(sampler.prepare([72])).rejects.toThrow();
    expect(sampler.canPlay([72])).toBe(false);
    expect(fetched.filter((url) => url === '/s/72.mp3')).toHaveLength(2);
  });

  it('plays a note at once: its own sample, a loaded one within a tritone, or the fallback', async () => {
    const { ctx, fetched, sources } = fakeAudio();
    const fallback = { noteOn: vi.fn(), stopAll: vi.fn() };
    const sampler = createSampler(ctx, { out: {} as AudioNode, samples, fallback });
    sampler.noteOn(60, 0, 1);
    expect(fallback.noteOn).toHaveBeenCalledWith(60, 0, 1, 0.8);
    await sampler.prepare([60]);
    sampler.noteOn(66, 0, 1);
    expect(sources.at(-1)!.buffer!.url).toBe('/s/60.mp3');
    expect(sources.at(-1)!.playbackRate.value).toBeCloseTo(2 ** (6 / 12));
    expect(fetched).toContain('/s/66.mp3');
    sampler.noteOn(72, 0, 1);
    expect(fallback.noteOn).toHaveBeenCalledTimes(2);
    await sampler.prepare([66]);
    sampler.noteOn(66, 0, 1);
    expect(sources.at(-1)!.buffer!.url).toBe('/s/66.mp3');
    expect(sources.at(-1)!.playbackRate.value).toBe(1);
    // The fake samples last 0.1 s: a 1 s note finishes its release as the sample ends, not after.
    expect(sources.at(-1)!.stopAt).toBeCloseTo(0.1);
    sampler.stopAll();
    expect(fallback.stopAll).toHaveBeenCalled();
  });

  it('warms coarse to fine: one sample per octave first, then every third semitone, until aborted', async () => {
    const chromatic = Array.from({ length: 25 }, (_, i) => ({ midi: 48 + i, url: `/s/${48 + i}.mp3` }));
    const { ctx, fetched } = fakeAudio();
    const sampler = createSampler(ctx, { out: {} as AudioNode, samples: chromatic });
    await sampler.warm();
    expect(fetched.slice(0, 3)).toEqual(['/s/48.mp3', '/s/60.mp3', '/s/72.mp3']);
    expect(sampler.canPlay(chromatic.map((sample) => sample.midi))).toBe(true);
    await vi.waitFor(() => expect(fetched).toHaveLength(9));
    expect(fetched.slice(3)).toEqual([51, 54, 57, 63, 66, 69].map((midi) => `/s/${midi}.mp3`));

    const other = fakeAudio(), abort = new AbortController();
    const stopped = createSampler(other.ctx, { out: {} as AudioNode, samples: chromatic });
    await stopped.warm(abort.signal);
    abort.abort();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(other.fetched.length).toBeLessThan(9);
  });
});
