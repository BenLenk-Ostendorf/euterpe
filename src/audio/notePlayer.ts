import { useSessionStore } from '../state/sessionStore'
import { attack, release } from './pianoSampler'

// Einheitlicher Pfad für alle Eingabequellen (Klick, MIDI, Computertastatur):
// Store aktualisieren (Taste leuchtet) + Klang erzeugen (falls App-Sound an).

// Note-On-Event-Bus: erlaubt es z.B. dem Notenregen, jeden Anschlag (samt
// Zeitstempel) mitzuhören, egal aus welcher Eingabequelle er kommt.
type NoteOnListener = (midi: number, time: number) => void
const noteOnListeners = new Set<NoteOnListener>()

export function onNoteOn(fn: NoteOnListener): () => void {
  noteOnListeners.add(fn)
  return () => {
    noteOnListeners.delete(fn)
  }
}

export function playNote(midi: number, velocity = 0.8) {
  const s = useSessionStore.getState()
  s.noteOn(midi)
  if (s.appSoundEnabled) attack(midi, velocity)
  const t = performance.now()
  noteOnListeners.forEach((l) => l(midi, t))
}

export function stopNote(midi: number) {
  const s = useSessionStore.getState()
  s.noteOff(midi)
  release(midi)
}
