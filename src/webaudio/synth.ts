import { midiToFrequency } from '../pitch.js';
import type { Instrument } from '../instrument.js';

const ATTACK = 0.01;
const DECAY = 0.1;
const SUSTAIN = 0.6;
const RELEASE = 0.08;
const STOP_RAMP = 0.025;

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  when: number;
}

export function synthInstrument(ctx: AudioContext, { out }: { out: AudioNode }): Instrument {
  const master = ctx.createGain();
  master.gain.value = 0.7;
  const compressor = ctx.createDynamicsCompressor();
  master.connect(compressor);
  compressor.connect(out);
  const voices = new Set<Voice>();

  return {
    noteOn(midi, when, duration, velocity = 0.8) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = midiToFrequency(midi);
      const gain = ctx.createGain();
      const peak = 0.3 * velocity;
      const attack = Math.min(ATTACK, duration / 4);
      const decay = Math.min(DECAY, duration / 2);
      const end = when + duration;
      gain.gain.value = 0;
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(peak, when + attack);
      gain.gain.linearRampToValueAtTime(peak * SUSTAIN, when + attack + decay);
      gain.gain.setValueAtTime(peak * SUSTAIN, end);
      gain.gain.linearRampToValueAtTime(0, end + RELEASE);
      osc.connect(gain);
      gain.connect(master);
      const voice: Voice = { osc, gain, when };
      voices.add(voice);
      osc.onended = () => {
        voices.delete(voice);
        osc.disconnect();
        gain.disconnect();
      };
      osc.start(when);
      osc.stop(end + RELEASE);
    },
    stopAll() {
      const now = ctx.currentTime;
      for (const { osc, gain, when } of voices) {
        if (when > now) {
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(0, now);
          osc.stop(now);
          continue;
        }
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + STOP_RAMP);
        osc.stop(now + STOP_RAMP + 0.005);
      }
      voices.clear();
    },
  };
}
