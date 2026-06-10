import { useEffect, useRef, useState } from 'react'
import { WebMidi } from 'webmidi'
import type { Input } from 'webmidi'
import { playNote, stopNote } from '../audio/notePlayer'

export type MidiStatus =
  | 'unsupported' // Browser ohne Web-MIDI (z.B. Safari/iOS)
  | 'disabled' // noch nicht aktiviert / Berechtigung ausstehend
  | 'no-device' // aktiviert, aber kein Gerät
  | 'connected'

export interface MidiDevice {
  id: string
  name: string
}

export interface UseMidi {
  status: MidiStatus
  devices: MidiDevice[]
  selectedId: string | null
  selectDevice: (id: string) => void
}

const isSupported = () =>
  typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator

export function useMidi(): UseMidi {
  const [status, setStatus] = useState<MidiStatus>(
    isSupported() ? 'disabled' : 'unsupported',
  )
  const [devices, setDevices] = useState<MidiDevice[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedRef = useRef<string | null>(null)
  const boundRef = useRef<Input | null>(null)

  // Listener an ein Input-Gerät hängen.
  const bindInput = (input: Input | null) => {
    if (boundRef.current) {
      boundRef.current.removeListener()
      boundRef.current = null
    }
    if (!input) return
    input.addListener('noteon', (e) => {
      playNote(e.note.number, e.note.attack ?? 0.8)
    })
    input.addListener('noteoff', (e) => {
      stopNote(e.note.number)
    })
    boundRef.current = input
  }

  const refresh = () => {
    const list = WebMidi.inputs.map((i) => ({ id: i.id, name: i.name }))
    setDevices(list)
    if (list.length === 0) {
      setStatus('no-device')
      selectedRef.current = null
      setSelectedId(null)
      bindInput(null)
      return
    }
    // Aktuelle Auswahl behalten, sonst erstes Gerät automatisch verbinden.
    const keep = list.find((d) => d.id === selectedRef.current)
    const chosen = keep ?? list[0]
    selectedRef.current = chosen.id
    setSelectedId(chosen.id)
    bindInput(WebMidi.getInputById(chosen.id) ?? null)
    setStatus('connected')
  }

  useEffect(() => {
    if (!isSupported()) return
    let cancelled = false

    const enable = async () => {
      try {
        await WebMidi.enable()
        if (cancelled) return
        refresh()
        WebMidi.addListener('connected', refresh)
        WebMidi.addListener('disconnected', refresh)
      } catch {
        if (!cancelled) setStatus('disabled')
      }
    }
    enable()

    return () => {
      cancelled = true
      WebMidi.removeListener('connected', refresh)
      WebMidi.removeListener('disconnected', refresh)
      bindInput(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectDevice = (id: string) => {
    selectedRef.current = id
    setSelectedId(id)
    bindInput(WebMidi.getInputById(id) ?? null)
    setStatus('connected')
  }

  return { status, devices, selectedId, selectDevice }
}
