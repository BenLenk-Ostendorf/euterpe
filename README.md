# Euterpe — Improvisation-First Keyboard Learning App

> **Euterpe ist kein Kurs. Euterpe ist ein Ort, an dem man sofort Musik macht.**

Eine Improvisations-Sandbox fürs Keyboard mit einer vorgelagerten **Lern-Landkarte**:
Kein einzelner Aufstieg, sondern **vier parallele Stränge** (Gehör · Improvisation ·
Akkorde & Begleitung · Koordination), die jeder für sich schon Musik machen und oben
im **Nordstern** zusammenlaufen — *aus einer eigenen Melodie ein ganzes Klavierstück
selbst spielen*. Von dort spielt man entweder **frei** (Pentatonik-Sandbox über einem
12-Bar-Blues) oder öffnet eine **Challenge**, die auf einen Checkpoint hinführt. Vom
ersten Tastendruck an klingt es nach Musik — keine falschen Töne, keine Bewertung.
MIDI-Keyboard, Maus oder Computertastatur (A–L).

Das Lernmodell (Stränge, Checkpoints, kleine Ziele, Pareto-Ziel, Nordstern) ist aus
einer Skill-Decomposition abgeleitet — Details in [`SKILL_DECOMPOSITION.md`](SKILL_DECOMPOSITION.md).

Dies ist **Iteration 1** — die Validierung der Erfolgs-Hypothese: Trägt der Core
Loop intrinsisch?

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

- **Lern-Landkarte (Startseite):** vier Stränge (Gehör · Improvisation · Akkorde &
  Begleitung · Koordination) mit Checkpoints in Spielreihenfolge; Koordination läuft
  als gestricheltes „nebenher"-Band, nicht als Tor. Jeder Strang trägt **kleine Ziele**
  (★ Spaß-Gipfel wie „Melodien-Detektiv" oder „Kadenz-Loop"), dazu ein **Pareto-Ziel**
  (bekannte Melodie + 3 Akkorde, Hände zusammen) und der **Nordstern**. Reine
  Orientierung, kein Scoring; der lokale Fortschritt färbt nur die Checkpoints ein
  (rücksetzbar). Klick zeigt Details, ▶ startet eine Übung, ♪ den freien Modus.
- **Freier Modus (Sandbox):** Bildschirmklaviatur C3–C5, markierte Pentatonik-Tasten,
  12-Bar-Blues im Loop. Tonart, Tempo (60–140 BPM) und Lautstärken sind live regelbar.
- **Tastenfinder:** Challenge zum Checkpoint „Tasten finden" (Strang *Akkorde &
  Begleitung*, das Fundament). Es wird
  ein Tonname *genannt* (ohne zu zeigen, wo die Taste liegt) — man muss sie selbst
  finden. **Kein Zeitdruck.** Hand-Wahl Links/Rechts (untere/obere Oktave) und ein
  Schalter, der die Tastenbeschriftung abschaltet (blind). Die Skala spiegelt das
  echte Können: *erreicht* (jede Taste der Hand einmal gefunden, Beschriftung erlaubt)
  → *verinnerlicht* (alle Tasten der Hand blind & sicher) → *gemeistert* (beide Hände
  blind & fehlerfrei = Lernziel erfüllt). Tempo ist bewusst kein Kriterium.
