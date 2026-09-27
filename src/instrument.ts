export interface Instrument {
  noteOn(midi: number, when: number, duration: number, velocity?: number): void;
  stopAll(): void;
}
