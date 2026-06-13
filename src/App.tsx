import { useEffect, useState } from 'react'
import { useSessionStore } from './state/sessionStore'
import type { NoteName } from './music/theory'
import { ensureAudioStarted, setPianoVolume } from './audio/pianoSampler'
import {
  configureTransport,
  setTempo as setTransportTempo,
  startTransport,
  stopTransport,
  registerBarTicker,
} from './audio/transport'
import { setupBacking, setBackingVolume } from './audio/backingTrack'
import { useMidi } from './midi/useMidi'
import { useKeyboardFallback } from './midi/useKeyboardFallback'
import Keyboard from './components/Keyboard'
import TransportControls from './components/TransportControls'
import BarIndicator from './components/BarIndicator'
import MidiStatus from './components/MidiStatus'
import Onboarding from './components/Onboarding'
import LearningPath from './components/LearningPath'

type View = 'sandbox' | 'path'

export default function App() {
  const hasStarted = useSessionStore((s) => s.hasStarted)
  const setHasStarted = useSessionStore((s) => s.setHasStarted)
  const isPlaying = useSessionStore((s) => s.isPlaying)
  const setIsPlaying = useSessionStore((s) => s.setIsPlaying)
  const tempo = useSessionStore((s) => s.tempo)
  const key = useSessionStore((s) => s.key)
  const setKey = useSessionStore((s) => s.setKey)
  const backingVolume = useSessionStore((s) => s.backingVolume)
  const pianoVolume = useSessionStore((s) => s.pianoVolume)
  const setCurrentBar = useSessionStore((s) => s.setCurrentBar)

  const [view, setView] = useState<View>('sandbox')

  const midi = useMidi()
  const fallbackLabels = useKeyboardFallback()

  // Tempo-/Lautstärke-Änderungen an die Audio-Engine spiegeln.
  useEffect(() => {
    if (hasStarted) setTransportTempo(tempo)
  }, [tempo, hasStarted])
  useEffect(() => {
    if (hasStarted) setBackingVolume(backingVolume)
  }, [backingVolume, hasStarted])
  useEffect(() => {
    if (hasStarted) setPianoVolume(pianoVolume)
  }, [pianoVolume, hasStarted])

  // Einstieg: Audio entsperren, Begleitung aufbauen, sofort losgrooven.
  const handleStart = async () => {
    await ensureAudioStarted()
    configureTransport(tempo)
    setBackingVolume(backingVolume)
    setPianoVolume(pianoVolume)
    setupBacking(key)
    registerBarTicker(setCurrentBar)
    setHasStarted(true)
    startTransport()
    setIsPlaying(true)
  }

  const handleTogglePlay = async () => {
    await ensureAudioStarted()
    if (isPlaying) {
      stopTransport()
      setIsPlaying(false)
    } else {
      startTransport()
      setIsPlaying(true)
    }
  }

  const handleKeyChange = (next: NoteName) => {
    setKey(next)
    if (hasStarted) {
      // Tonartwechsel darf den Loop neu starten (siehe Brief, M3).
      setupBacking(next)
      if (isPlaying) {
        stopTransport()
        setCurrentBar(0)
        startTransport()
      }
    }
  }

  if (!hasStarted) {
    return <Onboarding onStart={handleStart} />
  }

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col items-center gap-8 px-4 py-8">
      <header className="flex w-full items-center justify-between gap-4">
        <h1 className="font-display text-3xl tracking-wide text-amber-soft">
          Euterpe
        </h1>

        <nav className="flex items-center gap-1 rounded-full border border-bone/10 bg-ink-800/50 p-1 text-sm">
          {(
            [
              ['sandbox', 'Spielen'],
              ['path', 'Lernpfad'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              aria-pressed={view === id}
              className={`ease-soft rounded-full px-4 py-1.5 transition-all duration-150 ${
                view === id
                  ? 'bg-ink-600 text-amber-soft'
                  : 'text-bone/55 hover:text-bone/90'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {view === 'sandbox' ? <BarIndicator /> : <div className="w-px" />}
      </header>

      {view === 'sandbox' ? (
        <main className="flex w-full flex-1 flex-col items-center justify-center gap-10">
          <div className="w-full max-w-4xl rounded-xl bg-ink-800/40 p-3 shadow-2xl ring-1 ring-black/40 sm:p-5">
            <Keyboard fallbackLabels={fallbackLabels} />
          </div>

          <TransportControls
            onTogglePlay={handleTogglePlay}
            onKeyChange={handleKeyChange}
          />
        </main>
      ) : (
        <main className="flex w-full flex-1 flex-col">
          <LearningPath />
        </main>
      )}

      <footer className="w-full">
        <MidiStatus midi={midi} />
      </footer>
    </div>
  )
}
