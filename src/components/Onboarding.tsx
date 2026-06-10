// Startscreen: ein Satz, ein Button. Kein Tutorial.
// Der Button ist zugleich die nötige User-Geste zum Entsperren des Audios.
export default function Onboarding({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-10 px-6 text-center">
      <div className="flex flex-col items-center gap-5">
        <h1 className="font-display text-6xl tracking-wide text-amber-soft sm:text-7xl">
          Euterpe
        </h1>
        <p className="max-w-md text-lg leading-relaxed text-bone/80">
          Die <span className="text-amber-glow">markierten Tasten</span> sind
          deine. Drück Play und spiel — es gibt keine falschen Töne.
        </p>
      </div>

      <button
        type="button"
        onClick={onStart}
        autoFocus
        className="flex items-center gap-3 rounded-full border border-amber-glow/50 bg-ink-700/70 px-8 py-4 text-lg text-amber-soft transition-all duration-200 ease-soft hover:border-amber-glow hover:bg-ink-600 hover:shadow-[0_0_32px_rgba(224,177,94,0.35)]"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="#e0b15e">
          <path d="M8 5.5v13a1 1 0 0 0 1.54.84l10-6.5a1 1 0 0 0 0-1.68l-10-6.5A1 1 0 0 0 8 5.5z" />
        </svg>
        Los geht&rsquo;s
      </button>

      <p className="text-xs text-bone/40">
        Keyboard per USB? Dann spielst du direkt darauf. Sonst: Maus oder die
        Tasten A–L.
      </p>
    </div>
  )
}
