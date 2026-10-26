# ⭐ Champions League Bot 2.2

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

### Schnell: alles mit einem Befehl
```
/cl-einrichten alles anpfiff: 20:00
```
Der Bot übernimmt vorhandene Rollen und legt fehlende an, erkennt deine Kanäle am Namen (auch in Schreibschrift), legt fehlende Kanäle in Kategorien an, setzt die Rechte, trägt den Wochenplan für alle Tageskanäle ein und postet alle Panels. Dauert ca. 1–3 Minuten, Fortschritt mit `/cl-einrichten status`.
- `fehlende_erstellen: False` → nur vorhandene Kanäle verknüpfen, nichts neu anlegen
- `rechte_setzen: False` → Rechte deiner Kanäle nicht verändern
- Danach die Bot-Rolle in der Rollenliste ganz nach oben ziehen.

### Zurücksetzen
```
/cl-einrichten zurücksetzen umfang: Nur Einrichtung
/cl-einrichten zurücksetzen umfang: Alles
```
- **Nur Einrichtung:** löscht Kanal- und Rollen-Verknüpfungen, Wochenplan und die Panel-Posts. Vereine, Sperren und Turniere bleiben.
- **Alles:** zusätzlich Vereine/Manager, Sperren, Regel-Bestätigungen, Turniere und Statistiken; Spitznamen werden zurückgesetzt.
- Discord-Kanäle und -Rollen selbst werden nie gelöscht. Vor dem Zurücksetzen kommt immer eine Sicherheitsabfrage.

### Oder Schritt für Schritt

1. `/cl-einrichten rollen` → verknüpft vorhandene Rollen (Turnierleitung, Moderator, Manager, Spieler) und legt fehlende an (Gruppe A–H, Achtelfinale, Viertelfinale, Halbfinale, Finale, Spiel um Platz 3).
   **Wichtig:** Rolle des Bots in der Rollenliste **über** all diese Rollen ziehen.
2. Kanäle verknüpfen – für jeden Kanal einmal:
   `/cl-einrichten kanal typ: Team-registrieren kanal: #📝・𝓣𝓮𝓪𝓶-𝓻𝓮𝓰𝓲𝓼𝓽𝓻𝓲𝓮𝓻𝓮𝓷`
   (ebenso Willkommen, Rollenauswahl, Benachrichtigungen, Regelwerk, Meine-Mannschaft, Mannschaftsübersicht, Live-Spielplan, Hall-of-Fame, KO-Phase, KO-Phase · Ergebnisse, Sperrliste, Turnierleitung (Log))
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
| 🔔 Benachrichtigungen | Ansehen ✅, Schreiben ❌ | alle |
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

- **Manager-Rolle** holt man sich selbst in der Rollenauswahl (oder die Turnierleitung vergibt sie von Hand). Der Bot entfernt dann die Rolle Spieler (und gibt sie zurück, wenn Manager weggenommen wird – der Verein geht an den Co-VM oder wird frei).
- **Team-registrieren:** Liga → Verein → EA-Club. Jeder Verein nur einmal.
- **Meine-Mannschaft:** Co-VM hinzufügen/entfernen (bekommt Manager, verliert Spieler), EA-Club ändern, verlassen, löschen.
- **7-Tage-Regel:** Warnung im Benachrichtigungs-Kanal an Tag 5 und 6, nach 7 Tagen ohne Cup wird der Verein frei.
- **Cup-Tag:** Anmeldung im Tageskanal → 19:00 Auslosung, Gruppen-Rollen, Check-in im Gruppenkanal (Warteliste checkt im Tageskanal ein) → 19:55 Nachrücker bzw. 0:3-Wertung → Spieltage, beide Mannschaften melden das Ergebnis → K.-o. mit Runden-Rollen → Finale + Spiel um Platz 3 → Siegerbild in der Hall of Fame.

## Anmeldeliste, Freilose & Spitznamen

- Die Anmeldeliste hat oben das Kopfbild **Mannschaft anmelden** (`public/banner-anmeldung.jpg`) und zeigt jede Mannschaft als `🇪🇸 FC Barcelona | @Manager`.
- **Freilose:** Die Turnierleitung kann im Tageskanal mit `/cl-admin freilos-hinzufügen` bzw. `freilos-entfernen` Freilose setzen (z. B. 7 Mannschaften + 1 Freilos = 8er-Format). Echte Mannschaften haben immer Vorrang. Freilose werden auf verschiedene Gruppen verteilt, verlieren jedes Spiel 0:3 und kommen nie weiter.
- **Spitznamen:** Wer einen Verein übernimmt, heißt auf dem Server z. B. `Musti VM | Barcelona`, der Co-VM `Yassin CO-VM | Barcelona`. Beim Verlassen, Löschen oder Reset wird der alte Name wiederhergestellt. Discord erlaubt Bots nicht, den Namen des **Serverbesitzers** zu ändern – den musst du bei dir selbst von Hand setzen.

## Trophäenhalle

