import { useCallback, useEffect, useRef, useState } from 'react'
import { attack, ensureAudioStarted, release } from '../audio/pianoSampler'
import { useProgressStore } from '../state/progressStore'

// Puls-Tapper — das Timing-Mikro-Spiel auf dem Koordinations-Band (kp).
// Ein Metronom klopft im 4/4, du tippst auf den Schlag. Das Spiel zeigt,
// ob du zu früh, zu spät oder genau drauf warst (in ms) — und wird
// schneller, je sicherer dein Puls sitzt.
//
// Drei Stufen erreicht→verinnerlicht→gemeistert (über das Tempo):
//   1. 70 BPM  — langsam, viel Zeit          (erreicht)
//   2. 100 BPM — mittel, Songtempo            (verinnerlicht)
//   3. 132 BPM — flott, da muss der Puls sitzen (gemeistert)
//
// Feedback informiert (früh/spät/genau in ms), bewertet nie. Keine Punkte.

type Stage = 'langsam' | 'mittel' | 'flott'

const STAGE_ORDER: Stage[] = ['langsam', 'mittel', 'flott']
const STAGE_LABEL: Record<Stage, string> = {
  langsam: '70 BPM',
  mittel: '100 BPM',
  flott: '132 BPM',
}
const STAGE_BPM: Record<Stage, number> = {
  langsam: 70,
  mittel: 100,
  flott: 132,
}

const HIT = '#9bb88a'
const MISS = '#cf7d6b'

// Metronom-Klick: kurzer, hoher Ton; Schlag 1 etwas heller akzentuiert.
const CLICK_ACCENT = 88
const CLICK_BEAT = 84

interface StageStat {
  results: boolean[]
  passed: boolean
}
const freshStat = (): StageStat => ({ results: [], passed: false })

interface Snapshot {
  stage: Stage
  acc: number
  samples: number
  passed: Record<Stage, boolean>
}

