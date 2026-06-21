// 12-Bar-Blues als Datenmodell — NICHT im Audio-Code hartkodiert.
// Akkorde relativ zum Grundton (Stufen in Halbtönen): I=0, IV=5, V=7.

import type { NoteName } from './theory'
import { NOTE_NAMES, pitchClassOf } from './theory'

export interface BarChord {
  /** Taktnummer 1–12. */
  bar: number
  /** Stufenname für die Anzeige relativ zur Tonart, z.B. "I7". */
  degree: string
  /** Halbton-Offset des Akkord-Grundtons relativ zur Tonart. */
  rootOffset: number
  /** Akkordtöne als Halbton-Offsets vom Akkord-Grundton (Dominantseptakkord). */
  chordIntervals: number[]
}

// Dominantseptakkord: 1 3 5 b7
const DOM7 = [0, 4, 7, 10]

// Standard-12-Bar-Blues (mit Quick-Change in Takt 2 weggelassen für klaren Anfänger-Sound):
// | I7 | I7 | I7 | I7 | IV7 | IV7 | I7 | I7 | V7 | IV7 | I7 | V7 |
const PROGRESSION: Array<Omit<BarChord, 'bar'>> = [
  { degree: 'I7', rootOffset: 0, chordIntervals: DOM7 },
  { degree: 'I7', rootOffset: 0, chordIntervals: DOM7 },
  { degree: 'I7', rootOffset: 0, chordIntervals: DOM7 },
  { degree: 'I7', rootOffset: 0, chordIntervals: DOM7 },
  { degree: 'IV7', rootOffset: 5, chordIntervals: DOM7 },
  { degree: 'IV7', rootOffset: 5, chordIntervals: DOM7 },
  { degree: 'I7', rootOffset: 0, chordIntervals: DOM7 },
  { degree: 'I7', rootOffset: 0, chordIntervals: DOM7 },
  { degree: 'V7', rootOffset: 7, chordIntervals: DOM7 },
  { degree: 'IV7', rootOffset: 5, chordIntervals: DOM7 },
  { degree: 'I7', rootOffset: 0, chordIntervals: DOM7 },
  { degree: 'V7', rootOffset: 7, chordIntervals: DOM7 },
]

export const TWELVE_BAR_BLUES: BarChord[] = PROGRESSION.map((c, i) => ({
  bar: i + 1,
  ...c,
}))

/**
 * Konkreter Akkord-Name für eine Tonart, z.B. Takt 5 in A-Moll-Tonart -> "D7".
 * (Der Blues nutzt Dur-Dominantseptakkorde über dem jeweiligen Stufen-Grundton.)
 * Notennamen kommen aus NOTE_NAMES (deutsch: H/B), damit alles konsistent bleibt.
 */
export function chordLabelFor(bar: BarChord, key: NoteName): string {
  const pc = (pitchClassOf(key) + bar.rootOffset) % 12
  return `${NOTE_NAMES[pc]}7`
}

/** Akkord-Grundton als Pitch-Class (0–11) in einer Tonart. */
export function chordRootPitchClass(bar: BarChord, key: NoteName): number {
  return (pitchClassOf(key) + bar.rootOffset) % 12
}