- Kanal 🏅 Trophäenhalle (alle sehen, nur Bot schreibt). Ein Post mit Bild, der sich nach jedem Cup aktualisiert: Medaillenspiegel der Vereine (🥇 Titel, 🥈 Finals, 🥉 Platz 3), Top-Manager, Rekorde (meiste Tore in einem Cup, höchster Sieg, Titel in Folge, meiste Cups) und die letzten 5 Sieger.
- Button **Meine Statistik**: jeder sieht privat seine Titel, Finals, Spiele, Siege, Tore, Tordifferenz und seine Vitrine.
- Medaillen und Statistiken zählen für den Verein **und** für die Personen (Manager und Co-VM) – auch nach einem Vereinswechsel.
- Freilose und kampflose Wertungen zählen nicht in die Spiel- und Torstatistik.
- Nur die Statistik zurücksetzen: `/cl-einrichten zurücksetzen umfang: Nur Statistik` (Vereine, Manager, Einrichtung und Hall of Fame bleiben). `umfang: Alles` löscht sie ebenfalls.

## Aufräumen nach dem Cup

- **30 Minuten nach dem Finale** (oder nach Absage/Abbruch) löscht der Bot alle Nachrichten dieses Cups in: Gruppe A–H, A–H-Ergebnisse, KO-Phase, KO-Ergebnisse, Live-Spielplan, dem Tageskanal des Cups und im Turnierleitungs-Kanal (nur Nachrichten seit Beginn des Cups) – auch Nachrichten der Spieler.
- Hall of Fame, Regelwerk, Rollenauswahl, Mannschaftsübersicht, Sperrliste und die anderen festen Posts bleiben stehen.
- Die Wartezeit steht in `netlify/lib/cleanup.mjs` (`CLEANUP_DELAY_MIN`).

## Benachrichtigungen

- Der Bot schickt **keine Direktnachrichten**. Stattdessen markiert er die Person im Kanal 🔔 Benachrichtigungen – bei Sperre, aufgehobener oder abgelaufener Sperre, Inaktivitäts-Warnung (Tag 5 und 6) und Reset nach 7 Tagen.
- Jede Benachrichtigung wird **nach 1 Stunde automatisch gelöscht**, damit der Kanal sauber bleibt.

## Willkommen & Rollenauswahl

- Neue Mitglieder werden im Willkommenskanal mit Ping und Logo begrüßt (der Bot prüft jede Minute, ob jemand neu ist – die Begrüßung kommt also bis zu 1 Minute nach dem Beitritt). Beim allerersten Durchlauf merkt sich der Bot nur alle vorhandenen Mitglieder und begrüßt niemanden.
- In der Rollenauswahl gibt es **Spieler werden** und **Manager werden** – beide Rollen gibt es sofort. Wer Manager wird, verliert automatisch die Spieler-Rolle. Gesperrte Personen können nicht Manager werden.
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

## TOTT – Team of the Tournament (EA FC Pro Clubs)

- Jede Mannschaft trägt bei der Registrierung ihren **EA-FC-Clubnamen** ein. Der Bot sucht dazu im Hintergrund die EA-Club-ID (Status unter *Meine Mannschaft → EA-Club*).
- Ab Anpfiff sucht der Bot **jede Minute** zu jedem beendeten Cup-Spiel das passende Pro-Clubs-Spiel (Freundschaftsspiel) der beiden EA-Clubs und sammelt die Werte aller Spieler: Note, Tore, Vorlagen, Man of the Match, Zu-null-Spiele, Position.
- Nach dem Finale (spätestens 20 Minuten danach, damit auch die EA-Daten vom Finale da sind) postet der Bot im Kanal **⭐ TOTT** das Bild mit der besten Elf im **4-3-3** und dem **Spieler des Turniers**.
- Auswahl: pro Position die beste **Durchschnittsnote**. Bei Gleichstand entscheiden Torbeteiligungen, dann die Zahl der Einsätze. Wer mindestens die Hälfte der Spiele bestritten hat, kommt zuerst dran. Fehlen auf einer Position Spieler, wird von der Nachbarposition aufgefüllt.
- Die Ergebnisse melden die Mannschaften weiterhin selbst – EA-Daten werden **nur fürs TOTT** genutzt. Ist EA nicht erreichbar oder ein Club nicht verknüpft, fehlen nur dessen Spieler im TOTT.
- `/cl-admin ea-status` zeigt, welche Mannschaften verknüpft sind und wie viele Spiele/Spieler schon gesammelt wurden. `/cl-admin ea-verknüpfen verein [ea_id]` sucht neu oder trägt die EA-Club-ID direkt ein. `/cl-admin tott` postet das TOTT des letzten Turniers sofort (neu).
- Den Kanal legt `/cl-einrichten alles` automatisch an (oder `/cl-einrichten kanal typ: TOTT`).
- Optionale Umgebungsvariablen: `EA_AUTO=0` schaltet das TOTT aus, `EA_PLATFORM` = `common-gen5` (Standard: PS5/Xbox Series/PC) oder `common-gen4` (PS4/Xbox One).
- Nach dem Update einmal `https://DEINE-SEITE.netlify.app/api/setup?key=DEIN_SETUP_KEY` aufrufen, damit die neuen Befehle erscheinen.

