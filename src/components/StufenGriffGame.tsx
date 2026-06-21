import { useCallback, useEffect, useRef, useState } from 'react'
import { onNoteOn, playNote, stopNote } from '../audio/notePlayer'
import { attack, ensureAudioStarted, release } from '../audio/pianoSampler'
import { useSessionStore } from '../state/sessionStore'
import { useProgressStore } from '../state/progressStore'
import { midiToName, NOTE_NAMES } from '../music/theory'

// Stufen-Greifer — Challenge für Node ak1 „I · IV · V" (die drei Hauptakkorde).
//
// Eine Funktion wird angesagt — Tonika (I), Subdominante (IV) oder Dominante (V)
// einer Tonart — und du greifst den passenden Dur-Dreiklang. Damit lassen sich
// erstaunlich viele Lieder begleiten; wer die drei Stufen blind findet, hat das
// harmonische Skelett in der Hand.
//
// Aufbaut auf der Akkordgriff-Eingabeerkennung: gesammelte Anschläge werden über
// TONKLASSEN (Lage/Oktave/Umkehrung egal) gegen den Zieldreiklang geprüft.
//
// Drei Stufen als erreicht→verinnerlicht→gemeistert-Leiter:
//   1. Mit Stütze · C-Dur   — Zieltasten leuchten, Funktion benannt   (erreicht)
//   2. Blind · C-Dur        — du musst I/IV/V selbst wissen           (verinnerlicht)
//   3. Wechselnde Tonarten  — blind, in C/G/D/F/A                     (gemeistert)
//
// Wie überall: Feedback informiert, bewertet nie. Kein Tempo, kein Punktestand.

type Stage = 'stuetze' | 'blind' | 'tonarten'
type Degree = 'I' | 'IV' | 'V'

const STAGE_ORDER: Stage[] = ['stuetze', 'blind', 'tonarten']
const STAGE_LABEL: Record<Stage, string> = {
  stuetze: 'Mit Stütze · C-Dur',
  blind: 'Blind · C-Dur',
  tonarten: 'Wechselnde Tonarten',
}

// Funktion → Halbtöne über dem Tonika-Grundton (alle drei sind Dur-Dreiklänge).
const DEGREE_OFFSET: Record<Degree, number> = { I: 0, IV: 5, V: 7 }
const DEGREE_NAME: Record<Degree, string> = {
  I: 'Tonika',
  IV: 'Subdominante',
  V: 'Dominante',
}
const DEGREES: Degree[] = ['I', 'IV', 'V']

// Freundliche Tonarten für Stufe 3 (wenig schwarze Tasten, häufig).
const FRIENDLY_KEYS = ['C', 'G', 'D', 'F', 'A'] as const

const GOLD = '#e0b15e'
const HIT = '#9bb88a'
const MISS = '#cf7d6b'

const SETTLE_MS = 900
const BASE = 60 // C4 — Anker der Bildschirm-Klaviatur (zwei Oktaven)
const SPAN = 24

const rint = (n: number) => Math.floor(Math.random() * n)
const pc = (m: number) => ((m % 12) + 12) % 12
const isWhitePc = (p: number) => [0, 2, 4, 5, 7, 9, 11].includes(p)

// Grundton-MIDI eines Dur-Dreiklangs in der ersten Bildschirm-Oktave.
function rootMidiOf(tonicPc: number, deg: Degree): number {
  return BASE + ((tonicPc + DEGREE_OFFSET[deg]) % 12)
}
// Die drei Töne (Grundstellung) — für Anzeige/Vorspielen.
function triadNotes(rootMidi: number): number[] {
  return [rootMidi, rootMidi + 4, rootMidi + 7]
}
// Die drei Tonklassen — für oktav-/lage-unabhängiges Matchen.
function triadPcSet(rootMidi: number): Set<number> {
  return new Set([pc(rootMidi), pc(rootMidi + 4), pc(rootMidi + 7)])
}

interface Round {
  tonicPc: number
  tonicName: string
  deg: Degree
  rootMidi: number
}

