import type { UseMidi } from '../midi/useMidi'

// Statuszeile: verbundenes Gerät bzw. Hinweis auf den Tastatur-/Maus-Fallback.
export default function MidiStatus({ midi }: { midi: UseMidi }) {
  const { status, devices, selectedId, selectDevice } = midi

  let dot = '#6b6157'
  let text: string
  switch (status) {
    case 'connected':
      dot = '#7fbf8f'
      break
    case 'no-device':
    case 'disabled':
      dot = '#c8923c'
      break
    case 'unsupported':
      dot = '#9a6b6b'
      break
  }

  const current = devices.find((d) => d.id === selectedId)

  if (status === 'connected') {
    text = `Verbunden: ${current?.name ?? 'MIDI-Gerät'}`
  } else if (status === 'no-device') {
    text = 'Kein MIDI-Gerät — spiel mit Maus oder Tastatur (A–L)'
  } else if (status === 'disabled') {
    text = 'MIDI nicht aktiviert — Maus oder Tastatur (A–L) gehen trotzdem'
  } else {
    text = 'Dein Browser unterstützt kein MIDI — nutze Tastatur (A–L) oder Maus'
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-bone/55">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: dot, boxShadow: `0 0 8px ${dot}` }}
        aria-hidden
      />
      <span>🎹 {text}</span>

      {status === 'connected' && devices.length > 1 && (
        <select
          value={selectedId ?? ''}
          onChange={(e) => selectDevice(e.target.value)}
          className="rounded border border-bone/15 bg-ink-700/70 px-1.5 py-0.5 text-bone/80 focus:border-amber-glow focus:outline-none"
        >
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
