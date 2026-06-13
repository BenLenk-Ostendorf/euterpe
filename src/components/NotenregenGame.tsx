import { useEffect, useRef, useState } from 'react'
import { onNoteOn, playNote, stopNote } from '../audio/notePlayer'
import { useSessionStore } from '../state/sessionStore'
import { NOTE_NAMES } from '../music/theory'

// Notenregen — Gameloop für das Lernziel "Du kannst jede Taste benennen".
// Tonnamen fallen in der Spur ihrer Taste herab; erreicht ein Name die
// Trefferlinie, drückt man die Taste. Die Messung steckt im Spiel: aus den
// laufenden Treffern steuert sich der Schwierigkeitsgrad ("spielen bis es
// passt"). Feedback informiert eindeutig, bewertet aber nie — keine Punkte,
// keine Konsequenzen.

const OCTAVE_BASE = 60 // C4
const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11]
const BLACK_PCS = [1, 3, 6, 8, 10]
const isWhitePc = (pc: number) => WHITE_PCS.includes(pc)

const GOLD = '#e0b15e'
const HIT = '#9bb88a'
const MISS = '#cf7d6b'

// Wie viele weiße Tasten vor dieser Pitch-Class in der Oktave liegen
// (für die Position der schwarzen Tasten zwischen den weißen).
function whitesBefore(pc: number): number {
  let n = 0
  for (let p = 0; p < pc; p++) if (isWhitePc(p)) n++
  return n
}

const WHITE_W = 100 / WHITE_PCS.length

// Mittelpunkt der Spur einer Pitch-Class (in % der Klaviaturbreite).
function laneCenter(pc: number): number {
  if (isWhitePc(pc)) {
    const wi = WHITE_PCS.indexOf(pc)
    return (wi + 0.5) * WHITE_W
  }
  return whitesBefore(pc) * WHITE_W
}

type Resolved = null | 'hit' | 'wrong' | 'miss'
interface Tile {
  id: number
  pc: number
  spawn: number
  fall: number // ms bis zur Trefferlinie (bei Spawn eingefroren)
  resolved: Resolved
  resolvedAt: number
}

interface Flash {
  type: 'hit' | 'wrong' | 'miss'
  until: number
}

// Render-fertige Momentaufnahme (entkoppelt die Simulation vom Zeichnen).
interface TileView {
  id: number
  pc: number
  topPct: number
  bg: string
  border: string
  color: string
  opacity: number
  scale: number
}
interface RenderState {
  tiles: TileView[]
  flashes: Record<number, string>
}

interface Stats {
  accuracy: number
  samples: number
  level: number
  phase: number
  flow: boolean[]
  erreicht: boolean
  verinnerlicht: boolean
  gemeistert: boolean
}

// Tempo (0..1) -> Falldauer und Spawn-Abstand.
const fallDurationFor = (lvl: number) => 3000 - lvl * 1300 // 3.0s … 1.7s
const spawnIntervalFor = (lvl: number) => 1700 - lvl * 850 // 1.7s … 0.85s

// Tastenumfang wächst stufenweise: erst weiß, dann zwei Landmarken-Schwarze
// (C#, F#), dann alle. Bei jedem Schritt wird das Tempo wieder gedrosselt,
// damit die neuen Tasten nicht zugleich mit hohem Tempo kommen.
const BLACK_STEP1 = [1, 6] // C#, F#
function poolForPhase(phase: number): number[] {
  if (phase <= 0) return WHITE_PCS
  if (phase === 1) return [...WHITE_PCS, ...BLACK_STEP1]
  return [...WHITE_PCS, ...BLACK_PCS]
}
const PHASE_LABEL = ['weiße Tasten', 'weiß + 2 schwarze', 'alle Tasten']

