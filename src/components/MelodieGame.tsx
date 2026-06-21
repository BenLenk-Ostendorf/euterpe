import { useCallback, useEffect, useRef, useState } from 'react'
import { onNoteOn, playNote, stopNote } from '../audio/notePlayer'
import { attack, ensureAudioStarted, release } from '../audio/pianoSampler'
import { useSessionStore } from '../state/sessionStore'
import { useProgressStore } from '../state/progressStore'
import { midiToName } from '../music/theory'
import KeyboardViewport from './KeyboardViewport'

// Melodien-Detektiv — das kleine Ziel goal-detektiv (Gehör-Strang): eine bekannte
// Melodie ohne Noten am Klavier raushören und nachspielen. Der große Aha-Moment,
// der „Richtung hören" und „Intervalle" zusammenführt.
//
// Mechanik: Die Melodie erklingt, der Anfangston ist als Anker gegeben (leuchtet).
// Du spielst Ton für Ton nach — jeder Ton wird sofort gegen den erwarteten
// nächsten geprüft (über Tonklassen, Oktave egal). Eine Reihe von Pips zeigt den
// Fortschritt; richtig = grün, daneben = rot. Am Ende: alles richtig?
//
// Drei Stufen als erreicht→verinnerlicht→gemeistert-Leiter (über die Länge):
//   1. kurz   — 4-Ton-Phrasen                 (erreicht)
//   2. mittel — 6–7 Töne                       (verinnerlicht)
//   3. lang   — ganze Melodie-Zeile (8 Töne)   (gemeistert)
//
// Feedback informiert, bewertet nie. Kein Tempo, kein Punktestand.

type Stage = 'kurz' | 'mittel' | 'lang'

const STAGE_ORDER: Stage[] = ['kurz', 'mittel', 'lang']
const STAGE_LABEL: Record<Stage, string> = {
  kurz: 'kurz · 4 Töne',
  mittel: 'mittel · 6–7 Töne',
  lang: 'lang · ganze Zeile',
}

const HIT = '#9bb88a'
const MISS = '#cf7d6b'
const GOLD = '#e0b15e'

const BASE = 60 // C4 — Anker der Bildschirm-Klaviatur
const SPAN = 24

const pc = (m: number) => ((m % 12) + 12) % 12
const isWhitePc = (p: number) => [0, 2, 4, 5, 7, 9, 11].includes(p)

// Bekannte Melodien als Tonklassen-Folgen (Halbtöne ab C). Octave-frei gematcht.
interface Song {
  name: string
  pcs: number[]
}
const SONGS: Record<Stage, Song[]> = {
  kurz: [
    { name: 'Bruder Jakob', pcs: [0, 2, 4, 0] },
    { name: 'Alle meine Entchen', pcs: [0, 2, 4, 5] },
    { name: 'Hänschen klein', pcs: [7, 4, 4, 5] },
  ],
  mittel: [
    { name: 'Alle meine Entchen', pcs: [0, 2, 4, 5, 7, 7] },
    { name: 'Morgen kommt der Weihnachtsmann', pcs: [0, 0, 7, 7, 9, 9, 7] },
    { name: 'Hänschen klein', pcs: [7, 4, 4, 5, 2, 2, 0] },
  ],
  lang: [
    { name: 'Ode an die Freude', pcs: [4, 4, 5, 7, 7, 5, 4, 2] },
    { name: 'Alle meine Entchen', pcs: [0, 2, 4, 5, 7, 7, 9, 9] },
    { name: 'Song of Storms', pcs: [2, 9, 2, 2, 9, 2, 4, 5, 4, 5, 4, 0, 9, 9] },
  ],
}

const rint = (n: number) => Math.floor(Math.random() * n)

type Step = 'pending' | 'hit' | 'miss'

interface Round {
  song: Song
  idx: number // erwarteter nächster Ton
  steps: Step[]
}

