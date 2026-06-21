import { useCallback, useEffect, useRef, useState } from 'react'
import { onNoteOn, playNote, stopNote } from '../audio/notePlayer'
import { attack, ensureAudioStarted, release } from '../audio/pianoSampler'
import { useSessionStore } from '../state/sessionStore'
import { useProgressStore } from '../state/progressStore'
import { midiToName } from '../music/theory'
import KeyboardViewport from './KeyboardViewport'

// Akkordgriff — Challenge für das Lernziel w2 "Du kannst einen Dreiklang greifen".
//
// Ein Akkordname wird angesagt ("C-Dur"), du greifst die drei Töne. Die zweite,
// ehrliche Wahrheit neben richtig/falsch: GREIFST du sie zusammen oder suchst du
// sie einzeln zusammen? Das misst die Onset-Spreizung der Anschläge.
//
// Adaptive Engine (Bens Entwurf): es gibt eine geordnete Kurve aus Stufen, die
// nacheinander Achsen dazuschalten — Stütze→blind, Dur→Dur+Moll, weiße Griffe→
// 1 schwarze→schwarze Grundtöne, als Griff, zügig, dann die linke Hand von vorne,
// zuletzt beide Hände. Läuft es an der "Front" gut (>80%), kommt die nächste
// Stufe; ist es okay, bleibt es; läuft es schlecht (<50%), fällt die Front zurück.
// Zusätzlich wird Bekanntes/Leichteres regelmäßig EINGESTREUT (verteiltes Abrufen)
// — auch wenn es gut läuft, damit der Reflex sitzt statt Autopilot.
//
// Lernziel-Nachweis ist KEINE "aktuelles Level hoch"-Frage, sondern Abdeckung:
// erst wenn du den ganzen Raum (Dur+Moll × leicht/mittel/schwer × beide Hände)
// blind & als Griff sicher gezeigt hast, leuchtet "gemeistert".
//
// Wie überall: Feedback informiert, bewertet nie. Kein Punktestand, kein Streak.

type Quality = 'dur' | 'moll'
type Hand = 'L' | 'R'

const REGISTER: Record<Hand, number> = { L: 48, R: 60 } // C3 / C4
const HAND_LABEL: Record<Hand, string> = { L: 'Linke Hand', R: 'Rechte Hand' }
const QUAL_LABEL: Record<Quality, string> = { dur: 'Dur', moll: 'Moll' }
const THIRD: Record<Quality, number> = { dur: 4, moll: 3 } // große / kleine Terz

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11]
const BLACK_PCS = [1, 3, 6, 8, 10]
const ALL_PCS = Array.from({ length: 12 }, (_, i) => i)
const isWhitePc = (pc: number) => WHITE_PCS.includes(pc)

const GOLD = '#e0b15e'
const HIT = '#9bb88a'
const MISS = '#cf7d6b'

// Schwellen für die Messung.
const GRIP_MS = 240 // bis hierher gilt es als "zusammen gegriffen" (humane Hand)
const ZUGIG_MS = 2600 // bis hierher gilt der Griff als "zügig"
const SETTLE_MS = 900 // so lange wird nach dem letzten Anschlag noch gewartet
const ACC_WINDOW = 16
const MASTER_ACC = 0.85
const MIN_SAMPLES_V = 10
const MIN_SAMPLES_G = 16

const rint = (n: number) => Math.floor(Math.random() * n)

// Die drei Töne eines Dreiklangs (Grundton, Terz, Quinte) ab einem MIDI-Grundton.
function triadNotes(rootMidi: number, q: Quality): number[] {
  return [rootMidi, rootMidi + THIRD[q], rootMidi + 7]
}

// Die drei Tonklassen (0–11) des Dreiklangs — Oktave/Lage/Umkehrung egal.
function triadPcSet(rootMidi: number, q: Quality): Set<number> {
  return new Set([
    ((rootMidi % 12) + 12) % 12,
    ((rootMidi + THIRD[q]) % 12 + 12) % 12,
    ((rootMidi + 7) % 12 + 12) % 12,
  ])
}

// Schwierigkeit eines Griffs: 0 = reiner Weiß-Griff, 1 = Grundton weiß + ≥1
// schwarze Taste, 2 = schwarzer Grundton (Hand sitzt vorn).
function tierOf(rootPc: number, q: Quality): 0 | 1 | 2 {
  const pcs = [rootPc, (rootPc + THIRD[q]) % 12, (rootPc + 7) % 12]
  const blacks = pcs.filter((pc) => BLACK_PCS.includes(pc)).length
  if (blacks === 0) return 0
  if (isWhitePc(rootPc)) return 1
  return 2
}
function rootsFor(q: Quality, tier: number): number[] {
  return ALL_PCS.filter((pc) => tierOf(pc, q) === tier)
}

