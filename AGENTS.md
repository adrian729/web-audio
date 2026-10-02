# web-audio
- `web-audio` has no workspace dependencies; it never imports `mnx`, `mnx-score`, engine or react.
- Playback builders (`melodic`, `harmonic`) take MIDI numbers; audio never parses pitch strings.
- `.` entry: no DOM, no Web Audio; only `./webaudio` and `./sampler` touch Web Audio.
- No rAF, `setTimeout` or `setInterval` in audio. The app owns the UI clock.
- Score sound derives only from mnx-score `performance()` events, mapped to `NoteEvent`s by the app; `web-audio` never reads MNX documents or timelines.
- Third-party audio libs or samples only behind `Instrument`, pinned, own entry; ask before installing.
- `NoteEvent.id` is an MNX id; quiz data stays in the app.
- Docs: `notation/audio.md` in github.com/adrian729/notation.

# Publishing
- Published to public npm (`publishConfig.access: public`, `files` whitelist, own `LICENSE`).
- Record releasable changes with `pnpm changeset`. Agents never run `changeset publish`, `npm publish`, or push; the user publishes.
- Before a release, `pnpm pack` and smoke-install the tarball in a scratch project.

# Tests
- Add a test only to prevent a real regression: a contract or a bug that was actually fixed. Otherwise don't.
- New behavior → at most a few tests for its distinct branches. Never one test per constant, option, or trivial mapping; never restate the implementation.
- Fixed bug → one regression test that fails without the fix. Table-driven over copy-paste; no cross-products.
- Test only through public entry points; never export internals for tests. Never weaken an assertion to go green.
- Agents: run tests with `--reporter=dot`.