export default function NotenregenGame({ onExit }: { onExit: () => void }) {
  const activeNotes = useSessionStore((s) => s.activeNotes)

  // Veränderlicher Spielzustand in Refs (gehört nicht ins Rendering).
  const tilesRef = useRef<Tile[]>([])
  const flashesRef = useRef<Map<number, Flash>>(new Map())
  const resultsRef = useRef<boolean[]>([])
  const seenHitsRef = useRef<Set<number>>(new Set())
  const levelRef = useRef(0) // Tempo innerhalb der aktuellen Phase
  const phaseRef = useRef(0) // Tastenumfang-Stufe (0=weiß, 1=+2 schwarz, 2=alle)
  const nextSpawnRef = useRef(0)
  const lastPcRef = useRef(-1)
  const idRef = useRef(0)
  const pausedRef = useRef(false)

  const [render, setRender] = useState<RenderState>({ tiles: [], flashes: {} })
  const [paused, setPaused] = useState(false)
  const [stats, setStats] = useState<Stats>({
    accuracy: 0,
    samples: 0,
    level: 0,
    phase: 0,
    flow: [],
    erreicht: false,
    verinnerlicht: false,
    gemeistert: false,
  })

  // Animationsschleife + Eingabe: einmal aufsetzen, läuft über Refs.
  useEffect(() => {
    const recomputeStats = () => {
      const results = resultsRef.current
      const samples = results.length
      const accuracy = samples ? results.filter(Boolean).length / samples : 0
      const lvl = levelRef.current
      const phase = phaseRef.current
      const erreicht = WHITE_PCS.every((pc) => seenHitsRef.current.has(pc))
      const verinnerlicht = samples >= 16 && accuracy >= 0.85 && phase >= 1
      const gemeistert =
        samples >= 16 && accuracy >= 0.9 && phase >= 2 && lvl >= 0.8
      setStats({
        accuracy,
        samples,
        level: lvl,
        phase,
        flow: results.slice(-10),
        erreicht,
        verinnerlicht,
        gemeistert,
      })
    }

    const record = (ok: boolean) => {
      const r = resultsRef.current
      r.push(ok)
      if (r.length > 24) r.shift()
      const recent = r.slice(-8)
      if (recent.length >= 6) {
        const rate = recent.filter(Boolean).length / recent.length
        if (rate > 0.85) levelRef.current = Math.min(1, levelRef.current + 0.06)
        else if (rate < 0.6)
          levelRef.current = Math.max(0, levelRef.current - 0.08)
        // Sitzt die aktuelle Tastengruppe schnell, kommen neue Tasten dazu —
        // und das Tempo wird dafür wieder gedrosselt (kein Doppel-Sprung).
        if (phaseRef.current < 2 && levelRef.current >= 0.9 && rate > 0.85) {
          phaseRef.current += 1
          levelRef.current = 0.3
        }
      }
      recomputeStats()
    }

    const flash = (pc: number, type: Flash['type'], now: number) => {
      flashesRef.current.set(pc, {
        type,
        until: now + (type === 'hit' ? 280 : 460),
      })
    }

    const unsub = onNoteOn((midi, now) => {
      if (pausedRef.current) return
      const pc = ((midi % 12) + 12) % 12
      const cands = tilesRef.current
        .filter((t) => !t.resolved)
        .map((t) => ({ t, prog: (now - t.spawn) / t.fall }))
        .filter((x) => x.prog > 0.15 && x.prog < 1.12)
      if (cands.length === 0) return // freies Ausprobieren -> kein Fehler
      const match = cands
        .filter((x) => x.t.pc === pc)
        .sort((a, b) => b.prog - a.prog)[0]
      if (match) {
        match.t.resolved = 'hit'
        match.t.resolvedAt = now
        seenHitsRef.current.add(pc)
        flash(pc, 'hit', now)
        record(true)
      } else {
        flash(pc, 'wrong', now)
        record(false)
      }
    })

    let raf = 0
    nextSpawnRef.current = performance.now() + 600
    const loop = (now: number) => {
      if (!pausedRef.current) {
        const lvl = levelRef.current
        while (now >= nextSpawnRef.current && tilesRef.current.length < 5) {
          const pool = poolForPhase(phaseRef.current)
          const falling = new Set(
            tilesRef.current.filter((t) => !t.resolved).map((t) => t.pc),
          )
          let pc = pool[Math.floor(Math.random() * pool.length)]
          let guard = 0
          while ((pc === lastPcRef.current || falling.has(pc)) && guard < 8) {
            pc = pool[Math.floor(Math.random() * pool.length)]
            guard++
          }
          lastPcRef.current = pc
          tilesRef.current.push({
            id: idRef.current++,
            pc,
            spawn: now,
            fall: fallDurationFor(lvl),
            resolved: null,
            resolvedAt: 0,
          })
          nextSpawnRef.current += spawnIntervalFor(lvl)
        }
        for (const t of tilesRef.current) {
          if (!t.resolved && (now - t.spawn) / t.fall > 1.12) {
            t.resolved = 'miss'
            t.resolvedAt = now
            flash(t.pc, 'miss', now)
            record(false)
          }
        }
        tilesRef.current = tilesRef.current.filter(
          (t) => !t.resolved || now - t.resolvedAt < 300,
        )

        // Momentaufnahme fürs Rendering bauen.
        const tiles: TileView[] = tilesRef.current.map((t) => {
          const prog = Math.min(1.12, (now - t.spawn) / t.fall)
          let bg = 'rgba(36,29,24,0.92)'
          let border = 'rgba(239,230,214,0.18)'
          let color = '#efe6d6'
          if (isWhitePc(t.pc) && prog > 0.55 && !t.resolved) {
            const k = Math.min(1, (prog - 0.55) / 0.45)
            border = GOLD
            color = '#f0d49a'
            bg = `rgba(224,177,94,${(0.08 + k * 0.14).toFixed(3)})`
          }
          if (t.resolved === 'hit') {
            bg = 'rgba(155,184,138,0.25)'
            border = HIT
            color = HIT
          } else if (t.resolved === 'wrong' || t.resolved === 'miss') {
            bg = 'rgba(207,125,107,0.22)'
            border = MISS
            color = MISS
          }
          const opacity = t.resolved
            ? Math.max(0, 1 - (now - t.resolvedAt) / 300)
            : 1
          const scale = t.resolved === 'hit' ? 1 + (1 - opacity) * 0.5 : 1
          return {
            id: t.id,
            pc: t.pc,
            topPct: Math.min(prog, 1) * 100,
            bg,
            border,
            color,
            opacity,
            scale,
          }
        })
        const flashes: Record<number, string> = {}
        flashesRef.current.forEach((f, pc) => {
          if (now <= f.until) flashes[pc] = f.type === 'hit' ? HIT : MISS
        })
        setRender({ tiles, flashes })
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      unsub()
    }
  }, [])

  const togglePause = () => {
    const next = !pausedRef.current
    pausedRef.current = next
    setPaused(next)
    if (!next) nextSpawnRef.current = performance.now() + 400
  }

  // Frisch anfangen: allen Spielzustand zurücksetzen (auch die Stufen).
  const handleRestart = () => {
    tilesRef.current = []
    flashesRef.current.clear()
    resultsRef.current = []
    seenHitsRef.current.clear()
    levelRef.current = 0
    phaseRef.current = 0
    lastPcRef.current = -1
    idRef.current = 0
    nextSpawnRef.current = performance.now() + 600
    pausedRef.current = false
    setPaused(false)
    setRender({ tiles: [], flashes: {} })
    setStats({
      accuracy: 0,
      samples: 0,
      level: 0,
      phase: 0,
      flow: [],
      erreicht: false,
      verinnerlicht: false,
      gemeistert: false,
    })
  }

  const handleDown = (pc: number) => (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    playNote(OCTAVE_BASE + pc)
  }
  const handleUp = (pc: number) => () => stopNote(OCTAVE_BASE + pc)

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Kopfzeile: zurück, Titel, Fluss + Quote + Niveau */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onExit}
          className="ease-soft rounded-full border border-bone/15 px-4 py-2 text-base text-bone/70 transition-colors hover:border-amber-glow/50 hover:text-amber-soft"
        >
          ← Lernpfad
        </button>
        <h2 className="font-display text-3xl text-amber-soft">Tasten-Trainer</h2>
        <div className="flex items-center gap-5 text-sm text-bone/60">
          <span
            className="flex items-center gap-1"
            title="Fluss: letzte 10 Anschläge"
          >
            {Array.from({ length: 10 }).map((_, i) => {
              const v = stats.flow[i]
              return (
                <span
                  key={i}
                  className="inline-block h-3.5 w-2.5 rounded-sm"
                  style={{
                    background:
                      v === undefined
                        ? 'rgba(239,230,214,0.15)'
                        : v
                          ? GOLD
                          : MISS,
                  }}
                />
              )
            })}
          </span>
          <span className="tabular-nums">
            {stats.samples ? Math.round(stats.accuracy * 100) : 0}% richtig
          </span>
          <span className="flex items-center gap-1.5" title="Tempo">
            Tempo
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{
                  background:
                    stats.level * 5 > i ? GOLD : 'rgba(239,230,214,0.18)',
                }}
              />
            ))}
          </span>
          <span
            className="rounded-full border border-bone/15 px-2.5 py-0.5"
            title="Aktueller Tastenumfang — wächst stufenweise"
          >
            {PHASE_LABEL[stats.phase]}
          </span>
        </div>
      </div>

      {/* Spielfeld + Klaviatur */}
      <div className="relative mx-auto w-full max-w-3xl rounded-xl bg-ink-800/40 p-3 ring-1 ring-black/40 sm:p-4">
        {/* Fallbahn */}
        <div className="relative h-44 w-full overflow-hidden sm:h-52">
          <div
            className="absolute bottom-0 left-0 right-0"
            style={{ height: 2, background: GOLD, opacity: 0.55 }}
          />
          {render.tiles.map((t) => (
            <div
              key={t.id}
              className="absolute flex items-center justify-center rounded-lg text-lg font-medium"
              style={{
                left: `${laneCenter(t.pc)}%`,
                top: `calc(${t.topPct}% - 22px)`,
                transform: `translateX(-50%) scale(${t.scale})`,
                width: 54,
                height: 44,
                background: t.bg,
                border: `1px solid ${t.border}`,
                color: t.color,
                opacity: t.opacity,
              }}
            >
              {NOTE_NAMES[t.pc]}
            </div>
          ))}
        </div>

        {/* Klaviatur (eine Oktave C4–B4) */}
        <div
          className="relative mt-2 h-40 w-full select-none sm:h-48"
          style={{ touchAction: 'none' }}
        >
          {WHITE_PCS.map((pc, wi) => {
            const active = activeNotes.has(OCTAVE_BASE + pc)
            const fc = render.flashes[pc]
            return (
              <button
                key={pc}
                type="button"
                aria-label={NOTE_NAMES[pc]}
                onPointerDown={handleDown(pc)}
                onPointerUp={handleUp(pc)}
                onPointerLeave={handleUp(pc)}
                onPointerCancel={handleUp(pc)}
                className="ease-soft absolute bottom-0 top-0 flex items-end justify-center rounded-b-md border border-black/40 pb-2 transition-[transform,box-shadow] duration-100"
                style={{
                  left: `${wi * WHITE_W}%`,
                  width: `${WHITE_W}%`,
                  zIndex: 1,
                  background: fc
                    ? fc
                    : active
                      ? 'linear-gradient(180deg,#f6ecd8,#e9d9b8)'
                      : 'linear-gradient(180deg,#fbf6ec,#e7ddca)',
                  boxShadow: active
                    ? 'inset 0 -3px 10px rgba(176,130,52,0.45)'
                    : 'inset 0 -4px 8px rgba(0,0,0,0.18)',
                  transform: active ? 'translateY(1.5px)' : 'none',
                }}
              >
                <span className="pointer-events-none text-sm font-medium text-ink-700/60">
                  {NOTE_NAMES[pc]}
                </span>
              </button>
            )
          })}
          {BLACK_PCS.map((pc) => {
            const left = whitesBefore(pc) * WHITE_W - (WHITE_W * 0.62) / 2
            const active = activeNotes.has(OCTAVE_BASE + pc)
            const fc = render.flashes[pc]
            return (
              <button
                key={pc}
                type="button"
                aria-label={NOTE_NAMES[pc]}
                onPointerDown={handleDown(pc)}
                onPointerUp={handleUp(pc)}
                onPointerLeave={handleUp(pc)}
                onPointerCancel={handleUp(pc)}
                className="ease-soft absolute top-0 flex items-end justify-center rounded-b-md transition-[transform,box-shadow] duration-100"
                style={{
                  left: `${left}%`,
                  width: `${WHITE_W * 0.62}%`,
                  height: '62%',
                  zIndex: 2,
                  background: fc
                    ? fc
                    : active
                      ? 'linear-gradient(180deg,#5a4628,#3a2c16)'
                      : 'linear-gradient(180deg,#2a2420,#0c0a08)',
                  border: '1px solid #000',
                  boxShadow: active
                    ? '0 0 14px rgba(224,177,94,0.5)'
                    : '0 3px 5px rgba(0,0,0,0.5)',
                  transform: active ? 'translateY(1.5px)' : 'none',
                }}
              >
                <span className="pointer-events-none mb-1 text-xs font-medium text-bone/70">
                  {NOTE_NAMES[pc]}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Stufen + Steuerung */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-sm">
          {(
            [
              ['erreicht', stats.erreicht, 'Jeden weißen Ton einmal getroffen'],
              ['verinnerlicht', stats.verinnerlicht, '≥ 85 % über eine Serie'],
              ['gemeistert', stats.gemeistert, 'Schnell & mit schwarzen Tasten'],
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRestart}
            className="ease-soft rounded-full border border-bone/15 px-5 py-2 text-base text-bone/70 transition-colors hover:border-amber-glow/50 hover:text-amber-soft"
          >
            ↻ Neu starten
          </button>
          <button
            type="button"
            onClick={togglePause}
            className="ease-soft rounded-full border border-amber-glow/40 bg-ink-700/60 px-5 py-2 text-base text-amber-soft transition-colors hover:border-amber-glow hover:bg-ink-600/80"
          >
            {paused ? 'Weiter' : 'Pause'}
          </button>
        </div>
      </div>

      <p className="text-center text-sm text-bone/45">
        Spiel die Taste, deren Name die Linie erreicht. Läuft es rund, wird der
        Regen schneller; sitzt eine Tastengruppe, kommen neue Tasten dazu — und
        das Tempo wird dafür erst mal wieder ruhiger.
      </p>
    </div>
  )
}