- **Hörtrainer:** Challenge zum Checkpoint „Richtung hören" (Strang *Gehör*).
  Drei Stufen als eine Leiter: *Erkennen* (zwei Töne → ↑/=/↓ tippen) →
  *Spielen* (zwei Tasten in derselben Richtung nachspielen) → *Kontur* (eine ganze
  Phrase nachzeichnen). Gemessen wird an den **feinen Schritten** (Sekunde/Halbton,
  „gleich", beide Richtungen), nicht an der offensichtlichen Oktave. Frage-Töne
  klingen immer; kein Zeitdruck, keine Punkte. Skala: erreicht/verinnerlicht/gemeistert
  je Stufe.
- **Akkordgriff:** Challenge zum Checkpoint „Akkord greifen" (Strang *Akkorde &
  Begleitung*). Ein Dreiklang wird genannt (z. B. „F-Dur"), man greift ihn als einen
  Griff. Treffer zählen per **Tonklassen** (Oktave/Lage egal); richtige Töne sind
  immer grün, Griff-Gleichzeitigkeit und Tempo sind nur Hinweis, nie „Fehler" — rot
  nur bei wirklich falschen Tönen. Stufen wachsen über Abdeckung: Dur → + Moll →
  + schwarze Tasten → linke Hand → beide Hände (blind & als Griff).
- **Notenregen (Artefakt):** Tonnamen fallen in der Spur ihrer Taste herab; erreicht
  ein Name die Trefferlinie, trifft man die Taste im steten Takt. Ein Reaktions-/
  Timing-Spiel — fürs *Benennen* taugt es nicht (die Kachel fällt über ihrer Taste,
  man schaut nur ab; dafür ist der Tastenfinder da). Bewusst **keinem Strang
  zugeordnet**: als Spiel erhalten, aber fürs Takthalten gibt es vermutlich ein
  besseres Konzept (noch offen). Erreichbar über die Übungsliste in der Landkarte.

## Bedienung

- **Los geht's** entsperrt das Audio (Browser-Autoplay-Policy) und öffnet die Lern-Landkarte.
- Im **freien Modus** sind die **markierten Tasten** (goldene Punkte) die Moll-Pentatonik
  der Tonart; Play startet den Groove.
- Spielen über **MIDI-Keyboard**, **Maus/Touch** auf der Bildschirmklaviatur oder
  die Reihe **A S D F G H J K L** (spielt die Pentatonik aufsteigend, nicht chromatisch).
- **App-Sound für gespielte Noten** ausschalten, wenn das MIDI-Keyboard selbst klingt.

## Architektur

```
src/
├── App.tsx                 # Layout + Umschaltung: Landkarte / freier Modus / Challenge
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
│   └── learningPath.ts     # Lern-Landkarte: Stränge, Checkpoints, kleine Ziele, Nordstern
├── components/
│   ├── LearningPath.tsx    # Lern-Landkarte (Startseite): Strang-Swimlanes, Detail, Übungsliste
│   ├── TastenfinderGame.tsx # Tastenfinder „Tasten finden" (m1): blind, ohne Zeitdruck
│   ├── HoertrainerGame.tsx # Hörtrainer „Richtung hören" (g0): Erkennen → Spielen → Kontur
│   ├── AkkordgriffGame.tsx # Akkordgriff „Akkord greifen" (w2): Treffer per Tonklassen, adaptiv
│   ├── NotenregenGame.tsx  # Notenregen (Artefakt): Tonnamen im Takt treffen (Timing/Reaktion)
│   ├── Keyboard.tsx        # Bildschirmklaviatur C3–C5, Highlighting, Pointer-Input
│   ├── TransportControls.tsx
│   ├── BarIndicator.tsx
│   ├── MidiStatus.tsx
│   └── Onboarding.tsx
└── state/
    ├── sessionStore.ts     # Zustand-Store: Tonart, Tempo, Playing, aktive Noten
    └── progressStore.ts    # Lokaler Fortschritt je Checkpoint (Farbe, rücksetzbar; kein Score)
```

**Datenfluss:** Jede Eingabequelle (Klick / MIDI / Tastatur) läuft durch
`notePlayer.playNote/stopNote` → aktualisiert `sessionStore.activeNotes` (Taste
leuchtet) und triggert `pianoSampler` (Ton). Zusätzlich verteilt `notePlayer`
jeden Anschlag über einen **Note-On-Event-Bus** (`onNoteOn`), den der Tasten-Trainer
mithört, egal aus welcher Quelle der Anschlag kommt. Der `Tone.Transport` spielt
den Backing-Track-Loop und meldet den aktuellen Takt an den Store (BarIndicator).

## Designprinzipien (bewusst eingehalten)

- **Kein Scoring, keine Punkte/Streaks, keine Bewertung** — Overjustification-Risiko.
  In der Sandbox gibt es kein „Falsch". Auch Landkarte und Trainer bleiben punktefrei:
  der Trainer informiert über Treffer, bewertet aber nie. Den Stand je Checkpoint hält
  ein **lokaler** Speicher (nur Farbe = „wo stehst du", jederzeit rücksetzbar) — kein
  Score, kein Ranking, keine Konsequenzen.
- **Kein Backend, kein Account, kein Server-Tracking** — V1 ist ein lokales Experiment.
- **Dark Academia trifft Jazz-Club** — warmes Anthrazit/Mahagoni, Pentatonik in Gold.
- **Accessibility:** sichtbarer Tastatur-Fokus, `prefers-reduced-motion` respektiert,
  `aria-label`/`aria-pressed` auf den Tasten.

## Was Iteration 1 bewusst NICHT enthält

Richtig/Falsch-Bewertung mit Konsequenzen, Punkte/Streaks/Gamification, Accounts
oder Server-Tracking, Mikrofon-Pitch-Erkennung, Aufnahme, klassische Notenschrift.
(Die Landkarte ist Orientierung statt erzwungenem Curriculum; der Trainer zeigt
Tonnamen, keine Notation. Fortschritt bleibt lokal und rein informativ.) Die noch
offenen kleinen Ziele (z. B. Ohr-Mikro-Spiele, Kadenz-Loop) und der Nordstern sind
in der Landkarte sichtbar, aber noch nicht als Übung gebaut.

## Tech-Stack

Vite · React 19 · TypeScript · Tailwind CSS · Tone.js · WEBMIDI.js · Zustand.
