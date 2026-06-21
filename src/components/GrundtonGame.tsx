import { useCallback, useEffect, useRef, useState } from 'react'
import { attack, ensureAudioStarted, release } from '../audio/pianoSampler'
import { useProgressStore } from '../state/progressStore'

// Grundton-Ohr — ein Ohr-Mikro-Spiel zum Checkpoint „Grundton · Stufen" (gs):
// Auf welchem Ton ruht das Lied? Wann ist es „zu Hause"? Reines Hören, keine
// Motorik. Das ist die feine, mächtige Gehör-Ebene, die Stufen-Gefühl aufbaut.
//
// Drei Stufen als erreicht→verinnerlicht→gemeistert-Leiter:
//   1. Grundton erkennen — Kadenz, dann EIN Ton: ist das der Grundton? (erreicht)
//   2. Auflösung hören    — Phrase endet; ist sie „zu Hause" angekommen? (verinnerlicht)
//   3. Grundton finden    — Kadenz, dann drei Töne: welcher ist Zuhause? (gemeistert)
//
// Der Aufstieg verlangt eine Reihe sicherer Treffer. Feedback nennt die Lösung,
// bewertet nie. Kein Tempo, kein Punktestand.

type Stage = 'erkennen' | 'aufloesung' | 'finden'

const STAGE_ORDER: Stage[] = ['erkennen', 'aufloesung', 'finden']
const STAGE_LABEL: Record<Stage, string> = {
  erkennen: 'Grundton erkennen',
  aufloesung: 'Auflösung hören',
  finden: 'Grundton finden',
}

const HIT = '#9bb88a'
const MISS = '#cf7d6b'

// „Instabile" Stufen, die nach Auflösung verlangen (klingen nicht nach Zuhause).
const UNSTABLE = [2, 5, 11]
const STUFE_NAME: Record<number, string> = {
  0: 'Grundton (1. Stufe)',
  2: '2. Stufe',
  4: '3. Stufe',
  5: '4. Stufe',
  7: '5. Stufe',
  9: '6. Stufe',
  11: '7. Stufe (Leitton)',
}

const rint = (n: number) => Math.floor(Math.random() * n)

interface SeqEvent {
  notes: number[]
  at: number // ms-Offset ab Start
  hold: number
}

// Eine Kadenz I–IV–V–I als Blöcke — etabliert die Tonart („Zuhause" klarmachen).
function cadence(root: number, startAt = 0): SeqEvent[] {
  const chords = [
    [0, 4, 7],
    [5, 9, 12],
    [7, 11, 14],
    [0, 4, 7],
  ]
  const STEP = 430
  return chords.map((iv, i) => ({
    notes: iv.map((n) => root + n),
    at: startAt + i * STEP,
    hold: 380,
  }))
}
const cadenceEnd = (startAt = 0) => startAt + 4 * 430

interface Round {
  root: number
  stage: Stage
  // erkennen/aufloesung: ein Kandidat (Offset); finden: drei Kandidaten
  offset: number // Test-Stufe (erkennen) bzw. End-Stufe (aufloesung)
  candidates: number[] // drei Offsets (finden)
  tonicIndex: number // welcher Kandidat ist der Grundton (finden)
}

