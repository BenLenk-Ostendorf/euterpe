import { useCallback, useEffect, useRef, useState } from 'react'
import { attack, ensureAudioStarted, release } from '../audio/pianoSampler'
import { useProgressStore } from '../state/progressStore'

// Wechsel-Ohr — Ohr-Mikro-Spiel zum Checkpoint „Akkordwechsel hören" (gw):
// Eine Folge von Akkorden erklingt im Puls. Wie oft wechselt die Harmonie?
// Trainiert das Spüren, WANN sich die Begleitung ändert — die Grundlage dafür,
// pro Takt den richtigen Akkord zu finden.
//
// Drei Stufen erreicht→verinnerlicht→gemeistert:
//   1. 3 Akkorde   (erreicht)
//   2. 4 Akkorde   (verinnerlicht)
//   3. 5 Akkorde, zügiger (gemeistert)
//
// Gleiche Harmonie = identischer Griff (kein Scheinwechsel). Feedback nennt die
// richtige Zahl, bewertet nie. Kein Punktestand.

type Stage = 'drei' | 'vier' | 'fuenf'

const STAGE_ORDER: Stage[] = ['drei', 'vier', 'fuenf']
const STAGE_LABEL: Record<Stage, string> = {
  drei: '3 Akkorde',
  vier: '4 Akkorde',
  fuenf: '5 Akkorde',
}
const STAGE_LEN: Record<Stage, number> = { drei: 3, vier: 4, fuenf: 5 }
const STAGE_STEP: Record<Stage, number> = { drei: 760, vier: 720, fuenf: 620 }

// Drei Dur-Hauptakkorde in C: I (C), IV (F), V (G) — als Block, Grundstellung.
const CHORDS = [
  { name: 'C', root: 60 },
  { name: 'F', root: 65 },
  { name: 'G', root: 67 },
]
const triad = (root: number) => [root, root + 4, root + 7]

const HIT = '#9bb88a'
const MISS = '#cf7d6b'
const rint = (n: number) => Math.floor(Math.random() * n)