function genRound(stage: Stage, prev?: Round): Round {
  const keyName =
    stage === 'tonarten' ? FRIENDLY_KEYS[rint(FRIENDLY_KEYS.length)] : 'C'
  const tonicPc = NOTE_NAMES.indexOf(keyName as (typeof NOTE_NAMES)[number])
  let deg = DEGREES[rint(DEGREES.length)]
  // Nicht zweimal exakt dieselbe Aufgabe hintereinander.
  let guard = 0
  while (prev && prev.tonicPc === tonicPc && prev.deg === deg && guard < 8) {
    deg = DEGREES[rint(DEGREES.length)]
    guard++
  }
  return { tonicPc, tonicName: keyName, deg, rootMidi: rootMidiOf(tonicPc, deg) }
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

export default function StufenGriffGame({ onExit }: { onExit: () => void }) {
  const activeNotes = useSessionStore((s) => s.activeNotes)

  const statsRef = useRef<Record<Stage, StageStat>>({
    stuetze: freshStat(),
    blind: freshStat(),
    tonarten: freshStat(),
  })
  const stageRef = useRef<Stage>('stuetze')
  const roundRef = useRef<Round>(genRound('stuetze'))
  const awaitingRef = useRef(false)
  const bufferRef = useRef<number[]>([])
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const [round, setRound] = useState<Round>(roundRef.current)
  const [reveal, setReveal] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'hit' | 'miss'; text: string } | null>(null)
  const [snap, setSnap] = useState<Snapshot>({
    stage: 'stuetze',
    acc: 0,
    samples: 0,
    passed: { stuetze: false, blind: false, tonarten: false },
  })

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    settleTimerRef.current = null
  }, [])

  const refresh = useCallback(() => {
    const s = stageRef.current
    const st = statsRef.current[s]
    const n = st.results.length
    setSnap({
      stage: s,
      acc: n ? st.results.filter(Boolean).length / n : 0,
      samples: n,
      passed: {
        stuetze: statsRef.current.stuetze.passed,
        blind: statsRef.current.blind.passed,
        tonarten: statsRef.current.tonarten.passed,
      },
    })
  }, [])

  const playChord = useCallback((rootMidi: number, arpeggio = false) => {
    const notes = triadNotes(rootMidi)
    void ensureAudioStarted().then(() => {
      const STEP = arpeggio ? 150 : 0
      notes.forEach((n, i) => timersRef.current.push(setTimeout(() => attack(n, 0.7), i * STEP)))
      const end = (notes.length - 1) * STEP + 760
      notes.forEach((n) => timersRef.current.push(setTimeout(() => release(n), end)))
    })
  }, [])

  const nextRound = useCallback(() => {
    const r = genRound(stageRef.current, roundRef.current)
    roundRef.current = r
    setRound(r)
    bufferRef.current = []
    awaitingRef.current = true
    setReveal(false)
    setFeedback(null)
  }, [])

  // Reihe sicherer Treffer nötig (verhindert Glückstreffer durch 3-aus-12-Raten).
  const passedFor = (st: StageStat) => {
    const n = st.results.length
    const acc = n ? st.results.filter(Boolean).length / n : 0
    return n >= 10 && acc >= 0.8 && st.level >= 0.7
  }

  const record = useCallback(
    (ok: boolean) => {
      const s = stageRef.current
      const st = statsRef.current[s]
      st.results.push(ok)
      if (st.results.length > 16) st.results.shift()

      const recent = st.results.slice(-8)
      if (recent.length >= 5) {
        const rate = recent.filter(Boolean).length / recent.length
        if (rate > 0.8) st.level = Math.min(1, st.level + 0.1)
        else if (rate < 0.5) st.level = Math.max(0, st.level - 0.12)
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

  const evaluate = useCallback(() => {
    if (!awaitingRef.current) return
    awaitingRef.current = false
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current)
      settleTimerRef.current = null
    }
    const r = roundRef.current
    const targetPcs = triadPcSet(r.rootMidi)
    const playedPcs = new Set(bufferRef.current.map(pc))
    const correct = playedPcs.size === 3 && [...targetPcs].every((p) => playedPcs.has(p))

    const targetName = `${midiToName(r.rootMidi)}-Dur`
    if (correct) {
      setFeedback({ kind: 'hit', text: `Richtig — ${targetName}` })
    } else {
      setFeedback({ kind: 'miss', text: `War: ${targetName}` })
      setReveal(true)
      playChord(r.rootMidi)
    }
    record(correct)
    timersRef.current.push(setTimeout(() => nextRound(), correct ? 850 : 1700))
  }, [record, nextRound, playChord])

  // Eingabe sammeln (MIDI, Klick, Computertastatur).
  useEffect(() => {
    const unsub = onNoteOn((midi) => {
      if (!awaitingRef.current) return
      const buf = bufferRef.current
      if (buf.includes(midi)) return
      buf.push(midi)
      const targetPcs = triadPcSet(roundRef.current.rootMidi)
      const playedPcs = new Set(buf.map(pc))
      if (playedPcs.size === 3 && [...targetPcs].every((p) => playedPcs.has(p))) {
        evaluate()
        return
      }
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
      settleTimerRef.current = setTimeout(evaluate, SETTLE_MS)
    })
    return () => unsub()
  }, [evaluate])

  useEffect(() => {
    nextRound()
    refresh()
    return () => clearTimers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fortschritt fürs Lernziel ak1 festhalten (lokal, nur höchste Stufe).
  const recordLevel = useProgressStore((s) => s.recordLevel)
  useEffect(() => {
    if (snap.passed.stuetze) recordLevel('ak1', 'erreicht')
    if (snap.passed.blind) recordLevel('ak1', 'verinnerlicht')
    if (snap.passed.tonarten) recordLevel('ak1', 'gemeistert')
  }, [snap, recordLevel])

  const handleRestart = () => {
    clearTimers()
    statsRef.current = { stuetze: freshStat(), blind: freshStat(), tonarten: freshStat() }
    stageRef.current = 'stuetze'
    nextRound()
    refresh()
  }

  const blind = snap.stage !== 'stuetze'
  const targetNotes = triadNotes(round.rootMidi)
  const showTarget = !blind || reveal

  const handleDown = (midi: number) => (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    playNote(midi)
  }
  const handleUp = (midi: number) => () => stopNote(midi)

  // Zwei Oktaven ab C4.
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
        <h2 className="font-display text-3xl text-amber-soft">Stufen-Greifer</h2>
        <div className="flex items-center gap-4 text-sm text-bone/60">
          <span className="tabular-nums" title="Trefferquote dieser Stufe">
            {snap.samples ? Math.round(snap.acc * 100) : 0}% richtig
          </span>
          <span className="rounded-full border border-bone/15 px-2.5 py-0.5" title="Aktuelle Stufe">
            {STAGE_LABEL[snap.stage]}
          </span>
        </div>
      </div>

      {/* Spielfeld */}
      <div className="relative mx-auto w-full max-w-3xl rounded-xl bg-ink-800/40 p-3 ring-1 ring-black/40 sm:p-4">
        {/* Aufforderung */}
        <div className="mb-2 flex flex-col items-center gap-1 py-2">
          <span className="text-sm text-bone/50">
            Greif die Stufe in <span className="text-amber-soft">{round.tonicName}-Dur</span>
          </span>
          <span
            className="font-display text-5xl leading-none"
            style={{ color: feedback?.kind === 'miss' ? MISS : '#f0d49a' }}
          >
            {DEGREE_NAME[round.deg]}{' '}
            <span className="text-bone/45">({round.deg})</span>
          </span>
          <div className="mt-1 flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => playChord(round.rootMidi)}
              className="ease-soft rounded-full border border-amber-glow/30 px-3 py-0.5 text-amber-soft/90 transition-colors hover:border-amber-glow hover:text-amber-soft"
            >
              ♪ Anhören
            </button>
          </div>
        </div>

        {/* Feedback */}
        <div className="flex h-7 flex-col items-center justify-center" aria-live="polite">
          {feedback && (
            <span className="text-base font-medium" style={{ color: feedback.kind === 'hit' ? HIT : MISS }}>
              {feedback.kind === 'hit' ? '✓ ' : '✗ '}
              {feedback.text}
            </span>
          )}
        </div>

        {/* Klaviatur (zwei Oktaven ab C4) */}
        <div
          className="relative mt-2 h-40 w-full select-none sm:h-48"
          style={{ touchAction: 'none' }}
          role="group"
          aria-label="Klaviatur"
        >
          {whites.map((m, wi) => {
            const active = activeNotes.has(m)
            const mark = showTarget && targetNotes.includes(m)
            return (
              <button
                key={m}
                type="button"
                aria-label={midiToName(m) + (mark ? ' (Zielton)' : '')}
                onPointerDown={handleDown(m)}
                onPointerUp={handleUp(m)}
                onPointerLeave={handleUp(m)}
                onPointerCancel={handleUp(m)}
                className="ease-soft absolute bottom-0 top-0 flex items-end justify-center rounded-b-md border border-black/40 pb-2 transition-[transform,background-color] duration-100"
                style={{
                  left: `${wi * WHITE_W}%`,
                  width: `${WHITE_W}%`,
                  zIndex: 1,
                  background: mark
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
                {mark && (
                  <span
                    className="pointer-events-none absolute bottom-2 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full"
                    style={{ background: GOLD, boxShadow: '0 0 8px rgba(224,177,94,0.85)' }}
                  />
                )}
                {!blind && (
                  <span className="pointer-events-none text-sm font-medium text-ink-700/60">
                    {midiToName(m)}
                  </span>
                )}
              </button>
            )
          })}
          {blacks.map((m) => {
            const left = whitesBelow(m) * WHITE_W - (WHITE_W * 0.62) / 2
            const active = activeNotes.has(m)
            const mark = showTarget && targetNotes.includes(m)
            return (
              <button
                key={m}
                type="button"
                aria-label={midiToName(m) + (mark ? ' (Zielton)' : '')}
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
                  background: mark
                    ? 'linear-gradient(180deg,#7a5c1e,#4a3712)'
                    : active
                      ? 'linear-gradient(180deg,#5a4628,#3a2c16)'
                      : 'linear-gradient(180deg,#2a2420,#0c0a08)',
                  border: mark ? '1px solid #e0b15e' : '1px solid #000',
                  boxShadow: active ? '0 0 14px rgba(224,177,94,0.5)' : '0 3px 5px rgba(0,0,0,0.5)',
                  transform: active ? 'translateY(1.5px)' : 'none',
                }}
              >
                {mark && (
                  <span
                    className="pointer-events-none absolute bottom-1.5 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full"
                    style={{ background: GOLD, boxShadow: '0 0 8px rgba(224,177,94,0.95)' }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Skala: erreicht / verinnerlicht / gemeistert */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-sm">
          {(
            [
              ['erreicht', snap.passed.stuetze, 'Mit Stütze: I/IV/V in C-Dur mit leuchtenden Zieltasten gegriffen'],
              ['verinnerlicht', snap.passed.blind, 'Blind: I/IV/V in C-Dur ohne Hilfe selbst gefunden'],
              ['gemeistert', snap.passed.tonarten, 'Wechselnde Tonarten: I/IV/V auch in G/D/F/A blind gegriffen = Checkpoint erfüllt'],
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
        Merksatz: <span className="text-bone/70">I = Grundton</span>,{' '}
        <span className="text-bone/70">IV = vier Tasten höher</span>,{' '}
        <span className="text-bone/70">V = fünf höher</span> — alle drei als Dur-Dreiklang.
        Die Töne dürfen in jeder Lage/Umkehrung liegen. Es wird schwerer, je sicherer du
        wirst. Kein Zeitdruck, keine Punkte.
      </p>
    </div>
  )
}
