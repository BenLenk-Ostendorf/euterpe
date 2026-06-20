import { useCallback, useEffect, useRef, useState } from 'react'
import { attack, ensureAudioStarted, release } from '../audio/pianoSampler'
import { useProgressStore } from '../state/progressStore'
import { NOTE_NAMES } from '../music/theory'

// Dur/Moll-Ohr — ein Ohr-Mikro-Spiel zum Checkpoint „Dur/Moll hören" (gd):
// Fröhlich (Dur) oder traurig (Moll)? Reines Hören, keine Motorik.
//
// Drei Stufen als erreicht→verinnerlicht→gemeistert-Leiter:
//   1. Grundstellung — Dreiklang als Block, Grundstellung        (erreicht)
//   2. Umkehrungen   — Dreiklang als Block, beliebige Umkehrung  (verinnerlicht)
//   3. Gebrochen     — Dreiklang nacheinander (Arpeggio)         (gemeistert)
//
// Der Stufenaufstieg verlangt eine SERIE sicherer Treffer (nicht einen
// Glückstreffer — die Aufgabe ist binär). Feedback nennt den Akkord, bewertet
// nie. Kein Tempo, kein Punktestand.

type Stage = 'block' | 'umkehrung' | 'arpeggio'
type Quality = 'dur' | 'moll'

const STAGE_ORDER: Stage[] = ['block', 'umkehrung', 'arpeggio']
const STAGE_LABEL: Record<Stage, string> = {
  block: 'Grundstellung',
  umkehrung: 'Umkehrungen',
  arpeggio: 'Gebrochen',
}
const QUAL_LABEL: Record<Quality, string> = { dur: 'Dur', moll: 'Moll' }

const HIT = '#9bb88a'
const MISS = '#cf7d6b'

const THIRD: Record<Quality, number> = { dur: 4, moll: 3 }
const rint = (n: number) => Math.floor(Math.random() * n)

// Dreiklang-Töne (MIDI) für Qualität + Umkehrung, aufsteigend sortiert.
function chordNotes(rootMidi: number, q: Quality, inversion: number): number[] {
  const base = [0, THIRD[q], 7]
  return base
    .map((iv, idx) => rootMidi + iv + (idx < inversion ? 12 : 0))
    .sort((a, b) => a - b)
}

interface Round {
  rootMidi: number
  quality: Quality
  inversion: number
  notes: number[]
  arpeggio: boolean
}

