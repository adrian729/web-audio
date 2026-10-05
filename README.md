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