// Die Kurve: jede Stufe ist die Front (das Neue), das gerade getestet wird.
// Stütze/Griff/Tempo ziehen mit dem Front-Index an (siehe rigor()), der Inhalt
// (Qualität/Tier/Hand) kommt aus der jeweiligen Stufe.
interface Stage {
  quals: Quality[]
  tiers: number[]
  hand: Hand | 'both'
  label: string
}
const STAGES: Stage[] = [
  { quals: ['dur'], tiers: [0], hand: 'R', label: 'Dur · weiße Griffe' }, // 0
  { quals: ['dur'], tiers: [0], hand: 'R', label: 'Dur · weiß · blind' }, // 1
  { quals: ['dur', 'moll'], tiers: [0], hand: 'R', label: 'Dur + Moll · weiß' }, // 2
  { quals: ['dur', 'moll'], tiers: [0], hand: 'R', label: '… als ein Griff' }, // 3
  { quals: ['dur', 'moll'], tiers: [0, 1], hand: 'R', label: '+ eine schwarze Taste' }, // 4
  { quals: ['dur', 'moll'], tiers: [0, 1], hand: 'R', label: '… zügig' }, // 5
  { quals: ['dur'], tiers: [0], hand: 'L', label: 'Linke Hand · leicht' }, // 6
  { quals: ['dur', 'moll'], tiers: [0, 1], hand: 'L', label: 'Linke Hand · Dur + Moll' }, // 7
  { quals: ['dur', 'moll'], tiers: [0, 1, 2], hand: 'both', label: 'Voller Raum · beide Hände' }, // 8
]
// Rigor ratscht mit dem Front-Index — einmal an, bleibt an (kein Geflacker), und
// lockert nur, wenn die Front zurückfällt.
const rigor = (frontier: number) => ({
  blind: frontier >= 1,
  grip: frontier >= 3,
  zugig: frontier >= 5,
})

// Abdeckungs-Tore (Zellen-Schlüssel quality-tier-hand).
const cellKey = (q: Quality, tier: number, hand: Hand) => `${q}-${tier}-${hand}`
function cells(quals: Quality[], tiers: number[], hands: Hand[]): string[] {
  const out: string[] = []
  for (const q of quals) for (const t of tiers) for (const h of hands) out.push(cellKey(q, t, h))
  return out
}
const ERREICHT_CELLS = cells(['dur', 'moll'], [0], ['R']) // Rezept (mit Stütze)
const VERINNERLICHT_CELLS = cells(['dur', 'moll'], [0, 1], ['R']) // blind & als Griff
const GEMEISTERT_CELLS = cells(['dur', 'moll'], [0, 1, 2], ['R', 'L']) // voller Raum

interface Target {
  rootMidi: number
  q: Quality
  tier: number
  hand: Hand
  frontier: boolean // gehört zur Front (zählt für die Anpassung) oder eingestreut?
}
interface Snapshot {
  acc: number
  samples: number
  stageLabel: string
  blind: boolean
  grip: boolean
  zugig: boolean
  erreicht: boolean
  verinnerlicht: boolean
  gemeistert: boolean
}

