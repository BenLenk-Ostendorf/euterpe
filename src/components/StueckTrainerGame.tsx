import { useCallback, useEffect, useRef, useState } from 'react'
import { onNoteOn, playNote, stopNote } from '../audio/notePlayer'
import { attack, ensureAudioStarted, release } from '../audio/pianoSampler'
import { useSessionStore } from '../state/sessionStore'
import { useProgressStore } from '../state/progressStore'
import { midiToName } from '../music/theory'
import { SONGS, type Song } from '../music/songs'
import KeyboardViewport from './KeyboardViewport'

// Stück-Trainer — Challenge für Node k0 „Eine Hand sicher" (Koordination).
//
// Anders als die Quiz-Spiele ist das hier ein GEFÜHRTES Mitspielen: du wählst
// einen Song und eine Hand und spielst die Tonfolge so oft durch, bis sie ohne
// Hinsehen sitzt. Kein Zeitdruck, keine Punkte — die Stufen bilden ab, wie sehr
// die Hand schon „automatisiert" ist:
//
//   1. Mit Leuchten — die nächste Taste leuchtet, du spielst sie nach (erreicht)
//   2. Ohne Leuchten — aus dem Gedächtnis, fast ohne Hinsehen   (verinnerlicht)
//   3. Im Fluss     — ohne Leuchten und ohne langes Stocken     (gemeistert)
//
// Falscher Ton informiert (rot) und wartet auf den richtigen — er zählt als
// „nicht sauber", bestraft aber nicht. Treffer octav-unabhängig (Tonklasse).

type Stage = 'fuehrung' | 'blind' | 'fluss'
type Hand = 'rechts' | 'links'

const STAGE_ORDER: Stage[] = ['fuehrung', 'blind', 'fluss']
const STAGE_LABEL: Record<Stage, string> = {
  fuehrung: 'Mit Leuchten',
  blind: 'Ohne Leuchten',
  fluss: 'Im Fluss',
}

const HIT = '#9bb88a'
const MISS = '#cf7d6b'
const GOLD = '#e0b15e'

const BASE = 60 // C4 — Anker der Bildschirm-Klaviatur
const SPAN = 24

// So viele saubere Durchläufe pro Stufe (jeder Durchlauf = ein „Sample").
const REPS_TO_PASS = 3
// „Im Fluss" = kein Loch größer als das zwischen zwei Tönen (ms).
const FLOW_GAP_MS = 1800

const pc = (m: number) => ((m % 12) + 12) % 12
const isWhitePc = (p: number) => [0, 2, 4, 5, 7, 9, 11].includes(p)

const handPhrase = (song: Song, hand: Hand): number[] =>
  hand === 'rechts' ? song.melody : song.leftHand

type Step = 'pending' | 'hit' | 'wrong'

interface StageStat {
  /** Anzahl qualifizierender Durchläufe (sauber bzw. flüssig). */
  good: number
  passed: boolean
}
const freshStat = (): StageStat => ({ good: 0, passed: false })

interface Snapshot {
  stage: Stage
  good: number
  passed: Record<Stage, boolean>
}

