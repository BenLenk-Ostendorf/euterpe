import { useSessionStore } from '../state/sessionStore'
import { ALL_KEYS } from '../music/theory'
import type { NoteName } from '../music/theory'

interface Props {
  onTogglePlay: () => void
  onKeyChange: (key: NoteName) => void
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (v: number) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-bone/70">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="tabular-nums text-bone/50">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-amber-glow"
      />
    </label>
  )
}

export default function TransportControls({ onTogglePlay, onKeyChange }: Props) {
  const isPlaying = useSessionStore((s) => s.isPlaying)
  const tempo = useSessionStore((s) => s.tempo)
  const setTempo = useSessionStore((s) => s.setTempo)
  const key = useSessionStore((s) => s.key)
  const backingVolume = useSessionStore((s) => s.backingVolume)
  const setBackingVolume = useSessionStore((s) => s.setBackingVolume)
  const pianoVolume = useSessionStore((s) => s.pianoVolume)
  const setPianoVolume = useSessionStore((s) => s.setPianoVolume)
  const appSoundEnabled = useSessionStore((s) => s.appSoundEnabled)
  const setAppSoundEnabled = useSessionStore((s) => s.setAppSoundEnabled)

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Großer, zentraler Play/Pause-Button */}
      <button
        type="button"
        onClick={onTogglePlay}
        className="group flex h-20 w-20 items-center justify-center rounded-full border border-amber-glow/40 bg-ink-700/60 transition-all duration-200 ease-soft hover:border-amber-glow hover:bg-ink-600/80"
        style={{ boxShadow: isPlaying ? '0 0 28px rgba(224,177,94,0.35)' : 'none' }}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="#e0b15e">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="#e0b15e">
            <path d="M8 5.5v13a1 1 0 0 0 1.54.84l10-6.5a1 1 0 0 0 0-1.68l-10-6.5A1 1 0 0 0 8 5.5z" />
          </svg>
        )}
      </button>

      {/* Reglerzeile */}
      <div className="grid w-full max-w-md grid-cols-2 gap-x-6 gap-y-4">
        <label className="flex flex-col gap-1 text-xs text-bone/70">
          <span>Tonart</span>
          <select
            value={key}
            onChange={(e) => onKeyChange(e.target.value as NoteName)}
            className="rounded-md border border-bone/15 bg-ink-700/70 px-2 py-1.5 text-sm text-bone focus:border-amber-glow focus:outline-none"
          >
            {ALL_KEYS.map((k) => (
              <option key={k} value={k}>
                {k}-Moll
              </option>
            ))}
          </select>
        </label>

        <Slider
          label="Tempo"
          value={tempo}
          min={60}
          max={140}
          suffix=" BPM"
          onChange={setTempo}
        />
        <Slider
          label="Backing"
          value={backingVolume}
          min={-40}
          max={0}
          suffix=" dB"
          onChange={setBackingVolume}
        />
        <Slider
          label="Klavier"
          value={pianoVolume}
          min={-40}
          max={0}
          suffix=" dB"
          onChange={setPianoVolume}
        />
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-xs text-bone/60">
        <input
          type="checkbox"
          checked={appSoundEnabled}
          onChange={(e) => setAppSoundEnabled(e.target.checked)}
          className="accent-amber-glow"
        />
        App-Sound für gespielte Noten
        <span className="text-bone/35">(aus, wenn dein Keyboard selbst klingt)</span>
      </label>
    </div>
  )
}
