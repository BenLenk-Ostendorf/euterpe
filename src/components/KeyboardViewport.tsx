import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// Tastatur-Fenster fuer kleine Schirme.
//
// Problem: 2 Oktaven (~14 weisse Tasten) auf 73 mm Handy-Breite = ~5 mm pro
// Taste -> schmaler als ein Finger. Quer waeren die Tasten breit genug, aber
// dann passt die uebrige UI nicht in die Hoehe.
//
// Loesung (eine Mechanik fuer beide Lagen): Der Wrapper misst die echte
// Breite. Ist sie zu schmal, wird nur ein Ausschnitt (~8 Tasten) gross gezeigt
// und mit < > eine Oktave verschoben; auf den Fokus-Ton wird automatisch
// zentriert. Ist sie breit genug (quer / Desktop), wird die volle Klaviatur
// unveraendert durchgereicht (kein Zoom, keine Pfeile).
//
// Die Kinder bleiben die bestehende, prozent-positionierte Klaviatur jedes
// Spiels (w-full) — ihre Tasten-/Highlight-Logik wird NICHT angefasst.

const WHITE_PCS = new Set([0, 2, 4, 5, 7, 9, 11])
const isWhite = (m: number) => WHITE_PCS.has(((m % 12) + 12) % 12)

interface Props {
  /** Tiefster MIDI-Ton der vollen Klaviatur. */
  base: number
  /** Halbton-Spanne (z. B. 24 = 2 Oktaven). */
  span: number
  /** Toene, die sichtbar bleiben sollen (Auto-Zentrierung, nur im Fenster-Modus). */
  focus?: number[]
  /** Ziel-Breite pro weisser Taste in px — steuert, wie viele Tasten ins Fenster passen. */
  targetWhitePx?: number
  className?: string
  children: React.ReactNode
}

export default function KeyboardViewport({
  base,
  span,
  focus,
  targetWhitePx = 38,
  className = '',
  children,
}: Props) {
  const outerRef = useRef<HTMLDivElement>(null)
  const [outerW, setOuterW] = useState(0)

  useLayoutEffect(() => {
    const el = outerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setOuterW(e.contentRect.width)
    })
    ro.observe(el)
    setOuterW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // Weisse Tasten der vollen Spanne zaehlen + Index je weisse Taste merken.
  let whitesTotal = 0
  const whiteIndexOf: Record<number, number> = {}
  for (let m = base; m < base + span; m++) {
    if (isWhite(m)) {
      whiteIndexOf[m] = whitesTotal
      whitesTotal++
    }
  }

  const measured = outerW > 0
  const visible = measured
    ? Math.max(7, Math.min(whitesTotal, Math.floor(outerW / targetWhitePx)))
    : whitesTotal
  const zoomed = visible < whitesTotal
  const zoom = zoomed ? whitesTotal / visible : 1
  const maxOffset = Math.max(0, whitesTotal - visible)

  const [offset, setOffset] = useState(0)

  // offset immer im gueltigen Bereich halten (z. B. nach Groessenaenderung).
  useEffect(() => {
    setOffset((s) => Math.max(0, Math.min(maxOffset, s)))
  }, [maxOffset])

  // weisser Index eines Tons (schwarze Taste -> die weisse direkt darunter).
  const whiteIndexNear = (midi: number): number => {
    let m = midi
    let wi = whiteIndexOf[m]
    while (wi === undefined && m > base) {
      m--
      wi = whiteIndexOf[m]
    }
    return wi ?? 0
  }

  // Auto-Zentrierung auf die MITTE aller Fokus-Toene (so passt z. B. ein ganzer
  // Akkord ins Fenster, nicht nur der Grundton).
  const focusKey = focus && focus.length ? focus.join(',') : ''
  useEffect(() => {
    if (!zoomed || !focus || !focus.length) return
    const idxs = focus.map(whiteIndexNear)
    const center = (Math.min(...idxs) + Math.max(...idxs)) / 2
    setOffset(Math.max(0, Math.min(maxOffset, Math.round(center - visible / 2))))
    // whiteIndexNear/base sind aus base/span ableitbar -> bewusst nicht in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, zoomed, visible, maxOffset])

  const step = (d: number) =>
    setOffset((s) => Math.max(0, Math.min(maxOffset, s + d)))

  const translatePct = zoomed ? (offset / whitesTotal) * 100 : 0

  return (
    <div className={className}>
      {zoomed && (
        <div className="mb-1 flex items-center justify-between">
          <button
            type="button"
            onClick={() => step(-7)}
            disabled={offset <= 0}
            aria-label="Tiefere Tasten anzeigen"
            className="rounded-md border border-bone/20 px-4 py-1 text-bone/70 transition-opacity disabled:opacity-25"
          >
            ◀
          </button>
          <span className="text-xs text-bone/40">Tasten verschieben</span>
          <button
            type="button"
            onClick={() => step(7)}
            disabled={offset >= maxOffset}
            aria-label="Hoehere Tasten anzeigen"
            className="rounded-md border border-bone/20 px-4 py-1 text-bone/70 transition-opacity disabled:opacity-25"
          >
            ▶
          </button>
        </div>
      )}
      <div ref={outerRef} className="w-full overflow-hidden">
        <div
          style={{
            width: `${zoom * 100}%`,
            transform: `translateX(-${translatePct}%)`,
            transition: 'transform 160ms ease-out',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
