import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Lokaler (localStorage) Fortschritts-Speicher pro Lernziel. Bewusst LOKAL und
// rein informativ — kein Backend, kein Score, keine Streaks/Punkte: er zeigt nur
// "wo stehst du", damit die Lern-Landkarte den Stand farblich abbilden kann. Lässt
// sich jederzeit zurücksetzen (siehe Lern-Landkarte).

export type SkillLevel = 'erreicht' | 'verinnerlicht' | 'gemeistert'

const RANK: Record<SkillLevel, number> = {
  erreicht: 1,
  verinnerlicht: 2,
  gemeistert: 3,
}

export const levelRank = (l?: SkillLevel | null): number => (l ? RANK[l] : 0)

interface ProgressState {
  /** Höchste je erreichte Stufe je Lernziel-ID. */
  progress: Record<string, SkillLevel>
  /** Hebt die Stufe an (nie herab) — höchster Stand bleibt erhalten. */
  recordLevel: (skillId: string, level: SkillLevel) => void
  reset: () => void
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set) => ({
      progress: {},
      recordLevel: (skillId, level) =>
        set((s) => {
          const cur = s.progress[skillId]
          if (cur && RANK[cur] >= RANK[level]) return s
          return { progress: { ...s.progress, [skillId]: level } }
        }),
      reset: () => set({ progress: {} }),
    }),
    { name: 'euterpe-progress' },
  ),
)
