import { useSessionStore } from '../state/sessionStore'
import { TWELVE_BAR_BLUES, chordLabelFor } from '../music/bluesProgression'

// Dezente Anzeige der Position im 12-Bar-Zyklus + aktueller Akkord.
// Keine Aufmerksamkeits-Konkurrenz zur Klaviatur.
export default function BarIndicator() {
  const currentBar = useSessionStore((s) => s.currentBar)
  const isPlaying = useSessionStore((s) => s.isPlaying)
  const key = useSessionStore((s) => s.key)

  const chord = chordLabelFor(TWELVE_BAR_BLUES[currentBar], key)

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-[3px]" aria-hidden>
        {TWELVE_BAR_BLUES.map((bar, i) => {
          const active = isPlaying && i === currentBar
          return (
            <span
              key={bar.bar}
              className="h-1.5 rounded-full transition-all duration-150 ease-soft"
              style={{
                width: active ? 22 : 14,
                background: active
                  ? 'linear-gradient(90deg,#f0d49a,#c8923c)'
                  : 'rgba(239,230,214,0.18)',
                boxShadow: active ? '0 0 10px rgba(224,177,94,0.6)' : 'none',
              }}
            />
          )
        })}
      </div>
      <div
        className="font-display text-2xl leading-none transition-colors"
        style={{ color: isPlaying ? '#e0b15e' : 'rgba(239,230,214,0.35)' }}
        aria-live="polite"
      >
        {isPlaying ? chord : '—'}
      </div>
    </div>
  )
}
