# Offene Wünsche & Planung

Hier wird festgehalten, was noch umgesetzt werden soll, damit nichts vergessen wird.

## Imkerei – geplante Phasen

- [x] Phase 1 – Datenmodell (`backend/IMKEREI_SETUP.sql`)
- [x] Phase 2 – Oberfläche (Übersicht, Stockkarte, schnelle Durchsicht, Varroa-Diagramm)
- [x] Phase 3 – Auswertungen & Export (Reiter „Auswertungen“ in der Imkerei)
  - PDF-Export der Behandlungen nach Zeitraum und Bienenstand (Spalten leicht anpassbar,
    Pflichtangaben klärt der Betrieb noch mit Tierarzt/Imkerbund – keine erfundenen Vorgaben)
  - Anzahl aktiver Völker je Bienenstand zu einem frei wählbaren Stichtag
  - Honigernte-Auswertung je Jahr, Volk und Stand
  - Betriebskodex Hof und Imkerei im Kopf der Exporte
- [x] Phase 4 – QR-Codes je Volk + Druckansicht je Bienenstand
  - Offen/optional: QR-Scanner direkt in der App (iOS öffnet gescannte Links sonst in Safari statt in der Home-Bildschirm-App)
- [x] Phase 5 – Spracheingabe bei der Durchsicht – umgesetzt OHNE KI/Kosten: Diktierfunktion des Geräts + Stichwort-Erkennung in der App (Listen `DIKTAT_…` in imkerei.js erweiterbar)
- [ ] Phase 6 – Offline-Erfassung (erst nach Rücksprache: Aufwand abschätzen)

## Weitere Wünsche (gemeldet am 05.11.2026)

- [x] **Honig: Preis pro kg und Erlös** – umgesetzt als Variante B (Verkäufe in Finanzen mit Preis je Einheit, Kategorie Honig)
  - Bei der Honigernte einen kg-Preis erfassen, damit der Erlös des Honigs sichtbar ist.
  - In **Finanzen** bei den Erlösen ebenfalls den kg-Preis, Honig-Erlöse sollen dort erscheinen.
  - Offen: zählt der Wert der ganzen Ernte als Erlös oder nur tatsächlich verkaufter Honig
    (dann eigene Verkaufs-Einträge mit kg, Preis/kg, evtl. Käufer/Los)?
- [x] **Imkerei-Einkauf / Material** – Reiter „Material“: Bestand je Artikel, Einkaufsliste (vorgemerkt oder unter Mindestbestand), „gekauft“ bucht auf Wunsch Kosten (Kategorie Imkerei) – `backend/NACHTRAG_IMKER_MATERIAL.sql`
  - Eigener Bereich in der Imkerei mit allem, was man für die Imkerei kaufen muss:
    Futter (z. B. Invertzucker), Behandlungsmittel, Geräte (z. B. Schleuder), Kleinteile usw.
  - Mit Auswahlmöglichkeiten/Kategorien.
  - Offen: reine Einkaufsliste (was fehlt / was ist zu besorgen) oder auch Bestand
    und Kosten, die in die Finanzen einfließen?

- [x] **Förderungen & sonstige Einnahmen** in Finanzen (Beiträge vom Land, Weideinteressentschaft …)
  – `backend/NACHTRAG_SONSTIGE_EINNAHMEN.sql`
- [x] **Betriebskodex** Hof und Imkerei in den Einstellungen
- [x] **Wetter an den Bienenständen** mit „Durchsicht-Wetter“-Hinweis
- [ ] **Kaufpreis-Feld** direkt im Formular „Neues Einzeltier“ (legt die Kauf-Buchung gleich mit an) – Antwort offen

## Sonstiges

- [x] Direkte Links zu Fotos/Belegen schützen (Speicher privat + signierte Links, 1 Std. gültig) – erledigt 13.11.2026
- [ ] Imkerei-Aufgaben zusätzlich im allgemeinen To-Do-Board? (offene Frage)
