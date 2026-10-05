import type { NoteEvent } from '../events.js';
import type { Instrument } from '../instrument.js';
import { isRunning } from './context.js';

export type PlayResult = 'ended' | 'stopped' | 'blocked';

export type PlaybackClockSource = 'outputTimestamp' | 'latencyEstimate' | 'uncorrected';

/** One position on the estimated audible timeline, paired with performance.now(). */
export interface PlaybackClockSnapshot {
  performanceTimeMs: number;
  playbackTimeSeconds: number;
  source: PlaybackClockSource;
  latencyStages?: { baseSeconds?: number; outputSeconds?: number };
}

export interface Playback {
  time(): number;
  stop(): void;
  finished: Promise<PlayResult>;
  /** Signed time; remains available after natural completion until stop/replacement. */
  clock?(requestedSource?: PlaybackClockSource): PlaybackClockSnapshot | undefined;
}

export interface Player {
  play(events: readonly NoteEvent[], options?: { lead?: number; durationSeconds?: number }): Playback;
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
  timer.addEventListener?.('ended', () => {
    timer.disconnect();
    mute.disconnect();
  }, { once: true });
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
    play(events, { lead = 0.06, durationSeconds } = {}) {
      validate(events);
      const lastEnd = events.reduce((end, e) => Math.max(end, e.start + e.duration), 0);
      if (!Number.isFinite(lead) || lead < 0 || (durationSeconds !== undefined &&
        (!Number.isFinite(durationSeconds) || durationSeconds < lastEnd || durationSeconds < 0))) {
        throw new RangeError('invalid playback duration or lead');
      }
      current?.stop();
      const resumed = ctx.resume();
      const latency = () => ctx.outputLatency ?? ctx.baseLatency ?? 0;
      const startAt = ctx.currentTime + lead;
      const activation = (globalThis.navigator as ActivationNavigator | undefined)?.userActivation;
      const blocked = !isRunning(ctx) && activation?.hasBeenActive === false;
      const end = startAt + (durationSeconds ?? lastEnd);
      if (!blocked) {
        for (const e of events) {
          instrument.noteOn(e.midi, startAt + e.start, e.duration, e.velocity);
        }
      }

      let frozen: number | undefined;
      const elapsed = () => Math.max(0, ctx.currentTime - startAt - latency());
      let settle: (result: PlayResult) => void = () => {};
      let done = false;
      let clockValid = !blocked;
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
          clockValid = false;
          if (!done) {
            instrument.stopAll();
            timer.stop();
            settle('stopped');
          }
          if (current === playback) current = undefined;
        },
        clock(requestedSource) {
          if (!clockValid || !isRunning(ctx)) return undefined;
          if (!requestedSource || requestedSource === 'outputTimestamp') {
            try {
              const pair = ctx.getOutputTimestamp?.();
              if (pair && Number.isFinite(pair.contextTime) && Number.isFinite(pair.performanceTime) &&
                (pair.contextTime! > 0 || pair.performanceTime! > 0)) {
                return { performanceTimeMs: pair.performanceTime!, playbackTimeSeconds: pair.contextTime! - startAt,
                  source: 'outputTimestamp' };
              }
            } catch { /* Older implementations can expose an unusable timestamp API. */ }
            if (requestedSource) return undefined;
          }
          const validLatency = (value: number | undefined) =>
            value !== undefined && Number.isFinite(value) && value >= 0 ? value : undefined;
          const baseSeconds = validLatency(ctx.baseLatency);
          const outputSeconds = validLatency(ctx.outputLatency);
          const available = baseSeconds !== undefined || outputSeconds !== undefined;
          if (requestedSource === 'latencyEstimate' && !available) return undefined;
          const estimated = requestedSource !== 'uncorrected' && available;
          const performanceTimeMs = performance.now();
          const playbackTimeSeconds = ctx.currentTime - startAt -
            (estimated ? (baseSeconds ?? 0) + (outputSeconds ?? 0) : 0);
          if (!Number.isFinite(playbackTimeSeconds)) return undefined;
          return { performanceTimeMs, playbackTimeSeconds,
            source: estimated ? 'latencyEstimate' : 'uncorrected',
            ...(estimated ? { latencyStages: { baseSeconds, outputSeconds } } : {}) };
        },
        finished,
      };
      current = playback;

      if (blocked) {
        clockValid = false;
        timer.stop();
        settle('blocked');
        void Promise.resolve(resumed).catch(() => {});
        return playback;
      }
      Promise.resolve(resumed)
        .catch(() => {})
        .then(() => {
          if (!isRunning(ctx) && !done) {
            clockValid = false;
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