function genRound(stage: Stage, prevName?: string): Round {
  const lib = SONGS[stage]
  let song = lib[rint(lib.length)]
  let guard = 0
  while (lib.length > 1 && song.name === prevName && guard < 6) {
    song = lib[rint(lib.length)]
    guard++
  }
  return { song, idx: 0, steps: song.pcs.map(() => 'pending') }
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

export default function MelodieGame({ onExit }: { onExit: () => void }) {
  const activeNotes = useSessionStore((s) => s.activeNotes)

  const statsRef = useRef<Record<Stage, StageStat>>({
    kurz: freshStat(),
    mittel: freshStat(),
    lang: freshStat(),
  })
  const stageRef = useRef<Stage>('kurz')
  const roundRef = useRef<Round>(genRound('kurz'))
  const playingRef = useRef(false)
  const lockedRef = useRef(false) // während Vorspielen / Auswertung keine Eingabe werten
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const [round, setRound] = useState<Round>(roundRef.current)
  const [snap, setSnap] = useState<Snapshot>({
    stage: 'kurz',
    acc: 0,
    samples: 0,
    passed: { kurz: false, mittel: false, lang: false },
  })
  const [playing, setPlaying] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'hit' | 'miss'; text: string } | null>(null)

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }, [])

  const syncRound = useCallback(() => setRound({ ...roundRef.current }), [])

  const refresh = useCallback(() => {
    const s = stageRef.current
    const st = statsRef.current[s]
    const n = st.results.length
    setSnap({
      stage: s,
      acc: n ? st.results.filter(Boolean).length / n : 0,
      samples: n,
      passed: {
        kurz: statsRef.current.kurz.passed,
        mittel: statsRef.current.mittel.passed,
        lang: statsRef.current.lang.passed,
      },
    })
  }, [])

  // Die Melodie vorspielen (ab C4 + Tonklasse). Während des Spielens ist die
  // Eingabe gesperrt.
  const playMelody = useCallback(() => {
    clearTimers()
    const { pcs } = roundRef.current
    void ensureAudioStarted().then(() => {
      setPlaying(true)
      playingRef.current = true
      lockedRef.current = true
      const STEP = 480
      const HOLD = 420
      pcs.forEach((p, i) => {
        const m = BASE + p
        timersRef.current.push(setTimeout(() => attack(m, 0.72), i * STEP))
        timersRef.current.push(setTimeout(() => release(m), i * STEP + HOLD))
      })
      const end = pcs.length * STEP
      timersRef.current.push(
        setTimeout(() => {
          setPlaying(false)
          playingRef.current = false
          lockedRef.current = false
        }, end),
      )
    })
  }, [clearTimers])

  const playStart = useCallback(() => {
    const m = BASE + roundRef.current.song.pcs[0]
    void ensureAudioStarted().then(() => {
      attack(m, 0.72)
      timersRef.current.push(setTimeout(() => release(m), 520))
    })
  }, [])

  const nextRound = useCallback(
    (autoPlay = true) => {
      roundRef.current = genRound(stageRef.current, roundRef.current.song.name)
      syncRound()
      setFeedback(null)
      if (autoPlay) timersRef.current.push(setTimeout(() => playMelody(), 350))
    },
    [syncRound, playMelody],
  )

  const passedFor = (st: StageStat) => {
    const n = st.results.length
    const acc = n ? st.results.filter(Boolean).length / n : 0
    return n >= 8 && acc >= 0.75 && st.level >= 0.7
  }

  const record = useCallback(
    (ok: boolean) => {
      const s = stageRef.current
      const st = statsRef.current[s]
      st.results.push(ok)
      if (st.results.length > 14) st.results.shift()
      const recent = st.results.slice(-6)
      if (recent.length >= 4) {
        const rate = recent.filter(Boolean).length / recent.length
        if (rate > 0.8) st.level = Math.min(1, st.level + 0.12)
        else if (rate < 0.5) st.level = Math.max(0, st.level - 0.14)
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

  const finishAttempt = useCallback(() => {
    const r = roundRef.current
    const wrong = r.steps.filter((s) => s === 'miss').length
    const ok = wrong === 0
    lockedRef.current = true
    setFeedback({
      kind: ok ? 'hit' : 'miss',
      text: ok
        ? `Richtig — ${r.song.name}!`
        : `${r.song.pcs.length - wrong} von ${r.song.pcs.length} Tönen — ${r.song.name}`,
    })
    record(ok)
    timersRef.current.push(setTimeout(() => nextRound(true), ok ? 1300 : 1900))
  }, [record, nextRound])

  // Eingabe Ton für Ton prüfen.
  useEffect(() => {
    const unsub = onNoteOn((midi) => {
      if (lockedRef.current) return
      const r = roundRef.current
      if (r.idx >= r.song.pcs.length) return
      const expected = r.song.pcs[r.idx]
      r.steps[r.idx] = pc(midi) === expected ? 'hit' : 'miss'
      r.idx += 1
      syncRound()
      if (r.idx >= r.song.pcs.length) finishAttempt()
    })
    return () => unsub()
  }, [finishAttempt, syncRound])

  // Start.
  useEffect(() => {
    timersRef.current.push(setTimeout(() => playMelody(), 400))
    refresh()
    return () => clearTimers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fortschritt fürs Ziel (lokal, nur höchste Stufe).
  const recordLevel = useProgressStore((s) => s.recordLevel)
  useEffect(() => {
    if (snap.passed.kurz) recordLevel('det', 'erreicht')
    if (snap.passed.mittel) recordLevel('det', 'verinnerlicht')
    if (snap.passed.lang) recordLevel('det', 'gemeistert')
  }, [snap, recordLevel])

  // „Eingabe löschen" ist zugleich der garantierte Notausgang: setzt den Versuch
  // zurück UND entsperrt die Eingabe, falls je etwas hängen sollte.
  const resetAttempt = () => {
    clearTimers()
    const r = roundRef.current
    r.idx = 0
    r.steps = r.song.pcs.map(() => 'pending')
    lockedRef.current = false
    playingRef.current = false
    setPlaying(false)
    setFeedback(null)
    syncRound()
  }

  const handleRestart = () => {
    clearTimers()
    statsRef.current = { kurz: freshStat(), mittel: freshStat(), lang: freshStat() }
    stageRef.current = 'kurz'
    nextRound(true)
    refresh()
  }

  const startNote = BASE + round.song.pcs[0]

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
        <h2 className="font-display text-3xl text-amber-soft">Melodien-Detektiv</h2>
        <div className="flex items-center gap-4 text-sm text-bone/60">
          <span className="tabular-nums" title="Anteil fehlerfrei nachgespielt">
            {snap.samples ? Math.round(snap.acc * 100) : 0}% fehlerfrei
          </span>
          <span className="rounded-full border border-bone/15 px-2.5 py-0.5" title="Aktuelle Stufe">
            {STAGE_LABEL[snap.stage]}
          </span>
        </div>
      </div>

      {/* Spielfeld */}
      <div className="relative mx-auto w-full max-w-3xl rounded-xl bg-ink-800/40 p-3 ring-1 ring-black/40 sm:p-4">
        <div className="mb-2 flex flex-col items-center gap-3 py-2">
          <span className="text-sm text-bone/50">Spiel die Melodie nach Gehör nach</span>

          {/* Pips: Fortschritt der Eingabe */}
          <div className="flex items-center gap-2">
            {round.steps.map((s, i) => (
              <span
                key={i}
                className="ease-soft h-4 w-4 rounded-full transition-all"
                style={{
                  background:
                    s === 'hit' ? HIT : s === 'miss' ? MISS : i === round.idx ? GOLD : 'rgba(239,230,214,0.16)',
                  transform: i === round.idx ? 'scale(1.25)' : 'scale(1)',
                  boxShadow: i === round.idx ? '0 0 10px rgba(224,177,94,0.6)' : 'none',
                }}
                title={i === 0 ? 'Anfangston (Anker)' : `Ton ${i + 1}`}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => !playing && playMelody()}
              disabled={playing}
              className="ease-soft rounded-full border border-amber-glow/40 bg-ink-700/60 px-4 py-1.5 text-sm text-amber-soft transition-all hover:border-amber-glow hover:bg-ink-600 disabled:opacity-50"
            >
              {playing ? '♪ klingt …' : '↻ Melodie hören'}
            </button>
            <button
              type="button"
              onClick={() => !playing && playStart()}
              disabled={playing}
              className="ease-soft rounded-full border border-bone/15 px-3 py-1.5 text-bone/70 transition-colors hover:border-amber-glow/50 hover:text-amber-soft disabled:opacity-50"
            >
              ♪ Nur Anfangston
            </button>
            <button
              type="button"
              onClick={resetAttempt}
              className="ease-soft rounded-full border border-bone/15 px-3 py-1.5 text-bone/70 transition-colors hover:border-amber-glow/50 hover:text-amber-soft"
            >
              ⌫ Eingabe löschen
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

        {/* Klaviatur — der Anfangston leuchtet als Anker */}
        <KeyboardViewport base={BASE} span={SPAN} focus={[startNote]} className="mt-2">
        <div
          className="relative h-40 w-full select-none sm:h-48"
          style={{ touchAction: 'none' }}
          role="group"
          aria-label="Klaviatur"
        >
          {whites.map((m, wi) => {
            const active = activeNotes.has(m)
            const anchor = m === startNote && round.idx === 0
            return (
              <button
                key={m}
                type="button"
                aria-label={midiToName(m) + (anchor ? ' (Anfangston)' : '')}
                onPointerDown={handleDown(m)}
                onPointerUp={handleUp(m)}
                onPointerLeave={handleUp(m)}
                onPointerCancel={handleUp(m)}
                className="ease-soft absolute bottom-0 top-0 flex items-end justify-center rounded-b-md border border-black/40 pb-2 transition-[transform,background-color] duration-100"
                style={{
                  left: `${wi * WHITE_W}%`,
                  width: `${WHITE_W}%`,
                  zIndex: 1,
                  background: anchor
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
                {anchor && (
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
            return (
              <button
                key={m}
                type="button"
                aria-label={midiToName(m)}
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
                  background: active
                    ? 'linear-gradient(180deg,#5a4628,#3a2c16)'
                    : 'linear-gradient(180deg,#2a2420,#0c0a08)',
                  border: '1px solid #000',
                  boxShadow: active ? '0 0 14px rgba(224,177,94,0.5)' : '0 3px 5px rgba(0,0,0,0.5)',
                  transform: active ? 'translateY(1.5px)' : 'none',
                }}
              />
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
              ['erreicht', snap.passed.kurz, 'Kurz: 4-Ton-Phrasen sicher nach Gehör nachgespielt'],
              ['verinnerlicht', snap.passed.mittel, 'Mittel: 6–7-Ton-Melodien nachgespielt'],
              ['gemeistert', snap.passed.lang, 'Lang: eine ganze Melodie-Zeile raushören und nachspielen = Aha-Moment'],
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
        Erst hören, dann den Anfangston anschlagen — von da tastest du dich Ton für Ton
        weiter. Die Töne dürfen in jeder Oktave liegen. Es wird länger, je sicherer du
        wirst. Kein Zeitdruck, keine Punkte.
      </p>
    </div>
  )
}
