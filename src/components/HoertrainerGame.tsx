import { useCallback, useEffect, useRef, useState } from 'react'
import { onNoteOn, playNote, stopNote } from '../audio/notePlayer'
import { attack, ensureAudioStarted, release } from '../audio/pianoSampler'
import { useSessionStore } from '../state/sessionStore'
import { useProgressStore } from '../state/progressStore'
import { NOTE_NAMES, midiToScientific } from '../music/theory'
import KeyboardViewport from './KeyboardViewport'

// Hörtrainer — Challenge für das Lernziel g0 "Du kannst die Richtung einer
// Melodie hören": geht der nächste Ton hoch, runter oder bleibt gleich?
//
// Zwei Stufen als verinnerlicht→gemeistert-Leiter:
//   1. Spielen   — du spielst zwei Tasten in derselben Richtung  (verinnerlicht)
//   2. Kontur    — eine ganze Phrase, du zeichnest ihre Form nach (gemeistert)
//
// Der Anfangston wird gezeigt (Name + Markierung auf der Taste), damit du dich
// orientieren und direkt den zweiten Ton suchen kannst.
//
// Gemessen wird über die SCHWEREN Fälle: kleine Intervalle (Sekunde/Halbton),
// das "gleich" und beide Richtungen — nicht die offensichtliche Oktave. Kein
// Tempo, kein Punktestand; Feedback zeigt die richtige Richtung, bewertet nie.

type Mode = 'spielen' | 'kontur'
type Dir = 'up' | 'same' | 'down'

const DIR_ARROW: Record<Dir, string> = { up: '↑', same: '=', down: '↓' }
const DIR_LABEL: Record<Dir, string> = { up: 'Hoch', same: 'Gleich', down: 'Tief' }

const GOLD = '#e0b15e'
const HIT = '#9bb88a'
const MISS = '#cf7d6b'

// Intervall-Stufen (Halbtöne), von leicht (groß) bis schwer (klein).
const TIERS = [
  [12, 7],
  [12, 7, 5],
  [7, 5, 4],
  [4, 3, 2],
  [2, 1],
]
const LOW = 48 // C3
const HIGH = 78 // F#5
const tierIndex = (level: number) =>
  Math.min(TIERS.length - 1, Math.floor(level * TIERS.length))

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11]
const isWhitePc = (pc: number) => WHITE_PCS.includes(((pc % 12) + 12) % 12)
// Spiel-Stufe: zwei Oktaven, damit IMMER Platz nach oben UND unten ist
// (vorher eine Oktave → Anfangston B oben ließ "hoch" nicht zu).
const KB_LO = 48 // C3
const KB_HI = 72 // C5
// Anfangston mittig ankern, damit man in beide Richtungen ausweichen kann.
const anchorMidi = (startPc: number) => (startPc <= 4 ? 60 + startPc : 48 + startPc)

interface Round {
  notes: number[] // gespielte Tonfolge
  dirs: Dir[] // Richtung je Schritt (notes.length - 1 Einträge)
}
interface ModeStat {
  results: boolean[]
  level: number
  hits: Set<Dir> // bei kleinem Intervall korrekt erkannte Richtungen
  passed: boolean
}
const freshStat = (): ModeStat => ({
  results: [],
  level: 0,
  hits: new Set(),
  passed: false,
})

const MODE_ORDER: Mode[] = ['spielen', 'kontur']
const MODE_LABEL: Record<Mode, string> = {
  spielen: 'Spielen',
  kontur: 'Kontur',
}

// Eine Richtung in einen Tonschritt übersetzen, im Tonraum gehalten.
function step(from: number, dir: Dir, interval: number): number {
  if (dir === 'same') return from
  let to = dir === 'up' ? from + interval : from - interval
  if (to > HIGH) to = from - interval
  if (to < LOW) to = from + interval
  return to
}
function dirOf(from: number, to: number): Dir {
  if (to > from) return 'up'
  if (to < from) return 'down'
  return 'same'
}
const rint = (n: number) => Math.floor(Math.random() * n)

function genPair(level: number): Round {
  const n1 = 58 + rint(9) // 58..66
  if (Math.random() < 0.22) return { notes: [n1, n1], dirs: ['same'] }
  const tier = TIERS[tierIndex(level)]
  const interval = tier[rint(tier.length)]
  const dir: Dir = Math.random() < 0.5 ? 'up' : 'down'
  const n2 = step(n1, dir, interval)
  return { notes: [n1, n2], dirs: [dirOf(n1, n2)] }
}

