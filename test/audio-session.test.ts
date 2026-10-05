import { expect, test, vi } from 'vitest';
import { createAudioContext, setAudioSessionPolicy } from '../src/webaudio/index.js';
test('host audio-session policy works before and after shared context creation and restores conditionally', () => {
  const session = { type: 'auto' }; vi.stubGlobal('navigator', { audioSession: session });
  vi.stubGlobal('AudioContext', class { state = 'running'; });
  try {
    const policy = setAudioSessionPolicy('play-and-record'); expect(policy.supported).toBe(true);
    const context = createAudioContext(); expect(session.type).toBe('play-and-record');
    expect(createAudioContext()).toBe(context);
    policy.restore(); expect(session.type).toBe('auto');
    const active = setAudioSessionPolicy('play-and-record'); const newer = setAudioSessionPolicy('playback');
    active.restore(); expect(session.type).toBe('playback');
    newer.restore(); expect(session.type).toBe('play-and-record');
    vi.stubGlobal('navigator', {}); expect(setAudioSessionPolicy('auto').supported).toBe(false);
  } finally { vi.unstubAllGlobals(); }
});
