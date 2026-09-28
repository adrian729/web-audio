interface AudioSessionNavigator {
  audioSession?: { type: string };
}

type ContextConstructor = typeof AudioContext;

let shared: AudioContext | undefined;

export function isRunning(ctx: AudioContext): boolean {
  return (ctx.state as string) === 'running';
}

export function createAudioContext(): AudioContext {
  if (shared && (shared.state as string) !== 'closed') return shared;
  const Ctor: ContextConstructor | undefined =
    globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: ContextConstructor }).webkitAudioContext;
  if (!Ctor) throw new Error('Web Audio API is not available in this environment');
  const session = (globalThis.navigator as AudioSessionNavigator | undefined)?.audioSession;
  if (session) session.type = 'playback';
  shared = new Ctor();
  return shared;
}

export function unlockAudio(ctx: AudioContext = createAudioContext()): () => void {
  const events = ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown'] as const;
  const resume = () => {
    if (isRunning(ctx)) return;
    void ctx.resume().catch(() => {});
  };
  for (const name of events) globalThis.addEventListener(name, resume);
  return () => {
    for (const name of events) globalThis.removeEventListener(name, resume);
  };
}
