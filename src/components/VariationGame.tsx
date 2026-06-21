import { useCallback, useEffect, useRef, useState } from 'react'
import { onNoteOn, playNote, stopNote } from '../audio/notePlayer'
import { attack, ensureAudioStarted, release } from '../audio/pianoSampler'
import { useSessionStore } from '../state/sessionStore'
import { useProgressStore } from '../state/progressStore'
import { midiToName } from '../music/theory'
import KeyboardViewport from './KeyboardViewport'

// Motiv-Variieren — Challenge für Node im2 „Variieren" (Improv-Strang). Ein
// kurzes Motiv erklingt; du spielst es VERÄNDERT zurück: als Echo (gleich),
// rückwärts (Krebs) oder eine Terz höher. „Aus einem Motiv wird eine Linie" —
// das bewusste Umformen einer Idee ist der erste konkrete Improvisations-Skill.
//
// Anti-Frust by design: die Aufgabe ist eine klar definierte Umformung (kein
// „gut/schlecht"-Urteil über Kreativität). Gearbeitet wird in Tonleiter-Stufen,
// damit „höher" diatonisch in der Tonart bleibt und es immer gut klingt.
//
// Drei Stufen erreicht→verinnerlicht→gemeistert:
//   1. Echo      — nur wiederholen (Motiv merken + zurückspielen)  (erreicht)
//   2. Umkehren  — + rückwärts spielen                             (verinnerlicht)
//   3. Mix       — + eine Terz höher, längere Motive               (gemeistert)
//
// Baut auf der Nachspiel-Mechanik des Melodien-Detektivs auf. Feedback
// informiert, bewertet nie. Kein Tempo, kein Punktestand.

type Stage = 'echo' | 'umkehren' | 'mix'
type Transform = 'echo' | 'rueckwaerts' | 'terz'

const STAGE_ORDER: Stage[] = ['echo', 'umkehren', 'mix']
const STAGE_LABEL: Record<Stage, string> = {
  echo: 'Echo',
  umkehren: 'Echo + rückwärts',
  mix: 'Echo + rückwärts + höher',
}
const TRANSFORM_LABEL: Record<Transform, string> = {
  echo: 'Wiederhole das Motiv (Echo)',
  rueckwaerts: 'Spiel das Motiv rückwärts',
  terz: 'Spiel das Motiv eine Terz höher',
}
const TRANSFORM_HINT: Record<Transform, string> = {
  echo: 'genau gleich zurück',
  rueckwaerts: 'letzter Ton zuerst',
  terz: 'jede Stufe zwei höher',
}

const HIT = '#9bb88a'
const MISS = '#cf7d6b'
const GOLD = '#e0b15e'

const BASE = 60 // C4
const SPAN = 24
const SCALE = [0, 2, 4, 5, 7, 9, 11] // C-Dur

const pc = (m: number) => ((m % 12) + 12) % 12
const isWhitePc = (p: number) => SCALE.includes(p)
const rint = (n: number) => Math.floor(Math.random() * n)

// Tonleiter-Stufe (Index, auch über die Oktave) → MIDI ab C4.
const scaleMidi = (idx: number) => BASE + SCALE[((idx % 7) + 7) % 7] + 12 * Math.floor(idx / 7)

// Ein Motiv als Folge von Tonleiter-Stufen-Indizes (kleine Schritte, singbar).
function genMotif(len: number): number[] {
  let idx = 1 + rint(3) // Start irgendwo unten in der Oktave
  const out = [idx]
  for (let i = 1; i < len; i++) {
    const step = [-2, -1, 1, 2][rint(4)]
    idx = Math.max(0, Math.min(6, idx + step))
    out.push(idx)
  }
  return out
}

function applyTransform(motif: number[], t: Transform): number[] {
  if (t === 'rueckwaerts') return [...motif].reverse()
  if (t === 'terz') return motif.map((i) => i + 2)
  return motif
}

