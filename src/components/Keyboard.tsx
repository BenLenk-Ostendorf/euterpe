import { useMemo } from 'react'
import { useSessionStore } from '../state/sessionStore'
import { playNote, stopNote } from '../audio/notePlayer'
import {
  isInMinorPentatonic,
  midiToName,
  midiToScientific,
} from '../music/theory'

// Bildschirm-Klaviatur, 2 Oktaven C3–C5 (MIDI 48–72).
const FIRST_MIDI = 48 // C3
const LAST_MIDI = 72 // C5

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11]
const isWhite = (midi: number) => WHITE_PCS.includes(((midi % 12) + 12) % 12)

interface KeyMeta {
  midi: number
  white: boolean
  /** Index unter den weißen Tasten (nur für weiße gesetzt). */
  whiteIndex: number
  /** Fallback-Tastatur-Label (z.B. "A"), optional. */
  fallbackLabel?: string
}

export interface KeyboardProps {
  /** MIDI -> Buchstabe der Computertastatur (Fallback-Hinweis auf den Tasten). */
  fallbackLabels?: Record<number, string>
}

export default function Keyboard({ fallbackLabels }: KeyboardProps) {
  const musicKey = useSessionStore((s) => s.key)
  const activeNotes = useSessionStore((s) => s.activeNotes)

  const { keys, whiteCount } = useMemo(() => {
    const keys: KeyMeta[] = []
    let wi = 0
    for (let midi = FIRST_MIDI; midi <= LAST_MIDI; midi++) {
      const white = isWhite(midi)
      keys.push({ midi, white, whiteIndex: white ? wi : -1 })
      if (white) wi++
    }
    return { keys, whiteCount: wi }
  }, [])

  // Maße in % der Gesamtbreite, damit das Layout responsiv skaliert.
  const whiteW = 100 / whiteCount
  const blackW = whiteW * 0.62

  const whiteKeys = keys.filter((k) => k.white)
  const blackKeys = keys.filter((k) => !k.white)

  const handleDown = (midi: number) => (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    playNote(midi)
  }
  const handleUp = (midi: number) => () => stopNote(midi)

  return (
    <div className="select-none">
      <div
        className="relative mx-auto w-full"
        style={{ aspectRatio: `${whiteCount * 1.1} / 5`, touchAction: 'none' }}
        role="group"
        aria-label="Bildschirm-Klaviatur"
      >
        {/* Weiße Tasten */}
        {whiteKeys.map((k) => {
          const active = activeNotes.has(k.midi)
          const penta = isInMinorPentatonic(k.midi, musicKey)
          const label = fallbackLabels?.[k.midi]
          return (
            <button
              key={k.midi}
              type="button"
              aria-label={`${midiToScientific(k.midi)}${penta ? ', Pentatonik' : ''}`}
              aria-pressed={active}
              onPointerDown={handleDown(k.midi)}
              onPointerUp={handleUp(k.midi)}
              onPointerLeave={handleUp(k.midi)}
              onPointerCancel={handleUp(k.midi)}
              className="absolute bottom-0 top-0 flex items-end justify-center rounded-b-md border border-black/40 pb-3 transition-[transform,background-color,box-shadow] duration-100 ease-soft"
              style={{
                left: `${k.whiteIndex * whiteW}%`,
                width: `${whiteW}%`,
                zIndex: 1,
                background: active
                  ? 'linear-gradient(180deg,#f6ecd8,#e9d9b8)'
                  : 'linear-gradient(180deg,#fbf6ec,#e7ddca)',
                boxShadow: active
                  ? 'inset 0 -3px 10px rgba(176,130,52,0.55), 0 0 22px rgba(224,177,94,0.5)'
                  : 'inset 0 -4px 8px rgba(0,0,0,0.18)',
                transform: active ? 'translateY(1.5px)' : 'none',
              }}
            >
              {penta && (
                <span
                  className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2"
                  style={{
                    width: '22%',
                    aspectRatio: '1',
                    borderRadius: '9999px',
                    background:
                      'radial-gradient(circle at 35% 30%, #f0d49a, #c8923c)',
                    boxShadow: '0 0 10px rgba(224,177,94,0.7)',
                  }}
                />
              )}
              <span className="pointer-events-none relative z-10 text-[10px] font-medium text-ink-700/70">
                {label ?? (k.midi % 12 === 0 ? midiToName(k.midi) : '')}
              </span>
            </button>
          )
        })}

        {/* Schwarze Tasten (über den weißen) */}
        {blackKeys.map((k) => {
          // Position: zwischen vorheriger und nächster weißer Taste.
          // whiteIndex der vorhergehenden weißen Taste = Anzahl weißer Tasten < midi.
          let whitesBefore = 0
          for (let m = FIRST_MIDI; m < k.midi; m++) if (isWhite(m)) whitesBefore++
          const center = whitesBefore * whiteW // rechte Kante der vorherigen weißen Taste
          const left = center - blackW / 2
          const active = activeNotes.has(k.midi)
          const penta = isInMinorPentatonic(k.midi, musicKey)
          const label = fallbackLabels?.[k.midi]
          return (
            <button
              key={k.midi}
              type="button"
              aria-label={`${midiToScientific(k.midi)}${penta ? ', Pentatonik' : ''}`}
              aria-pressed={active}
              onPointerDown={handleDown(k.midi)}
              onPointerUp={handleUp(k.midi)}
              onPointerLeave={handleUp(k.midi)}
              onPointerCancel={handleUp(k.midi)}
              className="absolute top-0 flex items-end justify-center rounded-b-md transition-[transform,background-color,box-shadow] duration-100 ease-soft"
              style={{
                left: `${left}%`,
                width: `${blackW}%`,
                height: '62%',
                zIndex: 2,
                background: active
                  ? 'linear-gradient(180deg,#5a4628,#3a2c16)'
                  : 'linear-gradient(180deg,#2a2420,#0c0a08)',
                border: '1px solid #000',
                boxShadow: active
                  ? '0 0 20px rgba(224,177,94,0.6), inset 0 -3px 6px rgba(224,177,94,0.4)'
                  : '0 3px 5px rgba(0,0,0,0.5)',
                transform: active ? 'translateY(1.5px)' : 'none',
              }}
            >
              {penta && (
                <span
                  className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2"
                  style={{
                    width: '34%',
                    aspectRatio: '1',
                    borderRadius: '9999px',
                    background:
                      'radial-gradient(circle at 35% 30%, #f0d49a, #c8923c)',
                    boxShadow: '0 0 8px rgba(224,177,94,0.8)',
                  }}
                />
              )}
              {label && (
                <span className="pointer-events-none relative z-10 mb-1 text-[9px] font-medium text-bone/80">
                  {label}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
