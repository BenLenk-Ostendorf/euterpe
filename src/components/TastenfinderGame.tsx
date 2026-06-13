import { useCallback, useEffect, useRef, useState } from 'react'
import { onNoteOn, playNote, stopNote } from '../audio/notePlayer'
import { useSessionStore } from '../state/sessionStore'
import { NOTE_NAMES } from '../music/theory'

// Tastenfinder — Drill für das Lernziel m1 "Du kannst jede Taste benennen".
//
// Anders als der Notenregen nennt dieser Modus nur den TONNAMEN (ohne zu
// zeigen, WO die Taste liegt) — du musst die Taste selbst finden. Genau das
// trainiert das Benennen: fällt der Name über seiner Taste herab, schaut man
// nur ab; hier muss man wissen, wo z.B. F# sitzt. Bewusst OHNE Zeitdruck —
// das Ziel ist, alle Tasten ruhig, fehlerfrei und BLIND zu finden. Die
// Tastenbeschriftung ist eine Stütze, die man fürs eigentliche Lernziel
// abschaltet. Feedback informiert, bewertet aber nie.

type Hand = 'L' | 'R'
const REGISTER_BASE: Record<Hand, number> = { L: 48, R: 60 } // C3 / C4
const HAND_LABEL: Record<Hand, string> = { L: 'Linke Hand', R: 'Rechte Hand' }

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11]
const BLACK_PCS = [1, 3, 6, 8, 10]
const ALL_PCS = Array.from({ length: 12 }, (_, i) => i)
const isWhitePc = (pc: number) => WHITE_PCS.includes(pc)

const GOLD = '#e0b15e'
const HIT = '#9bb88a'
const MISS = '#cf7d6b'

function whitesBefore(pc: number): number {
  let n = 0
  for (let p = 0; p < pc; p++) if (isWhitePc(p)) n++
  return n
}
const WHITE_W = 100 / WHITE_PCS.length

// Tastenumfang wächst, sobald die aktuelle Gruppe einmal gefunden wurde —
// coverage-getrieben, nicht tempo-getrieben: weiß → weiß + C#/F# → alle.
function poolForPhase(phase: number): number[] {
  if (phase <= 0) return WHITE_PCS
  if (phase === 1) return [...WHITE_PCS, 1, 6] // + C#, F#
  return ALL_PCS
}
const PHASE_LABEL = ['weiße Tasten', 'weiß + 2 schwarze', 'alle Tasten']

// Pro Hand verfolgter Lernstand.
interface HandState {
  everFound: Set<number> // je einmal korrekt gefunden (Stütze erlaubt)
  blindFound: Set<number> // korrekt gefunden mit AUSgeschalteter Beschriftung
  results: boolean[] // letzte Versuche (für die Trefferquote)
  phase: number
}
const freshHand = (): HandState => ({
  everFound: new Set(),
  blindFound: new Set(),
  results: [],
  phase: 0,
})

// Lernziel-Schwelle: blind alle 12 + ruhig/fehlerfrei (hohe Quote über Serie).
const ACC_WINDOW = 16
const MASTER_ACC = 0.9
const MASTER_MIN_SAMPLES = 12

interface Flash {
  pc: number
  type: 'hit' | 'wrong'
}
interface HandSnapshot {
  everFound: number
  blindFound: number
  accuracy: number
  samples: number
  verinnerlicht: boolean
  erreicht: boolean
}

