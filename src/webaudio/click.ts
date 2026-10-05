import type { Instrument } from '../instrument.js';
import { midiToFrequency } from '../pitch.js';

/** Crisp, sample-free clicks. The envelope ends within the requested duration. */
export function clickInstrument(ctx: AudioContext, { out }: { out: AudioNode }): Instrument {
  const voices = new Set<{ osc: OscillatorNode; gain: GainNode }>();
  return {
    noteOn(midi, when, duration, velocity = 0.8) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = midiToFrequency(midi);
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, velocity)) * 0.5, when + Math.min(0.002, duration / 4));
      gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
      osc.connect(gain);
      gain.connect(out);
      const voice = { osc, gain };
      voices.add(voice);
      osc.onended = () => { voices.delete(voice); osc.disconnect(); gain.disconnect(); };
      osc.start(when);
      osc.stop(when + duration);
    },
    stopAll() {
      for (const { osc, gain } of voices) {
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        osc.stop(ctx.currentTime);
      }
      voices.clear();
    },
  };
}