## Support-Tickets

- Kanal 🎫 Support: Panel mit **Ticket öffnen** → Kategorie (Frage, Problem mit Spiel/Ergebnis, Spieler melden, Einspruch gegen Sperre, Sonstiges) → kurze Beschreibung.
- Der Bot legt einen privaten Kanal `ticket-0012-name` in derselben Kategorie wie der Support-Kanal an. Sehen können ihn nur die Person, Turnierleitung, Moderator und Support. Der Staff wird gepingt.
- Pro Person ein offenes Ticket. Buttons im Ticket: **Übernehmen** und **Person hinzufügen** (nur Staff), **Ticket schließen** (Person selbst oder Staff).
- Beim Schließen wird der Kanal **gelöscht, ohne Verlauf**. Im Admin-Kanal steht nur eine kurze Zeile, wer welches Ticket geschlossen hat.
- Der Bot braucht dafür das Recht **Kanäle verwalten**.

## Staff-Bewerbungen

- Kanal 📋 Staff-Bewerbung: Panel mit **Jetzt bewerben** → Position (**Moderator** oder **Support**) → Formular mit 5 Fragen (Alter, Aktivität, Erfahrung, Motivation, Sonstiges).
- Jede Bewerbung landet als Karte im Kanal ⚙️ Admin mit **Annehmen**, **Ablehnen** (mit Begründung) und **Gespräch** (öffnet ein Ticket mit dem Bewerber).
- Entscheiden können **nur Server-Admins** (Discord-Recht Administrator). Beim Annehmen wird die Rolle automatisch vergeben. Die Antwort bekommt der Bewerber im 🔔 Benachrichtigungs-Kanal.
- Eine offene Bewerbung pro Person, neu bewerben frühestens nach 14 Tagen.
- `/cl-bewerbung öffnen` bzw. `/cl-bewerbung schließen` (nur Server-Admins) – das Panel zeigt dann „Bewerbungen geschlossen“.
- Kanäle verknüpfen: `/cl-einrichten kanal typ: Support (Ticket-Panel)`, `… typ: Staff-Bewerbung`, `… typ: Admin (Bewerbungen & Ticket-Log)`, danach `/cl-einrichten rollen` (legt die Rolle **Support** an) und `/cl-einrichten panels`.

## Protokoll für die Admins

- Jede Aktion von Turnierleitung und Staff wird im Kanal ⚙️ Admin festgehalten: alle Befehle außer `/cl-ergebnis` (mit allen Angaben, z. B. `/cl-admin ergebnis spiel: 4 heim: 2 gast: 1`), Sperren und Aufheben, Zurücksetzen, Ticket übernehmen/hinzufügen/schließen sowie Entscheidungen über Bewerbungen.
- Jeder Eintrag zeigt wer, was, in welchem Kanal und wann. Es wird niemand gepingt.
- Der Admin-Kanal ist nur für Server-Admins sichtbar – die Turnierleitung sieht ihr eigenes Protokoll nicht.

## Sperrliste

- Im Kanal 🚫 Sperrliste steht ein Post mit Gründen, Regeln und allen aktuell gesperrten Personen – er aktualisiert sich automatisch.
- **Person sperren** (nur Turnierleitung & Moderator): Person → Grund → Dauer (Standard 7 Tage) → optional Notiz. Gehört die Person zu einer Mannschaft, kann der Partner (Manager/Co-VM) gleich mitgesperrt werden.
- Gesperrt wird die **Person**: Die Sperre gilt auch, wenn sie den Verein wechselt. Eine Mannschaft kann sich nicht anmelden, solange ihr Manager oder Co-VM gesperrt ist, und gesperrte Personen können nicht Co-VM werden.
- Betroffene werden im Benachrichtigungs-Kanal markiert (Nachricht verschwindet nach 1 Stunde), die Turnierleitung bekommt einen Eintrag im Log.
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
| `/cl-admin ea-status` | TOTT: EA-Verknüpfung & gesammelte Daten anzeigen |
| `/cl-admin tott` | TOTT des letzten Turniers sofort posten |
| `/cl-admin willkommen-test` | Willkommensnachricht testweise für dich selbst posten |
| `/cl-bewerbung öffnen · schließen` | Staff-Bewerbungen öffnen/schließen (nur Server-Admins) |
| `/cl-admin ea-verknüpfen verein [ea_id]` | EA-Club neu suchen oder ID direkt eintragen |

Spieler melden Ergebnisse über den Button im Spielplan oder mit `/cl-ergebnis`.

## Gut zu wissen

- Discord begrenzt, wie schnell Rollen vergeben werden. Bei der Auslosung kann es deshalb 1–2 Minuten dauern, bis alle die Gruppenkanäle sehen.
- Der Bot prüft jede Minute die Zeitpläne, Rollen und Turnierzeiten (Netlify Scheduled Function – läuft nur auf veröffentlichten Deploys).
- Banner und Logo liegen in `public/` und können dort ausgetauscht werden.
