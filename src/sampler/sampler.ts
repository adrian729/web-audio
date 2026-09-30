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

async function prepare(ctx: AudioContext, { midi, url }: Sample): Promise<Prepared> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`failed to load sample ${url}: ${response.status}`);
  const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
  const { peak, onset } = measure(buffer);
  return { midi, buffer, onset, level: peak > 0 ? LEVEL / peak : 0 };
}

export async function loadSampler(
  ctx: AudioContext,
  { out, samples }: { out: AudioNode; samples: readonly Sample[] },
): Promise<Instrument> {
  if (samples.length === 0) throw new RangeError('sampler needs at least one sample');
  const prepared = await Promise.all(samples.map((sample) => prepare(ctx, sample)));
  const master = ctx.createGain();
  master.gain.value = 0.7;
  const compressor = ctx.createDynamicsCompressor();
  master.connect(compressor);
  compressor.connect(out);
  const voices = new Set<Voice>();

  const nearest = (midi: number) =>
    prepared.reduce((best, s) => (Math.abs(s.midi - midi) < Math.abs(best.midi - midi) ? s : best));

  return {
    noteOn(midi, when, duration, velocity = 0.8) {
      const sample = nearest(midi);
      const source = ctx.createBufferSource();
      source.buffer = sample.buffer;
      source.playbackRate.value = 2 ** ((midi - sample.midi) / 12);
      const gain = ctx.createGain();
      const peak = sample.level * velocity;
      const end = when + duration;
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
    },
  };
}
