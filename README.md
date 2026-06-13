# Euterpe — Improvisation-First Keyboard Learning App

> **Euterpe ist kein Kurs. Euterpe ist ein Ort, an dem man sofort Musik macht.**

Eine Improvisations-Sandbox fürs Keyboard mit einem vorgelagerten **Lernpfad**:
Der Einstieg ist ein Lernzielgraph („Du kannst …"), von dem aus man entweder
**frei spielt** (Pentatonik-Sandbox über einem 12-Bar-Blues) oder eine
**Challenge** öffnet, die gezielt auf ein Lernziel hinführt. Vom ersten
Tastendruck an klingt es nach Musik — es gibt keine falschen Töne und keine
Bewertung. MIDI-Keyboard, Maus oder Computertastatur (A–L).

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

## Ansichten

- **Lernpfad (Startseite):** 20 Lernziele in Ebenen mit Abhängigkeitspfeilen,
  gruppiert nach Mechanik / Wissen / Gehör / Anwendung bis zum Ziel „ein gehörtes
  Lied selbst begleiten". Reine Orientierung — kein Fortschrittsbalken, kein Scoring.
  Hover hebt die Verbindungen eines Ziels hervor, Klick zeigt Details. Von hier aus
  startet man den freien Modus oder eine Challenge.
- **Freier Modus (Sandbox):** Bildschirmklaviatur C3–C5, markierte Pentatonik-Tasten,
  12-Bar-Blues im Loop. Tonart, Tempo (60–140 BPM) und Lautstärken sind live regelbar.
- **Tastenfinder:** Challenge zum Lernziel m1 „Du kannst jede Taste benennen". Es wird
  ein Tonname *genannt* (ohne zu zeigen, wo die Taste liegt) — man muss sie selbst
  finden. **Kein Zeitdruck.** Hand-Wahl Links/Rechts (untere/obere Oktave) und ein
  Schalter, der die Tastenbeschriftung abschaltet (blind). Die Skala spiegelt das
  echte Können: *erreicht* (jede Taste der Hand einmal gefunden, Beschriftung erlaubt)
  → *verinnerlicht* (alle Tasten der Hand blind & sicher) → *gemeistert* (beide Hände
  blind & fehlerfrei = Lernziel erfüllt). Tempo ist bewusst kein Kriterium.
- **Hörtrainer:** Challenge zum Lernziel g0 „Du kannst die Richtung einer Melodie
  hören". Drei Stufen als eine Leiter: *Erkennen* (zwei Töne → ↑/=/↓ tippen) →
  *Spielen* (zwei Tasten in derselben Richtung nachspielen) → *Kontur* (eine ganze
  Phrase nachzeichnen). Gemessen wird an den **feinen Schritten** (Sekunde/Halbton,
  „gleich", beide Richtungen), nicht an der offensichtlichen Oktave. Frage-Töne
  klingen immer; kein Zeitdruck, keine Punkte. Skala: erreicht/verinnerlicht/gemeistert
  je Stufe.
- **Notenregen (Artefakt):** Tonnamen fallen in der Spur ihrer Taste herab; erreicht
  ein Name die Trefferlinie, trifft man die Taste im steten Takt. Ein Reaktions-/
  Timing-Spiel — fürs *Benennen* taugt es nicht (die Kachel fällt über ihrer Taste,
  man schaut nur ab; dafür ist der Tastenfinder da). Bewusst **keinem Lernziel
  zugeordnet**: als Spiel erhalten, aber fürs Takthalten gibt es vermutlich ein
  besseres Konzept (noch offen). Erreichbar über die Übungsliste im Lernpfad.

## Bedienung

- **Los geht's** entsperrt das Audio (Browser-Autoplay-Policy) und öffnet den Lernpfad.
- Im **freien Modus** sind die **markierten Tasten** (goldene Punkte) die Moll-Pentatonik
  der Tonart; Play startet den Groove.
- Spielen über **MIDI-Keyboard**, **Maus/Touch** auf der Bildschirmklaviatur oder
  die Reihe **A S D F G H J K L** (spielt die Pentatonik aufsteigend, nicht chromatisch).
- **App-Sound für gespielte Noten** ausschalten, wenn das MIDI-Keyboard selbst klingt.

## Architektur

```
src/
├── App.tsx                 # Layout + Umschaltung: Lernpfad / freier Modus / Challenge
├── audio/
│   ├── transport.ts        # Tone.Transport: Tempo, Swing, 12-Bar-Loop, Bar-Tracking
│   ├── backingTrack.ts     # Walking-Bass + Shell-Voicings + Shuffle-Drums (alles Synths)
│   ├── pianoSampler.ts     # Klang gespielter Noten (Salamander-Sampler, PolySynth-Fallback)
│   └── notePlayer.ts       # Einheitlicher Eingabepfad + Note-On-Event-Bus (für den Trainer)
├── midi/
│   ├── useMidi.ts          # WEBMIDI.js: Geräte, noteon/noteoff, Hot-Plugging
│   └── useKeyboardFallback.ts # Computertastatur -> Pentatonik-Noten
├── music/
│   ├── theory.ts           # MIDI/Notennamen, Moll-Pentatonik-Berechnung
│   ├── bluesProgression.ts # 12-Bar-Blues als Datenmodell (nicht hartkodiert)
│   └── learningPath.ts     # Lernzielgraph: Knoten („Du kannst …") + Abhängigkeiten
├── components/
│   ├── LearningPath.tsx    # Lernpfad-Ansicht (Startseite): Graph, Hover, Detail, Übungsliste
│   ├── TastenfinderGame.tsx # Tastenfinder „jede Taste benennen" (m1): blind, ohne Zeitdruck
│   ├── HoertrainerGame.tsx # Hörtrainer „Richtung hören" (g0): Erkennen → Spielen → Kontur
│   ├── NotenregenGame.tsx  # Notenregen (Artefakt): Tonnamen im Takt treffen (Timing/Reaktion)
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
leuchtet) und triggert `pianoSampler` (Ton). Zusätzlich verteilt `notePlayer`
jeden Anschlag über einen **Note-On-Event-Bus** (`onNoteOn`), den der Tasten-Trainer
mithört, egal aus welcher Quelle der Anschlag kommt. Der `Tone.Transport` spielt
den Backing-Track-Loop und meldet den aktuellen Takt an den Store (BarIndicator).

## Designprinzipien (bewusst eingehalten)

- **Kein Scoring, keine Punkte/Streaks, keine Bewertung** — Overjustification-Risiko.
  In der Sandbox gibt es kein „Falsch". Auch Lernpfad und Trainer bleiben punktefrei:
  der Trainer informiert über Treffer, bewertet aber nie; der Lernpfad ist reine
  Orientierung ohne gespeicherten Fortschritt.
- **Kein Backend, kein Account, kein Tracking** — V1 ist ein lokales Experiment.
- **Dark Academia trifft Jazz-Club** — warmes Anthrazit/Mahagoni, Pentatonik in Gold.
- **Accessibility:** sichtbarer Tastatur-Fokus, `prefers-reduced-motion` respektiert,
  `aria-label`/`aria-pressed` auf den Tasten.

## Was Iteration 1 bewusst NICHT enthält

Richtig/Falsch-Bewertung mit Konsequenzen, Punkte/Streaks/Gamification, Accounts,
gespeicherter Fortschritt, Mikrofon-Pitch-Erkennung, Aufnahme, klassische
Notenschrift. (Der Lernpfad ist Orientierung statt erzwungenem Curriculum; der
Trainer zeigt Tonnamen, keine Notation.) → Stage 2/3 (siehe
`EUTERPE_ERWEITERUNGEN.md`), **erst** nach Bestätigung der Erfolgs-Hypothese.

## Tech-Stack

Vite · React 19 · TypeScript · Tailwind CSS · Tone.js · WEBMIDI.js · Zustand.