interface Round {
  seq: number[] // Indizes in CHORDS
  changes: number
}
function genRound(stage: Stage): Round {
  const len = STAGE_LEN[stage]
  const seq = [rint(CHORDS.length)]
  for (let i = 1; i < len; i++) {
    if (Math.random() < 0.5) {
      seq.push(seq[i - 1]) // gleich
    } else {
      let next = rint(CHORDS.length)
      while (next === seq[i - 1]) next = rint(CHORDS.length)
      seq.push(next)
    }
  }
  const changes = seq.slice(1).filter((c, i) => c !== seq[i]).length
  return { seq, changes }
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

export default function WechselGame({ onExit }: { onExit: () => void }) {
  const statsRef = useRef<Record<Stage, StageStat>>({
    drei: freshStat(),
    vier: freshStat(),
    fuenf: freshStat(),
  })
  const stageRef = useRef<Stage>('drei')
  const roundRef = useRef<Round>(genRound('drei'))
  const awaitingRef = useRef(false)
  const playingRef = useRef(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const [snap, setSnap] = useState<Snapshot>({
    stage: 'drei',
    acc: 0,
    samples: 0,
    passed: { drei: false, vier: false, fuenf: false },
  })
  const [playing, setPlaying] = useState(false)
  const [beat, setBeat] = useState(-1) // gerade klingender Akkord-Index
  const [feedback, setFeedback] = useState<{ kind: 'hit' | 'miss'; text: string } | null>(null)

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
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
        drei: statsRef.current.drei.passed,
        vier: statsRef.current.vier.passed,
        fuenf: statsRef.current.fuenf.passed,
      },
    })
  }, [])

  const playRound = useCallback(() => {
    clearTimers()
    const { seq } = roundRef.current
    const STEP = STAGE_STEP[stageRef.current]
    const DUR = STEP - 90
    void ensureAudioStarted().then(() => {
      setPlaying(true)
      playingRef.current = true
      seq.forEach((ci, i) => {
        const notes = triad(CHORDS[ci].root)
        const t = i * STEP
        timersRef.current.push(setTimeout(() => setBeat(i), t))
        notes.forEach((m) => {
          timersRef.current.push(setTimeout(() => attack(m, 0.62), t))
          timersRef.current.push(setTimeout(() => release(m), t + DUR))
        })
      })
      timersRef.current.push(
        setTimeout(() => {
          setPlaying(false)
          playingRef.current = false
          setBeat(-1)
        }, seq.length * STEP),
      )
    })
  }, [clearTimers])

  const nextRound = useCallback(() => {
    roundRef.current = genRound(stageRef.current)
    awaitingRef.current = true
    setFeedback(null)
    playRound()
  }, [playRound])

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

  const answer = useCallback(
    (count: number) => {
      if (!awaitingRef.current || playingRef.current) return
      const target = roundRef.current.changes
      const ok = count === target
      awaitingRef.current = false
      setFeedback({
        kind: ok ? 'hit' : 'miss',
        text: ok ? `Richtig — ${target}× gewechselt` : `War: ${target}× gewechselt`,
      })
      record(ok)
      timersRef.current.push(setTimeout(() => nextRound(), ok ? 850 : 1500))
    },
    [record, nextRound],
  )

  useEffect(() => {
    nextRound()
    refresh()
    return () => clearTimers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fortschritt fürs Lernziel gw festhalten (lokal, nur höchste Stufe).
  const recordLevel = useProgressStore((s) => s.recordLevel)
  useEffect(() => {
    if (snap.passed.drei) recordLevel('gw', 'erreicht')
    if (snap.passed.vier) recordLevel('gw', 'verinnerlicht')
    if (snap.passed.fuenf) recordLevel('gw', 'gemeistert')
  }, [snap, recordLevel])

  const handleRestart = () => {
    clearTimers()
    statsRef.current = { drei: freshStat(), vier: freshStat(), fuenf: freshStat() }
    stageRef.current = 'drei'
    nextRound()
    refresh()
  }

  const stage = snap.stage
  const len = STAGE_LEN[stage]
  const choices = Array.from({ length: len }, (_, i) => i) // 0 … len-1

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
        <h2 className="font-display text-3xl text-amber-soft">Wechsel-Ohr</h2>
        <div className="flex items-center gap-4 text-sm text-bone/60">
          <span className="tabular-nums" title="Trefferquote dieser Stufe">
            {snap.samples ? Math.round(snap.acc * 100) : 0}% richtig
          </span>
          <span
            className="rounded-full border border-bone/15 px-2.5 py-0.5"
            title="Aktuelle Stufe"
          >
            {STAGE_LABEL[stage]}
          </span>
        </div>
      </div>

      {/* Spielfeld */}
      <div className="relative mx-auto flex w-full max-w-2xl flex-col items-center gap-6 rounded-xl bg-ink-800/40 p-6 ring-1 ring-black/40">
        <button
          type="button"
          onClick={() => !playing && playRound()}
          disabled={playing}
          className="ease-soft rounded-full border border-amber-glow/40 bg-ink-700/60 px-6 py-2.5 text-base text-amber-soft transition-all hover:border-amber-glow hover:bg-ink-600 disabled:opacity-50"
        >
          {playing ? '♪ klingt …' : '↻ Nochmal hören'}
        </button>

        {/* Puls-Punkte: zeigen den Takt, NICHT den Wechsel */}
        <div className="flex items-center gap-2">
          {Array.from({ length: len }).map((_, i) => (
            <span
              key={i}
              className="h-3 w-3 rounded-full transition-all duration-100"
              style={{
                background: beat === i ? '#e0b15e' : 'rgba(239,230,214,0.18)',
                transform: beat === i ? 'scale(1.4)' : 'none',
              }}
            />
          ))}
        </div>

        <div className="flex h-7 items-center justify-center text-base font-medium" aria-live="polite">
          {feedback && (
            <span style={{ color: feedback.kind === 'hit' ? HIT : MISS }}>
              {feedback.kind === 'hit' ? '✓ ' : '✗ '}
              {feedback.text}
            </span>
          )}
        </div>

        <p className="text-center text-sm text-bone/55">
          Wie oft wechselt die Harmonie in der Folge?
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          {choices.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => answer(c)}
              disabled={playing}
              className="ease-soft flex h-14 w-14 items-center justify-center rounded-xl border border-bone/15 bg-ink-700/50 font-display text-2xl text-bone/85 transition-all hover:-translate-y-0.5 hover:border-amber-glow/50 hover:text-amber-soft disabled:opacity-40"
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Skala */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-sm">
          {(
            [
              ['erreicht', snap.passed.drei, '3 Akkorde: Wechsel sicher gezählt'],
              ['verinnerlicht', snap.passed.vier, '4 Akkorde sicher'],
              ['gemeistert', snap.passed.fuenf, '5 Akkorde, zügiger = Checkpoint erfüllt'],
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
        Hör auf den Punkt, an dem sich der Klang „umfärbt" — das ist ein Wechsel.
        Gleiche Harmonie klingt zweimal gleich. Kein Zeitdruck, keine Punkte.
      </p>
    </div>
  )
}