export default function StueckTrainerGame({ onExit }: { onExit: () => void }) {
  const activeNotes = useSessionStore((s) => s.activeNotes)
  const recordLevel = useProgressStore((s) => s.recordLevel)

  const [song, setSong] = useState<Song>(SONGS[0])
  const [hand, setHand] = useState<Hand>('rechts')

  const statsRef = useRef<Record<Stage, StageStat>>({
    fuehrung: freshStat(),
    blind: freshStat(),
    fluss: freshStat(),
  })
  const stageRef = useRef<Stage>('fuehrung')

  // Veränderlicher Durchlauf-Zustand in Refs (gehört nicht ins Rendering).
  const phraseRef = useRef<number[]>(handPhrase(SONGS[0], 'rechts'))
  const idxRef = useRef(0)
  const wrongRef = useRef(0) // falsche Anschläge in diesem Durchlauf
  const lastHitRef = useRef(0) // Zeit des letzten Treffers (für Fluss)
  const maxGapRef = useRef(0)
  const lockedRef = useRef(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const [steps, setSteps] = useState<Step[]>(phraseRef.current.map(() => 'pending'))
  const [idx, setIdx] = useState(0)
  const [feedback, setFeedback] = useState<{ kind: 'hit' | 'miss'; text: string } | null>(null)
  const [snap, setSnap] = useState<Snapshot>({
    stage: 'fuehrung',
    good: 0,
    passed: { fuehrung: false, blind: false, fluss: false },
  })

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }, [])

  const refresh = useCallback(() => {
    const s = stageRef.current
    setSnap({
      stage: s,
      good: statsRef.current[s].good,
      passed: {
        fuehrung: statsRef.current.fuehrung.passed,
        blind: statsRef.current.blind.passed,
        fluss: statsRef.current.fluss.passed,
      },
    })
  }, [])

  // Einen frischen Durchlauf aufsetzen (Phrase aus aktuellem Song + Hand).
  const resetRun = useCallback(() => {
    clearTimers()
    phraseRef.current = handPhrase(song, hand)
    idxRef.current = 0
    wrongRef.current = 0
    lastHitRef.current = 0
    maxGapRef.current = 0
    lockedRef.current = false
    setSteps(phraseRef.current.map(() => 'pending'))
    setIdx(0)
    setFeedback(null)
  }, [clearTimers, song, hand])

  // Phrase (oder den nächsten Ton) vorspielen.
  const playPhrase = useCallback(() => {
    const phrase = phraseRef.current
    void ensureAudioStarted().then(() => {
      lockedRef.current = true
      const STEP = 460
      const HOLD = 400
      phrase.forEach((m, i) => {
        timersRef.current.push(setTimeout(() => attack(m, 0.72), i * STEP))
        timersRef.current.push(setTimeout(() => release(m), i * STEP + HOLD))
      })
      timersRef.current.push(
        setTimeout(() => {
          lockedRef.current = false
        }, phrase.length * STEP),
      )
    })
  }, [])

  const completeRun = useCallback(
    () => {
      const clean = wrongRef.current === 0
      const fluent = clean && maxGapRef.current <= FLOW_GAP_MS
      const s = stageRef.current
      const st = statsRef.current[s]
      const qualifies = s === 'fluss' ? fluent : clean

      // Ein nicht-qualifizierender Durchlauf zählt einfach nicht hoch (kein Abzug).
      if (qualifies) st.good += 1

      if (clean && !fluent && s === 'fluss') {
        setFeedback({ kind: 'miss', text: 'Sauber, aber noch stockend — nochmal flüssiger' })
      } else if (clean) {
        setFeedback({ kind: 'hit', text: `Sauber durch! (${st.good}/${REPS_TO_PASS})` })
      } else {
        setFeedback({
          kind: 'miss',
          text: `${wrongRef.current} Patzer — nochmal in Ruhe`,
        })
      }

      if (!st.passed && st.good >= REPS_TO_PASS) {
        st.passed = true
        const i = STAGE_ORDER.indexOf(s)
        if (i < STAGE_ORDER.length - 1) stageRef.current = STAGE_ORDER[i + 1]
      }
      refresh()
      lockedRef.current = true
      timersRef.current.push(
        setTimeout(() => resetRun(), qualifies ? 1100 : 1500),
      )
    },
    [refresh, resetRun],
  )

  // Eingabe Ton für Ton prüfen.
  useEffect(() => {
    const unsub = onNoteOn((midi, time) => {
      if (lockedRef.current) return
      const phrase = phraseRef.current
      const i = idxRef.current
      if (i >= phrase.length) return
      const expected = phrase[i]
      if (pc(midi) === pc(expected)) {
        // Treffer — Lücke seit letztem Treffer fürs Fluss-Maß festhalten.
        if (lastHitRef.current > 0) {
          maxGapRef.current = Math.max(maxGapRef.current, time - lastHitRef.current)
        }
        lastHitRef.current = time
        const next = [...steps]
        next[i] = 'hit'
        setSteps(next)
        idxRef.current = i + 1
        setIdx(i + 1)
        if (i + 1 >= phrase.length) completeRun()
      } else {
        // Falscher Ton: informiert, wartet aber auf den richtigen (kein Vorrücken).
        wrongRef.current += 1
        const next = [...steps]
        next[i] = 'wrong'
        setSteps(next)
        timersRef.current.push(
          setTimeout(() => {
            setSteps((cur) => {
              const c = [...cur]
              if (c[idxRef.current] === 'wrong') c[idxRef.current] = 'pending'
              return c
            })
          }, 350),
        )
      }
    })
    return () => unsub()
  }, [steps, completeRun])

  // Start / Song- bzw. Handwechsel: frischen Durchlauf + Stufen-Reset bei Wechsel.
  useEffect(() => {
    statsRef.current = { fuehrung: freshStat(), blind: freshStat(), fluss: freshStat() }
    stageRef.current = 'fuehrung'
    resetRun()
    refresh()
    timersRef.current.push(setTimeout(() => playPhrase(), 400))
    return () => clearTimers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song, hand])

  // Fortschritt fürs Lernziel k0 festhalten (lokal, nur höchste Stufe).
  useEffect(() => {
    if (snap.passed.fuehrung) recordLevel('k0', 'erreicht')
    if (snap.passed.blind) recordLevel('k0', 'verinnerlicht')
    if (snap.passed.fluss) recordLevel('k0', 'gemeistert')
  }, [snap, recordLevel])

  const handleRestart = () => {
    statsRef.current = { fuehrung: freshStat(), blind: freshStat(), fluss: freshStat() }
    stageRef.current = 'fuehrung'
    resetRun()
    refresh()
  }

  const stage = snap.stage
  const showLight = stage === 'fuehrung'
  const expectedMidi = phraseRef.current[idx]
  const expectedPc = expectedMidi !== undefined ? pc(expectedMidi) : -1

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
  // Im Führungs-Modus genau die erwartete Taste markieren; sonst nichts.
  const isLit = (m: number) => showLight && expectedMidi !== undefined && m === expectedMidi

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
        <h2 className="font-display text-3xl text-amber-soft">Stück-Trainer</h2>
        <div className="flex items-center gap-3 text-sm text-bone/60">
          <span className="tabular-nums" title="Saubere Durchläufe auf dieser Stufe">
            {snap.good}/{REPS_TO_PASS}
          </span>
          <span className="rounded-full border border-bone/15 px-2.5 py-0.5" title="Aktuelle Stufe">
            {STAGE_LABEL[stage]}
          </span>
        </div>
      </div>

      {/* Song- und Hand-Wahl */}
      <div className="lq-hide flex flex-wrap items-center justify-center gap-2 text-sm">
        {SONGS.map((s) => {
          const on = s.id === song.id
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSong(s)}
              className="ease-soft rounded-full border px-3 py-1 transition-colors"
              style={{
                borderColor: on ? GOLD : 'rgba(239,230,214,0.14)',
                color: on ? '#f0d49a' : 'rgba(239,230,214,0.55)',
                background: on ? 'rgba(224,177,94,0.12)' : 'transparent',
              }}
            >
              {s.title}
            </button>
          )
        })}
        <span className="mx-1 text-bone/25">·</span>
        {(['rechts', 'links'] as const).map((h) => {
          const on = h === hand
          return (
            <button
              key={h}
              type="button"
              onClick={() => setHand(h)}
              className="ease-soft rounded-full border px-3 py-1 transition-colors"
              style={{
                borderColor: on ? '#7fa8c9' : 'rgba(239,230,214,0.14)',
                color: on ? '#bcd6ea' : 'rgba(239,230,214,0.55)',
                background: on ? 'rgba(127,168,201,0.12)' : 'transparent',
              }}
            >
              {h === 'rechts' ? 'rechte Hand (Melodie)' : 'linke Hand (Begleitung)'}
            </button>
          )
        })}
      </div>

      {/* Spielfeld */}
      <div className="relative mx-auto w-full max-w-3xl rounded-xl bg-ink-800/40 p-3 ring-1 ring-black/40 sm:p-4">
        <div className="mb-2 flex flex-col items-center gap-3 py-2">
          <span className="lq-hide text-sm text-bone/50">
            {song.title} · {song.keyLabel}
          </span>

          {/* Pips: Fortschritt durch die Phrase */}
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {steps.map((s, i) => (
              <span
                key={i}
                className="ease-soft h-3.5 w-3.5 rounded-full transition-all"
                style={{
                  background:
                    s === 'hit'
                      ? HIT
                      : s === 'wrong'
                        ? MISS
                        : i === idx
                          ? GOLD
                          : 'rgba(239,230,214,0.16)',
                  transform: i === idx ? 'scale(1.25)' : 'scale(1)',
                  boxShadow: i === idx ? '0 0 10px rgba(224,177,94,0.6)' : 'none',
                }}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => playPhrase()}
              className="ease-soft rounded-full border border-amber-glow/40 bg-ink-700/60 px-4 py-1.5 text-sm text-amber-soft transition-all hover:border-amber-glow hover:bg-ink-600"
            >
              ♪ Vorspielen
            </button>
            <button
              type="button"
              onClick={() => resetRun()}
              className="ease-soft rounded-full border border-bone/15 px-3 py-1.5 text-bone/70 transition-colors hover:border-amber-glow/50 hover:text-amber-soft"
            >
              ⌫ Durchlauf neu
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

        {/* Klaviatur — im Führungs-Modus leuchtet die nächste Taste */}
        <KeyboardViewport
          base={BASE}
          span={SPAN}
          focus={expectedMidi !== undefined ? [expectedMidi] : undefined}
          className="mt-2"
        >
        <div
          className="relative h-40 w-full select-none sm:h-48"
          style={{ touchAction: 'none' }}
          role="group"
          aria-label="Klaviatur"
        >
          {whites.map((m, wi) => {
            const active = activeNotes.has(m)
            const lit = isLit(m)
            return (
              <button
                key={m}
                type="button"
                aria-label={midiToName(m) + (lit ? ' (nächste Taste)' : '')}
                onPointerDown={handleDown(m)}
                onPointerUp={handleUp(m)}
                onPointerLeave={handleUp(m)}
                onPointerCancel={handleUp(m)}
                className="ease-soft absolute bottom-0 top-0 flex items-end justify-center rounded-b-md border border-black/40 pb-2 transition-[transform,background-color] duration-100"
                style={{
                  left: `${wi * WHITE_W}%`,
                  width: `${WHITE_W}%`,
                  zIndex: 1,
                  background: lit
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
                {lit && (
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
            const lit = isLit(m)
            return (
              <button
                key={m}
                type="button"
                aria-label={midiToName(m) + (lit ? ' (nächste Taste)' : '')}
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
                  background: lit
                    ? 'linear-gradient(180deg,#7a5c1e,#4a3712)'
                    : active
                      ? 'linear-gradient(180deg,#5a4628,#3a2c16)'
                      : 'linear-gradient(180deg,#2a2420,#0c0a08)',
                  border: lit ? '1px solid #e0b15e' : '1px solid #000',
                  boxShadow: active ? '0 0 14px rgba(224,177,94,0.5)' : '0 3px 5px rgba(0,0,0,0.5)',
                  transform: active ? 'translateY(1.5px)' : 'none',
                }}
              >
                {lit && (
                  <span
                    className="pointer-events-none absolute bottom-1.5 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full"
                    style={{ background: GOLD, boxShadow: '0 0 8px rgba(224,177,94,0.95)' }}
                  />
                )}
              </button>
            )
          })}
        </div>
        </KeyboardViewport>
      </div>

      {/* Skala */}
      <div className="lq-hide flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-sm">
          {(
            [
              ['erreicht', snap.passed.fuehrung, 'Mit Leuchten: die Phrase mehrmals sauber nachgespielt'],
              ['verinnerlicht', snap.passed.blind, 'Ohne Leuchten: aus dem Gedächtnis sauber durchgespielt'],
              ['gemeistert', snap.passed.fluss, 'Im Fluss: ohne Leuchten und ohne langes Stocken = die Hand sitzt'],
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

      <p className="lq-hide text-center text-sm text-bone/45">
        Erst mit leuchtender Führung, dann aus dem Gedächtnis, dann flüssig — eine
        Hand sicher, „fast ohne Hinsehen". Spiel die Phrase so oft durch, wie du
        magst. Töne dürfen in jeder Oktave liegen. Kein Zeitdruck, keine Punkte.
      </p>
    </div>
  )
}
