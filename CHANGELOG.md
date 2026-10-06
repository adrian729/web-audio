# @polyhymnia/web-audio

## 0.4.0

### Minor Changes

- Add `createSampler`, which loads samples as notes need them instead of every sample up front. `warm()` loads in the background, coarse to fine and at low network priority: one sample per octave (after which every note can play), then one every third semitone. `prepare(midis)` loads given notes' own samples and `canPlay(midis)` tells whether they can play now. A note never waits: until its own sample is loaded it borrows the nearest loaded one within a tritone, repitched, or plays on the `fallback` instrument. A note longer than its sample releases before the audio runs out instead of cutting off. `loadSampler` keeps loading everything before it resolves.

## 0.3.0

### Minor Changes

- Expose host-controlled, feature-detected audio-session policy with conditional restoration for microphone use.

## 0.2.0

### Minor Changes

- e75727c: Add explicit silent playback durations, signed paired output-clock snapshots and a sample-free click instrument for rhythm practice. Preserve legacy playback time behavior and invalidate completed handles on stop without affecting newer playback.
  
  Add reusable, fast-attack synthesized kick, snare and woodblock percussion voices with bounded decay and explicit cancellation.
