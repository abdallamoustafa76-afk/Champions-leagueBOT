# ⭐ Champions League Bot 2.0

Discord-Bot für tägliche Champions-League-Cups: 128 Vereine zum Übernehmen, automatische Anmeldelisten pro Wochentag, Formate von 8 bis 32 Mannschaften, Check-in in Gruppenkanälen, Live-Spielplan, K.-o.-Phase mit Runden-Rollen und Siegerbild in der Hall of Fame. Läuft komplett auf Netlify, Einrichtung nur im Browser.

---

## 1. Discord-Anwendung

1. https://discord.com/developers/applications → deine App (oder **New Application**).
2. **General Information:** *Application ID* und *Public Key* kopieren. App Icon = dein Logo.
3. **Bot:** *Reset Token* → Token kopieren (geheim halten!). Icon hochladen.
4. **Bot → Privileged Gateway Intents:** **Server Members Intent** einschalten (für den Abgleich Manager ↔ Spieler).

## 2. GitHub

Neues **privates** Repo anlegen → **Add file → Upload files** → den *Inhalt* dieses Ordners hineinziehen (`netlify`, `public`, `package.json`, `netlify.toml`, `README.md`) → Commit.

## 3. Netlify

1. **Add new project → Import an existing project → GitHub** → Repo auswählen.
2. **Project configuration → Environment variables:**

| Variable | Inhalt |
|---|---|
| `DISCORD_TOKEN` | Bot-Token |
| `DISCORD_PUBLIC_KEY` | Public Key |
| `DISCORD_APP_ID` | Application ID |
| `DISCORD_GUILD_ID` | Server-ID (Entwicklermodus → Rechtsklick auf Server → ID kopieren) |
| `SETUP_KEY` | frei gewähltes Passwort, z. B. `cl-setup-8472` |

3. **Deploys → Trigger deploy**, danach veröffentlichen.

## 4. Discord mit Netlify verbinden

1. Developer Portal → **General Information → Interactions Endpoint URL:** `https://DEINE-SEITE.netlify.app/api/interactions` → Speichern.
2. Im Browser öffnen: `https://DEINE-SEITE.netlify.app/api/setup?key=DEIN_SETUP_KEY` → Befehle werden registriert.

## 5. Bot einladen

**OAuth2 → URL Generator** → Scopes `bot` + `applications.commands` → Rechte:
Kanäle ansehen · Nachrichten senden · Links einbetten · Dateien anhängen · Nachrichtenverlauf lesen · Nachrichten verwalten · Rollen verwalten · @everyone, @here und alle Rollen erwähnen.

## 6. Im Discord einrichten

1. `/cl-einrichten rollen` → verknüpft vorhandene Rollen (Turnierleitung, Moderator, Manager, Spieler) und legt fehlende an (Gruppe A–H, Achtelfinale, Viertelfinale, Halbfinale, Finale, Spiel um Platz 3).
   **Wichtig:** Rolle des Bots in der Rollenliste **über** all diese Rollen ziehen.
2. Kanäle verknüpfen – für jeden Kanal einmal:
   `/cl-einrichten kanal typ: Team-registrieren kanal: #📝・𝓣𝓮𝓪𝓶-𝓻𝓮𝓰𝓲𝓼𝓽𝓻𝓲𝓮𝓻𝓮𝓷`
   (ebenso Willkommen, Rollenauswahl, Regelwerk, Meine-Mannschaft, Mannschaftsübersicht, Live-Spielplan, Hall-of-Fame, KO-Phase, KO-Phase · Ergebnisse, Sperrliste, Turnierleitung (Log))
   Gruppen: `/cl-einrichten gruppe gruppe: Gruppe A art: Gruppenkanal kanal: #⚽・𝓖𝓻𝓾𝓹𝓹𝓮-𝓐` und `… art: Ergebniskanal kanal: #📋・𝓐-𝓔𝓻𝓰𝓮𝓫𝓷𝓲𝓼𝓼𝓮` (für A–H)
3. `/cl-einrichten panels` → postet die Panels in Regelwerk, Rollenauswahl, Team-registrieren, Meine-Mannschaft, Mannschaftsübersicht und Sperrliste.
4. `/cl-einrichten status` → zeigt, was noch fehlt.
5. Wochenplan, für jeden Tag einmal:
   `/cl-zeitplan setzen tag: Montag kanal: #🗓️・𝓜𝓸𝓷𝓽𝓪𝓰 anpfiff: 20:00`
   → Liste um 12:00 · Anmeldeschluss & Auslosung 19:00 · Check-in bis 19:55 · Anpfiff 20:00

