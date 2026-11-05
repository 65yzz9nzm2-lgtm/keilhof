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
- [ ] Phase 4 – QR-Codes je Volk + Druckansicht je Bienenstand
- [ ] Phase 5 – Spracheingabe bei der Durchsicht (Transkription + Claude über Supabase Edge Function)
- [ ] Phase 6 – Offline-Erfassung (erst nach Rücksprache: Aufwand abschätzen)

## Weitere Wünsche (gemeldet am 05.11.2026)

- [x] **Honig: Preis pro kg und Erlös** – umgesetzt als Variante B (Verkäufe in Finanzen mit Preis je Einheit, Kategorie Honig)
  - Bei der Honigernte einen kg-Preis erfassen, damit der Erlös des Honigs sichtbar ist.
  - In **Finanzen** bei den Erlösen ebenfalls den kg-Preis, Honig-Erlöse sollen dort erscheinen.
  - Offen: zählt der Wert der ganzen Ernte als Erlös oder nur tatsächlich verkaufter Honig
    (dann eigene Verkaufs-Einträge mit kg, Preis/kg, evtl. Käufer/Los)?
- [ ] **Imkerei-Einkauf / Material**
  - Eigener Bereich in der Imkerei mit allem, was man für die Imkerei kaufen muss:
    Futter (z. B. Invertzucker), Behandlungsmittel, Geräte (z. B. Schleuder), Kleinteile usw.
  - Mit Auswahlmöglichkeiten/Kategorien.
  - Offen: reine Einkaufsliste (was fehlt / was ist zu besorgen) oder auch Bestand
    und Kosten, die in die Finanzen einfließen?

- [x] **Förderungen & sonstige Einnahmen** in Finanzen (Beiträge vom Land, Weideinteressentschaft …)
  – `backend/NACHTRAG_SONSTIGE_EINNAHMEN.sql`

## Sonstiges

- [ ] Direkte Links zu Fotos/Belegen schützen (Speicher privat + signierte Links) – optional
- [ ] Imkerei-Aufgaben zusätzlich im allgemeinen To-Do-Board? (offene Frage)