export default function AkkordgriffGame({ onExit }: { onExit: () => void }) {
  const activeNotes = useSessionStore((s) => s.activeNotes)

  const frontierRef = useRef(0)
  const frontierResultsRef = useRef<boolean[]>([])
  const resultsRef = useRef<boolean[]>([])
  const builtRef = useRef<Set<string>>(new Set()) // korrekt gebaut (Stütze erlaubt)
  const gripRef = useRef<Set<string>>(new Set()) // korrekt + blind + als Griff
  const targetRef = useRef<Target>({ rootMidi: 60, q: 'dur', tier: 0, hand: 'R', frontier: true })
  const lastRootRef = useRef(-1)
  const awaitingRef = useRef(false)
  const bufferRef = useRef<{ midi: number; time: number }[]>([])
  const startTimeRef = useRef(0)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const [target, setTargetState] = useState<Target>(targetRef.current)
  const [feedback, setFeedback] = useState<{ kind: 'hit' | 'miss'; text: string; sub?: string } | null>(null)
  const [reveal, setReveal] = useState(false)
  const [snap, setSnap] = useState<Snapshot>({
    acc: 0,
    samples: 0,
    stageLabel: STAGES[0].label,
    blind: false,
    grip: false,
    zugig: false,
    erreicht: false,
    verinnerlicht: false,
    gemeistert: false,
  })

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    settleTimerRef.current = null
  }, [])

  const refreshSnap = useCallback(() => {
    const fr = frontierRef.current
    const results = resultsRef.current
    const samples = results.length
    const acc = samples ? results.filter(Boolean).length / samples : 0
    const built = builtRef.current
    const grip = gripRef.current
    const { blind, grip: grp, zugig } = rigor(fr)
    setSnap({
      acc,
      samples,
      stageLabel: STAGES[fr].label,
      blind,
      grip: grp,
      zugig,
      erreicht: ERREICHT_CELLS.every((c) => built.has(c)),
      verinnerlicht:
        VERINNERLICHT_CELLS.every((c) => grip.has(c)) && samples >= MIN_SAMPLES_V && acc >= MASTER_ACC,
      gemeistert:
        GEMEISTERT_CELLS.every((c) => grip.has(c)) && samples >= MIN_SAMPLES_G && acc >= MASTER_ACC,
    })
  }, [])

  // Nächste Runde ziehen: meist die Front, mit ~30% Wahrscheinlichkeit etwas
  // Leichteres aus einer früheren Stufe einstreuen.
  const pickRound = useCallback(() => {
    const fr = frontierRef.current
    const interleave = fr > 0 && Math.random() < 0.3
    const stage = STAGES[interleave ? rint(fr) : fr]
    const q = stage.quals[rint(stage.quals.length)]
    const tier = stage.tiers[rint(stage.tiers.length)]
    const hand: Hand = stage.hand === 'both' ? (Math.random() < 0.5 ? 'L' : 'R') : stage.hand
    const roots = rootsFor(q, tier)
    let rootPc = roots[rint(roots.length)]
    let guard = 0
    while (rootPc === lastRootRef.current && roots.length > 1 && guard < 8) {
      rootPc = roots[rint(roots.length)]
      guard++
    }
    lastRootRef.current = rootPc
    const t: Target = { rootMidi: REGISTER[hand] + rootPc, q, tier, hand, frontier: !interleave }
    targetRef.current = t
    setTargetState(t)
  }, [])

  const nextRound = useCallback(() => {
    pickRound()
    bufferRef.current = []
    startTimeRef.current = performance.now()
    awaitingRef.current = true
    setReveal(false)
    setFeedback(null)
  }, [pickRound])

  const playChord = useCallback((notes: number[]) => {
    void ensureAudioStarted().then(() => {
      notes.forEach((n) => attack(n, 0.7))
      timersRef.current.push(setTimeout(() => notes.forEach((n) => release(n)), 760))
    })
  }, [])

  // Eine Runde auswerten: richtige Töne? zusammen gegriffen? zügig?
  const evaluate = useCallback(() => {
    if (!awaitingRef.current) return
    awaitingRef.current = false
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current)
      settleTimerRef.current = null
    }

    const t = targetRef.current
    const fr = frontierRef.current
    const { blind, grip: gripActive, zugig: zugigActive } = rigor(fr)
    const notes = triadNotes(t.rootMidi, t.q)
    const buf = bufferRef.current
    const targetPcs = triadPcSet(t.rootMidi, t.q)
    const playedPcs = new Set(buf.map((b) => ((b.midi % 12) + 12) % 12))
    // Richtig = genau die drei Akkordtöne, egal in welcher Oktave/Lage.
    const correct =
      playedPcs.size === 3 && [...targetPcs].every((pc) => playedPcs.has(pc))

    const times = buf.map((b) => b.time)
    const spread = times.length > 1 ? Math.max(...times) - Math.min(...times) : 0
    const gripped = buf.length >= 3 && spread <= GRIP_MS
    const completion = times.length ? Math.max(...times) - startTimeRef.current : Infinity
    const zugigOk = completion <= ZUGIG_MS

    // "meets" = erfüllt zusätzlich die aktuelle Strenge (Griff/Tempo). Steuert
    // NUR den Fortschritt — die richtigen Töne sind nie ein "Fehler".
    let meets = correct
    if (gripActive) meets = meets && gripped
    if (zugigActive) meets = meets && zugigOk

    // Verbuchen: "% richtig" zählt die richtigen Töne (nicht die Griff-Strenge).
    resultsRef.current.push(correct)
    if (resultsRef.current.length > ACC_WINDOW) resultsRef.current.shift()
    const cell = cellKey(t.q, t.tier, t.hand)
    if (correct) builtRef.current.add(cell)
    if (correct && blind && gripped) gripRef.current.add(cell)

    // Anpassung nur an Front-Runden — und nur, wenn die Strenge erfüllt ist.
    if (t.frontier) {
      frontierResultsRef.current.push(meets)
      if (frontierResultsRef.current.length > 8) frontierResultsRef.current.shift()
      const recent = frontierResultsRef.current.slice(-6)
      if (recent.length >= 4) {
        const rate = recent.filter(Boolean).length / recent.length
        if (rate > 0.8 && frontierRef.current < STAGES.length - 1) {
          frontierRef.current += 1
          frontierResultsRef.current = []
        } else if (rate < 0.5 && frontierRef.current > 0) {
          frontierRef.current -= 1
          frontierResultsRef.current = []
        }
      }
    }

    // Feedback — informiert, bewertet nicht. Richtige Töne sind IMMER grün;
    // Griff/Tempo sind nur ein Hinweis, kein Fehler. Rot nur bei falschen Tönen.
    const names = notes.map(midiToName).join(' – ')
    if (correct) {
      const sub = gripActive && !gripped
        ? 'Töne stimmen — noch einzeln; probier sie als einen Griff'
        : zugigActive && !zugigOk
          ? 'sauber — beim nächsten Mal gern etwas flotter'
          : gripped
            ? 'sauber als ein Griff'
            : undefined
      setFeedback({ kind: 'hit', text: 'Richtig', sub })
    } else {
      setFeedback({ kind: 'miss', text: `War: ${names}`, sub: undefined })
    }

    // Nur bei FALSCHEN Tönen die richtigen zeigen und den Akkord vorspielen.
    if (!correct) {
      setReveal(true)
      playChord(notes)
    }

    refreshSnap()
    timersRef.current.push(setTimeout(() => nextRound(), correct ? 850 : 1700))
  }, [nextRound, playChord, refreshSnap])

  // Eingabe sammeln (jede Quelle: MIDI, Klick, Computertastatur).
  useEffect(() => {
    const unsub = onNoteOn((midi, time) => {
      if (!awaitingRef.current) return
      const buf = bufferRef.current
      if (buf.some((b) => b.midi === midi)) return
      buf.push({ midi, time })
      const t = targetRef.current
      const targetPcs = triadPcSet(t.rootMidi, t.q)
      const playedPcs = new Set(buf.map((b) => ((b.midi % 12) + 12) % 12))
      // Liegt der Zieldreiklang (egal in welcher Lage)? sofort werten (snappy).
      if (playedPcs.size === 3 && [...targetPcs].every((pc) => playedPcs.has(pc))) {
        evaluate()
        return
      }
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
      settleTimerRef.current = setTimeout(evaluate, SETTLE_MS)
    })
    return () => unsub()
  }, [evaluate])

  // Start.
  useEffect(() => {
    nextRound()
    refreshSnap()
    return () => clearTimers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fortschritt fürs Lernziel w2 festhalten (lokal, nur höchste Stufe).
  const recordLevel = useProgressStore((s) => s.recordLevel)
  useEffect(() => {
    if (snap.erreicht) recordLevel('w2', 'erreicht')
    if (snap.verinnerlicht) recordLevel('w2', 'verinnerlicht')
    if (snap.gemeistert) recordLevel('w2', 'gemeistert')
  }, [snap, recordLevel])

  const handleRestart = () => {
    clearTimers()
    frontierRef.current = 0
    frontierResultsRef.current = []
    resultsRef.current = []
    builtRef.current = new Set()
    gripRef.current = new Set()
    lastRootRef.current = -1
    nextRound()
    refreshSnap()
  }

  const base = REGISTER[target.hand]
  const targetNotes = triadNotes(target.rootMidi, target.q)
  const showTarget = !snap.blind || reveal // Stütze (Tasten zeigen) oder Reveal

  const handleDown = (midi: number) => (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    playNote(midi)
  }
  const handleUp = (midi: number) => () => stopNote(midi)

  // Klaviatur über zwei Oktaven der aktuellen Hand.
  const whites: number[] = []
  const blacks: number[] = []
  for (let m = base; m < base + 24; m++) {
    if (isWhitePc(((m % 12) + 12) % 12)) whites.push(m)
    else blacks.push(m)
  }
  const WHITE_W = 100 / whites.length
  const whitesBelow = (m: number) => whites.filter((w) => w < m).length

  const chordName = `${midiToName(target.rootMidi)}-${QUAL_LABEL[target.q]}`

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
        <h2 className="font-display text-3xl text-amber-soft">Akkordgriff</h2>
        <div className="flex items-center gap-4 text-sm text-bone/60">
          <span className="tabular-nums" title="Trefferquote der letzten Griffe">
            {snap.samples ? Math.round(snap.acc * 100) : 0}% richtig
          </span>
          <span
            className="rounded-full border border-bone/15 px-2.5 py-0.5"
            title="Aktuelle Front — was gerade dazukommt"
          >
            {snap.stageLabel}
          </span>
        </div>
      </div>

      {/* Spielfeld */}
      <div className="relative mx-auto w-full max-w-3xl rounded-xl bg-ink-800/40 p-3 ring-1 ring-black/40 sm:p-4">
        {/* Aufforderung */}
        <div className="mb-2 flex flex-col items-center gap-1 py-2">
          <span className="text-sm text-bone/50">Greif den Akkord — {HAND_LABEL[target.hand]}</span>
          <span
            className="font-display text-6xl leading-none"
            style={{ color: feedback?.kind === 'miss' ? MISS : '#f0d49a' }}
          >
            {chordName}
          </span>
          <div className="mt-1 flex items-center gap-2 text-xs">
            {snap.grip && (
              <span className="rounded-full border border-bone/15 px-2 py-0.5 text-bone/55">als ein Griff</span>
            )}
            {snap.zugig && (
              <span className="rounded-full border border-bone/15 px-2 py-0.5 text-bone/55">zügig</span>
            )}
            <button
              type="button"
              onClick={() => playChord(targetNotes)}
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
              {feedback.sub && <span className="ml-2 text-sm text-bone/50">— {feedback.sub}</span>}
            </span>
          )}
        </div>

        {/* Klaviatur (zwei Oktaven der aktuellen Hand) */}
        <KeyboardViewport base={base} span={24} focus={targetNotes} className="mt-2">
        <div
          className="relative h-40 w-full select-none sm:h-48"
          style={{ touchAction: 'none' }}
          role="group"
          aria-label={`Klaviatur ${HAND_LABEL[target.hand]}`}
        >
          {whites.map((m, wi) => {
            const active = activeNotes.has(m)
            const isTarget = targetNotes.includes(m)
            const mark = showTarget && isTarget
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
                {!snap.blind && (
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
            const isTarget = targetNotes.includes(m)
            const mark = showTarget && isTarget
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
                  boxShadow: active
                    ? '0 0 14px rgba(224,177,94,0.5)'
                    : '0 3px 5px rgba(0,0,0,0.5)',
                  transform: active ? 'translateY(1.5px)' : 'none',
                }}
              >
                {mark && (
                  <span
                    className="pointer-events-none absolute bottom-1.5 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full"
                    style={{ background: GOLD, boxShadow: '0 0 8px rgba(224,177,94,0.95)' }}
                  />
                )}
                {!snap.blind && (
                  <span className="pointer-events-none mb-1 text-xs font-medium text-bone/70">
                    {midiToName(m)}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        </KeyboardViewport>
      </div>

      {/* Skala: erreicht / verinnerlicht / gemeistert */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-sm">
          {(
            [
              ['erreicht', snap.erreicht, 'Rezept angewandt: Dur & Moll als Weiß-Griff gebaut (Stütze erlaubt)'],
              [
                'verinnerlicht',
                snap.verinnerlicht,
                'Blind & als Griff: Dur + Moll, leichte + mittlere Griffe, eine Hand',
              ],
              [
                'gemeistert',
                snap.gemeistert,
                'Lernziel erfüllt: ganzer Raum — Dur + Moll × leicht/mittel/schwer × beide Hände, blind & als Griff',
              ],
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
        Rezept: Grundton → +4 → +3 Halbtöne = Dur, → +3 → +4 = Moll. Es wird
        schwerer, wenn's gut läuft, leichter, wenn's hakt — und Bekanntes wird immer
        wieder eingestreut. Das „als ein Griff"-Messen braucht ein Keyboard (per Maus
        kann man nur einzeln tippen). Kein Zeitdruck, keine Punkte.
      </p>
    </div>
  )
}