function transformsFor(stage: Stage): Transform[] {
  if (stage === 'echo') return ['echo']
  if (stage === 'umkehren') return ['echo', 'rueckwaerts']
  return ['echo', 'rueckwaerts', 'terz']
}

type Step = 'pending' | 'hit' | 'miss'

interface Round {
  motif: number[] // Stufen-Indizes des Originals
  transform: Transform
  target: number[] // Stufen-Indizes der erwarteten Antwort
  idx: number
  steps: Step[]
}

function genRound(stage: Stage): Round {
  const len = stage === 'mix' ? 4 : stage === 'umkehren' ? 3 + rint(2) : 3
  const motif = genMotif(len)
  const opts = transformsFor(stage)
  const transform = opts[rint(opts.length)]
  const target = applyTransform(motif, transform)
  return { motif, transform, target, idx: 0, steps: target.map(() => 'pending') }
}

interface StageStat {
  results: boolean[]
  level: number
  passed: boolean
}
const freshStat = (): StageStat => ({ results: [], level: 0, passed: false })

interface Snapshot {
  stage: Stage
  acc: number
  samples: number
  passed: Record<Stage, boolean>
}

export default function VariationGame({ onExit }: { onExit: () => void }) {
  const activeNotes = useSessionStore((s) => s.activeNotes)

  const statsRef = useRef<Record<Stage, StageStat>>({
    echo: freshStat(),
    umkehren: freshStat(),
    mix: freshStat(),
  })
  const stageRef = useRef<Stage>('echo')
  const roundRef = useRef<Round>(genRound('echo'))
  const playingRef = useRef(false)
  const lockedRef = useRef(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const [round, setRound] = useState<Round>(roundRef.current)
  const [snap, setSnap] = useState<Snapshot>({
    stage: 'echo',
    acc: 0,
    samples: 0,
    passed: { echo: false, umkehren: false, mix: false },
  })
  const [playing, setPlaying] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'hit' | 'miss'; text: string } | null>(null)

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }, [])

  const syncRound = useCallback(() => setRound({ ...roundRef.current }), [])

  const refresh = useCallback(() => {
    const s = stageRef.current
    const st = statsRef.current[s]
    const n = st.results.length
    setSnap({
      stage: s,
      acc: n ? st.results.filter(Boolean).length / n : 0,
      samples: n,
      passed: {
        echo: statsRef.current.echo.passed,
        umkehren: statsRef.current.umkehren.passed,
        mix: statsRef.current.mix.passed,
      },
    })
  }, [])

  // Eine Stufen-Index-Folge abspielen (ab C4). Während des Spielens gesperrt.
  const playSeq = useCallback(
    (indices: number[]) => {
      clearTimers()
      void ensureAudioStarted().then(() => {
        setPlaying(true)
        playingRef.current = true
        lockedRef.current = true
        const STEP = 460
        const HOLD = 400
        indices.forEach((ix, i) => {
          const m = scaleMidi(ix)
          timersRef.current.push(setTimeout(() => attack(m, 0.72), i * STEP))
          timersRef.current.push(setTimeout(() => release(m), i * STEP + HOLD))
        })
        const end = indices.length * STEP
        timersRef.current.push(
          setTimeout(() => {
            setPlaying(false)
            playingRef.current = false
            lockedRef.current = false
          }, end),
        )
      })
    },
    [clearTimers],
  )

  const playMotif = useCallback(() => playSeq(roundRef.current.motif), [playSeq])

  const nextRound = useCallback(
    (autoPlay = true) => {
      roundRef.current = genRound(stageRef.current)
      syncRound()
      setFeedback(null)
      if (autoPlay) timersRef.current.push(setTimeout(() => playMotif(), 350))
    },
    [syncRound, playMotif],
  )

  const passedFor = (st: StageStat) => {
    const n = st.results.length
    const acc = n ? st.results.filter(Boolean).length / n : 0
    return n >= 8 && acc >= 0.75 && st.level >= 0.7
  }

  const record = useCallback(
    (ok: boolean) => {
      const s = stageRef.current
      const st = statsRef.current[s]
      st.results.push(ok)
      if (st.results.length > 14) st.results.shift()
      const recent = st.results.slice(-6)
      if (recent.length >= 4) {
        const rate = recent.filter(Boolean).length / recent.length
        if (rate > 0.8) st.level = Math.min(1, st.level + 0.12)
        else if (rate < 0.5) st.level = Math.max(0, st.level - 0.14)
      }
      if (!st.passed && passedFor(st)) {
        st.passed = true
        const idx = STAGE_ORDER.indexOf(s)
        if (idx < STAGE_ORDER.length - 1) stageRef.current = STAGE_ORDER[idx + 1]
      }
      refresh()
    },
    [refresh],
  )

  const finishAttempt = useCallback(() => {
    const r = roundRef.current
    const wrong = r.steps.filter((s) => s === 'miss').length
    const ok = wrong === 0
    lockedRef.current = true
    setFeedback({
      kind: ok ? 'hit' : 'miss',
      text: ok
        ? 'Richtig variiert!'
        : `${r.target.length - wrong} von ${r.target.length} Tönen — ${TRANSFORM_LABEL[r.transform].toLowerCase()}`,
    })
    record(ok)
    timersRef.current.push(setTimeout(() => nextRound(true), ok ? 1200 : 1800))
  }, [record, nextRound])

  // Eingabe Ton für Ton gegen das (transformierte) Ziel prüfen.
  useEffect(() => {
    const unsub = onNoteOn((midi) => {
      if (lockedRef.current) return
      const r = roundRef.current
      if (r.idx >= r.target.length) return
      const expectedPc = pc(scaleMidi(r.target[r.idx]))
      r.steps[r.idx] = pc(midi) === expectedPc ? 'hit' : 'miss'
      r.idx += 1
      syncRound()
      if (r.idx >= r.target.length) finishAttempt()
    })
    return () => unsub()
  }, [finishAttempt, syncRound])

  // Start.
  useEffect(() => {
    timersRef.current.push(setTimeout(() => playMotif(), 400))
    refresh()
    return () => clearTimers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fortschritt fürs Lernziel im2 festhalten (lokal, nur höchste Stufe).
  const recordLevel = useProgressStore((s) => s.recordLevel)
  useEffect(() => {
    if (snap.passed.echo) recordLevel('im2', 'erreicht')
    if (snap.passed.umkehren) recordLevel('im2', 'verinnerlicht')
    if (snap.passed.mix) recordLevel('im2', 'gemeistert')
  }, [snap, recordLevel])

  // „Eingabe löschen" = garantierter Notausgang (entsperrt immer).
  const resetAttempt = () => {
    clearTimers()
    const r = roundRef.current
    r.idx = 0
    r.steps = r.target.map(() => 'pending')
    lockedRef.current = false
    playingRef.current = false
    setPlaying(false)
    setFeedback(null)
    syncRound()
  }

  const handleRestart = () => {
    clearTimers()
    statsRef.current = { echo: freshStat(), umkehren: freshStat(), mix: freshStat() }
    stageRef.current = 'echo'
    nextRound(true)
    refresh()
  }

  const startNote = scaleMidi(round.target[0])

  const handleDown = (midi: number) => (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    playNote(midi)
  }
  const handleUp = (midi: number) => () => stopNote(midi)

  const whites: number[] = []
  const blacks: number[] = []
  for (let m = BASE; m < BASE + SPAN; m++) {
    if (isWhitePc(pc(m))) whites.push(m)
    else blacks.push(m)
  }
  const WHITE_W = 100 / whites.length
  const whitesBelow = (m: number) => whites.filter((w) => w < m).length

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Kopfzeile */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onExit}
          className="ease-soft rounded-full border border-bone/15 px-4 py-2 text-base text-bone/70 transition-colors hover:border-amber-glow/50 hover:text-amber-soft"
        >
          ← Lernpfad
        </button>
        <h2 className="font-display text-3xl text-amber-soft">Motiv-Variieren</h2>
        <div className="flex items-center gap-4 text-sm text-bone/60">
          <span className="tabular-nums" title="Anteil fehlerfrei variiert">
            {snap.samples ? Math.round(snap.acc * 100) : 0}% fehlerfrei
          </span>
          <span className="rounded-full border border-bone/15 px-2.5 py-0.5" title="Aktuelle Stufe">
            {STAGE_LABEL[snap.stage]}
          </span>
        </div>
      </div>

      {/* Spielfeld */}
      <div className="relative mx-auto w-full max-w-3xl rounded-xl bg-ink-800/40 p-3 ring-1 ring-black/40 sm:p-4">
        <div className="mb-2 flex flex-col items-center gap-2 py-2">
          <span className="text-sm text-bone/50">Erst Motiv hören — dann so spielen:</span>
          <span
            className="font-display text-3xl leading-tight"
            style={{ color: feedback?.kind === 'miss' ? MISS : '#f0d49a' }}
          >
            {TRANSFORM_LABEL[round.transform]}
          </span>
          <span className="text-xs text-bone/45">{TRANSFORM_HINT[round.transform]}</span>

          {/* Pips */}
          <div className="mt-1 flex items-center gap-2">
            {round.steps.map((s, i) => (
              <span
                key={i}
                className="ease-soft h-4 w-4 rounded-full transition-all"
                style={{
                  background:
                    s === 'hit' ? HIT : s === 'miss' ? MISS : i === round.idx ? GOLD : 'rgba(239,230,214,0.16)',
                  transform: i === round.idx ? 'scale(1.25)' : 'scale(1)',
                  boxShadow: i === round.idx ? '0 0 10px rgba(224,177,94,0.6)' : 'none',
                }}
              />
            ))}
          </div>

          <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => !playing && playMotif()}
              disabled={playing}
              className="ease-soft rounded-full border border-amber-glow/40 bg-ink-700/60 px-4 py-1.5 text-sm text-amber-soft transition-all hover:border-amber-glow hover:bg-ink-600 disabled:opacity-50"
            >
              {playing ? '♪ klingt …' : '↻ Motiv hören'}
            </button>
            <button
              type="button"
              onClick={() => !playing && playSeq(roundRef.current.target)}
              disabled={playing}
              className="ease-soft rounded-full border border-bone/15 px-3 py-1.5 text-bone/70 transition-colors hover:border-amber-glow/50 hover:text-amber-soft disabled:opacity-50"
              title="Die Lösung vorhören (zum Lernen)"
            >
              ♪ Lösung vorhören
            </button>
            <button
              type="button"
              onClick={resetAttempt}
              className="ease-soft rounded-full border border-bone/15 px-3 py-1.5 text-bone/70 transition-colors hover:border-amber-glow/50 hover:text-amber-soft"
            >
              ⌫ Eingabe löschen
            </button>
          </div>
        </div>

        {/* Feedback */}
        <div className="flex h-7 flex-col items-center justify-center" aria-live="polite">
          {feedback && (
            <span className="text-base font-medium" style={{ color: feedback.kind === 'hit' ? HIT : MISS }}>
              {feedback.kind === 'hit' ? '✓ ' : '○ '}
              {feedback.text}
            </span>
          )}
        </div>

        {/* Klaviatur — der erste Zielton leuchtet als Anker */}
        <KeyboardViewport base={BASE} span={SPAN} focus={[startNote]} className="mt-2">
        <div
          className="relative h-40 w-full select-none sm:h-48"
          style={{ touchAction: 'none' }}
          role="group"
          aria-label="Klaviatur"
        >
          {whites.map((m, wi) => {
            const active = activeNotes.has(m)
            const anchor = m === startNote && round.idx === 0
            return (
              <button
                key={m}
                type="button"
                aria-label={midiToName(m) + (anchor ? ' (Startton)' : '')}
                onPointerDown={handleDown(m)}
                onPointerUp={handleUp(m)}
                onPointerLeave={handleUp(m)}
                onPointerCancel={handleUp(m)}
                className="ease-soft absolute bottom-0 top-0 flex items-end justify-center rounded-b-md border border-black/40 pb-2 transition-[transform,background-color] duration-100"
                style={{
                  left: `${wi * WHITE_W}%`,
                  width: `${WHITE_W}%`,
                  zIndex: 1,
                  background: anchor
                    ? 'linear-gradient(180deg,#f4e3bd,#ecd49f)'
                    : active
                      ? 'linear-gradient(180deg,#f6ecd8,#e9d9b8)'
                      : 'linear-gradient(180deg,#fbf6ec,#e7ddca)',
                  boxShadow: active
                    ? 'inset 0 -3px 10px rgba(176,130,52,0.45)'
                    : 'inset 0 -4px 8px rgba(0,0,0,0.18)',
                  transform: active ? 'translateY(1.5px)' : 'none',
                }}
              >
                {anchor && (
                  <span
                    className="pointer-events-none absolute bottom-2 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full"
                    style={{ background: GOLD, boxShadow: '0 0 8px rgba(224,177,94,0.85)' }}
                  />
                )}
                <span className="pointer-events-none text-sm font-medium text-ink-700/50">
                  {midiToName(m)}
                </span>
              </button>
            )
          })}
          {blacks.map((m) => {
            const left = whitesBelow(m) * WHITE_W - (WHITE_W * 0.62) / 2
            const active = activeNotes.has(m)
            return (
              <button
                key={m}
                type="button"
                aria-label={midiToName(m)}
                onPointerDown={handleDown(m)}
                onPointerUp={handleUp(m)}
                onPointerLeave={handleUp(m)}
                onPointerCancel={handleUp(m)}
                className="ease-soft absolute top-0 flex items-end justify-center rounded-b-md transition-[transform,background-color] duration-100"
                style={{
                  left: `${left}%`,
                  width: `${WHITE_W * 0.62}%`,
                  height: '62%',
                  zIndex: 2,
                  background: active
                    ? 'linear-gradient(180deg,#5a4628,#3a2c16)'
                    : 'linear-gradient(180deg,#2a2420,#0c0a08)',
                  border: '1px solid #000',
                  boxShadow: active ? '0 0 14px rgba(224,177,94,0.5)' : '0 3px 5px rgba(0,0,0,0.5)',
                  transform: active ? 'translateY(1.5px)' : 'none',
                }}
              />
            )
          })}
        </div>
        </KeyboardViewport>
      </div>

      {/* Skala */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-sm">
          {(
            [
              ['erreicht', snap.passed.echo, 'Echo: ein kurzes Motiv merken und genau zurückspielen'],
              ['verinnerlicht', snap.passed.umkehren, 'Umkehren: ein Motiv auch rückwärts spielen'],
              ['gemeistert', snap.passed.mix, 'Mix: Motive echoen, umkehren und höher versetzen = bewusstes Variieren'],
            ] as const
          ).map(([label, on, hint]) => (
            <span
              key={label}
              title={hint}
              className="ease-soft rounded-full border px-4 py-1.5 transition-colors"
              style={{
                borderColor: on ? HIT : 'rgba(239,230,214,0.14)',
                color: on ? HIT : 'rgba(239,230,214,0.45)',
                background: on ? 'rgba(155,184,138,0.10)' : 'transparent',
              }}
            >
              {on ? '✓ ' : ''}
              {label}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={handleRestart}
          className="ease-soft rounded-full border border-bone/15 px-5 py-2 text-base text-bone/70 transition-colors hover:border-amber-glow/50 hover:text-amber-soft"
        >
          ↻ Neu starten
        </button>
      </div>

      <p className="text-center text-sm text-bone/45">
        Ein Motiv ist eine kleine Idee — Variieren heißt, sie bewusst umzuformen. Hier
        in festen Regeln (Echo, rückwärts, höher), damit es immer in der Tonart bleibt
        und gut klingt. Der erste Schritt zur eigenen Linie. Kein Zeitdruck, keine Punkte.
      </p>
    </div>
  )
}
