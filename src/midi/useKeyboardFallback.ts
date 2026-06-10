import { useEffect, useMemo, useRef } from 'react'
import { useSessionStore } from '../state/sessionStore'
import { ascendingPentatonic } from '../music/theory'
import { playNote, stopNote } from '../audio/notePlayer'

// Computertastatur als Eingabe-Fallback (Safari/iOS, kein MIDI-Gerät).
// Die Buchstabenreihe spielt die Moll-Pentatonik der Tonart aufsteigend —
// bewusst NICHT chromatisch, damit dasselbe "keine falschen Töne"-Gefühl entsteht.
const KEY_ROW = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l']
const START_MIDI = 57 // ~A3, angenehme mittlere Lage

/**
 * Aktiviert das Tastatur-Listening und gibt die Zuordnung MIDI -> Buchstabe
 * zurück, damit die Bildschirm-Klaviatur die Tasten beschriften kann.
 */
export function useKeyboardFallback(): Record<number, string> {
  const key = useSessionStore((s) => s.key)

  const { midis, midiToLabel, keyToMidi } = useMemo(() => {
    const midis = ascendingPentatonic(key, START_MIDI, KEY_ROW.length)
    const midiToLabel: Record<number, string> = {}
    const keyToMidi: Record<string, number> = {}
    KEY_ROW.forEach((letter, i) => {
      midiToLabel[midis[i]] = letter.toUpperCase()
      keyToMidi[letter] = midis[i]
    })
    return { midis, midiToLabel, keyToMidi }
  }, [key])

  const pressed = useRef<Set<string>>(new Set())

  useEffect(() => {
    const isTypingTarget = (el: EventTarget | null) => {
      const node = el as HTMLElement | null
      if (!node) return false
      const tag = node.tagName
      return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
    }

    const onDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      if (isTypingTarget(e.target)) return
      const k = e.key.toLowerCase()
      const midi = keyToMidi[k]
      if (midi === undefined) return
      if (pressed.current.has(k)) return
      pressed.current.add(k)
      e.preventDefault()
      playNote(midi)
    }
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      const midi = keyToMidi[k]
      if (midi === undefined) return
      pressed.current.delete(k)
      stopNote(midi)
    }

    const pressedSet = pressed.current
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      // Hängende Noten lösen, wenn sich die Tonart-Zuordnung ändert.
      pressedSet.forEach((k) => stopNote(keyToMidi[k]))
      pressedSet.clear()
    }
  }, [keyToMidi])

  // midis nur referenzieren, damit der Linter zufrieden ist und die Lage stimmt.
  void midis
  return midiToLabel
}
