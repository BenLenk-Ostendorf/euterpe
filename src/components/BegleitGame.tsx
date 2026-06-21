import { useCallback, useEffect, useRef, useState } from 'react'
import { onNoteOn, playNote, stopNote } from '../audio/notePlayer'
import { attack, ensureAudioStarted, release } from '../audio/pianoSampler'
import { useSessionStore } from '../state/sessionStore'
import { useProgressStore } from '../state/progressStore'
import { midiToName } from '../music/theory'
import {
  SONGS,
  songById,
  chordPcs,
  chordTriadMidi,
  type SongChord,
} from '../music/songs'
import KeyboardViewport from './KeyboardViewport'

// Begleit-Tapper — Challenge für Node ak2 „Im 4/4 begleiten" (und das kleine
// Ziel goal-kadenz „Kadenz-Loop"). Ein Metronom läuft; pro Takt ein Akkord.
// Auf die Eins greifst du den aktuellen Akkord und wechselst rechtzeitig zum
// nächsten. Das ist die Pareto-Fähigkeit: Akkorde im Puls begleiten.
//
// ZWEI MODI:
//   • Übung (I·IV·V) — die gewertete Leiter erreicht→verinnerlicht→gemeistert,
//     die den Checkpoint ak2 setzt (langsam → mittel → flott).
//   • Song — eine ECHTE Akkordfolge aus der Song-Bibliothek (z. B. Song of
//     Storms: i–iv–V in d-Moll, 3/4) als ruhiger Übe-Loop mit Zieltasten.
//     Nicht gewertet — fürs „begleite einen echten Song"-Gefühl.
//
// Baut auf Dreiklang-Griff (Treffer über Tonklassen) + Puls (Timing). Feedback
// informiert (im Takt / etwas spät / falsch), bewertet nie. Kein Punktestand.

type Stage = 'langsam' | 'mittel' | 'flott'

const STAGE_ORDER: Stage[] = ['langsam', 'mittel', 'flott']
const STAGE_LABEL: Record<Stage, string> = {
  langsam: 'langsam · I–V',
  mittel: 'mittel · I–IV–V',
  flott: 'flott · I–IV–V–I',
}
const STAGE_BPM: Record<Stage, number> = { langsam: 66, mittel: 88, flott: 108 }

const HIT = '#9bb88a'
const MISS = '#cf7d6b'
const GOLD = '#e0b15e'

const CLICK_ACCENT = 88
const CLICK_BEAT = 84
const BASE = 60 // C4
const SPAN = 24

const pc = (m: number) => ((m % 12) + 12) % 12
const isWhitePc = (p: number) => [0, 2, 4, 5, 7, 9, 11].includes(p)

// Einheitlicher, schon aufbereiteter Akkord fürs Spiel (egal ob Übung/Song).
interface PlayChord {
  label: string // Anzeigename, z. B. 'C-Dur' / 'd-Moll'
  roman: string
  pcs: Set<number> // Tonklassen — fürs octav-/lage-unabhängige Matchen
  notes: number[] // Grundstellung als MIDI — für die Zieltasten
}

const major = (rootMidi: number, roman: string): PlayChord => ({
  label: `${midiToName(rootMidi)}-Dur`,
  roman,
  pcs: new Set([pc(rootMidi), pc(rootMidi + 4), pc(rootMidi + 7)]),
  notes: [rootMidi, rootMidi + 4, rootMidi + 7],
})
const fromSong = (c: SongChord): PlayChord => ({
  label: c.label,
  roman: c.roman,
  pcs: chordPcs(c),
  notes: chordTriadMidi(c, BASE),
})

// Die gewertete Übung: I·IV·V in C-Dur, drei Stufen.
const UEBUNG: Record<Stage, PlayChord[]> = {
  langsam: [major(60, 'I'), major(67, 'V')],
  mittel: [major(60, 'I'), major(65, 'IV'), major(67, 'V')],
  flott: [major(60, 'I'), major(65, 'IV'), major(67, 'V'), major(60, 'I')],
}

// Modus: 'uebung' (gewertet) oder eine Song-ID aus der Bibliothek.
type Mode = 'uebung' | string

interface ActiveBar {
  chord: PlayChord
  downbeat: number
  pcs: Set<number>
  gripTime: number | null
}

interface StageStat {
  results: boolean[]
  passed: boolean
}
const freshStat = (): StageStat => ({ results: [], passed: false })

interface Snapshot {
  mode: Mode
  isSong: boolean
  label: string // Stufen- bzw. Song-Schild
  acc: number
  samples: number
  passed: Record<Stage, boolean>
}

