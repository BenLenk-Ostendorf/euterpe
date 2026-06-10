# Euterpe — Improvisation-First Keyboard Learning App

> **Euterpe ist kein Kurs. Euterpe ist ein Ort, an dem man sofort Musik macht.**

Eine Improvisations-Sandbox fürs Keyboard: Pentatonik-Tasten sind markiert, ein
12-Bar-Blues groovt im Loop, und vom ersten Tastendruck an klingt es nach Musik —
es gibt keine falschen Töne. MIDI-Keyboard, Maus oder Computertastatur (A–L).

Dies ist **Iteration 1** — die Validierung der Erfolgs-Hypothese: Trägt der Core
Loop intrinsisch? (Siehe `EUTERPE_PROJECT_BRIEF.md` §4.7.)

## Schnellstart

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # Produktionsbuild nach dist/
npm run preview  # gebauten Build lokal servieren
```

> **Hinweis:** Web MIDI braucht einen Secure Context (HTTPS oder localhost) und
> Chrome/Edge/Opera bzw. Firefox 108+. Safari/iOS hat **kein** MIDI — dort greift
> der Computertastatur-/Maus-Fallback automatisch.

## Bedienung

- **Los geht's** entsperrt das Audio (Browser-Autoplay-Policy) und startet den Groove.
- **Markierte Tasten** (goldene Punkte) = die Moll-Pentatonik der Tonart.
- Spielen über **MIDI-Keyboard**, **Maus/Touch** auf der Bildschirmklaviatur oder
  die Reihe **A S D F G H J K L** (spielt die Pentatonik aufsteigend, nicht chromatisch).
- Tonart, Tempo (60–140 BPM) und Lautstärken sind live regelbar.
- **App-Sound für gespielte Noten** ausschalten, wenn das MIDI-Keyboard selbst klingt.

## Architektur

```
src/
├── App.tsx                 # Layout + Session-Orchestrierung
├── audio/
│   ├── transport.ts        # Tone.Transport: Tempo, Swing, 12-Bar-Loop, Bar-Tracking
│   ├── backingTrack.ts     # Walking-Bass + Shell-Voicings + Shuffle-Drums (alles Synths)
│   ├── pianoSampler.ts     # Klang gespielter Noten (Salamander-Sampler, PolySynth-Fallback)
│   └── notePlayer.ts       # Einheitlicher Pfad: Eingabe -> Store + Klang
├── midi/
│   ├── useMidi.ts          # WEBMIDI.js: Geräte, noteon/noteoff, Hot-Plugging
│   └── useKeyboardFallback.ts # Computertastatur -> Pentatonik-Noten
├── music/
│   ├── theory.ts           # MIDI/Notennamen, Moll-Pentatonik-Berechnung
│   └── bluesProgression.ts # 12-Bar-Blues als Datenmodell (nicht hartkodiert)
├── components/
│   ├── Keyboard.tsx        # Bildschirmklaviatur C3–C5, Highlighting, Pointer-Input
│   ├── TransportControls.tsx
│   ├── BarIndicator.tsx
│   ├── MidiStatus.tsx
│   └── Onboarding.tsx
└── state/
    └── sessionStore.ts     # Zustand-Store: Tonart, Tempo, Playing, aktive Noten
```

**Datenfluss:** Jede Eingabequelle (Klick / MIDI / Tastatur) läuft durch
`notePlayer.playNote/stopNote` → aktualisiert `sessionStore.activeNotes` (Taste
leuchtet) und triggert `pianoSampler` (Ton). Der `Tone.Transport` spielt den
Backing-Track-Loop und meldet den aktuellen Takt an den Store (BarIndicator).

## Designprinzipien (bewusst eingehalten)

- **Kein Scoring, keine Punkte/Streaks, keine Bewertung** — Overjustification-Risiko.
  In der Sandbox gibt es kein „Falsch". Nicht-Pentatonik-Tasten bleiben spielbar.
- **Kein Backend, kein Account, kein Tracking** — V1 ist ein lokales Experiment.
- **Dark Academia trifft Jazz-Club** — warmes Anthrazit/Mahagoni, Pentatonik in Gold.
- **Accessibility:** sichtbarer Tastatur-Fokus, `prefers-reduced-motion` respektiert,
  `aria-label`/`aria-pressed` auf den Tasten.

## Tech-Stack

Vite · React 19 · TypeScript · Tailwind CSS · Tone.js · WEBMIDI.js · Zustand.

## Was Iteration 1 bewusst NICHT enthält

Richtig/Falsch-Bewertung, Gamification, Accounts, Curriculum, Notendarstellung,
Mikrofon-Pitch-Erkennung, Aufnahme. → Stage 2/3 (siehe `EUTERPE_ERWEITERUNGEN.md`),
**erst** nach Bestätigung der Erfolgs-Hypothese.