function genRound(stage: Stage, prevRoot?: number): Round {
  let root = 57 + rint(8) // A3..E4 — Tonart wandert, kein Absolut-Merken
  if (prevRoot !== undefined && Math.abs(root - prevRoot) < 2) root = prevRoot + 5
  if (stage === 'finden') {
    // Grundton + zwei andere Stufen, gemischt.
    const others = [4, 9, 5, 2].sort(() => Math.random() - 0.5).slice(0, 2)
    const cands = [0, ...others].sort(() => Math.random() - 0.5)
    return { root, stage, offset: 0, candidates: cands, tonicIndex: cands.indexOf(0) }
  }
  // erkennen: 50/50 Grundton vs. instabile Stufe.
  // aufloesung: 50/50 endet auf Grundton (aufgelöst) vs. instabil (offen).
  const isHome = Math.random() < 0.5
  const offset = isHome ? 0 : UNSTABLE[rint(UNSTABLE.length)]
  return { root, stage, offset, candidates: [], tonicIndex: 0 }
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

export default function GrundtonGame({ onExit }: { onExit: () => void }) {
  const statsRef = useRef<Record<Stage, StageStat>>({
    erkennen: freshStat(),
    aufloesung: freshStat(),
    finden: freshStat(),
  })
  const stageRef = useRef<Stage>('erkennen')
  const roundRef = useRef<Round>(genRound('erkennen'))
  const awaitingRef = useRef(false)
  const playingRef = useRef(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const [snap, setSnap] = useState<Snapshot>({
    stage: 'erkennen',
    acc: 0,
    samples: 0,
    passed: { erkennen: false, aufloesung: false, finden: false },
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
        erkennen: statsRef.current.erkennen.passed,
        aufloesung: statsRef.current.aufloesung.passed,
        finden: statsRef.current.finden.passed,
      },
    })
  }, [])

  // Eine Tonfolge abspielen (attack/release über Timer).
  const playSequence = useCallback(
    (events: SeqEvent[]) => {
      clearTimers()
      void ensureAudioStarted().then(() => {
        setPlaying(true)
        playingRef.current = true
        let last = 0
        events.forEach((ev) => {
          ev.notes.forEach((m) => {
            timersRef.current.push(setTimeout(() => attack(m, 0.7), ev.at))
            timersRef.current.push(setTimeout(() => release(m), ev.at + ev.hold))
          })
          last = Math.max(last, ev.at + ev.hold)
        })
        timersRef.current.push(
          setTimeout(() => {
            setPlaying(false)
            playingRef.current = false
          }, last),
        )
      })
    },
    [clearTimers],
  )

  // Die Tonfolge der aktuellen Runde aufbauen.
  const buildSequence = useCallback((r: Round): SeqEvent[] => {
    if (r.stage === 'finden') {
      const events = cadence(r.root)
      let at = cadenceEnd() + 350
      r.candidates.forEach((off) => {
        events.push({ notes: [r.root + 12 + off], at, hold: 560 })
        at += 760
      })
      return events
    }
    if (r.stage === 'aufloesung') {
      // Tonika kurz, dann eine kleine Phrase, die auf der Zielstufe endet.
      const events: SeqEvent[] = [{ notes: [r.root, r.root + 4, r.root + 7], at: 0, hold: 360 }]
      const approach = r.offset === 0 ? [4, 2] : r.offset === 11 ? [9, 7] : [5, 4]
      let at = 560
      approach.forEach((off) => {
        events.push({ notes: [r.root + 12 + off], at, hold: 300 })
        at += 360
      })
      events.push({ notes: [r.root + 12 + r.offset], at, hold: 700 })
      return events
    }
    // erkennen: Kadenz, dann ein Testton.
    const events = cadence(r.root)
    events.push({ notes: [r.root + 12 + r.offset], at: cadenceEnd() + 380, hold: 760 })
    return events
  }, [])

  const playRound = useCallback(() => {
    playSequence(buildSequence(roundRef.current))
  }, [playSequence, buildSequence])

  const nextRound = useCallback(() => {
    roundRef.current = genRound(stageRef.current, roundRef.current.root)
    awaitingRef.current = true
    setFeedback(null)
    playRound()
  }, [playRound])

  const passedFor = (st: StageStat, stage: Stage) => {
    const n = st.results.length
    const acc = n ? st.results.filter(Boolean).length / n : 0
    // „finden" ist 1-aus-3 (weniger Glück) → etwas niedrigere Schwelle.
    const need = stage === 'finden' ? 0.7 : 0.8
    return n >= 10 && acc >= need && st.level >= 0.7
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

      if (!st.passed && passedFor(st, s)) {
        st.passed = true
        const idx = STAGE_ORDER.indexOf(s)
        if (idx < STAGE_ORDER.length - 1) stageRef.current = STAGE_ORDER[idx + 1]
      }
      refresh()
    },
    [refresh],
  )

  // Antwort für erkennen/aufloesung (Ja/Nein) oder finden (Index).
  const answer = useCallback(
    (value: 'ja' | 'nein' | number) => {
      if (!awaitingRef.current || playingRef.current) return
      const r = roundRef.current
      awaitingRef.current = false
      let ok: boolean
      let text: string
      if (r.stage === 'finden') {
        ok = value === r.tonicIndex
        text = ok ? `Richtig — Ton ${r.tonicIndex + 1} war der Grundton` : `War: Ton ${r.tonicIndex + 1}`
      } else {
        const isHome = r.offset === 0
        ok = (value === 'ja') === isHome
        if (r.stage === 'erkennen') {
          text = isHome ? 'Richtig — das war der Grundton' : `War: nicht der Grundton — ${STUFE_NAME[r.offset]}`
          if (ok && !isHome) text = `Richtig — ${STUFE_NAME[r.offset]}, nicht der Grundton`
        } else {
          text = isHome ? 'Richtig — aufgelöst, zu Hause' : `War: offen — endet auf ${STUFE_NAME[r.offset]}`
          if (ok && !isHome) text = `Richtig — offen, endet auf ${STUFE_NAME[r.offset]}`
        }
      }
      setFeedback({ kind: ok ? 'hit' : 'miss', text })
      record(ok)
      timersRef.current.push(setTimeout(() => nextRound(), ok ? 850 : 1700))
    },
    [record, nextRound],
  )

  useEffect(() => {
    nextRound()
    refresh()
    return () => clearTimers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fortschritt fürs Lernziel gs festhalten (lokal, nur höchste Stufe).
  const recordLevel = useProgressStore((s) => s.recordLevel)
  useEffect(() => {
    if (snap.passed.erkennen) recordLevel('gs', 'erreicht')
    if (snap.passed.aufloesung) recordLevel('gs', 'verinnerlicht')
    if (snap.passed.finden) recordLevel('gs', 'gemeistert')
  }, [snap, recordLevel])

  const handleRestart = () => {
    clearTimers()
    statsRef.current = { erkennen: freshStat(), aufloesung: freshStat(), finden: freshStat() }
    stageRef.current = 'erkennen'
    nextRound()
    refresh()
  }

  const stage = snap.stage
  const prompt =
    stage === 'erkennen'
      ? 'Ist der letzte Ton der Grundton (Zuhause)?'
      : stage === 'aufloesung'
        ? 'Ist die Phrase „zu Hause" angekommen?'
        : 'Welcher der drei Töne ist der Grundton?'

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
        <h2 className="font-display text-3xl text-amber-soft">Grundton-Ohr</h2>
        <div className="flex items-center gap-4 text-sm text-bone/60">
          <span className="tabular-nums" title="Trefferquote dieser Stufe">
            {snap.samples ? Math.round(snap.acc * 100) : 0}% richtig
          </span>
          <span className="rounded-full border border-bone/15 px-2.5 py-0.5" title="Aktuelle Stufe">
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

        <p className="text-center text-sm text-bone/55">{prompt}</p>

        {stage === 'finden' ? (
          <div className="flex gap-4">
            {[0, 1, 2].map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => answer(i)}
                disabled={playing}
                className="ease-soft flex min-w-[96px] flex-col items-center gap-1 rounded-xl border border-bone/15 bg-ink-700/50 px-6 py-4 text-bone/85 transition-all hover:-translate-y-0.5 hover:border-amber-glow/50 hover:text-amber-soft disabled:opacity-40"
              >
                <span className="font-display text-2xl">{i + 1}</span>
                <span className="text-xs text-bone/50">{i + 1}. Ton</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex gap-4">
            {(['ja', 'nein'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => answer(v)}
                disabled={playing}
                className="ease-soft flex min-w-[128px] flex-col items-center gap-1 rounded-xl border border-bone/15 bg-ink-700/50 px-7 py-4 text-bone/85 transition-all hover:-translate-y-0.5 hover:border-amber-glow/50 hover:text-amber-soft disabled:opacity-40"
              >
                <span className="text-3xl">{v === 'ja' ? '🏠' : '↗'}</span>
                <span className="font-display text-xl">{v === 'ja' ? 'Zuhause' : 'Offen'}</span>
                <span className="text-xs text-bone/50">
                  {stage === 'erkennen'
                    ? v === 'ja'
                      ? 'der Grundton'
                      : 'eine andere Stufe'
                    : v === 'ja'
                      ? 'aufgelöst'
                      : 'hängt noch'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Skala: erreicht / verinnerlicht / gemeistert */}
      <div className="lq-hide flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-sm">
          {(
            [
              ['erreicht', snap.passed.erkennen, 'Grundton erkennen: nach einer Kadenz den Grundton sicher heraushören'],
              ['verinnerlicht', snap.passed.aufloesung, 'Auflösung hören: spüren, ob eine Phrase zu Hause ankommt oder offen bleibt'],
              ['gemeistert', snap.passed.finden, 'Grundton finden: aus drei Tönen den Grundton heraushören = Checkpoint erfüllt'],
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
        Der Grundton ist der Ton, auf dem ein Lied ruht — er klingt nach „angekommen".
        Erst etabliert eine kleine Kadenz das Zuhause, dann hörst du hin. Die Stufen
        werden feiner, je sicherer du wirst. Kein Zeitdruck, keine Punkte.
      </p>
    </div>
  )
}
