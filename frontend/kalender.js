// ============================================================================
// KALENDER - alle Einträge und Fälligkeiten des Hofs an einem Ort.
// Liest nur vorhandene Daten (keine eigene Tabelle): Bienen, Vieh, Maschinen,
// Felder, Geld. Oben "Demnächst" (überfällig + nächste 14 Tage), darunter die
// Monatsansicht; ein Tipp auf einen Tag zeigt dessen Einträge.
// ============================================================================

const KAL_BEREICHE = [
  { key: 'alle', text: 'Alles', icon: '📋' },
  { key: 'bienen', text: 'Bienen', icon: '🐝' },
  { key: 'vieh', text: 'Vieh', icon: '🐄' },
  { key: 'maschinen', text: 'Maschinen', icon: '🚜' },
  { key: 'felder', text: 'Felder', icon: '🌾' },
  { key: 'geld', text: 'Geld', icon: '💶' },
];
const KAL_MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const KAL_WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const KAL_DEMNAECHST_TAGE = 14;

const kal = {
  bereich: 'alle',
  nurFaellig: false,
  monat: null,        // Date am 1. des angezeigten Monats
  tag: null,          // gewählter Tag 'YYYY-MM-DD'
  eintraege: [],
};

// ---- kleine Helfer ----------------------------------------------------------
function kalIso(d) {
  if (!d) return '';
  if (typeof d === 'string') return d.slice(0, 10);
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
function kalHeute() { return kalIso(new Date()); }
function kalPlusTage(iso, tage) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + Number(tage));
  return kalIso(d);
}
function kalPlusMonate(iso, monate) {
  const d = new Date(iso + 'T12:00:00');
  d.setMonth(d.getMonth() + Number(monate));
  return kalIso(d);
}
function kalEsc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function kalDatumLang(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function kalEuro(n) { return Number(n || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }

// Status eines Eintrags: 'erledigt' (grün), 'offen' (orange), 'ueberfaellig' (rot)
function kalStatus(e) {
  if (e.art === 'eintrag' || e.erledigt) return 'erledigt';
  if (e.datum < kalHeute()) return e.art === 'hinweis' ? 'erledigt' : 'ueberfaellig';
  return 'offen';
}
const KAL_STATUS_FARBE = { erledigt: 'bg-green-500', offen: 'bg-amber-500', ueberfaellig: 'bg-red-600' };
const KAL_STATUS_TEXT = { offen: 'fällig', ueberfaellig: 'überfällig' };

// Liste laden, ohne bei fehlender Tabelle die ganze Ansicht scheitern zu lassen
async function kalListe(action) {
  if (action in listCache) return listCache[action] || [];
  try { listCache[action] = await Api.call(action); return listCache[action] || []; }
  catch (e) { console.warn('Kalender:', action, e.message); return []; }
}

// ---- alle Einträge einsammeln ---------------------------------------------
async function kalEintraegeLaden() {
  const namen = ['tiere', 'zuchtereignisse', 'tierkosten', 'tiererloese', 'maschinen', 'wartungsintervalle',
    'maschinenkosten', 'flaechen', 'schnitte', 'duengungen', 'feldarbeiten', 'allgemeinekosten',
    'erntevermarktung', 'sonstigeeinnahmen'];
  const listen = await Promise.all(namen.map(n => kalListe(n + '.list')));
  const L = Object.fromEntries(namen.map((n, i) => [n, listen[i] || []]));
  if (IMKEREI_AKTIV) { try { await ladeImkerDaten(); } catch (e) { console.warn('Kalender Imkerei:', e.message); } }

  const out = [];
  const add = (e) => { if (e.datum) out.push({ ...e, datum: kalIso(e.datum) }); };
  const nachId = (liste) => Object.fromEntries(liste.map(x => [x.ID, x]));
  const tiere = nachId(L.tiere), maschinen = nachId(L.maschinen), flaechen = nachId(L.flaechen);
  const tierName = id => { const t = tiere[id]; return t ? (t.Name || t.Ohrmarke || 'Tier') : 'Tier'; };
  const neuLaden = async () => { await kalNeuLaden(); };

  // ---- Bienen ----
  if (IMKEREI_AKTIV && typeof imker !== 'undefined') {
    const volk = id => imker.voelker.find(v => v.ID === id);
    const volkLinks = ids => [...new Set(ids)].map(id => volk(id)).filter(Boolean)
      .sort((a, b) => String(a.Nummer).localeCompare(String(b.Nummer), 'de', { numeric: true }))
      .map(v => ({ text: volkLabel(v), fn: () => openStockkarte(v.ID) }));
    const gruppiert = (liste, schluessel) => {
      const g = {};
      liste.forEach(x => { (g[schluessel(x)] = g[schluessel(x)] || []).push(x); });
      return Object.values(g);
    };

    imker.durchsichten.forEach(d => {
      const dv = imker.durchsichtvoelker.filter(x => x.DurchsichtID === d.ID);
      add({ datum: d.Datum, bereiche: ['bienen'], art: 'eintrag', icon: '🐝',
        titel: `Durchsicht · ${dv.length} ${dv.length === 1 ? 'Volk' : 'Völker'}`, detail: d.Notiz || '',
        links: volkLinks(dv.map(x => x.VolkID)) });
    });
    gruppiert(imker.behandlungen, b => b.SammelID || b.ID).forEach(gr => {
      const b = gr[0];
      const bis = b.DatumBis && kalIso(b.DatumBis) !== kalIso(b.Datum) ? ` bis ${fmtDate(b.DatumBis)}` : '';
      add({ datum: b.Datum, bereiche: ['bienen'], art: 'eintrag', icon: '💊',
        titel: `Behandlung ${b.Mittel || ''}`.trim(), detail: [bis.trim(), b.Menge ? `${zahl(b.Menge)} ${b.Einheit || ''} je Volk` : ''].filter(Boolean).join(' · '),
        links: volkLinks(gr.map(x => x.VolkID)) });
      if (Number(b.WartezeitTage) > 0) {
        add({ datum: kalPlusTage(kalIso(b.DatumBis || b.Datum), Number(b.WartezeitTage)), bereiche: ['bienen'], art: 'hinweis', icon: '⏳',
          titel: `Wartezeit endet (${b.Mittel || 'Behandlung'})`, detail: `${b.WartezeitTage} Tage nach der Behandlung`,
          links: volkLinks(gr.map(x => x.VolkID)) });
      }
    });
    gruppiert(imker.fuetterungen, f => f.SammelID || f.ID).forEach(gr => {
      const f = gr[0];
      add({ datum: f.Datum, bereiche: ['bienen'], art: 'eintrag', icon: '🥣',
        titel: `Fütterung ${f.Futterart || ''}`.trim(), detail: f.Menge ? `${zahl(f.Menge)} ${f.Einheit || ''} je Volk` : '',
        links: volkLinks(gr.map(x => x.VolkID)) });
    });
    gruppiert(imker.varroa, k => kalIso(k.Datum)).forEach(gr => {
      add({ datum: gr[0].Datum, bereiche: ['bienen'], art: 'eintrag', icon: '🔬',
        titel: `Varroa-Kontrolle · ${gr.length} ${gr.length === 1 ? 'Volk' : 'Völker'}`, detail: gr[0].Methode || '',
        links: volkLinks(gr.map(x => x.VolkID)) });
    });
    imker.honigernten.forEach(h => {
      const hv = imker.honigerntevoelker.filter(x => x.HonigernteID === h.ID);
      add({ datum: h.Datum, bereiche: ['bienen'], art: 'eintrag', icon: '🍯',
        titel: `Honigernte${h.MengeKg ? ' ' + zahl(h.MengeKg) + ' kg' : ''}`, detail: h.Sorte || '',
        links: volkLinks(hv.map(x => x.VolkID)) });
    });
    imker.ereignisse.forEach(ev => {
      add({ datum: ev.Datum, bereiche: ['bienen'], art: 'eintrag', icon: '🔁',
        titel: ev.Typ || 'Ereignis', detail: ev.Grund || ev.Notiz || '', links: volkLinks([ev.VolkID, ev.PartnerVolkID].filter(Boolean)) });
    });
    imker.aufgaben.forEach(a => {
      if (!a.FaelligAm && !(a.Erledigt === true && a.ErledigtAm)) return;
      const stand = a.BienenstandID && (imker.bienenstaende.find(s => s.ID === a.BienenstandID) || {}).Name;
      add({ datum: a.FaelligAm || a.ErledigtAm, bereiche: ['bienen'], art: 'faellig', erledigt: a.Erledigt === true, icon: '📌',
        titel: a.Titel, detail: [stand ? `Stand ${stand}` : '', a.Erledigt === true ? `erledigt${a.ErledigtAm ? ' am ' + fmtDate(a.ErledigtAm) : ''}` : ''].filter(Boolean).join(' · '),
        oeffnen: () => openAufgabeModal(a), links: a.VolkID ? volkLinks([a.VolkID]) : [] });
    });
  }

  // ---- Vieh ----
  L.zuchtereignisse.forEach(z => {
    const tier = tiere[z.TierID];
    const oeffnen = tier ? () => openTierBuchungenDetail(tier) : null;
    add({ datum: z.Datum, bereiche: ['vieh'], art: 'eintrag', icon: '🐄', titel: `${z.Typ || 'Zucht'} – ${tierName(z.TierID)}`,
      detail: z.Vatertier ? `Vatertier: ${z.Vatertier}` : (z.Notiz || ''), oeffnen });
    if (z.Typ === 'Besamung' || z.Typ === 'Deckung') {
      add({ datum: z.TrockenstellenAb, bereiche: ['vieh'], art: 'hinweis', icon: '🥛', titel: `Trockenstellen – ${tierName(z.TierID)}`, oeffnen });
      add({ datum: z.VoraussichtlichesAbkalbedatum, bereiche: ['vieh'], art: 'hinweis', icon: '🐮', titel: `Voraussichtliche Abkalbung – ${tierName(z.TierID)}`, oeffnen });
    }
  });
  L.tiere.forEach(t => {
    const oeffnen = () => openTierBuchungenDetail(t);
    const name = t.Name || t.Ohrmarke || 'Tier';
    add({ datum: t.Geburtsdatum, bereiche: ['vieh'], art: 'eintrag', icon: '🎉', titel: `Geburt – ${name}`, detail: t.Tierart || '', oeffnen });
    add({ datum: t.Eingangsdatum, bereiche: ['vieh'], art: 'eintrag', icon: '➡️', titel: `Zugang – ${name}`, detail: t.Tierart || '', oeffnen });
    add({ datum: t.Ausgangsdatum, bereiche: ['vieh'], art: 'eintrag', icon: '⬅️', titel: `Abgang – ${name}`, detail: t.Status || '', oeffnen });
  });

  // ---- Maschinen ----
  L.wartungsintervalle.forEach(iv => {
    const m = maschinen[iv.MaschinenID];
    if (!m || m.Aktiv === false || !iv.IntervallMonate || !iv.LetzteWartungDatum) return;
    add({ datum: kalPlusMonate(kalIso(iv.LetzteWartungDatum), iv.IntervallMonate), bereiche: ['maschinen'], art: 'faellig', icon: '🔧',
      titel: `Wartung: ${iv.Bezeichnung || ''} – ${m.Bezeichnung || 'Maschine'}`, detail: `alle ${iv.IntervallMonate} Monate, zuletzt ${fmtDate(iv.LetzteWartungDatum)}`,
      oeffnen: () => openWartungsintervalleDetail(m) });
  });

  // ---- Felder ----
  const feldOeffnen = (id) => {
    const f = flaechen[id];
    return f ? async () => { await showSection('flaechen'); await openFeldbuchPanel(f); document.getElementById('feldbuchPanel').scrollIntoView({ behavior: 'smooth' }); } : null;
  };
  const flName = id => (flaechen[id] || {}).Name || 'Fläche';
  L.schnitte.forEach(s => add({ datum: s.Datum, bereiche: ['felder'], art: 'eintrag', icon: '✂️',
    titel: `${s.SchnittNummer ? s.SchnittNummer + '. ' : ''}Schnitt – ${flName(s.FlaecheID)}`,
    detail: [s.Erntetyp, s.ErtragsMenge ? `${s.ErtragsMenge} ${s.ErtragsEinheit || ''}` : ''].filter(Boolean).join(' · '), oeffnen: feldOeffnen(s.FlaecheID) }));
  L.duengungen.forEach(d => add({ datum: d.Datum, bereiche: ['felder'], art: 'eintrag', icon: '🌱',
    titel: `Düngung – ${flName(d.FlaecheID)}`, detail: [d.Duengerart, d.Menge ? `${d.Menge} ${d.Einheit || ''}` : ''].filter(Boolean).join(' · '), oeffnen: feldOeffnen(d.FlaecheID) }));
  L.feldarbeiten.forEach(a => add({ datum: a.Datum, bereiche: ['felder'], art: 'eintrag', icon: '🚜',
    titel: `${a.Schritt || 'Feldarbeit'} – ${flName(a.FlaecheID)}`, detail: a.Notiz || '', oeffnen: feldOeffnen(a.FlaecheID) }));

  // ---- Geld (dazu je nach Kategorie auch Bienen/Vieh/Maschinen) ----
  L.allgemeinekosten.forEach(k => add({ datum: k.Datum, bereiche: ['geld'].concat(k.Kategorie === 'Imkerei' ? ['bienen'] : []), art: 'eintrag', icon: '💸',
    titel: `Ausgabe ${kalEuro(k.Betrag)} – ${k.Kategorie || ''}`, detail: k.Beschreibung || '', oeffnen: () => openAllgemeinekostenBearbeitenModal(k, neuLaden) }));
  L.maschinenkosten.forEach(k => add({ datum: k.Datum, bereiche: ['geld', 'maschinen'], art: 'eintrag', icon: '💸',
    titel: `Maschinenkosten ${kalEuro(k.Betrag)} – ${(maschinen[k.MaschinenID] || {}).Bezeichnung || ''}`, detail: [k.Kategorie, k.Beschreibung].filter(Boolean).join(' · '),
    oeffnen: () => openMaschinenkostenBearbeitenModal(k, neuLaden) }));
  L.tierkosten.forEach(k => add({ datum: k.Datum, bereiche: ['geld', 'vieh'], art: 'eintrag', icon: '💸',
    titel: `Tierkosten ${kalEuro(k.Betrag)} – ${tierName(k.TierID)}`, detail: [k.Kategorie, k.Beschreibung].filter(Boolean).join(' · '),
    oeffnen: () => openTierkostenBearbeitenModal(k, neuLaden) }));
  L.tiererloese.forEach(k => add({ datum: k.Datum, bereiche: ['geld', 'vieh'], art: 'eintrag', icon: '💶',
    titel: `Tiererlös ${kalEuro(k.Betrag)} – ${tierName(k.TierID)}`, detail: [k.Art, k.Beschreibung].filter(Boolean).join(' · '),
    oeffnen: () => openTiererloeseBearbeitenModal(k, neuLaden) }));
  L.erntevermarktung.forEach(v => add({ datum: v.Datum, bereiche: ['geld'].concat(v.Kategorie === 'Honig' ? ['bienen'] : []), art: 'eintrag', icon: '🛒',
    titel: `Verkauf ${kalEuro(v.Erloes)} – ${v.Kategorie || ''}`, detail: v.Beschreibung || '', oeffnen: () => openErntevermarktungBearbeitenModal(v, neuLaden) }));
  L.sonstigeeinnahmen.forEach(e => add({ datum: e.Datum, bereiche: ['geld'].concat(e.Kategorie === 'Förderung Imkerei' ? ['bienen'] : []), art: 'eintrag', icon: '💶',
    titel: `Einnahme ${kalEuro(e.Betrag)} – ${e.Kategorie || ''}`, detail: e.Beschreibung || '', oeffnen: () => openSonstigeEinnahmeModal(e, neuLaden) }));

  return out;
}

// ---- Anzeige ------------------------------------------------------------------
function kalGefiltert() {
  return kal.eintraege.filter(e =>
    (kal.bereich === 'alle' || e.bereiche.includes(kal.bereich)) &&
    (!kal.nurFaellig || e.art !== 'eintrag'));
}

function kalEintragHtml(e, i, mitDatum) {
  const st = kalStatus(e);
  const statusText = KAL_STATUS_TEXT[st] && e.art !== 'eintrag' ? `<span class="kal-badge kal-badge-${st}">${KAL_STATUS_TEXT[st]}</span>` : '';
  const erledigt = e.art === 'faellig' && e.erledigt ? '<span class="kal-badge kal-badge-erledigt">erledigt</span>' : '';
  return `<div class="kal-eintrag kal-rand-${st}">
    <button type="button" class="kal-eintrag-kopf" data-kal-i="${i}" ${e.oeffnen ? '' : 'data-kal-ohne="1"'}>
      <span class="kal-eintrag-icon">${e.icon || '•'}</span>
      <span class="min-w-0 flex-1">
        <span class="kal-eintrag-titel">${kalEsc(e.titel)} ${statusText}${erledigt}</span>
        ${mitDatum ? `<span class="kal-eintrag-datum">${kalDatumLang(e.datum)}</span>` : ''}
        ${e.detail ? `<span class="kal-eintrag-detail">${kalEsc(e.detail)}</span>` : ''}
      </span>
      ${e.oeffnen ? '<span class="kal-pfeil">›</span>' : ''}
    </button>
    ${e.links && e.links.length ? `<div class="kal-links">${e.links.map((l, j) => `<button type="button" class="kal-link" data-kal-i="${i}" data-kal-l="${j}">${kalEsc(l.text)}</button>`).join('')}</div>` : ''}
  </div>`;
}

function kalListeVerdrahten(container, liste) {
  container.querySelectorAll('[data-kal-i]').forEach(b => b.addEventListener('click', () => {
    const e = liste[Number(b.dataset.kalI)];
    if (!e) return;
    if (b.dataset.kalL !== undefined) { const l = e.links[Number(b.dataset.kalL)]; if (l) l.fn(); return; }
    if (e.oeffnen) e.oeffnen();
    else if (e.links && e.links.length === 1) e.links[0].fn();
  }));
}

function renderKalender() {
  const sektion = document.getElementById('section-kalender');
  if (!sektion) return;
  if (!kal.monat) { const h = new Date(); kal.monat = new Date(h.getFullYear(), h.getMonth(), 1); }
  if (!kal.tag) kal.tag = kalHeute();
  const heute = kalHeute();
  const alle = kalGefiltert();

  // Filterknöpfe
  document.getElementById('kalFilter').innerHTML = KAL_BEREICHE
    .filter(b => b.key !== 'bienen' || IMKEREI_AKTIV)
    .map(b => `<button type="button" class="kal-filter${kal.bereich === b.key ? ' aktiv' : ''}" data-bereich="${b.key}">${b.icon} ${b.text}</button>`).join('')
    + `<button type="button" class="kal-filter kal-filter-faellig${kal.nurFaellig ? ' aktiv' : ''}" id="kalNurFaellig">⏰ Nur Fälliges</button>`;
  document.querySelectorAll('#kalFilter [data-bereich]').forEach(b => b.onclick = () => { kal.bereich = b.dataset.bereich; renderKalender(); });
  document.getElementById('kalNurFaellig').onclick = () => { kal.nurFaellig = !kal.nurFaellig; renderKalender(); };

  // Demnächst: überfällig + nächste 14 Tage (nur Fälligkeiten/Hinweise, nicht erledigt)
  const bis = kalPlusTage(heute, KAL_DEMNAECHST_TAGE);
  const demnaechst = alle.filter(e => e.art !== 'eintrag' && !e.erledigt &&
    ((kalStatus(e) === 'ueberfaellig') || (e.datum >= heute && e.datum <= bis)))
    .sort((a, b) => a.datum.localeCompare(b.datum));
  const dn = document.getElementById('kalDemnaechst');
  dn.innerHTML = demnaechst.length
    ? demnaechst.map((e, i) => kalEintragHtml(e, i, true)).join('')
    : `<p class="text-gray-500">Nichts fällig in den nächsten ${KAL_DEMNAECHST_TAGE} Tagen. 👍</p>`;
  kalListeVerdrahten(dn, demnaechst);

  // Monatsansicht
  const jahr = kal.monat.getFullYear(), monat = kal.monat.getMonth();
  document.getElementById('kalMonatTitel').textContent = `${KAL_MONATE[monat]} ${jahr}`;
  const proTag = {};
  alle.forEach(e => { (proTag[e.datum] = proTag[e.datum] || []).push(e); });
  const erster = new Date(jahr, monat, 1);
  const versatz = (erster.getDay() + 6) % 7;                 // Montag = 0
  const tageImMonat = new Date(jahr, monat + 1, 0).getDate();
  let zellen = KAL_WOCHENTAGE.map(w => `<div class="kal-wochentag">${w}</div>`).join('');
  for (let i = 0; i < versatz; i++) zellen += '<div></div>';
  for (let t = 1; t <= tageImMonat; t++) {
    const iso = kalIso(new Date(jahr, monat, t));
    const liste = proTag[iso] || [];
    const zaehler = { ueberfaellig: 0, offen: 0, erledigt: 0 };
    liste.forEach(e => zaehler[kalStatus(e)]++);
    const punkte = ['ueberfaellig', 'offen', 'erledigt'].filter(s => zaehler[s])
      .map(s => `<span class="kal-punkt ${KAL_STATUS_FARBE[s]}">${zaehler[s]}</span>`).join('');
    zellen += `<button type="button" class="kal-tag${iso === heute ? ' heute' : ''}${iso === kal.tag ? ' gewaehlt' : ''}" data-tag="${iso}"
      aria-label="${kalDatumLang(iso)}${liste.length ? ', ' + liste.length + ' Einträge' : ''}">
      <span class="kal-tag-nr">${t}</span><span class="kal-punkte">${punkte}</span></button>`;
  }
  const raster = document.getElementById('kalRaster');
  raster.innerHTML = zellen;
  raster.querySelectorAll('[data-tag]').forEach(b => b.onclick = () => {
    kal.tag = b.dataset.tag; renderKalender();
    document.getElementById('kalTagTitel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // Einträge des gewählten Tags
  const tagListe = (proTag[kal.tag] || []).slice().sort((a, b) => ({ ueberfaellig: 0, offen: 1, erledigt: 2 }[kalStatus(a)] - { ueberfaellig: 0, offen: 1, erledigt: 2 }[kalStatus(b)]));
  document.getElementById('kalTagTitel').textContent = kalDatumLang(kal.tag) + (kal.tag === heute ? ' (heute)' : '');
  const tl = document.getElementById('kalTagListe');
  tl.innerHTML = tagListe.length ? tagListe.map((e, i) => kalEintragHtml(e, i, false)).join('') : '<p class="text-gray-500">Keine Einträge an diesem Tag.</p>';
  kalListeVerdrahten(tl, tagListe);
}

async function kalNeuLaden() {
  kal.eintraege = await kalEintraegeLaden();
  renderKalender();
}

async function loadKalenderSection() {
  if (!kal._verdrahtet) {
    kal._verdrahtet = true;
    const monatWechseln = (d) => { kal.monat = new Date(kal.monat.getFullYear(), kal.monat.getMonth() + d, 1); renderKalender(); };
    document.getElementById('kalZurueck').onclick = () => monatWechseln(-1);
    document.getElementById('kalVor').onclick = () => monatWechseln(1);
    document.getElementById('kalHeute').onclick = () => {
      const h = new Date(); kal.monat = new Date(h.getFullYear(), h.getMonth(), 1); kal.tag = kalHeute(); renderKalender();
    };
  }
  renderKalender();          // sofort mit dem, was schon da ist
  await kalNeuLaden();
}
