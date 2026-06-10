// Musiktheoretische Grundlagen — alles intern über MIDI-Notennummern (0–127).
// Eine MIDI-Note: 60 = C4 (mittleres C). Pitch-Class = midi % 12.

export const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const

export type NoteName = (typeof NOTE_NAMES)[number]

// Moll-Pentatonik-Intervalle (Halbtöne über dem Grundton): 1 b3 4 5 b7
export const MINOR_PENTATONIC_INTERVALS = [0, 3, 5, 7, 10] as const

/** Alle 12 möglichen Tonarten (Grundtöne) für das Dropdown. */
export const ALL_KEYS: NoteName[] = [...NOTE_NAMES]

/** Pitch-Class (0–11) eines Notennamens. */
export function pitchClassOf(name: NoteName): number {
  return NOTE_NAMES.indexOf(name)
}

/** Notenname einer MIDI-Nummer (ohne Oktave). */
export function midiToName(midi: number): NoteName {
  return NOTE_NAMES[((midi % 12) + 12) % 12]
}

/** Notenname inkl. Oktave, z.B. 60 -> "C4". (Wissenschaftliche Notation) */
export function midiToScientific(midi: number): string {
  const octave = Math.floor(midi / 12) - 1
  return `${midiToName(midi)}${octave}`
}

/**
 * Die Pitch-Classes (0–11) der Moll-Pentatonik einer Tonart.
 * A-Moll -> {A, C, D, E, G}.
 */
export function getMinorPentatonicPitchClasses(root: NoteName): Set<number> {
  const rootPc = pitchClassOf(root)
  return new Set(MINOR_PENTATONIC_INTERVALS.map((i) => (rootPc + i) % 12))
}

/** Liegt eine MIDI-Note in der Moll-Pentatonik der Tonart? */
export function isInMinorPentatonic(midi: number, root: NoteName): boolean {
  return getMinorPentatonicPitchClasses(root).has(((midi % 12) + 12) % 12)
}

/**
 * Aufsteigende MIDI-Noten der Moll-Pentatonik ab einem Start-MIDI über `count`
 * Töne hinweg. Für den Computer-Tastatur-Fallback (A S D F ... -> Pentatonik).
 */
export function ascendingPentatonic(
  root: NoteName,
  startMidi: number,
  count: number,
): number[] {
  const pcs = MINOR_PENTATONIC_INTERVALS.map(
    (i) => (pitchClassOf(root) + i) % 12,
  ).sort((a, b) => a - b)
  const result: number[] = []
  let midi = startMidi
  // Auf die nächste Pentatonik-Note ab startMidi aufrunden.
  while (!pcs.includes(((midi % 12) + 12) % 12)) midi++
  while (result.length < count) {
    if (pcs.includes(((midi % 12) + 12) % 12)) result.push(midi)
    midi++
  }
  return result
}
