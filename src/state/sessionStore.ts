import { create } from 'zustand'
import type { NoteName } from '../music/theory'

interface SessionState {
  // Musikalischer Kontext
  key: NoteName
  tempo: number // BPM

  // Transport
  isPlaying: boolean
  currentBar: number // 0–11, aktueller Takt im 12-Bar-Zyklus

  // Klang
  backingVolume: number // dB, -60..0
  pianoVolume: number // dB, -60..0
  appSoundEnabled: boolean // App-Sound für gespielte Noten an/aus

  // Eingabe
  activeNotes: Set<number> // aktuell gehaltene MIDI-Noten

  // Onboarding
  hasStarted: boolean // Onboarding-Overlay weg, Audio freigeschaltet

  // Actions
  setKey: (key: NoteName) => void
  setTempo: (tempo: number) => void
  setIsPlaying: (playing: boolean) => void
  setCurrentBar: (bar: number) => void
  setBackingVolume: (db: number) => void
  setPianoVolume: (db: number) => void
  setAppSoundEnabled: (on: boolean) => void
  noteOn: (midi: number) => void
  noteOff: (midi: number) => void
  setHasStarted: (v: boolean) => void
}

export const useSessionStore = create<SessionState>((set) => ({
  key: 'A',
  tempo: 90,
  isPlaying: false,
  currentBar: 0,
  backingVolume: -8,
  pianoVolume: -4,
  appSoundEnabled: true,
  activeNotes: new Set<number>(),
  hasStarted: false,

  setKey: (key) => set({ key }),
  setTempo: (tempo) => set({ tempo }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentBar: (currentBar) => set({ currentBar }),
  setBackingVolume: (backingVolume) => set({ backingVolume }),
  setPianoVolume: (pianoVolume) => set({ pianoVolume }),
  setAppSoundEnabled: (appSoundEnabled) => set({ appSoundEnabled }),
  setHasStarted: (hasStarted) => set({ hasStarted }),

  noteOn: (midi) =>
    set((s) => {
      if (s.activeNotes.has(midi)) return s
      const next = new Set(s.activeNotes)
      next.add(midi)
      return { activeNotes: next }
    }),
  noteOff: (midi) =>
    set((s) => {
      if (!s.activeNotes.has(midi)) return s
      const next = new Set(s.activeNotes)
      next.delete(midi)
      return { activeNotes: next }
    }),
}))
