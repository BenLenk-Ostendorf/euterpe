// Meta-Daten zu jedem Spiel — die getypte Quelle der Wahrheit für die
// didaktische Analyse: Welcher Skill wird trainiert? Welche Annahmen liegen
// dem zugrunde (warum ist das Spiel EFFIZIENTES Training)? Wie funktioniert
// die Mechanik, mit der der Skill trainiert wird? Und auf welchem Gerät
// spielbar?
//
// Zweck (Bens Wunsch): überprüfbar machen, wie gut die Spiele wirklich
// trainieren und ob der eingeschlagene Weg der beste ist — statt es nur zu
// glauben. Darum sind die ANNAHMEN bewusst explizit und einzeln testbar
// formuliert (jede Annahme ist eine Hypothese, die sich falsifizieren lässt).
//
// WICHTIG: GAME_META ist ein Record über ALLE ChallengeId — TypeScript
// erzwingt damit, dass jedes neue Spiel hier einen Eintrag bekommt.

import type { ChallengeId } from './learningPath'

/** Auf welchem Gerät lässt sich das Spiel (sinnvoll) spielen? */
export type Device = 'klavier' | 'pc' | 'handy'

export const DEVICE_LABEL: Record<Device, string> = {
  klavier: 'Klavier (MIDI)',
  pc: 'PC',
  handy: 'Handy',
}
export const DEVICE_ICON: Record<Device, string> = {
  klavier: '🎹',
  pc: '💻',
  handy: '📱',
}

export interface GameMeta {
  /** Der (Sub-)Skill, den das Spiel trainiert — möglichst atomar. */
  skill: string
  /**
   * Annahmen, warum das Spiel effizientes Training ist. Jede Annahme ist eine
   * einzeln prüfbare Hypothese (für die spätere Analyse: stimmt sie? trägt sie?).
   */
  assumptions: string[]
  /** Beschreibung des Spiels — vor allem: WIE wird der Skill durch die Mechanik trainiert. */
  mechanic: string
  /** Auf welchen Geräten spielbar. */
  devices: Device[]
  /** Einschränkung/Hinweis je Gerät (optional). */
  deviceNote?: string
}

