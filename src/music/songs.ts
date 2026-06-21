// Song-Bibliothek — die gemeinsame Quelle für die SONG-basierten Spiele:
//   • Stück-Trainer („Eine Hand sicher" / Node k0) — eine Hand geführt üben
//   • Begleit-Tapper — eine echte Akkordfolge im Puls begleiten
//   • Melodien-Detektiv — eine bekannte Melodie nach Gehör nachspielen
//
// So lässt sich DERSELBE Song über mehrere Stränge üben: hören → eine Hand
// spielen → begleiten → drüber improvisieren. Bewusst klein und getypt.
//
// Töne als MIDI in der Bildschirm-Region (C4 = 60, zwei Oktaven bis ~C6).
// Akkorde werden octav-/lage-unabhängig über Tonklassen gematcht.

export type ChordQuality = 'dur' | 'moll'

export interface SongChord {
  /** Anzeigename, z. B. 'd-Moll'. */
  label: string
  /** Stufe im Song-Kontext, z. B. 'i', 'iv', 'V'. */
  roman: string
  /** Grundton-Tonklasse 0..11. */
  rootPc: number
  quality: ChordQuality
}

export interface Song {
  id: string
  title: string
  composer?: string
  /** Kurzschild, z. B. 'd-Moll · 3/4'. */
  keyLabel: string
  /** Schläge pro Takt (für den Begleit-Tapper). */
  meter: 3 | 4
  /** Rechte Hand (Melodie) als MIDI-Folge. */
  melody: number[]
  /** Linke Hand, vereinfacht (MIDI) — die Grundtöne der Begleitung. */
  leftHand: number[]
  /** Begleitung: ein Akkord pro Takt, als Loop. */
  progression: SongChord[]
  /** Hinweis, dass/wie vereinfacht wurde. */
  note?: string
}

const dur = (label: string, roman: string, rootPc: number): SongChord => ({
  label,
  roman,
  rootPc,
  quality: 'dur',
})
const moll = (label: string, roman: string, rootPc: number): SongChord => ({
  label,
  roman,
  rootPc,
  quality: 'moll',
})

export const SONGS: Song[] = [
  {
    id: 'song-of-storms',
    title: 'Song of Storms',
    composer: 'Koji Kondo · Zelda: Ocarina of Time',
    keyLabel: 'd-Moll · 3/4',
    meter: 3,
    // Erkennbare Melodie-Phrase: der Sprung D5 -> A4 (Quarte abwärts) ist das
    // Markenzeichen, danach die kleine Klage E-F-E-F-E-C-A-A.
    melody: [74, 69, 74, 74, 69, 74, 76, 77, 76, 77, 76, 72, 69, 69],
    // Vereinfachte linke Hand: die Grundtöne der Begleit-Akkorde (D D G A).
    leftHand: [62, 62, 67, 69],
    progression: [
      moll('d-Moll', 'i', 2),
      moll('g-Moll', 'iv', 7),
      dur('A-Dur', 'V', 9),
    ],
    note: 'Vereinfachte Begleitung: i–iv–V in d-Moll (3/4-Walzer). Echte Arrangements variieren.',
  },
  {
    id: 'entchen',
    title: 'Alle meine Entchen',
    keyLabel: 'C-Dur · 4/4',
    meter: 4,
    // C D E F G G | A A A A G
    melody: [60, 62, 64, 65, 67, 67, 69, 69, 69, 69, 67],
    leftHand: [60, 60, 67, 60], // C C G C
    progression: [dur('C-Dur', 'I', 0), dur('G-Dur', 'V', 7)],
  },
  {
    id: 'ode',
    title: 'Ode an die Freude',
    composer: 'Beethoven',
    keyLabel: 'C-Dur · 4/4',
    meter: 4,
    // E E F G G F E D | C C D E E D D
    melody: [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62],
    leftHand: [60, 60, 67, 67], // C C G G
    progression: [dur('C-Dur', 'I', 0), dur('G-Dur', 'V', 7)],
  },
]

export const songById = (id: string): Song | undefined =>
  SONGS.find((s) => s.id === id)

/** Die drei Tonklassen eines Akkords (für octav-/lage-unabhängiges Matchen). */
export const chordPcs = (c: SongChord): Set<number> => {
  const third = c.quality === 'dur' ? 4 : 3
  return new Set([c.rootPc % 12, (c.rootPc + third) % 12, (c.rootPc + 7) % 12])
}

/** Die drei Töne (Grundstellung) eines Akkords als MIDI — fürs Anzeigen/Vorspielen. */
export const chordTriadMidi = (c: SongChord, base = 60): number[] => {
  const third = c.quality === 'dur' ? 4 : 3
  const root = base + (c.rootPc % 12)
  return [root, root + third, root + 7]
}
