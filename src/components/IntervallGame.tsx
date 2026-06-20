import { useCallback, useEffect, useRef, useState } from 'react'
import { attack, ensureAudioStarted, release } from '../audio/pianoSampler'
import { useProgressStore } from '../state/progressStore'

// Intervall-Ohr — Ohr-Mikro-Spiel zum Checkpoint „Intervalle" (gi):
// Zwei Töne erklingen aufsteigend, wie groß ist der Sprung? Bekannte
// Liedanfänge als Anker. Auswahl wächst mit der Stufe.
//
// Drei Stufen erreicht→verinnerlicht→gemeistert:
//   1. Weite Sprünge — Oktave / Quinte / Quarte   (erreicht)
//   2. + Terzen      — groß & klein                (verinnerlicht)
//   3. + Sekunden    — die feinen Schritte         (gemeistert)
//
// Feedback nennt das richtige Intervall, bewertet nie. Kein Tempo, keine Punkte.

type Stage = 'weit' | 'mittel' | 'fein'

const STAGE_ORDER: Stage[] = ['weit', 'mittel', 'fein']
const STAGE_LABEL: Record<Stage, string> = {
  weit: 'Weite Sprünge',
  mittel: '+ Terzen',
  fein: '+ Sekunden',
}
const STAGE_SET: Record<Stage, number[]> = {
  weit: [12, 7, 5],
  mittel: [12, 7, 5, 4, 3],
  fein: [12, 7, 5, 4, 3, 2, 1],
}

const INTERVAL_NAME: Record<number, string> = {
  1: 'kl. Sekunde',
  2: 'gr. Sekunde',
  3: 'kl. Terz',
  4: 'gr. Terz',
  5: 'Quarte',
  7: 'Quinte',
  12: 'Oktave',
}
// Nur sehr geläufige, verlässliche Anker — als Gedächtnisstütze, nicht Pflicht.
const ANCHOR: Record<number, string> = {
  3: 'wie „Kuckuck"',
  5: 'wie „Hochzeitsmarsch"',
  7: 'wie „Morgen kommt der Weihnachtsmann"',
  12: 'wie „Over the Rainbow"',
}

const HIT = '#9bb88a'
const MISS = '#cf7d6b'
const rint = (n: number) => Math.floor(Math.random() * n)

interface Round {
  root: number
  semi: number
  notes: number[]
}
function genRound(stage: Stage): Round {
  const set = STAGE_SET[stage]
  const semi = set[rint(set.length)]
  const root = 52 + rint(13) // E3..E4 — Sprung bleibt im Mittenbereich
  return { root, semi, notes: [root, root + semi] }
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

export default function IntervallGame({ onExit }: { onExit: () => void }) {
  const statsRef = useRef<Record<Stage, StageStat>>({
    weit: freshStat(),
    mittel: freshStat(),
    fein: freshStat(),
  })
  const stageRef = useRef<Stage>('weit')
  const roundRef = useRef<Round>(genRound('weit'))
  const awaitingRef = useRef(false)
  const playingRef = useRef(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const [snap, setSnap] = useState<Snapshot>({
    stage: 'weit',
    acc: 0,
    samples: 0,
    passed: { weit: false, mittel: false, fein: false },
  })
  const [playing, setPlaying] = useState(false)
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
        weit: statsRef.current.weit.passed,
        mittel: statsRef.current.mittel.passed,
        fein: statsRef.current.fein.passed,
      },
    })
  }, [])

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
        timersRef.current.push(setTimeout(() => attack(m, 0.78), t))
        timersRef.current.push(setTimeout(() => release(m), t + NOTE))
      })
      timersRef.current.push(
        setTimeout(() => {
          setPlaying(false)
          playingRef.current = false
        }, notes.length * (NOTE + GAP)),
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
    (semi: number) => {
      if (!awaitingRef.current || playingRef.current) return
      const target = roundRef.current.semi
      const ok = semi === target
      awaitingRef.current = false
      setFeedback({
        kind: ok ? 'hit' : 'miss',
        text: ok ? `Richtig — ${INTERVAL_NAME[target]}` : `War: ${INTERVAL_NAME[target]}`,
      })
      record(ok)
      timersRef.current.push(setTimeout(() => nextRound(), ok ? 800 : 1500))
    },
    [record, nextRound],
  )

  useEffect(() => {
    nextRound()
    refresh()
    return () => clearTimers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fortschritt fürs Lernziel gi festhalten (lokal, nur höchste Stufe).
  const recordLevel = useProgressStore((s) => s.recordLevel)
  useEffect(() => {
    if (snap.passed.weit) recordLevel('gi', 'erreicht')
    if (snap.passed.mittel) recordLevel('gi', 'verinnerlicht')
    if (snap.passed.fein) recordLevel('gi', 'gemeistert')
  }, [snap, recordLevel])

  const handleRestart = () => {
    clearTimers()
    statsRef.current = { weit: freshStat(), mittel: freshStat(), fein: freshStat() }
    stageRef.current = 'weit'
    nextRound()
    refresh()
  }

  const stage = snap.stage
  const choices = STAGE_SET[stage]

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
        <h2 className="font-display text-3xl text-amber-soft">Intervall-Ohr</h2>
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

        <div className="flex h-7 items-center justify-center text-base font-medium" aria-live="polite">
          {feedback && (
            <span style={{ color: feedback.kind === 'hit' ? HIT : MISS }}>
              {feedback.kind === 'hit' ? '✓ ' : '✗ '}
              {feedback.text}
            </span>
          )}
        </div>

        <p className="text-center text-sm text-bone/55">
          Wie groß ist der Sprung von Ton 1 zu Ton 2?
        </p>

        <div className="flex max-w-xl flex-wrap items-center justify-center gap-3">
          {choices.map((semi) => (
            <button
              key={semi}
              type="button"
              onClick={() => answer(semi)}
              disabled={playing}
              title={ANCHOR[semi]}
              className="ease-soft flex min-w-[120px] flex-col items-center gap-0.5 rounded-xl border border-bone/15 bg-ink-700/50 px-5 py-3 text-bone/85 transition-all hover:-translate-y-0.5 hover:border-amber-glow/50 hover:text-amber-soft disabled:opacity-40"
            >
              <span className="font-display text-lg">{INTERVAL_NAME[semi]}</span>
              {ANCHOR[semi] && (
                <span className="text-[11px] text-bone/45">{ANCHOR[semi]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Skala */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-sm">
          {(
            [
              ['erreicht', snap.passed.weit, 'Weite Sprünge: Oktave/Quinte/Quarte sicher'],
              ['verinnerlicht', snap.passed.mittel, 'Terzen (groß & klein) sicher dazu'],
              ['gemeistert', snap.passed.fein, 'Auch die feinen Sekunden sicher = Checkpoint erfüllt'],
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
        Erst hören, dann zuordnen — die Anker-Lieder helfen beim Einprägen. Die Auswahl
        wächst, je sicherer du wirst. Kein Zeitdruck, keine Punkte.
      </p>
    </div>
  )
}
