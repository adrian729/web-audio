export function midiToFrequency(midi: number, a4 = 440): number {
  return a4 * 2 ** ((midi - 69) / 12);
}
