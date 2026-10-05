import type { Instrument } from '../instrument.js';

export type PercussionSound = 'kick' | 'snare' | 'woodblock';

/** Short synthesized percussion; no samples or timers. MIDI pitch is ignored. */
export function percussionInstrument(ctx: AudioContext, { out, sound }: { out: AudioNode; sound: PercussionSound }): Instrument {
  if (!['kick', 'snare', 'woodblock'].includes(sound)) throw new RangeError('Unknown percussion sound.');
  const voices = new Set<{ source: AudioScheduledSourceNode; nodes: AudioNode[]; gain: GainNode }>();
  let noise: AudioBuffer | undefined;
  return {
    noteOn(_midi, when, duration, velocity = 0.8) {
      if (![when, duration, velocity].every(Number.isFinite) || when < 0 || duration <= 0) throw new RangeError('Invalid percussion event.');
      const length = Math.min(duration, sound === 'kick' ? 0.1 : sound === 'snare' ? 0.075 : 0.045);
      const gain = ctx.createGain();
      const nodes: AudioNode[] = [gain];
      let source: AudioScheduledSourceNode;
      if (sound === 'snare') {
        if (!noise) {
          noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.075), ctx.sampleRate);
          const data = noise.getChannelData(0);
          for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        }
        const buffer = ctx.createBufferSource();
        buffer.buffer = noise;
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass'; filter.frequency.value = 900;
        buffer.connect(filter); filter.connect(gain); nodes.push(filter);
        source = buffer;
      } else {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(sound === 'kick' ? 160 : 1100, when);
        osc.frequency.exponentialRampToValueAtTime(sound === 'kick' ? 45 : 650, when + length);
        osc.connect(gain); source = osc;
      }
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, velocity)) * 0.7, when + Math.min(0.001, length / 4));
      gain.gain.exponentialRampToValueAtTime(0.0001, when + length);
      gain.connect(out);
      const voice = { source, nodes, gain }; voices.add(voice);
      source.onended = () => { voices.delete(voice); source.disconnect(); for (const node of nodes) node.disconnect(); };
      source.start(when); source.stop(when + length);
    },
    stopAll() {
      for (const { source, gain } of voices) {
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        source.stop(ctx.currentTime);
      }
      voices.clear();
    },
  };
}
