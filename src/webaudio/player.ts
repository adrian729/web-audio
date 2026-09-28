import type { NoteEvent } from '../events.js';
import type { Instrument } from '../instrument.js';
import { isRunning } from './context.js';

export type PlayResult = 'ended' | 'stopped' | 'blocked';

export interface Playback {
  time(): number;
  stop(): void;
  finished: Promise<PlayResult>;
}

export interface Player {
  play(events: readonly NoteEvent[], options?: { lead?: number }): Playback;
  stop(): void;
}

interface ActivationNavigator {
  userActivation?: { hasBeenActive: boolean };
}

function scheduleEndSignal(ctx: AudioContext, at: number): OscillatorNode {
  const timer = ctx.createOscillator();
  const mute = ctx.createGain();
  mute.gain.value = 0;
  timer.connect(mute);
  mute.connect(ctx.destination);
  timer.start();
  timer.stop(at);
  return timer;
}

function validate(events: readonly NoteEvent[]): void {
  for (const e of events) {
    if (
      !Number.isFinite(e.midi) ||
      !Number.isFinite(e.start) ||
      !Number.isFinite(e.duration) ||
      e.duration <= 0 ||
      (e.velocity !== undefined && !Number.isFinite(e.velocity))
    ) {
      throw new RangeError('invalid note event');
    }
  }
}

export function createPlayer(ctx: AudioContext, instrument: Instrument): Player {
  let current: Playback | undefined;

  const player: Player = {
    play(events, { lead = 0.06 } = {}) {
      validate(events);
      current?.stop();
      const resumed = ctx.resume();
      const latency = () => ctx.outputLatency ?? ctx.baseLatency ?? 0;
      const startAt = ctx.currentTime + lead;
      const activation = (globalThis.navigator as ActivationNavigator | undefined)?.userActivation;
      const blocked = !isRunning(ctx) && activation?.hasBeenActive === false;
      let end = startAt;
      if (!blocked) {
        for (const e of events) {
          instrument.noteOn(e.midi, startAt + e.start, e.duration, e.velocity);
          end = Math.max(end, startAt + e.start + e.duration);
        }
      }

      let frozen: number | undefined;
      const elapsed = () => Math.max(0, ctx.currentTime - startAt - latency());
      let settle: (result: PlayResult) => void = () => {};
      let done = false;
      const finished = new Promise<PlayResult>((resolve) => {
        settle = (result) => {
          if (done) return;
          done = true;
          frozen = elapsed();
          timer.onended = null;
          resolve(result);
        };
      });
      const timer = scheduleEndSignal(ctx, end + latency() + 0.1);
      timer.onended = () => settle('ended');

      const playback: Playback = {
        time() {
          return frozen ?? elapsed();
        },
        stop() {
          if (done) return;
          instrument.stopAll();
          timer.stop();
          settle('stopped');
          if (current === playback) current = undefined;
        },
        finished,
      };
      current = playback;

      if (blocked) {
        timer.stop();
        settle('blocked');
        void Promise.resolve(resumed).catch(() => {});
        return playback;
      }
      Promise.resolve(resumed)
        .catch(() => {})
        .then(() => {
          if (!isRunning(ctx) && !done) {
            instrument.stopAll();
            timer.stop();
            settle('blocked');
          }
        });
      return playback;
    },
    stop() {
      current?.stop();
    },
  };
  return player;
}