export default function BegleitGame({ onExit }: { onExit: () => void }) {
  const activeNotes = useSessionStore((s) => s.activeNotes)

  const modeRef = useRef<Mode>('uebung')
  const statsRef = useRef<Record<Stage, StageStat>>({
    langsam: freshStat(),
    mittel: freshStat(),
    flott: freshStat(),
  })
  const songResultsRef = useRef<boolean[]>([]) // ungewerteter Song-Loop (nur Quote)
  const stageRef = useRef<Stage>('langsam')
  const periodRef = useRef(60000 / STAGE_BPM.langsam)
  const beatsRef = useRef(4) // Schläge pro Takt
  const progRef = useRef<PlayChord[]>(UEBUNG.langsam)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const beatIdxRef = useRef(0)
  const barCountRef = useRef(-1)
  const activeBarRef = useRef<ActiveBar | null>(null)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const [snap, setSnap] = useState<Snapshot>({
    mode: 'uebung',
    isSong: false,
    label: STAGE_LABEL.langsam,
    acc: 0,
    samples: 0,
    passed: { langsam: false, mittel: false, flott: false },
  })
  const [running, setRunning] = useState(false)
  const [pulse, setPulse] = useState(-1)
  const [prog, setProg] = useState<PlayChord[]>(UEBUNG.langsam)
  const [cur, setCur] = useState<PlayChord>(UEBUNG.langsam[0])
  const [feedback, setFeedback] = useState<{ kind: 'hit' | 'miss'; text: string } | null>(null)

  const currentSong = () =>
    modeRef.current === 'uebung' ? undefined : songById(modeRef.current)

  const refresh = useCallback(() => {
    const isSong = modeRef.current !== 'uebung'
    const results = isSong
      ? songResultsRef.current
      : statsRef.current[stageRef.current].results
    const n = results.length
    const song = currentSong()
    setSnap({
      mode: modeRef.current,
      isSong,
      label: isSong
        ? song
          ? song.keyLabel
          : 'Song'
        : STAGE_LABEL[stageRef.current],
      acc: n ? results.filter(Boolean).length / n : 0,
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
      attack(n, accent ? 0.5 : 0.32)
      timersRef.current.push(setTimeout(() => release(n), 60))
    })
  }, [])

  const passedFor = (st: StageStat) => {
    const n = st.results.length
    const acc = n ? st.results.filter(Boolean).length / n : 0
    return n >= 12 && acc >= 0.7
  }

  // Einen abgeschlossenen Takt auswerten. Gibt true zurück, wenn dabei das
  // Metronom (Stufenaufstieg) neu gestartet wurde — dann darf tick() nicht
  // weiterlaufen.
  const evaluateBar = useCallback(
    (bar: ActiveBar): boolean => {
      const period = periodRef.current
      const correct = bar.gripTime !== null
      const offset = bar.gripTime !== null ? bar.gripTime - bar.downbeat : Infinity
      const inTime = correct && offset <= period * 0.7
      const ok = correct && inTime
      const name = bar.chord.label
      if (!correct) {
        setFeedback({ kind: 'miss', text: `War: ${bar.chord.roman} = ${name}` })
      } else if (offset <= period * 0.3) {
        setFeedback({ kind: 'hit', text: `${name} — im Takt` })
      } else if (inTime) {
        setFeedback({ kind: 'hit', text: `${name} — etwas spät` })
      } else {
        setFeedback({ kind: 'miss', text: `${name} — zu spät für die Eins` })
      }

      // Song-Modus: nur Quote führen, nicht werten, nicht aufsteigen.
      if (modeRef.current !== 'uebung') {
        const r = songResultsRef.current
        r.push(ok)
        if (r.length > 20) r.shift()
        refresh()
        return false
      }

      const s = stageRef.current
      const st = statsRef.current[s]
      st.results.push(ok)
      if (st.results.length > 20) st.results.shift()

      if (!st.passed && passedFor(st)) {
        st.passed = true
        const idx = STAGE_ORDER.indexOf(s)
        if (idx < STAGE_ORDER.length - 1) {
          const next = STAGE_ORDER[idx + 1]
          stageRef.current = next
          periodRef.current = 60000 / STAGE_BPM[next]
          progRef.current = UEBUNG[next]
          setProg(UEBUNG[next])
          refresh()
          startRef.current()
          return true
        }
      }
      refresh()
      return false
    },
    [refresh],
  )

  const startRef = useRef<() => void>(() => {})

  const tick = useCallback(() => {
    const now = performance.now()
    const beats = beatsRef.current
    const beat = beatIdxRef.current % beats
    if (beat === 0) {
      if (activeBarRef.current && evaluateBar(activeBarRef.current)) return
      barCountRef.current += 1
      const p = progRef.current
      const chord = p[barCountRef.current % p.length]
      activeBarRef.current = { chord, downbeat: now, pcs: new Set(), gripTime: null }
      setCur(chord)
      playClick(true)
    } else {
      playClick(false)
    }
    setPulse(beat)
    beatIdxRef.current += 1
  }, [evaluateBar, playClick])

  const tickRef = useRef(tick)
  tickRef.current = tick

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
    beatIdxRef.current = 0
    barCountRef.current = -1
    activeBarRef.current = null
    setFeedback(null)
    const run = () => tickRef.current()
    run()
    intervalRef.current = setInterval(run, periodRef.current)
    setRunning(true)
  }, [])
  startRef.current = startMetronome

  // Modus wählen: Übung oder ein Song. Setzt Tempo/Takt/Progression neu.
  const selectMode = useCallback(
    (mode: Mode) => {
      modeRef.current = mode
      if (mode === 'uebung') {
        statsRef.current = { langsam: freshStat(), mittel: freshStat(), flott: freshStat() }
        stageRef.current = 'langsam'
        periodRef.current = 60000 / STAGE_BPM.langsam
        beatsRef.current = 4
        progRef.current = UEBUNG.langsam
        setProg(UEBUNG.langsam)
      } else {
        const song = songById(mode)
        const chords = song ? song.progression.map(fromSong) : UEBUNG.langsam
        songResultsRef.current = []
        beatsRef.current = song ? song.meter : 4
        // Ruhiges Übe-Tempo (Walzer etwas langsamer).
        periodRef.current = 60000 / (beatsRef.current === 3 ? 60 : 72)
        progRef.current = chords
        setProg(chords)
      }
      startMetronome()
      refresh()
    },
    [startMetronome, refresh],
  )

  // Eingabe sammeln → in den aktuellen Takt.
  useEffect(() => {
    const unsub = onNoteOn((midi, time) => {
      const bar = activeBarRef.current
      if (!bar || intervalRef.current === null) return
      bar.pcs.add(pc(midi))
      if (bar.gripTime === null) {
        if ([...bar.chord.pcs].every((p) => bar.pcs.has(p))) bar.gripTime = time
      }
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    startMetronome()
    refresh()
    return () => {
      stopMetronome()
      timersRef.current.forEach(clearTimeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fortschritt fürs Lernziel ak2 festhalten (nur in der gewerteten Übung).
  const recordLevel = useProgressStore((s) => s.recordLevel)
  useEffect(() => {
    if (snap.isSong) return
    if (snap.passed.langsam) recordLevel('ak2', 'erreicht')
    if (snap.passed.mittel) recordLevel('ak2', 'verinnerlicht')
    if (snap.passed.flott) recordLevel('ak2', 'gemeistert')
  }, [snap, recordLevel])

  const handleRestart = () => selectMode(modeRef.current)

  const isSong = snap.isSong
  // Im Song-Modus immer Zieltasten zeigen (Übe-Loop); in der Übung nur Stufe 1.
  const lightsOn = isSong || stageRef.current === 'langsam'
  const targetNotes = cur.notes

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
  const beats = beatsRef.current

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
        <h2 className="font-display text-3xl text-amber-soft">Begleit-Tapper</h2>
        <div className="flex items-center gap-3 text-sm text-bone/60">
          <span className="tabular-nums" title="Anteil richtig & im Takt">
            {snap.samples ? Math.round(snap.acc * 100) : 0}% im Takt
          </span>
          <span className="rounded-full border border-bone/15 px-2.5 py-0.5" title="Modus / Stufe">
            {snap.label}
          </span>
        </div>
      </div>

      {/* Modus-Wahl: gewertete Übung oder echter Song */}
      <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => selectMode('uebung')}
          className="ease-soft rounded-full border px-3 py-1 transition-colors"
          style={{
            borderColor: !isSong ? GOLD : 'rgba(239,230,214,0.14)',
            color: !isSong ? '#f0d49a' : 'rgba(239,230,214,0.55)',
            background: !isSong ? 'rgba(224,177,94,0.12)' : 'transparent',
          }}
        >
          Übung · I·IV·V
        </button>
        <span className="mx-1 text-bone/25">·</span>
        {SONGS.map((s) => {
          const on = snap.mode === s.id
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => selectMode(s.id)}
              className="ease-soft rounded-full border px-3 py-1 transition-colors"
              style={{
                borderColor: on ? '#7fa8c9' : 'rgba(239,230,214,0.14)',
                color: on ? '#bcd6ea' : 'rgba(239,230,214,0.55)',
                background: on ? 'rgba(127,168,201,0.12)' : 'transparent',
              }}
            >
              {s.title}
            </button>
          )
        })}
      </div>

      {/* Spielfeld */}
      <div className="relative mx-auto w-full max-w-3xl rounded-xl bg-ink-800/40 p-3 ring-1 ring-black/40 sm:p-4">
        {/* Akkordfolge — aktueller Akkord hervorgehoben */}
        <div className="mb-1 flex flex-wrap items-center justify-center gap-2">
          {prog.map((c, i) => {
            const active = c === cur
            return (
              <span
                key={i}
                className="ease-soft flex min-w-[60px] flex-col items-center rounded-lg border px-3 py-1.5 transition-all"
                style={{
                  borderColor: active ? GOLD : 'rgba(239,230,214,0.14)',
                  background: active ? 'rgba(224,177,94,0.12)' : 'transparent',
                  transform: active ? 'scale(1.06)' : 'scale(1)',
                }}
              >
                <span
                  className="font-display text-lg"
                  style={{ color: active ? '#f0d49a' : 'rgba(239,230,214,0.5)' }}
                >
                  {c.roman}
                </span>
                <span className="text-[11px] text-bone/45">{c.label}</span>
              </span>
            )
          })}
        </div>

        {/* Puls-Punkte (so viele wie Schläge pro Takt) */}
        <div className="mb-1 flex items-center justify-center gap-3 py-1">
          {Array.from({ length: beats }).map((_, b) => {
            const on = pulse === b
            return (
              <span
                key={b}
                className="ease-soft rounded-full transition-all"
                style={{
                  width: b === 0 ? 18 : 13,
                  height: b === 0 ? 18 : 13,
                  background: on ? GOLD : 'rgba(239,230,214,0.16)',
                  transform: on ? 'scale(1.25)' : 'scale(1)',
                  boxShadow: on ? '0 0 12px rgba(224,177,94,0.6)' : 'none',
                }}
              />
            )
          })}
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

        {/* Klaviatur (zwei Oktaven ab C4) */}
        <KeyboardViewport base={BASE} span={SPAN} focus={targetNotes} className="mt-2">
        <div
          className="relative h-40 w-full select-none sm:h-48"
          style={{ touchAction: 'none' }}
          role="group"
          aria-label="Klaviatur"
        >
          {whites.map((m, wi) => {
            const active = activeNotes.has(m)
            const mark = lightsOn && targetNotes.includes(m)
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
                {lightsOn && (
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
            const mark = lightsOn && targetNotes.includes(m)
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
        </KeyboardViewport>

        <div className="mt-3 flex items-center justify-center">
          <button
            type="button"
            onClick={() => (running ? stopMetronome() : startMetronome())}
            className="ease-soft rounded-full border border-bone/15 px-5 py-2 text-base text-bone/70 transition-colors hover:border-amber-glow/50 hover:text-amber-soft"
          >
            {running ? '⏸ Metronom aus' : '▶ Metronom an'}
          </button>
        </div>
      </div>

      {/* Skala (nur in der gewerteten Übung) bzw. Song-Hinweis */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {isSong ? (
          <p className="text-sm text-bone/45">
            Übe-Loop — kein Fortschritt gewertet.{' '}
            {currentSong()?.note ?? 'Begleite den Song frei mit.'}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2 text-sm">
            {(
              [
                ['erreicht', snap.passed.langsam, 'Langsam I–V: zwei Akkorde im Takt gewechselt (mit Stütze)'],
                ['verinnerlicht', snap.passed.mittel, 'Mittel I–IV–V: drei Akkorde blind im Puls begleitet'],
                ['gemeistert', snap.passed.flott, 'Flott I–IV–V–I: voller Loop im Songtempo = Checkpoint erfüllt'],
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
        )}
        <button
          type="button"
          onClick={handleRestart}
          className="ease-soft rounded-full border border-bone/15 px-5 py-2 text-base text-bone/70 transition-colors hover:border-amber-glow/50 hover:text-amber-soft"
        >
          ↻ Neu starten
        </button>
      </div>

      <p className="text-center text-sm text-bone/45">
        Pro Takt ein Akkord — greif ihn auf die <span className="text-bone/70">Eins</span> und
        wechsle rechtzeitig zum nächsten. Die Töne dürfen in jeder Lage liegen. In der Übung
        wird es schneller und voller, je sicherer du wirst; im Song begleitest du frei mit.
        Kein Zeitdruck im Sinne von Punkten.
      </p>
    </div>
  )
}