export const GAME_META: Record<ChallengeId, GameMeta> = {
  tastenfinder: {
    skill: 'Tonnamen blind in Tasten übersetzen — räumliche Orientierung auf der Klaviatur.',
    assumptions: [
      'Tasten-Orientierung ist Voraussetzung für alles Greifen und Spielen — ohne sie bleibt jeder Ton ein Suchen.',
      'Blind (ohne Tastenbeschriftung) erzwingt ein inneres Tasten-Modell statt Ablesen.',
      'Die schwarzen Tasten als Anker (2er-/3er-Gruppen) sind die Strategie echter Pianisten — relationales statt absolutes Merken, dadurch transponierbar.',
      'Verteiltes, unzeitliches Abrufen einzelner Töne baut den Reflex schneller als ein stures Durchspielen aller Töne.',
    ],
    mechanic:
      'Ein Tonname wird angesagt — ohne räumlichen Hinweis. Du findest die Taste. Stufen: mit Beschriftung → blind, eine Hand → beide Hände blind. Feedback zeigt die richtige Taste, wertet nicht.',
    devices: ['klavier', 'pc', 'handy'],
    deviceNote:
      'Am echten MIDI-Klavier am wertvollsten — die motorische Orientierung überträgt sich 1:1 aufs Instrument.',
  },

  hoertrainer: {
    skill: 'Tonhöhen-Richtung hören (hoch / runter / gleich) und als Kontur nachspielen.',
    assumptions: [
      'Richtungshören ist die gröbste, aber fundamentalste Gehör-Fähigkeit — ohne sie kein Melodie-Raushören.',
      'Nachspielen statt nur Erkennen koppelt Ohr an Motorik → tieferes Lernen als reines Ankreuzen.',
      'Der gezeigte Anfangston isoliert die RICHTUNG als einzige Achse (Orientierung ist gegeben, nur die Bewegung wird trainiert).',
    ],
    mechanic:
      'Eine kurze Tonfolge erklingt; du spielst die Richtung/Kontur nach. Der Anfangston ist markiert. Stufen: zwei Töne in Richtung nachspielen → ganze Phrase nachzeichnen. Feedback zeigt gespielte vs. gehörte Bewegung.',
    devices: ['klavier', 'pc', 'handy'],
    deviceNote: 'Eingabe über Bildschirm-Klaviatur oder MIDI; das Hören selbst geht überall.',
  },

  durmoll: {
    skill: 'Tongeschlecht hören — Dur (fröhlich) gegen Moll (traurig) unterscheiden.',
    assumptions: [
      'Dur/Moll ist binär und emotional verankert → das schnellste Ohr-Erfolgserlebnis, hält die Motivation.',
      'Reines Hören ohne Motorik isoliert die Gehör-Fähigkeit (keine Verwechslung mit Greif-Fehlern).',
      'Steigende Stufen (Grundstellung → Umkehrung → gebrochen) verhindern das Auswendiglernen einer Klangschablone und erzwingen, die Terz selbst zu hören.',
    ],
    mechanic:
      'Ein Akkord erklingt; Knopf Dur oder Moll. Feedback deckt den Akkordnamen auf. Stufen: Grundstellung → Umkehrungen → gebrochen (Arpeggio). Höhere Aufstiegsschwelle, weil binär (Raten zu leicht).',
    devices: ['klavier', 'pc', 'handy'],
    deviceNote: 'Kein Instrument nötig — nur Hören und zwei Knöpfe. Überall spielbar.',
  },

  intervalle: {
    skill: 'Intervalle hören — die Größe eines Tonsprungs erkennen.',
    assumptions: [
      'Intervalle sind die Bausteine jeder Melodie; wer sie hört, kann Melodien raushören (Nordstern-Pfad).',
      'Anker-Lieder (bekannte Liedanfänge) nutzen vorhandenes Gedächtnis statt abstraktes Pauken.',
      'Die wachsende Auswahl (weite Sprünge → Terzen → Sekunden) staffelt die Schwierigkeit von leicht unterscheidbar zu fein.',
    ],
    mechanic:
      'Zwei Töne erklingen aufsteigend; ordne den Sprung zu (Mehrfachauswahl, wächst mit der Stufe). Anker-Lieder als Eselsbrücke. Feedback nennt das richtige Intervall.',
    devices: ['klavier', 'pc', 'handy'],
    deviceNote: 'Kein Instrument nötig — Hören und auswählen. Überall spielbar.',
  },

  wechsel: {
    skill: 'Hören, WANN die Harmonie wechselt — Akkordwechsel im Puls zählen.',
    assumptions: [
      'Das Gespür, wann ein neuer Akkord fällig ist, gibt der Begleitung ihren Rhythmus — direkte Voraussetzung fürs Begleiten (Pareto-Ziel).',
      'Zählen statt Benennen isoliert die Wahrnehmung des Wechsels selbst, ohne Harmonielehre vorauszusetzen.',
      'Steigende Akkordzahl pro Runde erhöht Gedächtnis- und Aufmerksamkeitslast graduell.',
    ],
    mechanic:
      'Eine Akkordfolge läuft im Puls (Pulspunkte zeigen den Schlag); zähl die Wechsel und wähl die Zahl. Stufen: 3 → 4 → 5 Akkorde. Feedback zeigt die echte Wechselzahl.',
    devices: ['klavier', 'pc', 'handy'],
    deviceNote: 'Kein Instrument nötig — Hören und auswählen. Überall spielbar.',
  },

  pulstap: {
    skill: 'Gleichmäßigen Puls fühlen und auf den Schlag timen.',
    assumptions: [
      'Ein stabiler innerer Puls ist das Fundament jeder Begleitung — ohne ihn zerfällt das 4/4.',
      'Auf den Schlag tippen misst Timing direkt und gibt sofortiges, präzises Feedback (ms zu früh/spät).',
      'Steigendes Tempo (70 → 100 → 132 BPM) trainiert den Puls über den relevanten Bereich; reines Feedback ohne Strafe hält den Fokus auf dem Gefühl statt auf Punkten.',
    ],
    mechanic:
      'Ein Metronom klopft im 4/4; tippe jeden Schlag (Knopf, Leertaste oder Enter). Feedback nennt die Abweichung in ms (zu früh/spät/genau). Tempo steigt, sobald der Puls sitzt.',
    devices: ['pc', 'handy'],
    deviceNote:
      'Kein Instrument nötig — Tippen per Knopf/Leertaste/Enter. (Noch nicht aufs MIDI-Keyboard gelegt.)',
  },

  akkordgriff: {
    skill: 'Einen Dreiklang (1–3–5) als einen Griff spielen — Dur und Moll.',
    assumptions: [
      'Der Dreiklang-Griff ist das Grundbauteil jeder Begleitung.',
      'Treffer über Tonklassen (Lage/Umkehrung egal) trainiert das Akkord-Verständnis statt einer auswendigen Handstellung.',
      'Das Messen der Anschlag-Spreizung („zusammen gegriffen?") trennt „kann den Akkord" von „sucht die Töne einzeln" — die ehrliche zweite Wahrheit neben richtig/falsch.',
      'Adaptive Front plus eingestreutes Leichteres = verteiltes Abrufen, baut den Reflex statt Autopilot.',
    ],
    mechanic:
      'Ein Akkordname wird angesagt; greif die drei Töne. Richtige Töne sind immer grün; ob als Griff/zügig ist nur Hinweis, nie Fehler. Stufen ratschen Achsen dazu (Stütze → blind, Dur → +Moll, weiß → schwarz, → als Griff → zügig → linke Hand → beide). „Gemeistert" = ganzer Raum blind als Griff gezeigt.',
    devices: ['klavier', 'pc', 'handy'],
    deviceNote:
      'Das „als ein Griff"-Messen braucht ein MIDI-Keyboard; per Maus geht nur einzeln, am Handy per Multitouch eingeschränkt.',
  },

  stufengriff: {
    skill: 'Die drei Hauptakkorde (I · IV · V) einer Tonart finden und als Dur-Dreiklang greifen.',
    assumptions: [
      'I/IV/V sind das harmonische Skelett tausender Lieder — wer sie blind greift, kann fast alles begleiten (Pareto-Ziel).',
      'Die Funktion (Tonika/Subdominante/Dominante) statt des Akkordnamens anzusagen erzwingt das Stufen-DENKEN, nicht das Auswendiglernen einzelner Akkorde.',
      'Aufbau auf dem Akkordgriff (Treffer über Tonklassen): die Greif-Mechanik ist schon verinnerlicht, hier kommt nur die Stufen-Zuordnung dazu — eine Achse pro Spiel.',
      'Der Wechsel der Tonart in Stufe 3 prüft, ob die Relation (I→+5→+7) verstanden ist oder nur drei C-Dur-Griffe auswendig sitzen — macht den Skill transponierbar.',
    ],
    mechanic:
      'Eine Funktion wird angesagt — Tonika (I), Subdominante (IV), Dominante (V) — du greifst den passenden Dur-Dreiklang (Lage/Umkehrung egal). Stufen: mit Stütze (Zieltasten leuchten) in C-Dur → blind in C-Dur → wechselnde Tonarten (C/G/D/F/A) blind. Feedback nennt den richtigen Akkord, spielt ihn bei Fehlern vor.',
    devices: ['klavier', 'pc', 'handy'],
    deviceNote:
      'Am MIDI-Klavier am wertvollsten (echtes Greifen mit der Hand); per Maus nur Ton für Ton, am Handy per Multitouch eingeschränkt.',
  },

  notenregen: {
    skill: 'Eine fallende Note rechtzeitig auf der richtigen Taste treffen (Reaktions-/Spaß-Spiel).',
    assumptions: [
      'EHRLICH: schwaches Lernspiel fürs Benennen — die Kachel fällt über ihrer Zieltaste, man liest die Position ab statt den Tonnamen zu übersetzen.',
      'Bleibt als spielbares Artefakt erhalten, ist aber bewusst KEINEM Lernziel zugeordnet (siehe SKILL_DECOMPOSITION).',
    ],
    mechanic:
      'Kacheln fallen in Spuren über den Zieltasten; triff sie rechtzeitig. Eher Spaß-/Reaktions-Spiel als gezieltes Training.',
    devices: ['klavier', 'pc', 'handy'],
    deviceNote: 'Eher Spaß-Artefakt als gezieltes Training.',
  },
}
