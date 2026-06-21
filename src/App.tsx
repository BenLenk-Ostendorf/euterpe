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
import NotenregenGame from './components/NotenregenGame'
import TastenfinderGame from './components/TastenfinderGame'
import HoertrainerGame from './components/HoertrainerGame'
import DurMollGame from './components/DurMollGame'
import IntervallGame from './components/IntervallGame'
import WechselGame from './components/WechselGame'
import GrundtonGame from './components/GrundtonGame'
import MelodieGame from './components/MelodieGame'
import PulsGame from './components/PulsGame'
import AkkordgriffGame from './components/AkkordgriffGame'
import StufenGriffGame from './components/StufenGriffGame'
import BegleitGame from './components/BegleitGame'
import VariationGame from './components/VariationGame'
import type { ChallengeId } from './music/learningPath'

// Der Lernpfad (Tree) ist die Hauptseite. Von dort lassen sich Modi
// "anschalten": der freie Spiel-Modus (Sandbox) oder eine Challenge.
type Overlay = 'free' | ChallengeId | null

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

  const [overlay, setOverlay] = useState<Overlay>(null)

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

  // Einstieg: nur Audio entsperren und auf der Hauptseite (Tree) landen.
  // Keine Hintergrundmusik — die läuft erst, wenn man sie im freien Modus startet.
  const handleStart = async () => {
    await ensureAudioStarted()
    setPianoVolume(pianoVolume)
    setHasStarted(true)
  }

  // Freien Modus anschalten: Begleitung bereitstellen, aber noch still lassen
  // (erst Play im Modus startet den Groove).
  const enterFreeMode = async () => {
    await ensureAudioStarted()
    configureTransport(tempo)
    setBackingVolume(backingVolume)
    setPianoVolume(pianoVolume)
    setupBacking(key)
    registerBarTicker(setCurrentBar)
    setOverlay('free')
  }

  // Zurück zum Tree: Musik anhalten, damit unter dem Baum nichts weiterläuft.
  const exitToTree = () => {
    stopTransport()
    setIsPlaying(false)
    setCurrentBar(0)
    setOverlay(null)
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
    // Tonartwechsel baut die Begleitung neu auf (und startet ggf. neu).
    setupBacking(next)
    if (isPlaying) {
      stopTransport()
      setCurrentBar(0)
      startTransport()
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
        {overlay === 'free' ? <BarIndicator /> : <div className="w-px" />}
      </header>

      <main className="flex w-full flex-1 flex-col">
        {overlay === 'tastenfinder' ? (
          <TastenfinderGame onExit={() => setOverlay(null)} />
        ) : overlay === 'hoertrainer' ? (
          <HoertrainerGame onExit={() => setOverlay(null)} />
        ) : overlay === 'durmoll' ? (
          <DurMollGame onExit={() => setOverlay(null)} />
        ) : overlay === 'intervalle' ? (
          <IntervallGame onExit={() => setOverlay(null)} />
        ) : overlay === 'wechsel' ? (
          <WechselGame onExit={() => setOverlay(null)} />
        ) : overlay === 'grundton' ? (
          <GrundtonGame onExit={() => setOverlay(null)} />
        ) : overlay === 'detektiv' ? (
          <MelodieGame onExit={() => setOverlay(null)} />
        ) : overlay === 'pulstap' ? (
          <PulsGame onExit={() => setOverlay(null)} />
        ) : overlay === 'akkordgriff' ? (
          <AkkordgriffGame onExit={() => setOverlay(null)} />
        ) : overlay === 'stufengriff' ? (
          <StufenGriffGame onExit={() => setOverlay(null)} />
        ) : overlay === 'begleit' ? (
          <BegleitGame onExit={() => setOverlay(null)} />
        ) : overlay === 'variation' ? (
          <VariationGame onExit={() => setOverlay(null)} />
        ) : overlay === 'notenregen' ? (
          <NotenregenGame onExit={() => setOverlay(null)} />
        ) : overlay === 'free' ? (
          <div className="flex w-full flex-1 flex-col items-center gap-8">
            <button
              type="button"
              onClick={exitToTree}
              className="ease-soft self-start rounded-full border border-bone/15 px-4 py-2 text-base text-bone/70 transition-colors hover:border-amber-glow/50 hover:text-amber-soft"
            >
              ← Lernpfad
            </button>
            <div className="flex w-full flex-1 flex-col items-center justify-center gap-10">
              <div className="w-full max-w-4xl rounded-xl bg-ink-800/40 p-3 shadow-2xl ring-1 ring-black/40 sm:p-5">
                <Keyboard fallbackLabels={fallbackLabels} />
              </div>
              <TransportControls
                onTogglePlay={handleTogglePlay}
                onKeyChange={handleKeyChange}
              />
            </div>
          </div>
        ) : (
          <LearningPath
            onStartChallenge={setOverlay}
            onStartFreeMode={enterFreeMode}
          />
        )}
      </main>

      <footer className="w-full">
        <MidiStatus midi={midi} />
      </footer>
    </div>
  )
}