### Kanal-Rechte

| Kanal | @everyone | Wer sieht ihn |
|---|---|---|
| 👋 Willkommen | Ansehen ✅, Schreiben ❌ | alle |
| 🎭 Rollenauswahl | Ansehen ✅, Schreiben ❌ | alle |
| 📜 Regelwerk | Ansehen ✅, Schreiben ❌ | alle |
| 📝 Team-registrieren | Ansehen ❌ | Manager, Turnierleitung, Bot |
| 🛡️ Meine-Mannschaft | Ansehen ❌ | Manager, Turnierleitung, Bot |
| 📋 Mannschaftsübersicht | Ansehen ✅, Schreiben ❌ | alle |
| 🗓️ Tageskanäle | Ansehen ✅, Schreiben ❌ | alle |
| 📺 Live-Spielplan, 🏆 Hall-of-Fame | Ansehen ✅, Schreiben ❌ | alle |
| 🚫 Sperrliste | Ansehen ✅, Schreiben ❌ | alle (Sperren nur Turnierleitung & Moderator) |
| ⚽ Gruppe-A … H | Ansehen ❌ | jeweilige Gruppe, Turnierleitung, Bot |
| 📋 A-Ergebnisse … H-Ergebnisse | Ansehen ❌ | jeweilige Gruppe (Ansehen, Schreiben, Dateien anhängen), Turnierleitung, Bot |
| 📋 KO-Ergebnisse | Ansehen ❌ | Runden-Rollen (Ansehen, Schreiben, Dateien anhängen), Turnierleitung, Bot |
| ⚔️ KO-Phase | Ansehen ❌ | Achtelfinale, Viertelfinale, Halbfinale, Finale, Spiel um Platz 3, Turnierleitung, Bot |

---

## Ablauf

- **Manager-Rolle** vergibt die Turnierleitung von Hand. Der Bot entfernt dann innerhalb einer Minute die Rolle Spieler (und gibt sie zurück, wenn Manager weggenommen wird – der Verein geht an den Co-VM oder wird frei).
- **Team-registrieren:** Liga → Verein → EA-Club. Jeder Verein nur einmal.
- **Meine-Mannschaft:** Co-VM hinzufügen/entfernen (bekommt Manager, verliert Spieler), EA-Club ändern, verlassen, löschen.
- **7-Tage-Regel:** Warnung per Direktnachricht an Tag 5 und 6, nach 7 Tagen ohne Cup wird der Verein frei.
- **Cup-Tag:** Anmeldung im Tageskanal → 19:00 Auslosung, Gruppen-Rollen, Check-in im Gruppenkanal (Warteliste checkt im Tageskanal ein) → 19:55 Nachrücker bzw. 0:3-Wertung → Spieltage, beide Mannschaften melden das Ergebnis → K.-o. mit Runden-Rollen → Finale + Spiel um Platz 3 → Siegerbild in der Hall of Fame.

## Willkommen & Rollenauswahl

- Neue Mitglieder werden im Willkommenskanal mit Ping und Logo begrüßt (der Bot prüft jede Minute, ob jemand neu ist – die Begrüßung kommt also bis zu 1 Minute nach dem Beitritt). Beim allerersten Durchlauf merkt sich der Bot nur alle vorhandenen Mitglieder und begrüßt niemanden.
- In der Rollenauswahl gibt es **Spieler werden** (Rolle sofort) und **Manager werden** (Anfrage an die Turnierleitung im Log-Kanal mit Annehmen/Ablehnen; beim Annehmen bekommt die Person Manager, verliert Spieler und erhält eine Direktnachricht).
- Wenn bisher ein anderer Bot (z. B. Galaxy) begrüßt, dort die Begrüßung ausschalten, sonst kommen zwei Nachrichten.

## Regelwerk

- Der Bot postet das Regelwerk als Embed mit Logo und dem Button **Regeln akzeptieren**. Unten steht, wie viele Mitglieder es schon akzeptiert haben.
- Zum Cup anmelden kann sich nur, wer das Regelwerk akzeptiert hat.
- Ändert sich das Regelwerk: Text in `netlify/lib/data.mjs` (RULES) anpassen und `RULES_VERSION` um 1 erhöhen – dann müssen alle neu akzeptieren. Danach `/cl-einrichten panels`.

