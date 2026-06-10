import * as Tone from 'tone'
import type { NoteName } from '../music/theory'
import { pitchClassOf } from '../music/theory'
import { TWELVE_BAR_BLUES } from '../music/bluesProgression'

// 12-Bar-Blues-Begleitung, komplett aus Tone.js-Synths (keine Asset-Abhängigkeit).
// Drei Schichten: Walking-Bass, Shell-Voicing-Akkordstabs, Shuffle-Drums.

let backingVol: Tone.Volume | null = null
let bass: Tone.MonoSynth | null = null
let chords: Tone.PolySynth | null = null
let kick: Tone.MembraneSynth | null = null
let snare: Tone.NoiseSynth | null = null
let hat: Tone.NoiseSynth | null = null
let hatFilter: Tone.Filter | null = null

let bassPart: Tone.Part | null = null
let chordPart: Tone.Part | null = null
let drumLoop: Tone.Loop | null = null

const midiToNote = (m: number) => Tone.Frequency(m, 'midi').toNote()

function ensureInstruments() {
  if (backingVol) return
  backingVol = new Tone.Volume(-8).toDestination()

  bass = new Tone.MonoSynth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 0.4 },
    filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.3, baseFrequency: 120, octaves: 2.5 },
    volume: -6,
  }).connect(backingVol)

  chords = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.01, decay: 0.25, sustain: 0.15, release: 0.3 },
    volume: -14,
  }).connect(backingVol)

  kick = new Tone.MembraneSynth({
    octaves: 5,
    pitchDecay: 0.05,
    envelope: { attack: 0.001, decay: 0.32, sustain: 0 },
    volume: -4,
  }).connect(backingVol)

  snare = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.16, sustain: 0 },
    volume: -16,
  }).connect(backingVol)

  hatFilter = new Tone.Filter(7000, 'highpass').connect(backingVol)
  hat = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0 },
    volume: -26,
  }).connect(hatFilter)
}

// Walking-Bass-Offsets je Beat relativ zum Akkord-Grundton (1-3-5-6).
const WALK = [0, 4, 7, 9]

function buildSchedule(key: NoteName) {
  disposeParts()
  const keyPc = pitchClassOf(key)

  const bassEvents: Array<{ time: string; note: string }> = []
  const chordEvents: Array<{ time: string; notes: string[] }> = []

  TWELVE_BAR_BLUES.forEach((barChord, barIdx) => {
    const chordRootPc = (keyPc + barChord.rootOffset) % 12
    // Bass tief (C2-Bereich): Grundton + Walking-Pattern.
    const bassRoot = 36 + chordRootPc
    WALK.forEach((off, beat) => {
      bassEvents.push({
        time: `${barIdx}:${beat}:0`,
        note: midiToNote(bassRoot + off),
      })
    })
    // Shell-Voicing (Grundton, große Terz, kleine Septime) im C3-Bereich,
    // kurze Stabs auf 2 und 4.
    const cRoot = 48 + chordRootPc
    const voicing = [cRoot, cRoot + 4, cRoot + 10].map(midiToNote)
    ;[1, 3].forEach((beat) => {
      chordEvents.push({ time: `${barIdx}:${beat}:0`, notes: voicing })
    })
  })

  bassPart = new Tone.Part((time, ev) => {
    bass?.triggerAttackRelease(ev.note, '8n', time)
  }, bassEvents)
  bassPart.loop = true
  bassPart.loopEnd = '12m'
  bassPart.start(0)

  chordPart = new Tone.Part((time, ev) => {
    chords?.triggerAttackRelease(ev.notes, '8n', time, 0.6)
  }, chordEvents)
  chordPart.loop = true
  chordPart.loopEnd = '12m'
  chordPart.start(0)

  // Shuffle-Drums: Hat auf jeder (geswingten) Achtel, Kick auf 1+3, Snare auf 2+4.
  drumLoop = new Tone.Loop((time) => {
    const pos = Tone.getTransport().position as string
    const [, beatStr, sixteenthStr] = pos.split(':')
    const beat = parseInt(beatStr, 10)
    const sixteenth = Math.round(parseFloat(sixteenthStr))
    const onBeat = sixteenth === 0

    hat?.triggerAttackRelease('16n', time, onBeat ? 0.9 : 0.5)
    if (onBeat && (beat === 0 || beat === 2)) {
      kick?.triggerAttackRelease('C1', '8n', time)
    }
    if (onBeat && (beat === 1 || beat === 3)) {
      snare?.triggerAttackRelease('16n', time)
    }
  }, '8n')
  drumLoop.start(0)
}

/** Begleitung für eine Tonart aufbauen (ersetzt eine evtl. laufende). */
export function setupBacking(key: NoteName) {
  ensureInstruments()
  buildSchedule(key)
}

export function setBackingVolume(db: number) {
  ensureInstruments()
  backingVol!.volume.rampTo(db, 0.05)
}

function disposeParts() {
  bassPart?.dispose()
  chordPart?.dispose()
  drumLoop?.dispose()
  bassPart = chordPart = drumLoop = null
}

export function disposeBacking() {
  disposeParts()
}
