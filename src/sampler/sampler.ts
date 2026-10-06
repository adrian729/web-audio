import type { Instrument } from '../instrument.js';

export interface Sample {
  midi: number;
  url: string;
}

interface Prepared {
  midi: number;
  buffer: AudioBuffer;
  onset: number;
  level: number;
}

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  when: number;
}

const ATTACK = 0.004;
const RELEASE = 0.08;
const STOP_RAMP = 0.025;
const LEVEL = 0.35;
const ONSET_FRAME = 0.02;
const ONSET_HOP = 0.005;
const ONSET_RATIO = 0.5;
const ATTACK_WINDOW = 0.3;

function measure(buffer: AudioBuffer): { peak: number; onset: number } {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const sampleRate = buffer.sampleRate;
  const frame = Math.max(1, Math.round(ONSET_FRAME * sampleRate));
  const hop = Math.max(1, Math.round(ONSET_HOP * sampleRate));
  const frames = Math.max(1, Math.floor(Math.max(0, buffer.length - frame) / hop) + 1);

  // Short-time energy, so a quiet lead-in or noise floor before the note is skipped.
  const energy = new Float64Array(frames);
  for (const data of channels) {
    for (let f = 0; f < frames; f += 1) {
      const start = f * hop;
      const end = Math.min(buffer.length, start + frame);
      let sum = 0;
      for (let i = start; i < end; i += 1) sum += data[i]! * data[i]!;
      energy[f] += sum;
    }
  }
  let loudest = 0;
  for (const value of energy) loudest = Math.max(loudest, value);
  let first = 0;
  for (let f = 0; f < frames; f += 1) {
    if (energy[f]! > loudest * ONSET_RATIO) {
      first = f;
      break;
    }
  }

  // Normalize by the attack, not by any louder resonance later in the file.
  const onsetSample = first * hop;
  const windowEnd = Math.min(buffer.length, onsetSample + Math.round(ATTACK_WINDOW * sampleRate));
  let peak = 0;
  for (const data of channels) {
    for (let i = onsetSample; i < windowEnd; i += 1) peak = Math.max(peak, Math.abs(data[i]!));
  }
  return { peak, onset: onsetSample / sampleRate };
}

async function prepare(ctx: AudioContext, { midi, url }: Sample, priority: RequestPriority): Promise<Prepared> {
  const response = await fetch(url, { priority });
  if (!response.ok) throw new Error(`failed to load sample ${url}: ${response.status}`);
  const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
  const { peak, onset } = measure(buffer);
  return { midi, buffer, onset, level: peak > 0 ? LEVEL / peak : 0 };
}

/**
 * How far a note may borrow a loaded neighbour's sample while its own is still loading: a tritone,
 * so one sample per octave already lets every note play.
 */
const BORROW_SEMITONES = 6;
/** Warm-up tiers, coarse to fine: one sample per octave, then one every third semitone. */
const WARM_STEPS = [12, 3];

export interface Sampler extends Instrument {
  /** Loads the samples these notes play from; resolves once each can play its own. */
  prepare(midis: Iterable<number>): Promise<void>;
  /** Whether each of these notes can play now, from its own sample or a loaded one nearby. */
  canPlay(midis: Iterable<number>): boolean;
  /**
   * Loads samples in the background, one at a time at low network priority and coarse to fine: one
   * per octave, then one every third semitone. Resolves once the first tier is in, when every note
   * in range can play; the finer tier continues until done or `signal` aborts. A note's exact
   * sample still loads the first time it plays.
   */
  warm(signal?: AbortSignal): Promise<void>;
}

export interface SamplerOptions {
  out: AudioNode;
  samples: readonly Sample[];
  /** Plays a note when no loaded sample is close enough to it, such as before the first loads. */
  fallback?: Instrument;
}

/**
 * A sampler that loads nothing up front: each sample is fetched, decoded and measured when a note
 * needs it (`prepare`, `noteOn`) or when `warm` reaches it. A note never waits:
 * until its own sample is loaded it borrows the nearest loaded one within a tritone, repitched, or
 * plays on `fallback`.
 */