## Ergebniskanäle & Größenvideos

- Jede Gruppe hat zusätzlich einen eigenen Ergebniskanal (z. B. 📋 A-Ergebnisse), die K.-o.-Phase den Kanal 📋 KO-Ergebnisse – jeweils mit den Buttons **Ergebnis eintragen** und **Größenvideo anfordern**. Der Gruppenkanal zeigt nur Check-in und den kurzen Spielplan (Gegner und Ergebnisse).
- **Ergebnis eintragen:** Eine Mannschaft trägt ein, der Gegner wird gepingt und hat **2 Minuten** Zeit für **Bestätigen** oder **Anderes Ergebnis**. Ohne Reaktion gilt das Ergebnis automatisch (der Bot prüft jede Minute). Tragen beide unterschiedliche Ergebnisse ein, wird die **Turnierleitung markiert** und entscheidet mit `/cl-admin ergebnis`.
- **Größenvideo:** nur in den ersten 40 Spielminuten (der Anfordernde gibt die aktuelle Spielminute ein), 3× pro Mannschaft und Turnier, 1× pro Spiel. Der Gegner wird gepingt: *„Bis nach Ende des Spiels hast du Zeit, das Video in diesem Kanal zu posten.“* – das Video wird direkt als Nachricht im Ergebniskanal gepostet.
- In den Ergebniskanälen brauchen die Gruppen-Rollen deshalb **Nachrichten senden** und **Dateien anhängen**.
- Ist für eine Gruppe kein Ergebniskanal verknüpft, laufen Ergebnisse über den Gruppenkanal.

## Sperrliste

- Im Kanal 🚫 Sperrliste steht ein Post mit Gründen, Regeln und allen aktuell gesperrten Personen – er aktualisiert sich automatisch.
- **Person sperren** (nur Turnierleitung & Moderator): Person → Grund → Dauer (Standard 7 Tage) → optional Notiz. Gehört die Person zu einer Mannschaft, kann der Partner (Manager/Co-VM) gleich mitgesperrt werden.
- Gesperrt wird die **Person**: Die Sperre gilt auch, wenn sie den Verein wechselt. Eine Mannschaft kann sich nicht anmelden, solange ihr Manager oder Co-VM gesperrt ist, und gesperrte Personen können nicht Co-VM werden.
- Betroffene bekommen eine Direktnachricht, die Turnierleitung einen Eintrag im Log.
- Abgelaufene Sperren werden automatisch entfernt; **Sperre aufheben** geht jederzeit per Button.
- In einen laufenden Cup greift der Bot nicht ein – fehlende Ergebnisse trägt die Turnierleitung mit `/cl-admin ergebnis` ein.

## Befehle für die Turnierleitung

| Befehl | Wofür |
|---|---|
| `/cl-zeitplan anzeigen · entfernen · jetzt-posten` | Wochenplan verwalten, Liste sofort posten |
| `/cl-turnier name anpfiff` | einmaliges Turnier im aktuellen Kanal |
| `/cl-admin anmeldeschluss` | Anmeldung sofort schließen und auslosen |
| `/cl-admin checkin-ende` | Check-in sofort beenden |
| `/cl-admin spiele` | offene Spiele und Meldungen |
| `/cl-admin ergebnis spiel heim gast [elfmeter]` | Ergebnis festlegen (z. B. bei Konflikt) |
| `/cl-admin abbrechen` | Turnier abbrechen, Rollen entfernen |
| `/cl-admin verein-freigeben verein` | Verein freigeben |

Spieler melden Ergebnisse über den Button im Spielplan oder mit `/cl-ergebnis`.

## Gut zu wissen

- Discord begrenzt, wie schnell Rollen vergeben werden. Bei der Auslosung kann es deshalb 1–2 Minuten dauern, bis alle die Gruppenkanäle sehen.
- Der Bot prüft jede Minute die Zeitpläne, Rollen und Turnierzeiten (Netlify Scheduled Function – läuft nur auf veröffentlichten Deploys).
- Banner und Logo liegen in `public/` und können dort ausgetauscht werden.
