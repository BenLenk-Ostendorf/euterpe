import { useSessionStore } from '../state/sessionStore'
import { attack, release } from './pianoSampler'

// Einheitlicher Pfad für alle Eingabequellen (Klick, MIDI, Computertastatur):
// Store aktualisieren (Taste leuchtet) + Klang erzeugen (falls App-Sound an).

export function playNote(midi: number, velocity = 0.8) {
  const s = useSessionStore.getState()
  s.noteOn(midi)
  if (s.appSoundEnabled) attack(midi, velocity)
}

export function stopNote(midi: number) {
  const s = useSessionStore.getState()
  s.noteOff(midi)
  release(midi)
}
