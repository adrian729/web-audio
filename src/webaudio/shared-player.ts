import type { Instrument } from '../instrument.js';
import { createAudioContext } from './context.js';
import { createPlayer, type Player } from './player.js';
import { synthInstrument } from './synth.js';

export function defaultInstrument(ctx: AudioContext): Instrument {
  return synthInstrument(ctx, { out: ctx.destination });
}

export function createSharedPlayer(makeInstrument: (ctx: AudioContext) => Instrument = defaultInstrument): Player {
  const ctx = createAudioContext();
  return createPlayer(ctx, makeInstrument(ctx));
}