export default function TastenfinderGame({ onExit }: { onExit: () => void }) {
  const activeNotes = useSessionStore((s) => s.activeNotes)

  const handsRef = useRef<Record<Hand, HandState>>({
    L: freshHand(),
    R: freshHand(),
  })
  const handRef = useRef<Hand>('R')
  const labelsRef = useRef(true)
  const targetRef = useRef<number>(0)

  const [hand, setHandState] = useState<Hand>('R')
  const [labelsOn, setLabelsOn] = useState(true)
  const [target, setTargetState] = useState<number>(0)
  const [flash, setFlash] = useState<Flash | null>(null)
  const [reveal, setReveal] = useState<number | null>(null) // bei Fehler kurz die richtige Taste zeigen
  const [snap, setSnap] = useState<Record<Hand, HandSnapshot>>({
    L: emptySnap(),
    R: emptySnap(),
  })
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const computeSnap = useCallback((h: HandState): HandSnapshot => {
    const samples = h.results.length
    const accuracy = samples ? h.results.filter(Boolean).length / samples : 0
    const erreicht = ALL_PCS.every((pc) => h.everFound.has(pc))
    const verinnerlicht =
      ALL_PCS.every((pc) => h.blindFound.has(pc)) &&
      samples >= MASTER_MIN_SAMPLES &&
      accuracy >= MASTER_ACC
    return {
      everFound: h.everFound.size,
      blindFound: h.blindFound.size,
      accuracy,
      samples,
      verinnerlicht,
      erreicht,
    }
  }, [])

  const refreshSnap = useCallback(() => {
    setSnap({
      L: computeSnap(handsRef.current.L),
      R: computeSnap(handsRef.current.R),
    })
  }, [computeSnap])

  // Nächstes Ziel ziehen: erst Abdeckung (noch nicht gefundene Tasten der
  // Phase bevorzugen), dann blinde Wiederholung — nie zweimal dieselbe direkt.
  const pickTarget = useCallback(() => {
    const h = handsRef.current[handRef.current]
    const pool = poolForPhase(h.phase)
    const blindMode = !labelsRef.current
    const missing = pool.filter((pc) =>
      blindMode ? !h.blindFound.has(pc) : !h.everFound.has(pc),
    )
    const from = missing.length ? missing : pool
    let pc = from[Math.floor(Math.random() * from.length)]
    let guard = 0
    while (pc === targetRef.current && from.length > 1 && guard < 8) {
      pc = from[Math.floor(Math.random() * from.length)]
      guard++
    }
    targetRef.current = pc
    setTargetState(pc)
  }, [])

  const doFlash = useCallback((f: Flash, revealPc: number | null) => {
    if (flashTimer.current) clearTimeout(flashTimer.current)
    setFlash(f)
    setReveal(revealPc)
    flashTimer.current = setTimeout(() => {
      setFlash(null)
      setReveal(null)
    }, f.type === 'hit' ? 320 : 520)
  }, [])

  // Eingabe verarbeiten (jede Quelle: Klick, MIDI, Computertastatur).
  useEffect(() => {
    const unsub = onNoteOn((midi) => {
      const pc = ((midi % 12) + 12) % 12
      const h = handsRef.current[handRef.current]
      const blindMode = !labelsRef.current
      const correct = pc === targetRef.current

      h.results.push(correct)
      if (h.results.length > ACC_WINDOW) h.results.shift()

      if (correct) {
        h.everFound.add(pc)
        if (blindMode) h.blindFound.add(pc)
        // Sitzt die ganze aktuelle Gruppe (einmal gefunden), kommt die
        // nächste Tastengruppe dazu — ohne Tempo, rein nach Abdeckung.
        const pool = poolForPhase(h.phase)
        if (h.phase < 2 && pool.every((p) => h.everFound.has(p))) h.phase += 1
        doFlash({ pc, type: 'hit' }, null)
        refreshSnap()
        pickTarget()
      } else {
        // Kein Strafmechanismus: gleiches Ziel bleibt, die richtige Taste
        // leuchtet kurz zur Orientierung auf.
        doFlash({ pc, type: 'wrong' }, targetRef.current)
        refreshSnap()
      }
    })
    return () => {
      unsub()
      if (flashTimer.current) clearTimeout(flashTimer.current)
    }
  }, [doFlash, pickTarget, refreshSnap])

  // Erstes Ziel ziehen.
  useEffect(() => {
    pickTarget()
    refreshSnap()
  }, [pickTarget, refreshSnap])

  const switchHand = (next: Hand) => {
    handRef.current = next
    setHandState(next)
    targetRef.current = -1
    pickTarget()
  }

  const toggleLabels = () => {
    const next = !labelsRef.current
    labelsRef.current = next
    setLabelsOn(next)
    // Im Blind-Modus auf eine noch nicht blind gefundene Taste umlenken.
    pickTarget()
  }

  const handleRestart = () => {
    handsRef.current = { L: freshHand(), R: freshHand() }
    targetRef.current = -1
    pickTarget()
    refreshSnap()
  }

  const base = REGISTER_BASE[hand]
  const handleDown = (pc: number) => (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    playNote(base + pc)
  }
  const handleUp = (pc: number) => () => stopNote(base + pc)

  const gemeistert = snap.L.verinnerlicht && snap.R.verinnerlicht
  const cur = snap[hand]

  const keyFill = (pc: number, active: boolean, white: boolean) => {
    if (flash?.pc === pc) return flash.type === 'hit' ? HIT : MISS
    if (reveal === pc) return GOLD
    if (active)
      return white
        ? 'linear-gradient(180deg,#f6ecd8,#e9d9b8)'
        : 'linear-gradient(180deg,#5a4628,#3a2c16)'
    return white
      ? 'linear-gradient(180deg,#fbf6ec,#e7ddca)'
      : 'linear-gradient(180deg,#2a2420,#0c0a08)'
  }

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
        <h2 className="font-display text-3xl text-amber-soft">Tastenfinder</h2>
        <div className="flex items-center gap-4 text-sm text-bone/60">
          <span className="tabular-nums" title="Trefferquote dieser Hand">
            {cur.samples ? Math.round(cur.accuracy * 100) : 0}% richtig
          </span>
          <span
            className="rounded-full border border-bone/15 px-2.5 py-0.5"
            title="Aktueller Tastenumfang — wächst nach Abdeckung"
          >
            {PHASE_LABEL[handsRef.current[hand].phase]}
          </span>
        </div>
      </div>

      {/* Hand- und Beschriftungs-Wahl */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-full border border-bone/15 p-1 text-sm">
          {(['L', 'R'] as Hand[]).map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => switchHand(h)}
              className="ease-soft rounded-full px-3 py-1 transition-colors"
              style={{
                background: hand === h ? 'rgba(224,177,94,0.18)' : 'transparent',
                color: hand === h ? '#f0d49a' : 'rgba(239,230,214,0.6)',
              }}
            >
              {HAND_LABEL[h]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={toggleLabels}
          className="ease-soft rounded-full border px-4 py-1.5 text-sm transition-colors"
          style={{
            borderColor: labelsOn ? 'rgba(239,230,214,0.18)' : HIT,
            color: labelsOn ? 'rgba(239,230,214,0.7)' : HIT,
            background: labelsOn ? 'transparent' : 'rgba(155,184,138,0.10)',
          }}
          title="Fürs Lernziel zählt nur das blinde Finden ohne Beschriftung"
        >
          {labelsOn ? 'Tastennamen: an' : '✓ Blind (Namen aus)'}
        </button>
      </div>

      {/* Aufforderung + Klaviatur */}
      <div className="relative mx-auto w-full max-w-2xl rounded-xl bg-ink-800/40 p-3 ring-1 ring-black/40 sm:p-4">
        <div className="mb-3 flex flex-col items-center gap-1 py-2">
          <span className="text-sm text-bone/50">Finde die Taste</span>
          <span
            className="font-display text-6xl leading-none"
            style={{ color: flash?.type === 'wrong' ? MISS : '#f0d49a' }}
          >
            {NOTE_NAMES[target]}
          </span>
        </div>

        {/* Klaviatur (eine Oktave der gewählten Hand) */}
        <div
          className="relative mt-2 h-40 w-full select-none sm:h-48"
          style={{ touchAction: 'none' }}
          role="group"
          aria-label={`Klaviatur ${HAND_LABEL[hand]}`}
        >
          {WHITE_PCS.map((pc, wi) => {
            const active = activeNotes.has(base + pc)
            return (
              <button
                key={pc}
                type="button"
                aria-label={NOTE_NAMES[pc]}
                onPointerDown={handleDown(pc)}
                onPointerUp={handleUp(pc)}
                onPointerLeave={handleUp(pc)}
                onPointerCancel={handleUp(pc)}
                className="ease-soft absolute bottom-0 top-0 flex items-end justify-center rounded-b-md border border-black/40 pb-2 transition-[transform,background-color] duration-100"
                style={{
                  left: `${wi * WHITE_W}%`,
                  width: `${WHITE_W}%`,
                  zIndex: 1,
                  background: keyFill(pc, active, true),
                  boxShadow: active
                    ? 'inset 0 -3px 10px rgba(176,130,52,0.45)'
                    : 'inset 0 -4px 8px rgba(0,0,0,0.18)',
                  transform: active ? 'translateY(1.5px)' : 'none',
                }}
              >
                {labelsOn && (
                  <span className="pointer-events-none text-sm font-medium text-ink-700/60">
                    {NOTE_NAMES[pc]}
                  </span>
                )}
              </button>
            )
          })}
          {BLACK_PCS.map((pc) => {
            const left = whitesBefore(pc) * WHITE_W - (WHITE_W * 0.62) / 2
            const active = activeNotes.has(base + pc)
            return (
              <button
                key={pc}
                type="button"
                aria-label={NOTE_NAMES[pc]}
                onPointerDown={handleDown(pc)}
                onPointerUp={handleUp(pc)}
                onPointerLeave={handleUp(pc)}
                onPointerCancel={handleUp(pc)}
                className="ease-soft absolute top-0 flex items-end justify-center rounded-b-md transition-[transform,background-color] duration-100"
                style={{
                  left: `${left}%`,
                  width: `${WHITE_W * 0.62}%`,
                  height: '62%',
                  zIndex: 2,
                  background: keyFill(pc, active, false),
                  border: '1px solid #000',
                  boxShadow: active
                    ? '0 0 14px rgba(224,177,94,0.5)'
                    : '0 3px 5px rgba(0,0,0,0.5)',
                  transform: active ? 'translateY(1.5px)' : 'none',
                }}
              >
                {labelsOn && (
                  <span className="pointer-events-none mb-1 text-xs font-medium text-bone/70">
                    {NOTE_NAMES[pc]}
                  </span>
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
              [
                'erreicht',
                cur.erreicht,
                `${HAND_LABEL[hand]}: jede Taste einmal gefunden (Stütze erlaubt) — ${cur.everFound}/12`,
              ],
              [
                'verinnerlicht',
                cur.verinnerlicht,
                `${HAND_LABEL[hand]}: alle Tasten blind & sicher gefunden — ${cur.blindFound}/12 blind`,
              ],
              [
                'gemeistert',
                gemeistert,
                'Lernziel erfüllt: beide Hände blind & fehlerfrei',
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

      {/* Beide-Hände-Stand, damit "gemeistert" nachvollziehbar ist */}
      <div className="flex items-center justify-center gap-4 text-xs text-bone/45">
        {(['L', 'R'] as Hand[]).map((h) => (
          <span key={h}>
            {HAND_LABEL[h]}: {snap[h].verinnerlicht ? 'blind sicher ✓' : `${snap[h].blindFound}/12 blind`}
          </span>
        ))}
      </div>

      <p className="text-center text-sm text-bone/45">
        Es wird ein Tonname genannt — finde die Taste. Kein Zeitdruck: Ziel ist,
        jede Taste ruhig und ohne Fehler zu treffen. Schalt die Tastennamen ab,
        sobald du dich traust — nur das blinde Finden zählt fürs Lernziel, sonst
        liest man bloß ab.
      </p>
    </div>
  )
}

function emptySnap(): HandSnapshot {
  return {
    everFound: 0,
    blindFound: 0,
    accuracy: 0,
    samples: 0,
    verinnerlicht: false,
    erreicht: false,
  }
}
