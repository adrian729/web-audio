# @polyhymnia/web-audio

Web Audio playback of MIDI note events: pure event builders on `.`, synth and player on `./webaudio`, sample player on `./sampler`. No dependencies.

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

Releases are versioned with changesets and published to npm as `@polyhymnia/web-audio`.

MIT licensed.


The `./webaudio` entry also provides sample-free rhythm voices: `clickInstrument(ctx, { out })` and `percussionInstrument(ctx, { out, sound: 'kick' | 'snare' | 'woodblock' })`. Percussion uses a 1 ms attack and at most 100/75/45 ms decay respectively, ignores MIDI pitch, supports velocity and `stopAll()`, and runs without timers. A host can use a separate percussion instrument for input feedback without replacing its player's scheduled metronome or clock.

## Microphone audio-session policy

Hosts sharing playback and microphone capture can call `setAudioSessionPolicy('play-and-record')` from `@polyhymnia/web-audio/webaudio`. It returns `{ supported, restore }`, feature-detects the browser API, and works before or after the shared context exists. Restore when the host releases capture; restoration is conditional so an older handle cannot overwrite a newer host policy. The host coordinates global policy ownership. This API neither requests microphone access nor captures sound. Existing playback creation keeps its default policy when no explicit host policy is active.