function genRound(stage: Stage): Round {
  const rootMidi = 52 + rint(13) // E3..E4 — Akkord bleibt im hörbaren Mittenbereich
  const quality: Quality = Math.random() < 0.5 ? 'dur' : 'moll'
  const inversion = stage === 'block' ? 0 : rint(3)
  return {
    rootMidi,
    quality,
    inversion,
    notes: chordNotes(rootMidi, quality, inversion),
    arpeggio: stage === 'arpeggio',
  }
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

export default function DurMollGame({ onExit }: { onExit: () => void }) {
  const statsRef = useRef<Record<Stage, StageStat>>({
    block: freshStat(),
    umkehrung: freshStat(),
    arpeggio: freshStat(),
  })
  const stageRef = useRef<Stage>('block')
  const roundRef = useRef<Round>(genRound('block'))
  const awaitingRef = useRef(false)
  const playingRef = useRef(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const [snap, setSnap] = useState<Snapshot>({
    stage: 'block',
    acc: 0,
    samples: 0,
    passed: { block: false, umkehrung: false, arpeggio: false },
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
        block: statsRef.current.block.passed,
        umkehrung: statsRef.current.umkehrung.passed,
        arpeggio: statsRef.current.arpeggio.passed,
      },
    })
  }, [])

  // Akkord abspielen (über attack/release). Block = gleichzeitig, Arpeggio =
  // aufsteigend versetzt, klingt dann zum Akkord zusammen.
  const playRound = useCallback(() => {
    clearTimers()
    const { notes, arpeggio } = roundRef.current
    void ensureAudioStarted().then(() => {
      setPlaying(true)
      playingRef.current = true
      const STEP = arpeggio ? 240 : 0
      const HOLD = 1150
      notes.forEach((m, i) => {
        timersRef.current.push(setTimeout(() => attack(m, 0.72), i * STEP))
      })
      const end = (notes.length - 1) * STEP + HOLD
      notes.forEach((m) => timersRef.current.push(setTimeout(() => release(m), end)))
      timersRef.current.push(
        setTimeout(() => {
          setPlaying(false)
          playingRef.current = false
        }, end),
      )
    })
  }, [clearTimers])

  const nextRound = useCallback(() => {
    roundRef.current = genRound(stageRef.current)
    awaitingRef.current = true
    setFeedback(null)
    playRound()
  }, [playRound])

  // Binäre Aufgabe → höhere Schwelle, damit kein Glückstreffer durchrutscht.
  const passedFor = (st: StageStat) => {
    const n = st.results.length
    const acc = n ? st.results.filter(Boolean).length / n : 0
    return n >= 10 && acc >= 0.85 && st.level >= 0.7
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
    (q: Quality) => {
      if (!awaitingRef.current || playingRef.current) return
      const r = roundRef.current
      const ok = q === r.quality
      awaitingRef.current = false
      const name = `${NOTE_NAMES[r.rootMidi % 12]} ${QUAL_LABEL[r.quality]}`
      setFeedback({
        kind: ok ? 'hit' : 'miss',
        text: ok ? `Richtig — ${name}` : `War: ${name}`,
      })
      record(ok)
      timersRef.current.push(setTimeout(() => nextRound(), ok ? 800 : 1500))
    },
    [record, nextRound],
  )

  // Start: erste Runde ziehen und abspielen.
  useEffect(() => {
    nextRound()
    refresh()
    return () => clearTimers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fortschritt fürs Lernziel gd festhalten (lokal, nur höchste Stufe).
  const recordLevel = useProgressStore((s) => s.recordLevel)
  useEffect(() => {
    if (snap.passed.block) recordLevel('gd', 'erreicht')
    if (snap.passed.umkehrung) recordLevel('gd', 'verinnerlicht')
    if (snap.passed.arpeggio) recordLevel('gd', 'gemeistert')
  }, [snap, recordLevel])

  const handleRestart = () => {
    clearTimers()
    statsRef.current = {
      block: freshStat(),
      umkehrung: freshStat(),
      arpeggio: freshStat(),
    }
    stageRef.current = 'block'
    nextRound()
    refresh()
  }

  const stage = snap.stage

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
        <h2 className="font-display text-3xl text-amber-soft">Dur/Moll-Ohr</h2>
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

        {/* Feedback */}
        <div className="flex h-7 items-center justify-center text-base font-medium" aria-live="polite">
          {feedback && (
            <span style={{ color: feedback.kind === 'hit' ? HIT : MISS }}>
              {feedback.kind === 'hit' ? '✓ ' : '✗ '}
              {feedback.text}
            </span>
          )}
        </div>

        <p className="text-center text-sm text-bone/55">
          Klingt der Akkord <span className="text-amber-soft">fröhlich (Dur)</span> oder{' '}
          <span className="text-amber-soft">traurig (Moll)</span>?
        </p>

        <div className="flex gap-4">
          {(['dur', 'moll'] as Quality[]).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => answer(q)}
              disabled={playing}
              className="ease-soft flex min-w-[128px] flex-col items-center gap-1 rounded-xl border border-bone/15 bg-ink-700/50 px-7 py-4 text-bone/85 transition-all hover:-translate-y-0.5 hover:border-amber-glow/50 hover:text-amber-soft disabled:opacity-40"
            >
              <span className="text-3xl">{q === 'dur' ? '☺' : '☹'}</span>
              <span className="font-display text-xl">{QUAL_LABEL[q]}</span>
              <span className="text-xs text-bone/50">
                {q === 'dur' ? 'fröhlich' : 'traurig'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Skala: erreicht / verinnerlicht / gemeistert */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-sm">
          {(
            [
              ['erreicht', snap.passed.block, 'Grundstellung: Dur/Moll als Block sicher gehört'],
              ['verinnerlicht', snap.passed.umkehrung, 'Umkehrungen: Qualität auch bei verschobenem Akkord erkannt'],
              ['gemeistert', snap.passed.arpeggio, 'Gebrochen: Dur/Moll auch im Arpeggio sicher = Checkpoint erfüllt'],
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
        Erst hören, dann entscheiden — Dur klingt offen/hell, Moll dunkler/weicher.
        Die Stufen werden schwerer (Umkehrungen, gebrochen), je sicherer du wirst.
        Kein Zeitdruck, keine Punkte.
      </p>
    </div>
  )
}
