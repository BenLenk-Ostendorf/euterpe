import * as Tone from 'tone'

// Klang für die vom Lerner gespielten Noten.
// Tone.Sampler mit Salamander-Grand-Piano-Samples (CDN), PolySynth als Fallback,
// falls die Samples nicht laden. Singleton — übersteht StrictMode-Doppelmount.

let sampler: Tone.Sampler | null = null
let fallbackSynth: Tone.PolySynth | null = null
let volumeNode: Tone.Volume | null = null
let loaded = false
let audioStarted = false

const SALAMANDER_BASE = 'https://tonejs.github.io/audio/salamander/'

// Ein über die Oktaven verteilter Subset — der Sampler interpoliert dazwischen.
const SALAMANDER_URLS: Record<string, string> = {
  A1: 'A1.mp3',
  C2: 'C2.mp3',
  'D#2': 'Ds2.mp3',
  'F#2': 'Fs2.mp3',
  A2: 'A2.mp3',
  C3: 'C3.mp3',
  'D#3': 'Ds3.mp3',
  'F#3': 'Fs3.mp3',
  A3: 'A3.mp3',
  C4: 'C4.mp3',
  'D#4': 'Ds4.mp3',
  'F#4': 'Fs4.mp3',
  A4: 'A4.mp3',
  C5: 'C5.mp3',
  'D#5': 'Ds5.mp3',
  'F#5': 'Fs5.mp3',
  A5: 'A5.mp3',
  C6: 'C6.mp3',
}

function ensureGraph() {
  if (volumeNode) return
  volumeNode = new Tone.Volume(-4).toDestination()

  fallbackSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.005, decay: 0.3, sustain: 0.4, release: 1.2 },
  }).connect(volumeNode)

  sampler = new Tone.Sampler({
    urls: SALAMANDER_URLS,
    baseUrl: SALAMANDER_BASE,
    release: 1,
    onload: () => {
      loaded = true
    },
    onerror: () => {
      // CDN nicht erreichbar -> PolySynth-Fallback bleibt aktiv.
      loaded = false
    },
  }).connect(volumeNode)
}

/** Muss bei der ersten User-Geste laufen (Browser-Autoplay-Policy). */
export async function ensureAudioStarted(): Promise<void> {
  ensureGraph()
  if (!audioStarted) {
    await Tone.start()
    audioStarted = true
  }
}

function instrument(): Tone.Sampler | Tone.PolySynth | null {
  if (loaded && sampler) return sampler
  return fallbackSynth
}

function midiToNote(midi: number): string {
  return Tone.Frequency(midi, 'midi').toNote()
}

export function attack(midi: number, velocity = 0.8) {
  const inst = instrument()
  if (!inst) return
  inst.triggerAttack(midiToNote(midi), Tone.now(), velocity)
}

export function release(midi: number) {
  const inst = instrument()
  if (!inst) return
  inst.triggerRelease(midiToNote(midi), Tone.now())
}

export function setPianoVolume(db: number) {
  ensureGraph()
  volumeNode!.volume.rampTo(db, 0.05)
}