function genPhrase(level: number): Round {
  const len = 3 + Math.min(2, Math.floor(level * 3)) // 3..5 Töne
  const tier = TIERS[tierIndex(level)]
  const notes = [58 + rint(9)]
  const dirs: Dir[] = []
  for (let i = 1; i < len; i++) {
    const prev = notes[i - 1]
    if (Math.random() < 0.18) {
      notes.push(prev)
      dirs.push('same')
      continue
    }
    const interval = tier[rint(tier.length)]
    const dir: Dir = Math.random() < 0.5 ? 'up' : 'down'
    const next = step(prev, dir, interval)
    notes.push(next)
    dirs.push(dirOf(prev, next))
  }
  return { notes, dirs }
}

interface Snapshot {
  mode: Mode
  acc: number
  samples: number
  level: number
  passed: Record<Mode, boolean>
}

export default function HoertrainerGame({ onExit }: { onExit: () => void }) {
  const activeNotes = useSessionStore((s) => s.activeNotes)

  const statsRef = useRef<Record<Mode, ModeStat>>({
    spielen: freshStat(),
    kontur: freshStat(),
  })
  const modeRef = useRef<Mode>('spielen')
  const roundRef = useRef<Round>({ notes: [60, 60], dirs: ['same'] })
  const awaitingRef = useRef(false) // wartet auf Antwort?
  const playingRef = useRef(false)
  const firstPressRef = useRef<number | null>(null) // Spielen-Stufe
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const [snap, setSnap] = useState<Snapshot>({
    mode: 'spielen',
    acc: 0,
    samples: 0,
    level: 0,
    passed: { spielen: false, kontur: false },
  })
  const [playing, setPlaying] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'hit' | 'miss'; text: string } | null>(null)
  const [konturAnswers, setKonturAnswers] = useState<Dir[]>([])
  const [firstPressPc, setFirstPressPc] = useState<number | null>(null)
  const [startMidi, setStartMidi] = useState<number | null>(null)
  const [lastPlayed, setLastPlayed] = useState<{ a: number; b: number } | null>(
    null,
  )

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }, [])

  const refresh = useCallback(() => {
    const m = modeRef.current
    const st = statsRef.current[m]
    const n = st.results.length
    setSnap({
      mode: m,
      acc: n ? st.results.filter(Boolean).length / n : 0,
      samples: n,
      level: st.level,
      passed: {
        spielen: statsRef.current.spielen.passed,
        kontur: statsRef.current.kontur.passed,
      },
    })
  }, [])

  // Frage-Töne abspielen (über attack/release, NICHT über den Eingabe-Bus).
  const playRound = useCallback(() => {
    clearTimers()
    const notes = roundRef.current.notes
    void ensureAudioStarted().then(() => {
      setPlaying(true)
      playingRef.current = true
      const NOTE = 520
      const GAP = 150
      notes.forEach((m, i) => {
        const t = i * (NOTE + GAP)
        timersRef.current.push(setTimeout(() => attack(m, 0.8), t))
        timersRef.current.push(setTimeout(() => release(m), t + NOTE))
      })
      timersRef.current.push(
        setTimeout(
          () => {
            setPlaying(false)
            playingRef.current = false
          },
          notes.length * (NOTE + GAP),
        ),
      )
    })
  }, [clearTimers])

  const nextRound = useCallback(() => {
    const m = modeRef.current
    roundRef.current = m === 'kontur' ? genPhrase(statsRef.current[m].level) : genPair(statsRef.current[m].level)
    awaitingRef.current = true
    firstPressRef.current = null
    setFirstPressPc(null)
    setStartMidi(anchorMidi(((roundRef.current.notes[0] % 12) + 12) % 12))
    setLastPlayed(null)
    setKonturAnswers([])
    setFeedback(null)
    playRound()
  }, [playRound])

  const passedFor = (m: Mode, st: ModeStat) => {
    const n = st.results.length
    const acc = n ? st.results.filter(Boolean).length / n : 0
    if (m === 'kontur') return n >= 6 && acc >= 0.85 && st.level >= 0.55
    return n >= 12 && acc >= 0.85 && st.level >= 0.8 && st.hits.size >= 3
  }

  // Ein Ergebnis verbuchen, Schwierigkeit anpassen, ggf. Stufe freischalten.
  const record = useCallback(
    (ok: boolean, dir: Dir) => {
      const m = modeRef.current
      const st = statsRef.current[m]
      st.results.push(ok)
      if (st.results.length > 16) st.results.shift()
      if (ok && st.level >= 0.55 && m !== 'kontur') st.hits.add(dir)

      const recent = st.results.slice(-8)
      if (recent.length >= 5) {
        const rate = recent.filter(Boolean).length / recent.length
        if (rate > 0.8) st.level = Math.min(1, st.level + 0.08)
        else if (rate < 0.5) st.level = Math.max(0, st.level - 0.1)
      }

      if (!st.passed && passedFor(m, st)) {
        st.passed = true
        const idx = MODE_ORDER.indexOf(m)
        if (idx < MODE_ORDER.length - 1) {
          // Nächste Stufe freischalten, Schwierigkeit dort sanft starten.
          modeRef.current = MODE_ORDER[idx + 1]
          statsRef.current[modeRef.current].level = Math.max(
            statsRef.current[modeRef.current].level,
            0.35,
          )
        }
      }
      refresh()
    },
    [refresh],
  )

  // Antwort einer einzelnen Richtung (Spielen-Stufe).
  const answerSingle = useCallback(
    (d: Dir) => {
      if (!awaitingRef.current || playingRef.current) return
      const target = roundRef.current.dirs[0]
      const ok = d === target
      awaitingRef.current = false
      setFeedback({
        kind: ok ? 'hit' : 'miss',
        text: ok ? 'Richtig' : `War: ${DIR_LABEL[target]} ${DIR_ARROW[target]}`,
      })
      record(ok, target)
      timersRef.current.push(setTimeout(() => nextRound(), ok ? 700 : 1200))
    },
    [record, nextRound],
  )

  // Kontur-Stufe: Schritt für Schritt eine Richtung wählen.
  const answerKonturStep = useCallback(
    (d: Dir) => {
      if (!awaitingRef.current || playingRef.current) return
      setKonturAnswers((prev) => {
        const next = [...prev, d]
        const dirs = roundRef.current.dirs
        if (next.length >= dirs.length) {
          awaitingRef.current = false
          const ok = dirs.every((dd, i) => dd === next[i])
          setFeedback({
            kind: ok ? 'hit' : 'miss',
            text: ok
              ? 'Richtig'
              : `War: ${dirs.map((x) => DIR_ARROW[x]).join(' ')}`,
          })
          record(ok, dirs[0])
          timersRef.current.push(setTimeout(() => nextRound(), ok ? 800 : 1400))
        }
        return next
      })
    },
    [record, nextRound],
  )

  // Spielen-Stufe: zwei Tastenanschläge -> Kontur ableiten (jede Quelle).
  useEffect(() => {
    const unsub = onNoteOn((midi) => {
      if (modeRef.current !== 'spielen' || !awaitingRef.current || playingRef.current) return
      if (firstPressRef.current === null) {
        firstPressRef.current = midi
        setFirstPressPc(((midi % 12) + 12) % 12)
        return
      }
      const first = firstPressRef.current
      const userDir = dirOf(first, midi)
      firstPressRef.current = null
      setFirstPressPc(null)
      setLastPlayed({ a: first, b: midi })
      answerSingle(userDir)
    })
    return () => unsub()
  }, [answerSingle])

  // Start: erste Runde ziehen und abspielen.
  useEffect(() => {
    nextRound()
    refresh()
    return () => clearTimers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fortschritt fürs Lernziel g0 festhalten (lokal, nur höchste Stufe).
  const recordLevel = useProgressStore((s) => s.recordLevel)
  useEffect(() => {
    if (snap.passed.spielen) recordLevel('g0', 'verinnerlicht')
    if (snap.passed.kontur) recordLevel('g0', 'gemeistert')
  }, [snap, recordLevel])

  const handleRestart = () => {
    clearTimers()
    statsRef.current = {
      spielen: freshStat(),
      kontur: freshStat(),
    }
    modeRef.current = 'spielen'
    nextRound()
    refresh()
  }

  const handleDown = (m: number) => (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    playNote(m)
  }
  const handleUp = (m: number) => () => stopNote(m)

  // Tastatur über zwei Oktaven (C3–C5), nach MIDI-Note.
  const whiteMidis: number[] = []
  const blackMidis: number[] = []
  for (let m = KB_LO; m <= KB_HI; m++) {
    if (isWhitePc(m)) whiteMidis.push(m)
    else blackMidis.push(m)
  }
  const WHITE_W = 100 / whiteMidis.length
  const whitesBelow = (m: number) => whiteMidis.filter((w) => w < m).length

  const mode = snap.mode
  const gemeistert = snap.passed.kontur
  const konturLen = roundRef.current.dirs.length

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
        <h2 className="font-display text-3xl text-amber-soft">Hörtrainer</h2>
        <div className="flex items-center gap-4 text-sm text-bone/60">
          <span className="tabular-nums" title="Trefferquote dieser Stufe">
            {snap.samples ? Math.round(snap.acc * 100) : 0}% richtig
          </span>
          <span
            className="rounded-full border border-bone/15 px-2.5 py-0.5"
            title="Aktuelle Stufe"
          >
            {MODE_LABEL[mode]}
          </span>
        </div>
      </div>

      {/* Spielfeld */}
      <div className="relative mx-auto flex w-full max-w-2xl flex-col items-center gap-5 rounded-xl bg-ink-800/40 p-5 ring-1 ring-black/40">
        <button
          type="button"
          onClick={() => !playing && playRound()}
          disabled={playing}
          className="ease-soft rounded-full border border-amber-glow/40 bg-ink-700/60 px-6 py-2.5 text-base text-amber-soft transition-all hover:border-amber-glow hover:bg-ink-600 disabled:opacity-50"
        >
          {playing ? '♪ klingt …' : '↻ Nochmal hören'}
        </button>

        {/* Anfangston — damit du dich orientieren kannst */}
        <div className="text-base text-bone/70" aria-live="polite">
          Anfangston:{' '}
          <span className="font-display text-xl text-amber-soft">
            {startMidi !== null ? NOTE_NAMES[startMidi % 12] : '—'}
          </span>
        </div>

        {/* Feedback + welcher Ton wirklich gespielt wurde */}
        <div className="flex h-12 flex-col items-center justify-center gap-0.5">
          <div className="text-base font-medium" aria-live="polite">
            {feedback && (
              <span style={{ color: feedback.kind === 'hit' ? HIT : MISS }}>
                {feedback.kind === 'hit' ? '✓ ' : '✗ '}
                {feedback.text}
              </span>
            )}
          </div>
          {mode === 'spielen' && lastPlayed && (
            <div className="text-sm text-bone/55" aria-live="polite">
              Gespielt: {midiToScientific(lastPlayed.a)}{' '}
              {DIR_ARROW[dirOf(lastPlayed.a, lastPlayed.b)]}{' '}
              {midiToScientific(lastPlayed.b)} (
              {DIR_LABEL[dirOf(lastPlayed.a, lastPlayed.b)]})
            </div>
          )}
        </div>

        {mode === 'spielen' ? (
          <>
            <p className="text-center text-sm text-bone/55">
              Spiel zwei Tasten in derselben Richtung wie das Gehörte
              {firstPressPc !== null && (
                <span className="text-amber-soft">
                  {' '}
                  — deine erste Taste: {NOTE_NAMES[firstPressPc]}, jetzt die zweite
                </span>
              )}
            </p>
            <KeyboardViewport
              base={KB_LO}
              span={KB_HI - KB_LO + 1}
              focus={startMidi !== null ? [startMidi] : undefined}
              className="max-w-lg"
            >
            <div
              className="relative h-36 w-full select-none sm:h-40"
              style={{ touchAction: 'none' }}
              role="group"
              aria-label="Klaviatur"
            >
              {whiteMidis.map((m, wi) => {
                const active = activeNotes.has(m)
                const isStart = startMidi === m
                return (
                  <button
                    key={m}
                    type="button"
                    aria-label={
                      midiToScientific(m) + (isStart ? ' (Anfangston)' : '')
                    }
                    onPointerDown={handleDown(m)}
                    onPointerUp={handleUp(m)}
                    onPointerLeave={handleUp(m)}
                    onPointerCancel={handleUp(m)}
                    className="ease-soft absolute bottom-0 top-0 rounded-b-md border border-black/40 transition-[transform] duration-100"
                    style={{
                      left: `${wi * WHITE_W}%`,
                      width: `${WHITE_W}%`,
                      zIndex: 1,
                      background: active
                        ? 'linear-gradient(180deg,#f6ecd8,#e9d9b8)'
                        : 'linear-gradient(180deg,#fbf6ec,#e7ddca)',
                      boxShadow: active
                        ? 'inset 0 -3px 10px rgba(176,130,52,0.45)'
                        : 'inset 0 -4px 8px rgba(0,0,0,0.18)',
                      transform: active ? 'translateY(1.5px)' : 'none',
                    }}
                  >
                    {isStart && (
                      <span
                        className="pointer-events-none absolute bottom-2 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full"
                        style={{ background: GOLD, boxShadow: '0 0 8px rgba(224,177,94,0.85)' }}
                      />
                    )}
                  </button>
                )
              })}
              {blackMidis.map((m) => {
                const left = whitesBelow(m) * WHITE_W - (WHITE_W * 0.62) / 2
                const active = activeNotes.has(m)
                const isStart = startMidi === m
                return (
                  <button
                    key={m}
                    type="button"
                    aria-label={
                      midiToScientific(m) + (isStart ? ' (Anfangston)' : '')
                    }
                    onPointerDown={handleDown(m)}
                    onPointerUp={handleUp(m)}
                    onPointerLeave={handleUp(m)}
                    onPointerCancel={handleUp(m)}
                    className="ease-soft absolute top-0 rounded-b-md transition-[transform] duration-100"
                    style={{
                      left: `${left}%`,
                      width: `${WHITE_W * 0.62}%`,
                      height: '62%',
                      zIndex: 2,
                      background: active
                        ? 'linear-gradient(180deg,#5a4628,#3a2c16)'
                        : 'linear-gradient(180deg,#2a2420,#0c0a08)',
                      border: '1px solid #000',
                      boxShadow: active
                        ? '0 0 14px rgba(224,177,94,0.5)'
                        : '0 3px 5px rgba(0,0,0,0.5)',
                      transform: active ? 'translateY(1.5px)' : 'none',
                    }}
                  >
                    {isStart && (
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
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-2xl">
              {Array.from({ length: konturLen }).map((_, i) => (
                <span
                  key={i}
                  className="flex h-9 w-9 items-center justify-center rounded-md border"
                  style={{
                    borderColor: konturAnswers[i] ? GOLD : 'rgba(239,230,214,0.18)',
                    color: konturAnswers[i] ? '#f0d49a' : 'rgba(239,230,214,0.3)',
                  }}
                >
                  {konturAnswers[i] ? DIR_ARROW[konturAnswers[i]] : '·'}
                </span>
              ))}
            </div>
            <p className="text-center text-sm text-bone/55">
              {`Zeichne die Form Schritt für Schritt nach (${konturAnswers.length}/${konturLen}).`}
            </p>
            <div className="flex gap-3">
              {(['up', 'same', 'down'] as Dir[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => answerKonturStep(d)}
                  disabled={playing}
                  className="ease-soft flex min-w-[96px] flex-col items-center gap-1 rounded-xl border border-bone/15 bg-ink-700/50 px-5 py-3 text-bone/80 transition-all hover:-translate-y-0.5 hover:border-amber-glow/50 hover:text-amber-soft disabled:opacity-40"
                >
                  <span className="text-2xl">{DIR_ARROW[d]}</span>
                  <span className="text-xs">{DIR_LABEL[d]}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Skala: erreicht / verinnerlicht / gemeistert */}
      <div className="lq-hide flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-sm">
          {(
            [
              ['verinnerlicht', snap.passed.spielen, 'Spielen: Richtung sicher selbst nachgespielt'],
              ['gemeistert', gemeistert, 'Kontur: ganze Phrasen-Form sicher erkannt = Lernziel erfüllt'],
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
        Erst hören, dann antworten — die Schritte werden kleiner, je sicherer du
        wirst. Es zählt das Hören bei den feinen Schritten, nicht die offensichtliche
        Oktave. Kein Zeitdruck, keine Punkte.
      </p>
    </div>
  )
}