export function createSampler(ctx: AudioContext, { out, samples, fallback }: SamplerOptions): Sampler {
  if (samples.length === 0) throw new RangeError('sampler needs at least one sample');
  const master = ctx.createGain();
  master.gain.value = 0.7;
  const compressor = ctx.createDynamicsCompressor();
  master.connect(compressor);
  compressor.connect(out);
  const voices = new Set<Voice>();
  const loading = new Map<Sample, Promise<Prepared>>();
  const loaded = new Map<Sample, Prepared>();

  const own = (midi: number) =>
    samples.reduce((best, s) => (Math.abs(s.midi - midi) < Math.abs(best.midi - midi) ? s : best));
  const load = (sample: Sample, priority: RequestPriority = 'auto'): Promise<Prepared> => {
    let pending = loading.get(sample);
    if (!pending) {
      pending = prepare(ctx, sample, priority).then(
        (prepared) => {
          loaded.set(sample, prepared);
          return prepared;
        },
        (error: unknown) => {
          loading.delete(sample);
          throw error;
        },
      );
      loading.set(sample, pending);
    }
    return pending;
  };
  const borrowed = (midi: number): Prepared | undefined => {
    let best: Prepared | undefined;
    for (const prepared of loaded.values()) {
      const distance = Math.abs(prepared.midi - midi);
      if (distance <= BORROW_SEMITONES && (!best || distance < Math.abs(best.midi - midi))) best = prepared;
    }
    return best;
  };
  const playable = (midi: number) => loaded.has(own(midi)) || !!borrowed(midi);
  // The sample nearest each evenly spaced pitch across the range, so any step spreads evenly.
  const lowest = Math.min(...samples.map((s) => s.midi));
  const highest = Math.max(...samples.map((s) => s.midi));
  const spaced = (step: number) => {
    const targets = [];
    for (let midi = lowest; midi < highest; midi += step) targets.push(midi);
    return [...new Set([...targets, highest].map(own))];
  };
  const loadInTurn = async (list: readonly Sample[], signal?: AbortSignal) => {
    for (const sample of list) {
      if (signal?.aborted) return;
      if (!loaded.has(sample)) await load(sample, 'low').catch(() => {});
    }
  };

  return {
    async prepare(midis) {
      await Promise.all([...new Set([...midis].map(own))].map((sample) => load(sample)));
    },
    canPlay(midis) {
      return [...midis].every(playable);
    },
    async warm(signal) {
      const [first = [], ...finer] = WARM_STEPS.map(spaced);
      await loadInTurn(first, signal);
      void loadInTurn(finer.flat(), signal);
    },
    noteOn(midi, when, duration, velocity = 0.8) {
      const target = own(midi);
      const sample = loaded.get(target) ?? borrowed(midi);
      if (!loaded.has(target)) void load(target).catch(() => {});
      if (!sample) {
        fallback?.noteOn(midi, when, duration, velocity);
        return;
      }
      const source = ctx.createBufferSource();
      const rate = 2 ** ((midi - sample.midi) / 12);
      source.buffer = sample.buffer;
      source.playbackRate.value = rate;
      const gain = ctx.createGain();
      const peak = sample.level * velocity;
      // A note longer than its sample releases before the audio runs out, never cutting off with a click.
      const available = (sample.buffer.duration - sample.onset) / rate - RELEASE;
      const end = when + Math.max(0, Math.min(duration, available));
      gain.gain.value = 0;
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(peak, when + Math.min(ATTACK, duration / 4));
      gain.gain.setValueAtTime(peak, end);
      gain.gain.linearRampToValueAtTime(0, end + RELEASE);
      source.connect(gain);
      gain.connect(master);
      const voice: Voice = { source, gain, when };
      voices.add(voice);
      source.onended = () => {
        voices.delete(voice);
        source.disconnect();
        gain.disconnect();
      };
      source.start(when, sample.onset);
      source.stop(end + RELEASE);
    },
    stopAll() {
      const now = ctx.currentTime;
      for (const { source, gain, when } of voices) {
        gain.gain.cancelScheduledValues(now);
        if (when > now) {
          gain.gain.setValueAtTime(0, now);
          source.stop(now);
          continue;
        }
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + STOP_RAMP);
        source.stop(now + STOP_RAMP + 0.005);
      }
      voices.clear();
      fallback?.stopAll();
    },
  };
}

/** A sampler with every sample loaded before it resolves. */
export async function loadSampler(
  ctx: AudioContext,
  { out, samples }: { out: AudioNode; samples: readonly Sample[] },
): Promise<Instrument> {
  const sampler = createSampler(ctx, { out, samples });
  await sampler.prepare(samples.map((sample) => sample.midi));
  return sampler;
}