export default function PulsGame({ onExit }: { onExit: () => void }) {
  const statsRef = useRef<Record<Stage, StageStat>>({
    langsam: freshStat(),
    mittel: freshStat(),
    flott: freshStat(),
  })
  const stageRef = useRef<Stage>('langsam')
  const periodRef = useRef(60000 / STAGE_BPM.langsam)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const beatsRef = useRef<number[]>([]) // jüngste Klick-Zeitpunkte (performance.now)
  const beatIdxRef = useRef(0)

  const [snap, setSnap] = useState<Snapshot>({
    stage: 'langsam',
    acc: 0,
    samples: 0,
    passed: { langsam: false, mittel: false, flott: false },
  })
  const [running, setRunning] = useState(false)
  const [pulse, setPulse] = useState(-1)
  const [feedback, setFeedback] = useState<{ kind: 'hit' | 'miss'; text: string } | null>(null)

  const refresh = useCallback(() => {
    const s = stageRef.current
    const st = statsRef.current[s]
    const n = st.results.length
    setSnap({
      stage: s,
      acc: n ? st.results.filter(Boolean).length / n : 0,
      samples: n,
      passed: {
        langsam: statsRef.current.langsam.passed,
        mittel: statsRef.current.mittel.passed,
        flott: statsRef.current.flott.passed,
      },
    })
  }, [])

  const playClick = useCallback((accent: boolean) => {
    const n = accent ? CLICK_ACCENT : CLICK_BEAT
    void ensureAudioStarted().then(() => {
      attack(n, accent ? 0.6 : 0.4)
      setTimeout(() => release(n), 70)
    })
  }, [])

  const stopMetronome = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setRunning(false)
    setPulse(-1)
  }, [])

  const startMetronome = useCallback(() => {
    if (intervalRef.current !== null) clearInterval(intervalRef.current)
    beatsRef.current = []
    beatIdxRef.current = 0
    const period = periodRef.current
    const tick = () => {
      const now = performance.now()
      const beat = beatIdxRef.current % 4
      playClick(beat === 0)
      beatsRef.current.push(now)
      if (beatsRef.current.length > 8) beatsRef.current.shift()
      setPulse(beat)
      beatIdxRef.current++
    }
    tick() // sofort den ersten Schlag
    intervalRef.current = setInterval(tick, period)
    setRunning(true)
  }, [playClick])

  const passedFor = (st: StageStat) => {
    const n = st.results.length
    const acc = n ? st.results.filter(Boolean).length / n : 0
    return n >= 12 && acc >= 0.8
  }

  const advanceIfReady = useCallback(() => {
    const s = stageRef.current
    const st = statsRef.current[s]
    if (!st.passed && passedFor(st)) {
      st.passed = true
      const idx = STAGE_ORDER.indexOf(s)
      if (idx < STAGE_ORDER.length - 1) {
        const next = STAGE_ORDER[idx + 1]
        stageRef.current = next
        periodRef.current = 60000 / STAGE_BPM[next]
        startMetronome() // neues Tempo, frischer Puls
      }
    }
  }, [startMetronome])

  const onTap = useCallback(() => {
    const beats = beatsRef.current
    if (!beats.length) return
    const now = performance.now()
    const period = periodRef.current
    // Kandidaten: alle gehörten Schläge + der nächste erwartete (für „leicht zu früh").
    const candidates = [...beats, beats[beats.length - 1] + period]
    let best = candidates[0]
    for (const t of candidates) {
      if (Math.abs(now - t) < Math.abs(now - best)) best = t
    }
    if (Math.abs(now - best) > period * 0.6) return // kein Schlag in der Nähe
    const off = now - best // + = zu spät, − = zu früh
    const ok = Math.abs(off) <= period * 0.3
    let text: string
    if (Math.abs(off) <= period * 0.12) text = 'genau auf dem Schlag'
    else if (off < 0) text = `${Math.round(-off)} ms zu früh`
    else text = `${Math.round(off)} ms zu spät`
    setFeedback({ kind: ok ? 'hit' : 'miss', text })

    const s = stageRef.current
    const st = statsRef.current[s]
    st.results.push(ok)
    if (st.results.length > 20) st.results.shift()
    advanceIfReady()
    refresh()
  }, [advanceIfReady, refresh])

  // Metronom beim Öffnen starten, beim Schließen sauber stoppen.
  useEffect(() => {
    startMetronome()
    refresh()
    return () => stopMetronome()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Leertaste / Enter zum Tippen (zusätzlich zum Button).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault()
        onTap()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onTap])

  // Fortschritt fürs Lernziel pt festhalten (lokal, nur höchste Stufe).
  const recordLevel = useProgressStore((s) => s.recordLevel)
  useEffect(() => {
    if (snap.passed.langsam) recordLevel('pt', 'erreicht')
    if (snap.passed.mittel) recordLevel('pt', 'verinnerlicht')
    if (snap.passed.flott) recordLevel('pt', 'gemeistert')
  }, [snap, recordLevel])

  const handleRestart = () => {
    statsRef.current = { langsam: freshStat(), mittel: freshStat(), flott: freshStat() }
    stageRef.current = 'langsam'
    periodRef.current = 60000 / STAGE_BPM.langsam
    setFeedback(null)
    startMetronome()
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
        <h2 className="font-display text-3xl text-amber-soft">Puls-Tapper</h2>
        <div className="flex items-center gap-4 text-sm text-bone/60">
          <span className="tabular-nums" title="Anteil Treffer dieser Stufe">
            {snap.samples ? Math.round(snap.acc * 100) : 0}% im Takt
          </span>
          <span
            className="rounded-full border border-bone/15 px-2.5 py-0.5"
            title="Aktuelles Tempo"
          >
            {STAGE_LABEL[stage]}
          </span>
        </div>
      </div>

      {/* Spielfeld */}
      <div className="relative mx-auto flex w-full max-w-2xl flex-col items-center gap-6 rounded-xl bg-ink-800/40 p-6 ring-1 ring-black/40">
        {/* Puls-Punkte: 4/4, Schlag 1 hervorgehoben */}
        <div className="flex items-center gap-4">
          {[0, 1, 2, 3].map((b) => {
            const on = pulse === b
            return (
              <span
                key={b}
                className="ease-soft rounded-full transition-all"
                style={{
                  width: b === 0 ? 22 : 16,
                  height: b === 0 ? 22 : 16,
                  background: on ? '#e0b15e' : 'rgba(239,230,214,0.16)',
                  transform: on ? 'scale(1.25)' : 'scale(1)',
                  boxShadow: on ? '0 0 14px rgba(224,177,94,0.6)' : 'none',
                }}
              />
            )
          })}
        </div>

        <div className="flex h-7 items-center justify-center text-base font-medium" aria-live="polite">
          {feedback && (
            <span style={{ color: feedback.kind === 'hit' ? HIT : MISS }}>
              {feedback.kind === 'hit' ? '✓ ' : '○ '}
              {feedback.text}
            </span>
          )}
        </div>

        {/* Tap-Fläche */}
        <button
          type="button"
          onClick={onTap}
          className="ease-soft flex h-40 w-40 items-center justify-center rounded-full border-2 border-amber-glow/40 bg-ink-700/60 font-display text-2xl text-amber-soft transition-all hover:border-amber-glow hover:bg-ink-600 active:scale-95"
        >
          TAP
        </button>

        <p className="text-center text-sm text-bone/55">
          Tippe auf jeden Schlag — Knopf, Leertaste oder Enter.
        </p>

        <button
          type="button"
          onClick={() => (running ? stopMetronome() : startMetronome())}
          className="ease-soft rounded-full border border-bone/15 px-5 py-2 text-base text-bone/70 transition-colors hover:border-amber-glow/50 hover:text-amber-soft"
        >
          {running ? '⏸ Metronom aus' : '▶ Metronom an'}
        </button>
      </div>

      {/* Skala */}
      <div className="lq-hide flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-sm">
          {(
            [
              ['erreicht', snap.passed.langsam, '70 BPM sicher im Takt'],
              ['verinnerlicht', snap.passed.mittel, '100 BPM (Songtempo) sicher dazu'],
              ['gemeistert', snap.passed.flott, 'Auch flotte 132 BPM sitzen = Checkpoint erfüllt'],
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
        Der gleichmäßige Puls ist das Fundament jeder Begleitung — er läuft nebenher
        unter allem mit. Kein Zeitdruck im Sinne von Punkten: nur du und der Schlag.
      </p>
    </div>
  )
}
