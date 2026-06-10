import * as Tone from 'tone'

// Dünne Hülle um Tone.Transport: Tempo, Swing (Shuffle-Feel) und Bar-Tracking.
// Der Loop selbst (12 Takte) wird in backingTrack.ts aufgebaut.

let barTickerId: number | null = null

export function configureTransport(tempo: number) {
  const t = Tone.getTransport()
  t.bpm.value = tempo
  // Shuffle-Feel: Achtel swingen.
  t.swing = 0.55
  t.swingSubdivision = '8n'
  t.loop = true
  t.loopStart = 0
  t.loopEnd = '12m'
}

export function setTempo(tempo: number) {
  Tone.getTransport().bpm.rampTo(tempo, 0.1)
}

export function startTransport() {
  // Etwas Vorlauf, damit der erste Hit sauber sitzt.
  Tone.getTransport().start('+0.05')
}

export function stopTransport() {
  Tone.getTransport().stop()
}

/** Aktuellen Takt (0–11) periodisch melden. */
export function registerBarTicker(onBar: (bar: number) => void) {
  clearBarTicker()
  let last = -1
  barTickerId = Tone.getTransport().scheduleRepeat((time) => {
    Tone.getDraw().schedule(() => {
      const pos = Tone.getTransport().position as string
      const bar = parseInt(pos.split(':')[0], 10) % 12
      if (bar !== last) {
        last = bar
        onBar(bar)
      }
    }, time)
  }, '8n')
}

export function clearBarTicker() {
  if (barTickerId !== null) {
    Tone.getTransport().clear(barTickerId)
    barTickerId = null
  }
}
