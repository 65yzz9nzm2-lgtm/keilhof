'use strict';

// ============================================================================
// MODUL IMKEREI
// Bienenstände, Völker (Stockkarte mit Zeitleiste), Durchsichten, Behandlungen,
// Fütterungen, Varroa-Kontrollen, Honigernten und Aufgaben.
// Nutzt dieselben Bausteine wie der Rest der App (Api/cachedBatch/cacheUpsert,
// openFormModal, openDetailModal, renderTable) - Datenmodell siehe
// backend/IMKEREI_SETUP.sql, Feldzuordnung siehe ENTITIES in api.js.
// ============================================================================

const IMKER_LISTEN = {
  bienenstaende: 'bienenstaende.list',
  voelker: 'voelker.list',
  ereignisse: 'voelkerereignisse.list',
  koeniginnen: 'koeniginnen.list',
  durchsichten: 'durchsichten.list',
  durchsichtvoelker: 'durchsichtvoelker.list',
  behandlungen: 'behandlungen.list',
  fuetterungen: 'fuetterungen.list',
  varroa: 'varroakontrollen.list',
  honigernten: 'honigernten.list',
  honigerntevoelker: 'honigerntevoelker.list',
  aufgaben: 'bienenaufgaben.list'
};

// Beim Login/Aktualisieren gleich mitladen, damit die Imkerei (auch ohne Netz am
// Bienenstand) sofort aus dem lokalen Stand angezeigt werden kann.
if (IMKEREI_AKTIV) {
  Object.entries(IMKER_LISTEN).forEach(([key, action]) => { FULL_SYNC_CALLS['imker_' + key] = { action }; });
}

// Aktueller Datenstand des Moduls - wird vor jedem Anzeigen aus dem Cache übernommen.
const imker = {};
Object.keys(IMKER_LISTEN).forEach(k => { imker[k] = []; });

function imkerSync() {
  Object.entries(IMKER_LISTEN).forEach(([k, action]) => { imker[k] = listCache[action] || []; });
}

async function ladeImkerDaten() {
  const calls = {};
  Object.entries(IMKER_LISTEN).forEach(([k, action]) => { calls[k] = { action }; });
  await cachedBatch(calls);
  imkerSync();
}

// ---- Auswahllisten ----------------------------------------------------------
const VOLK_STATUS = ['Aktiv', 'Aufgelöst', 'Verkauft', 'Abgeschwärmt', 'Eingegangen'];
const VOLK_HERKUNFT = ['Eigener Ableger', 'Schwarm', 'Kunstschwarm', 'Kauf', 'Sonstiges'];
const BEUTENTYPEN = ['Zander', 'Deutsch Normal', 'Dadant', 'Langstroth', 'Alberti', 'Einraumbeute'];
const VARROA_METHODEN = ['Gemüllwindel', 'Puderzucker', 'Auswaschen'];
const FUTTER_VORSCHLAEGE = ['Zuckerwasser', 'Futterteig', 'Invertsirup', 'Honig'];
const BEHANDLUNG_METHODEN = ['Träufeln', 'Sprühen', 'Verdunsten', 'Sublimieren', 'Streifen einhängen'];
const BEHANDLUNG_EINHEITEN = ['ml', 'g', 'Streifen', 'Stück'];
const HONIGSORTEN = ['Blütenhonig', 'Waldhonig', 'Almrosenhonig', 'Löwenzahnhonig', 'Kastanienhonig'];
const VERLUST_GRUENDE = ['Varroa', 'Weisellosigkeit', 'Verhungert', 'Räuberei', 'Wintertod'];
const VERLUST_STATUS = ['Eingegangen', 'Aufgelöst', 'Verkauft', 'Abgeschwärmt'];

// Königinnen-Bewertung: 1 = schlecht ... 4 = sehr gut
const BEWERTUNG_OPTIONEN = [{ value: '', label: '–' }, { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }];
const BEWERTUNG_HILFE = '1 = schlecht … 4 = sehr gut (bei Schwarmneigung: 4 = schwarmträge)';

// Internationale Zeichenfarbe nach der letzten Ziffer des Jahrgangs
const KOENIGIN_FARBEN = { 1: 'Weiß', 6: 'Weiß', 2: 'Gelb', 7: 'Gelb', 3: 'Rot', 8: 'Rot', 4: 'Grün', 9: 'Grün', 5: 'Blau', 0: 'Blau' };
const FARBE_HEX = { 'Weiß': '#f9fafb', 'Gelb': '#facc15', 'Rot': '#ef4444', 'Grün': '#22c55e', 'Blau': '#3b82f6' };

// ---- kleine Helfer ----------------------------------------------------------
function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Heutiges Datum als JJJJ-MM-TT in Ortszeit (toISOString wäre UTC - kurz nach
// Mitternacht sonst noch "gestern").
function heuteIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function zahl(n, stellen = 1) {
  if (n === '' || n === null || n === undefined || isNaN(Number(n))) return '';
  return Number(n).toLocaleString('de-DE', { maximumFractionDigits: stellen });
}

function datumWert(d) {
  const t = new Date(d).getTime();
  return isNaN(t) ? 0 : t;
}

function tageSeitText(d) {
  if (!d) return '';
  const tage = Math.round((datumWert(heuteIso()) - datumWert(String(d).slice(0, 10))) / 86400000);
  if (tage <= 0) return 'heute';
  if (tage === 1) return 'gestern';
  return `vor ${tage} Tagen`;
}

function volkLabel(v) {
  if (!v) return 'unbekanntes Volk';
  return `Volk ${v.Nummer || '?'}${v.Name ? ` „${v.Name}“` : ''}`;
}

function volkById(id) { return imker.voelker.find(v => v.ID === id); }
function standById(id) { return imker.bienenstaende.find(s => s.ID === id); }
function standName(id) { const s = standById(id); return s ? s.Name : 'ohne Bienenstand'; }

function istSichtbar(r) { return r.Aktiv !== false; }
function aktiveVoelker() { return imker.voelker.filter(v => istSichtbar(v) && v.Status === 'Aktiv'); }
function aktiveStaende() { return imker.bienenstaende.filter(istSichtbar); }

function nachNummer(a, b) {
  const na = parseFloat(a.Nummer), nb = parseFloat(b.Nummer);
  if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
  return String(a.Nummer || '').localeCompare(String(b.Nummer || ''), 'de');
}

function letzteDurchsicht(volkId) {
  const eintraege = imker.durchsichtvoelker
    .filter(dv => dv.VolkID === volkId)
    .map(dv => ({ dv, d: imker.durchsichten.find(x => x.ID === dv.DurchsichtID) }))
    .filter(x => x.d)
    .sort((a, b) => datumWert(b.d.Datum) - datumWert(a.d.Datum));
  return eintraege[0] || null;
}

function aktuelleKoenigin(volkId) {
  return imker.koeniginnen
    .filter(k => k.VolkID === volkId && k.Aktuell === true)
    .sort((a, b) => datumWert(b.EingesetztAm || b.ErstelltAm) - datumWert(a.EingesetztAm || a.ErstelltAm))[0] || null;
}

function letzteBehandlung(volkId) {
  return imker.behandlungen.filter(b => b.VolkID === volkId).sort((a, b) => datumWert(b.Datum) - datumWert(a.Datum))[0] || null;
}

function letzteVarroa(volkId) {
  return imker.varroa.filter(v => v.VolkID === volkId).sort((a, b) => datumWert(b.Datum) - datumWert(a.Datum))[0] || null;
}

function varroaText(k) {
  if (!k) return '';
  const anzahl = Number(k.MilbenAnzahl);
  if (k.Methode === 'Gemüllwindel' && Number(k.ZeitraumTage) > 0) {
    return `${zahl(anzahl / Number(k.ZeitraumTage))} Milben/Tag`;
  }
  return `${zahl(anzahl, 0)} Milben (${k.Methode || 'Kontrolle'})`;
}

function offeneAufgaben() {
  return imker.aufgaben.filter(a => a.Erledigt !== true)
    .sort((a, b) => (datumWert(a.FaelligAm) || 9e15) - (datumWert(b.FaelligAm) || 9e15));
}

function istUeberfaellig(a) {
  return a.Erledigt !== true && a.FaelligAm && String(a.FaelligAm).slice(0, 10) < heuteIso();
}

function koeniginPunkt(k, klasse = 'w-3 h-3') {
  if (!k || !k.Farbe) return '';
  const hex = FARBE_HEX[k.Farbe] || '#9ca3af';
  return `<span class="inline-block ${klasse} rounded-full border border-gray-400 align-middle" style="background:${hex}" title="${esc(k.Farbe)}"></span>`;
}

// Speichert einen Datensatz und führt den lokalen Stand nach (Fehler gehen an den Aufrufer).
async function imkerSpeichern(entity, payload, id) {
  const saved = id
    ? await Api.call(entity + '.update', { id, ...payload })
    : await Api.call(entity + '.create', payload);
  cacheUpsert(entity + '.list', saved);
  return saved;
}

async function imkerLoeschen(entity, id) {
  await Api.call(entity + '.delete', { id });
  const cfg = ENTITIES[entity];
  if (cfg.bool && cfg.bool.indexOf('aktiv') !== -1) {
    // Nur ausgeblendet - im Cache als inaktiv markieren statt entfernen (Historie bleibt)
    const row = (listCache[entity + '.list'] || []).find(r => r.ID === id);
    if (row) { row.Aktiv = false; persistCacheDebounced(); }
  } else {
    cacheRemove(entity + '.list', id);
  }
}

async function fotoHochladen(file) {
  if (!file) return null;
  const up = await Api.uploadFile(file, 'imkerei');
  return up.url;
}

// ---- Neu zeichnen nach jeder Änderung ---------------------------------------
let _stockkarteVolkId = null;
let _imkerDetailNeuZeichnen = null;

function imkerNeuZeichnen() {
  imkerSync();
  if (detailModal.open && _stockkarteVolkId) renderStockkarte(_stockkarteVolkId);
  else if (detailModal.open && _imkerDetailNeuZeichnen) _imkerDetailNeuZeichnen();
  const sektion = document.getElementById('section-imkerei');
  if (sektion && !sektion.classList.contains('hidden')) { renderImkereiSection(); renderImkerWetter(); }
}

if (IMKEREI_AKTIV) {
  detailModal.addEventListener('close', () => { _stockkarteVolkId = null; _imkerDetailNeuZeichnen = null; });
}

// ============================================================================
// ÜBERSICHT: Bienenstände -> Völker
// ============================================================================
async function loadImkereiSection() {
  await ladeImkerDaten();
  renderImkereiSection();
  renderImkerWetter();
  ladeMaterialStill().then(ok => { if (ok) renderImkerMaterial(); });
}

if (IMKEREI_AKTIV) {
  document.querySelectorAll('.itab-btn').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.itab-btn').forEach(x => {
      const aktiv = x === b;
      x.classList.toggle('border-green-700', aktiv);
      x.classList.toggle('border-transparent', !aktiv);
      x.classList.toggle('text-gray-500', !aktiv);
    });
    document.querySelectorAll('.itab-panel').forEach(p => p.classList.toggle('hidden', p.id !== 'itab-' + b.dataset.itab));
    if (b.dataset.itab === 'auswertung') renderImkerAuswertung();
    if (b.dataset.itab === 'material') renderImkerMaterial();
  }));

  document.getElementById('btnNeuerBienenstand').onclick = () => openBienenstandModal();
  document.getElementById('btnNeuesVolk').onclick = () => openVolkModal();
  document.getElementById('btnImkerDurchsicht').onclick = () => openDurchsichtErfassung([]);
  document.getElementById('btnImkerBehandlung').onclick = () => openBehandlungModal({ volkIds: [] });
  document.getElementById('btnImkerFuetterung').onclick = () => openFuetterungModal({ volkIds: [] });
  document.getElementById('btnImkerHonigernte').onclick = () => openHonigernteModal({ volkIds: [] });
  document.getElementById('btnVoelkerRegisterToggle').onclick = () => {
    document.getElementById('voelkerRegister').classList.toggle('hidden');
    renderVoelkerRegister();
  };
}

function volkZeileHtml(v) {
  const k = aktuelleKoenigin(v.ID);
  const letzte = letzteDurchsicht(v.ID);
  const varroa = letzteVarroa(v.ID);
  const aufgaben = offeneAufgaben().filter(a => a.VolkID === v.ID);
  const ueberfaellig = aufgaben.some(istUeberfaellig);
  const infos = [];
  if (k) infos.push(`${koeniginPunkt(k)} ${esc(k.Jahrgang || '')}`);
  if (letzte && letzte.dv.Volksstaerke !== '') infos.push(`Stärke ${zahl(letzte.dv.Volksstaerke)}`);
  if (letzte) infos.push(`Durchsicht ${tageSeitText(letzte.d.Datum)}`);
  if (varroa) infos.push(`🔬 ${varroaText(varroa)}`);
  return `<button type="button" data-volk="${v.ID}" class="btn-volk w-full text-left flex items-center gap-3 py-3 px-1 hover:bg-amber-50 rounded">
      <span class="text-2xl">🐝</span>
      <span class="flex-1 min-w-0">
        <span class="block font-semibold">${esc(volkLabel(v))}${v.Beutentyp ? ` <span class="text-xs font-normal text-gray-400">${esc(v.Beutentyp)}</span>` : ''}</span>
        <span class="block text-xs text-gray-500">${infos.join(' · ') || 'noch keine Einträge'}</span>
      </span>
      ${aufgaben.length ? `<span class="text-xs px-2 py-1 rounded-full ${ueberfaellig ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}">${aufgaben.length} ✅</span>` : ''}
      <span class="text-gray-300 text-xl">›</span>
    </button>`;
}

function renderImkereiSection() {
  const kodex = state.betrieb && state.betrieb.BetriebskodexImkerei;
  document.getElementById('imkerBetriebskodex').innerHTML = kodex
    ? `Betriebskodex Imkerei: <b>${esc(kodex)}</b>`
    : `<button type="button" id="btnImkerKodexFehlt" class="text-amber-700 underline">Betriebskodex Imkerei eintragen</button>`;
  const kodexLink = document.getElementById('btnImkerKodexFehlt');
  if (kodexLink) kodexLink.onclick = () => showSection('einstellungen');

  const container = document.getElementById('bienenstaendeListe');
  const staende = aktiveStaende().sort((a, b) => String(a.Name).localeCompare(String(b.Name), 'de'));
  const voelker = aktiveVoelker();
  const offen = offeneAufgaben();

  const gruppen = staende.map(s => ({ stand: s, voelker: voelker.filter(v => v.BienenstandID === s.ID).sort(nachNummer) }));
  const ohneStand = voelker.filter(v => !v.BienenstandID || !staende.some(s => s.ID === v.BienenstandID)).sort(nachNummer);
  if (ohneStand.length) gruppen.push({ stand: null, voelker: ohneStand });

  if (!gruppen.length) {
    container.innerHTML = `<div class="bg-white rounded-xl shadow p-6 text-center space-y-2 lg:col-span-2">
      <div class="text-4xl">🐝</div>
      <p class="text-gray-600">Noch kein Bienenstand angelegt.</p>
      <p class="text-sm text-gray-400">Lege zuerst einen Bienenstand an, danach die Völker darauf.</p>
    </div>`;
  } else {
    container.innerHTML = gruppen.map(({ stand, voelker: vs }) => {
      const standAufgaben = stand ? offen.filter(a => a.BienenstandID === stand.ID && !a.VolkID) : [];
      return `<div class="bg-white rounded-xl shadow p-4 space-y-2">
        <div class="space-y-2">
          <div class="min-w-0">
            <div class="font-semibold text-lg">📍 ${esc(stand ? stand.Name : 'Ohne Bienenstand')}</div>
            <div class="text-xs text-gray-500">${stand && stand.Standort ? esc(stand.Standort) + ' · ' : ''}${vs.length} ${vs.length === 1 ? 'Volk' : 'Völker'}</div>
          </div>
          ${stand ? `<div class="flex gap-1 flex-wrap">
            <button data-stand="${stand.ID}" class="btn-stand-volk text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1.5 rounded">+ Volk</button>
            <button data-stand="${stand.ID}" class="btn-stand-aufgabe text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1.5 rounded">+ Aufgabe</button>
            <button data-stand="${stand.ID}" class="btn-stand-qr text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1.5 rounded">🏷️ QR-Etiketten</button>
            <button data-stand="${stand.ID}" class="btn-stand-edit text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1.5 rounded">Bearbeiten</button>
          </div>` : ''}
        </div>
        ${standAufgaben.length ? `<div class="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm space-y-1">
          ${standAufgaben.map(a => `<div class="${istUeberfaellig(a) ? 'text-red-700 font-semibold' : 'text-amber-900'}">✅ ${esc(a.Titel)}${a.FaelligAm ? ` · bis ${fmtDate(a.FaelligAm)}` : ''}</div>`).join('')}
        </div>` : ''}
        <div class="divide-y">${vs.map(volkZeileHtml).join('') || '<p class="text-sm text-gray-400 py-2">Keine aktiven Völker.</p>'}</div>
      </div>`;
    }).join('');
  }

  container.querySelectorAll('.btn-volk').forEach(b => b.onclick = () => openStockkarte(b.dataset.volk));
  container.querySelectorAll('.btn-stand-volk').forEach(b => b.onclick = () => openVolkModal({ BienenstandID: b.dataset.stand }));
  container.querySelectorAll('.btn-stand-aufgabe').forEach(b => b.onclick = () => openAufgabeModal({ BienenstandID: b.dataset.stand }));
  container.querySelectorAll('.btn-stand-edit').forEach(b => b.onclick = () => openBienenstandModal(standById(b.dataset.stand)));
  container.querySelectorAll('.btn-stand-qr').forEach(b => b.onclick = () => druckeQrEtiketten(
    aktiveVoelker().filter(v => v.BienenstandID === b.dataset.stand).sort(nachNummer), `QR-Etiketten: ${standName(b.dataset.stand)}`));

  // Register: ehemalige Völker (aufgelöst/verkauft/eingegangen ...)
  const ehemalige = imker.voelker.filter(v => istSichtbar(v) && v.Status !== 'Aktiv');
  const register = document.getElementById('voelkerRegister');
  document.getElementById('btnVoelkerRegisterToggle').textContent =
    `📖 Register (ehemalige Völker, ${ehemalige.length}) ${register.classList.contains('hidden') ? 'anzeigen' : 'ausblenden'}`;
  if (!register.classList.contains('hidden')) renderVoelkerRegister();

  // Aufgaben-Reiter + Zähler
  const ueberfaellig = offen.filter(istUeberfaellig).length;
  document.getElementById('imkerAufgabenBadge').innerHTML = offen.length
    ? `<span class="ml-1 text-xs px-1.5 py-0.5 rounded-full ${ueberfaellig ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}">${offen.length}</span>` : '';
  renderImkerAufgabenListe(document.getElementById('imkerAufgabenListe'), { mitErledigten: true });
  if (!document.getElementById('itab-auswertung').classList.contains('hidden')) renderImkerAuswertung();
  if (!document.getElementById('itab-material').classList.contains('hidden')) renderImkerMaterial();

}

function renderVoelkerRegister() {
  const register = document.getElementById('voelkerRegister');
  const ehemalige = imker.voelker.filter(v => istSichtbar(v) && v.Status !== 'Aktiv')
    .sort((a, b) => datumWert(b.Abgangsdatum) - datumWert(a.Abgangsdatum));
  renderTable(register, [
    { label: 'Volk', format: r => esc(volkLabel(r)) },
    { key: 'Status', label: 'Status' },
    { label: 'Abgang', format: r => fmtDate(r.Abgangsdatum) },
    { label: 'Zuletzt am Stand', format: r => esc(standName(r.BienenstandID)) }
  ], ehemalige, { onRowClick: (row) => openStockkarte(row.ID) });
  document.getElementById('btnVoelkerRegisterToggle').textContent =
    `📖 Register (ehemalige Völker, ${ehemalige.length}) ${register.classList.contains('hidden') ? 'anzeigen' : 'ausblenden'}`;
}

// ============================================================================
// FORMULARE: Bienenstand, Volk
// ============================================================================
function openBienenstandModal(initial = {}) {
  const hatAktiveVoelker = initial.ID && aktiveVoelker().some(v => v.BienenstandID === initial.ID);
  openFormModal({
    title: initial.ID ? 'Bienenstand bearbeiten' : 'Neuer Bienenstand',
    fields: [
      { key: 'Name', label: 'Name', required: true },
      { key: 'Standort', label: 'Ortsbeschreibung', help: 'z. B. „oberhalb vom Stadel“' },
      { key: 'Lat', label: 'Breitengrad', type: 'number', step: 'any' },
      { key: 'Lng', label: 'Längengrad', type: 'number', step: 'any' },
      { key: 'Foto', label: initial.FotoURL ? 'Foto ersetzen' : 'Foto', type: 'file', accept: 'image/*' },
      { key: 'Notiz', label: 'Notiz', type: 'textarea' }
    ],
    initial,
    onSubmit: async (values) => {
      const fotoUrl = await fotoHochladen(values.Foto);
      const payload = { ...values };
      delete payload.Foto;
      if (fotoUrl) payload.FotoURL = fotoUrl;
      await imkerSpeichern('bienenstaende', payload, initial.ID);
      toast(initial.ID ? 'Bienenstand aktualisiert.' : 'Bienenstand angelegt.');
      imkerNeuZeichnen();
    },
    onDelete: initial.ID && state.user.role === 'Admin' ? async () => {
      if (hatAktiveVoelker) throw new Error('Auf diesem Stand stehen noch aktive Völker - zuerst umstellen.');
      await imkerLoeschen('bienenstaende', initial.ID);
      toast('Bienenstand entfernt.');
      imkerNeuZeichnen();
    } : null
  });

  koordinatenHelferEinbauen();
}

// Gezeichneter Punkt statt Stecknadel-Bild (braucht keine Bilddatei vom CDN)
function standPunkt(ll) {
  return L.circleMarker(ll, { radius: 10, color: '#92400e', weight: 3, fillColor: '#f59e0b', fillOpacity: 1 });
}

// Unter den Koordinaten-Feldern: GPS übernehmen ODER auf der Karte antippen.
function koordinatenHelferEinbauen() {
  const latFeld = document.getElementById('field_Lat');
  const lngFeld = document.getElementById('field_Lng');
  if (!latFeld || !lngFeld) return;

  const box = document.createElement('div');
  box.className = 'space-y-2';
  box.innerHTML = `
    <div class="grid grid-cols-2 gap-2">
      <button type="button" class="kh-gps bg-sky-600 text-white px-3 py-3 rounded text-sm">🛰️ Mein Standort</button>
      <button type="button" class="kh-karte bg-gray-700 text-white px-3 py-3 rounded text-sm">🗺️ Auf Karte wählen</button>
    </div>
    <p class="kh-status text-xs text-gray-500"></p>
    <div class="kh-map hidden rounded-lg border" style="height:260px"></div>`;
  lngFeld.parentElement.appendChild(box);
  const status = box.querySelector('.kh-status');
  let karte = null, marker = null;

  const setze = (lat, lng, text) => {
    latFeld.value = Number(lat).toFixed(6);
    lngFeld.value = Number(lng).toFixed(6);
    status.textContent = text;
    if (karte) {
      const ll = [Number(lat), Number(lng)];
      if (marker) marker.setLatLng(ll); else marker = standPunkt(ll).addTo(karte);
    }
  };

  // GPS: erst genau (GPS), bei Zeitüberschreitung/kein Signal nochmal ungenau (WLAN/Mobilfunk)
  box.querySelector('.kh-gps').onclick = () => {
    if (!navigator.geolocation) { status.textContent = 'Dieses Gerät/dieser Browser kann den Standort nicht ermitteln – bitte „Auf Karte wählen“ verwenden.'; return; }
    if (!window.isSecureContext) { status.textContent = 'Standort geht nur über https:// – bitte die App über die GitHub-Adresse öffnen.'; return; }
    const ok = (pos) => setze(pos.coords.latitude, pos.coords.longitude, `✓ Standort übernommen (Genauigkeit ca. ${Math.round(pos.coords.accuracy)} m)`);
    const fehlerText = (err) => {
      if (err.code === 1) return 'Standortzugriff ist für diese Seite gesperrt. iPhone/iPad: Einstellungen → Datenschutz → Ortungsdienste → Safari-Websites → „Beim Verwenden der App“. Danach Seite neu laden. Alternativ „Auf Karte wählen“.';
      if (err.code === 3) return 'Kein Standort innerhalb der Wartezeit – im Freien nochmal versuchen oder „Auf Karte wählen“.';
      return 'Standort derzeit nicht verfügbar (Ortungsdienste am Gerät eingeschaltet?) – oder „Auf Karte wählen“.';
    };
    status.textContent = 'Standort wird ermittelt …';
    navigator.geolocation.getCurrentPosition(ok, (err) => {
      if (err.code === 1) { status.textContent = fehlerText(err); return; }
      status.textContent = 'Genaue Ortung klappt nicht, versuche ungenaue Ortung …';
      navigator.geolocation.getCurrentPosition(ok, (err2) => { status.textContent = fehlerText(err2); },
        { enableHighAccuracy: false, timeout: 20000, maximumAge: 10 * 60 * 1000 });
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60 * 1000 });
  };

  box.querySelector('.kh-karte').onclick = () => {
    const kartenDiv = box.querySelector('.kh-map');
    kartenDiv.classList.toggle('hidden');
    if (kartenDiv.classList.contains('hidden')) return;
    if (!karte) {
      const hatWert = latFeld.value !== '' && lngFeld.value !== '';
      const mitte = hatWert ? [Number(latFeld.value), Number(lngFeld.value)] : CONFIG.MAP_CENTER;
      karte = L.map(kartenDiv).setView(mitte, hatWert ? 17 : CONFIG.MAP_ZOOM);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(karte);
      if (hatWert) marker = standPunkt(mitte).addTo(karte);
      karte.on('click', (e) => setze(e.latlng.lat, e.latlng.lng, '✓ Punkt auf der Karte übernommen'));
    }
    status.textContent = 'Auf die Karte tippen, wo der Bienenstand steht.';
    setTimeout(() => { karte.invalidateSize(); kartenDiv.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 50);
  };
}

function naechsteVolkNummer() {
  const nummern = imker.voelker.map(v => parseInt(v.Nummer, 10)).filter(n => !isNaN(n));
  return nummern.length ? Math.max(...nummern) + 1 : 1;
}

function standOptionen() {
  return aktiveStaende().map(s => ({ value: s.ID, label: s.Name }));
}

function openVolkModal(initial = {}) {
  const neu = !initial.ID;
  const standOpts = standOptionen();
  if (!standOpts.length) { toast('Bitte zuerst einen Bienenstand anlegen.', true); return; }
  const muttervolkOpts = [{ value: '', label: '–' }].concat(
    imker.voelker.filter(v => istSichtbar(v) && v.ID !== initial.ID).sort(nachNummer)
      .map(v => ({ value: v.ID, label: `${volkLabel(v)} (${standName(v.BienenstandID)})` })));
  const start = neu
    ? { Status: 'Aktiv', Nummer: String(naechsteVolkNummer()), Eingangsdatum: heuteIso(), ...initial }
    : initial;

  openFormModal({
    title: neu ? 'Neues Volk' : `${volkLabel(initial)} bearbeiten`,
    fields: [
      { key: 'BienenstandID', label: 'Bienenstand', type: 'select', options: standOpts, required: true,
        help: neu ? '' : 'Für einen Umzug mit Datum besser „Ereignis → Standortwechsel“ in der Stockkarte verwenden.' },
      { key: 'Nummer', label: 'Nummer', required: true },
      { key: 'Name', label: 'Name (optional)' },
      { key: 'Beutentyp', label: 'Beutentyp', suggestions: BEUTENTYPEN },
      { key: 'Status', label: 'Status', type: 'select', options: VOLK_STATUS },
      { key: 'Herkunft', label: 'Herkunft', type: 'select', options: [''].concat(VOLK_HERKUNFT) },
      { key: 'MuttervolkID', label: 'Muttervolk (bei Ableger/Schwarm)', type: 'select', options: muttervolkOpts },
      { key: 'Eingangsdatum', label: 'Zugang am', type: 'date' },
      { key: 'Abgangsdatum', label: 'Abgang am', type: 'date', help: 'Wird beim Statuswechsel automatisch auf heute gesetzt, falls leer.' },
      { key: 'Foto', label: initial.FotoURL ? 'Foto ersetzen' : 'Foto', type: 'file', accept: 'image/*' },
      { key: 'Notiz', label: 'Notiz', type: 'textarea' }
    ],
    initial: start,
    onSubmit: async (values) => {
      const fotoUrl = await fotoHochladen(values.Foto);
      const payload = { ...values };
      delete payload.Foto;
      if (fotoUrl) payload.FotoURL = fotoUrl;
      if (payload.Status !== 'Aktiv' && !payload.Abgangsdatum) payload.Abgangsdatum = heuteIso();
      const saved = await imkerSpeichern('voelker', payload, initial.ID);
      toast(neu ? `${volkLabel(saved)} angelegt.` : 'Volk aktualisiert.');
      imkerNeuZeichnen();
    },
    onDelete: !neu && state.user.role === 'Admin' ? async () => {
      await imkerLoeschen('voelker', initial.ID);
      toast('Volk ausgeblendet.');
      if (detailModal.open) detailModal.close();
      imkerNeuZeichnen();
    } : null
  });
}

// ============================================================================
// VÖLKER-AUSWAHL (Mehrfachauswahl mit großen Feldern, gruppiert nach Stand)
// ============================================================================
function volkAuswahlHtml(vorausgewaehlt = []) {
  const voelker = aktiveVoelker();
  if (!voelker.length) return '<p class="text-sm text-gray-400">Noch keine aktiven Völker angelegt.</p>';
  const staende = aktiveStaende().sort((a, b) => String(a.Name).localeCompare(String(b.Name), 'de'));
  const gruppen = staende.map(s => ({ id: s.ID, name: s.Name, voelker: voelker.filter(v => v.BienenstandID === s.ID).sort(nachNummer) }))
    .filter(g => g.voelker.length);
  const rest = voelker.filter(v => !staende.some(s => s.ID === v.BienenstandID)).sort(nachNummer);
  if (rest.length) gruppen.push({ id: 'ohne', name: 'Ohne Bienenstand', voelker: rest });

  return `<div class="volk-auswahl space-y-3">${gruppen.map(g => `
    <div>
      <div class="flex items-center justify-between mb-1">
        <span class="text-sm font-semibold text-gray-600">📍 ${esc(g.name)}</span>
        <button type="button" class="va-alle text-sm text-amber-700 px-2 py-1" data-gruppe="${g.id}">alle</button>
      </div>
      <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
        ${g.voelker.map(v => {
          const an = vorausgewaehlt.indexOf(v.ID) !== -1;
          return `<button type="button" class="va-volk min-h-[56px] rounded-lg border-2 text-sm font-semibold px-1 ${an ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-gray-200 text-gray-700'}"
            data-id="${v.ID}" data-gruppe="${g.id}" aria-pressed="${an}">${esc(v.Nummer || '?')}${v.Name ? `<span class="block text-[11px] font-normal truncate">${esc(v.Name)}</span>` : ''}</button>`;
        }).join('')}
      </div>
    </div>`).join('')}
    <p class="va-anzahl text-xs text-gray-500"></p>
  </div>`;
}

function setzeVolkKnopf(btn, an) {
  btn.setAttribute('aria-pressed', an ? 'true' : 'false');
  btn.classList.toggle('bg-amber-500', an);
  btn.classList.toggle('border-amber-500', an);
  btn.classList.toggle('text-white', an);
  btn.classList.toggle('bg-white', !an);
  btn.classList.toggle('border-gray-200', !an);
  btn.classList.toggle('text-gray-700', !an);
}

function aktiviereVolkAuswahl(root, onChange) {
  const box = root.querySelector('.volk-auswahl');
  if (!box) return;
  const zaehle = () => {
    const n = gewaehlteVoelker(root).length;
    box.querySelector('.va-anzahl').textContent = n ? `${n} ${n === 1 ? 'Volk' : 'Völker'} ausgewählt` : 'Kein Volk ausgewählt';
    if (onChange) onChange(gewaehlteVoelker(root));
  };
  box.querySelectorAll('.va-volk').forEach(b => b.onclick = () => { setzeVolkKnopf(b, b.getAttribute('aria-pressed') !== 'true'); zaehle(); });
  box.querySelectorAll('.va-alle').forEach(b => b.onclick = () => {
    const knoepfe = [...box.querySelectorAll(`.va-volk[data-gruppe="${b.dataset.gruppe}"]`)];
    const alleAn = knoepfe.every(k => k.getAttribute('aria-pressed') === 'true');
    knoepfe.forEach(k => setzeVolkKnopf(k, !alleAn));
    zaehle();
  });
  zaehle();
}

function gewaehlteVoelker(root) {
  return [...root.querySelectorAll('.va-volk[aria-pressed="true"]')].map(b => b.dataset.id);
}

// ============================================================================
// FORMULARE: Behandlung, Fütterung, Varroa, Honigernte, Königin, Aufgabe
// ============================================================================
function eindeutigeWerte(liste, feld) {
  return [...new Set(liste.map(r => r[feld]).filter(Boolean))];
}

function openBehandlungModal({ volkIds = [], initial = null }) {
  const bearbeiten = !!(initial && initial.ID);
  const fields = [];
  if (!bearbeiten) fields.push({ key: '_voelker', label: 'Völker', type: 'html', html: volkAuswahlHtml(volkIds) });
  fields.push(
    { key: 'Datum', label: 'Datum (Beginn)', type: 'date', required: true },
    { key: 'DatumBis', label: 'Ende (bei Langzeitbehandlung)', type: 'date' },
    { key: 'Mittel', label: 'Mittel', required: true, suggestions: eindeutigeWerte(imker.behandlungen, 'Mittel'),
      help: bearbeiten ? '' : 'Ein schon verwendetes Mittel füllt die übrigen Angaben vom letzten Mal vor.' },
    { key: 'Wirkstoff', label: 'Wirkstoff', suggestions: eindeutigeWerte(imker.behandlungen, 'Wirkstoff') },
    { key: 'Chargennummer', label: 'Chargennummer' },
    { key: 'Menge', label: 'Menge je Volk', type: 'number', step: 'any' },
    { key: 'Einheit', label: 'Einheit', suggestions: BEHANDLUNG_EINHEITEN },
    { key: 'Methode', label: 'Methode', suggestions: [...new Set(BEHANDLUNG_METHODEN.concat(eindeutigeWerte(imker.behandlungen, 'Methode')))] },
    { key: 'WartezeitTage', label: 'Wartezeit (Tage)', type: 'number' },
    { key: 'Bezugsquelle', label: 'Lieferant (Name und Anschrift)', suggestions: eindeutigeWerte(imker.behandlungen, 'Bezugsquelle') },
    { key: 'Kaufdatum', label: 'Kaufdatum des Mittels', type: 'date' },
    { key: 'Belegnummer', label: 'Beleg-Nr.', suggestions: eindeutigeWerte(imker.behandlungen, 'Belegnummer') },
    { key: 'Tierarzt', label: 'Verschreibung durch (Tierarzt)', suggestions: eindeutigeWerte(imker.behandlungen, 'Tierarzt') },
    { key: 'BehandelndePerson', label: 'Behandelnde Person', suggestions: eindeutigeWerte(imker.behandlungen, 'BehandelndePerson') },
    { key: 'Notiz', label: 'Notiz', type: 'textarea' }
  );

  openFormModal({
    title: bearbeiten ? `Behandlung bearbeiten (${volkLabel(volkById(initial.VolkID))})` : 'Behandlung erfassen',
    fields,
    initial: bearbeiten ? initial : { Datum: heuteIso() },
    onSubmit: async (values) => {
      delete values._voelker;
      if (bearbeiten) {
        await imkerSpeichern('behandlungen', values, initial.ID);
        toast('Behandlung aktualisiert.');
      } else {
        const ids = gewaehlteVoelker(formModalBody);
        if (!ids.length) throw new Error('Bitte mindestens ein Volk auswählen.');
        const sammelId = ids.length > 1 ? crypto.randomUUID() : '';
        await Promise.all(ids.map(id => imkerSpeichern('behandlungen', { ...values, VolkID: id, SammelID: sammelId })));
        toast(`Behandlung für ${ids.length} ${ids.length === 1 ? 'Volk' : 'Völker'} erfasst.`);
      }
      imkerNeuZeichnen();
    },
    onDelete: bearbeiten && state.user.role === 'Admin' ? async () => {
      await imkerLoeschen('behandlungen', initial.ID);
      toast('Gelöscht.');
      imkerNeuZeichnen();
    } : null
  });
  aktiviereVolkAuswahl(formModalBody);

  // Vorbelegung: beim Wählen eines bekannten Mittels die Angaben der letzten Behandlung übernehmen
  if (!bearbeiten) {
    const mittelFeld = document.getElementById('field_Mittel');
    mittelFeld.addEventListener('change', () => {
      const vorlage = imker.behandlungen.filter(b => b.Mittel === mittelFeld.value)
        .sort((a, b) => datumWert(b.Datum) - datumWert(a.Datum))[0];
      if (!vorlage) return;
      ['Wirkstoff', 'Chargennummer', 'Menge', 'Einheit', 'Methode', 'WartezeitTage', 'Bezugsquelle', 'Kaufdatum', 'Belegnummer', 'Tierarzt', 'BehandelndePerson'].forEach(f => {
        const el = document.getElementById('field_' + f);
        if (el && !el.value && vorlage[f] !== '') el.value = vorlage[f];
      });
    });
  }
}

function openFuetterungModal({ volkIds = [], initial = null }) {
  const bearbeiten = !!(initial && initial.ID);
  const fields = [];
  if (!bearbeiten) fields.push({ key: '_voelker', label: 'Völker', type: 'html', html: volkAuswahlHtml(volkIds) });
  fields.push(
    { key: 'Datum', label: 'Datum', type: 'date', required: true },
    { key: 'Futterart', label: 'Futterart', required: true, suggestions: [...new Set(FUTTER_VORSCHLAEGE.concat(eindeutigeWerte(imker.fuetterungen, 'Futterart')))] },
    { key: 'Menge', label: 'Menge je Volk', type: 'number', step: 'any', required: true },
    { key: 'Einheit', label: 'Einheit', type: 'select', options: ['kg', 'Liter'] },
    { key: 'Notiz', label: 'Notiz', type: 'textarea' }
  );
  const letzte = imker.fuetterungen.slice().sort((a, b) => datumWert(b.Datum) - datumWert(a.Datum))[0];
  openFormModal({
    title: bearbeiten ? `Fütterung bearbeiten (${volkLabel(volkById(initial.VolkID))})` : 'Fütterung erfassen',
    fields,
    initial: bearbeiten ? initial : { Datum: heuteIso(), Futterart: letzte ? letzte.Futterart : '', Menge: letzte ? letzte.Menge : '', Einheit: letzte ? letzte.Einheit : 'kg' },
    onSubmit: async (values) => {
      delete values._voelker;
      if (bearbeiten) {
        await imkerSpeichern('fuetterungen', values, initial.ID);
        toast('Fütterung aktualisiert.');
      } else {
        const ids = gewaehlteVoelker(formModalBody);
        if (!ids.length) throw new Error('Bitte mindestens ein Volk auswählen.');
        const sammelId = ids.length > 1 ? crypto.randomUUID() : '';
        await Promise.all(ids.map(id => imkerSpeichern('fuetterungen', { ...values, VolkID: id, SammelID: sammelId })));
        toast(`Fütterung für ${ids.length} ${ids.length === 1 ? 'Volk' : 'Völker'} erfasst.`);
      }
      imkerNeuZeichnen();
    },
    onDelete: bearbeiten && state.user.role === 'Admin' ? async () => {
      await imkerLoeschen('fuetterungen', initial.ID);
      toast('Gelöscht.');
      imkerNeuZeichnen();
    } : null
  });
  aktiviereVolkAuswahl(formModalBody);
}

function openVarroaModal(volk, initial = null) {
  const bearbeiten = !!(initial && initial.ID);
  const vorher = letzteVarroa(volk.ID);
  openFormModal({
    title: `Varroa-Kontrolle: ${volkLabel(volk)}`,
    fields: [
      { key: 'Datum', label: 'Datum', type: 'date', required: true },
      { key: 'Methode', label: 'Methode', type: 'select', options: VARROA_METHODEN },
      { key: 'MilbenAnzahl', label: 'Gezählte Milben', type: 'number', step: 'any', required: true },
      { key: 'ZeitraumTage', label: 'Tage unter der Windel', type: 'number', step: 'any',
        help: 'Nur bei Gemüllwindel: daraus wird der Milbenfall pro Tag berechnet. Hast du schon „Milben pro Tag“ gezählt, hier 1 eintragen.' },
      { key: 'Notiz', label: 'Notiz', type: 'textarea' }
    ],
    initial: bearbeiten ? initial : { Datum: heuteIso(), Methode: vorher ? vorher.Methode : 'Gemüllwindel', ZeitraumTage: vorher ? vorher.ZeitraumTage : '' },
    onSubmit: async (values) => {
      if (values.Methode !== 'Gemüllwindel') values.ZeitraumTage = '';
      await imkerSpeichern('varroakontrollen', { ...values, VolkID: volk.ID }, bearbeiten ? initial.ID : null);
      toast(bearbeiten ? 'Aktualisiert.' : 'Varroa-Kontrolle erfasst.');
      imkerNeuZeichnen();
    },
    onDelete: bearbeiten && state.user.role === 'Admin' ? async () => {
      await imkerLoeschen('varroakontrollen', initial.ID);
      toast('Gelöscht.');
      imkerNeuZeichnen();
    } : null
  });
}

function openHonigernteModal({ volkIds = [], initial = null }) {
  const bearbeiten = !!(initial && initial.ID);
  const fields = [];
  if (!bearbeiten) fields.push({ key: '_voelker', label: 'Beteiligte Völker', type: 'html', html: volkAuswahlHtml(volkIds) });
  fields.push(
    { key: 'Datum', label: 'Datum', type: 'date', required: true },
    { key: 'Sorte', label: 'Sorte', suggestions: [...new Set(HONIGSORTEN.concat(eindeutigeWerte(imker.honigernten, 'Sorte')))] },
    { key: 'MengeKg', label: 'Menge gesamt (kg)', type: 'number', step: 'any', required: true },
    { key: 'Wassergehalt', label: 'Wassergehalt (%)', type: 'number', step: 'any' },
    { key: 'Losnummer', label: 'Losnummer / Abfüllung' },
    { key: 'Notiz', label: 'Notiz', type: 'textarea' }
  );
  openFormModal({
    title: bearbeiten ? 'Honigernte bearbeiten' : 'Honigernte erfassen',
    fields,
    initial: bearbeiten ? initial : { Datum: heuteIso() },
    onSubmit: async (values) => {
      delete values._voelker;
      if (bearbeiten) {
        await imkerSpeichern('honigernten', values, initial.ID);
        toast('Honigernte aktualisiert.');
      } else {
        const ids = gewaehlteVoelker(formModalBody);
        if (!ids.length) throw new Error('Bitte mindestens ein Volk auswählen.');
        const ernte = await imkerSpeichern('honigernten', values);
        // Menge je Volk nur eintragen, wenn sie eindeutig ist (ein einziges Volk)
        await Promise.all(ids.map(id => imkerSpeichern('honigerntevoelker', {
          HonigernteID: ernte.ID, VolkID: id, MengeKg: ids.length === 1 ? values.MengeKg : ''
        })));
        toast(`Honigernte (${zahl(values.MengeKg)} kg) erfasst.`);
      }
      imkerNeuZeichnen();
    },
    onDelete: bearbeiten && state.user.role === 'Admin' ? async () => {
      await imkerLoeschen('honigernten', initial.ID);
      // Verknüpfungen löscht die Datenbank mit (on delete cascade) - lokal nachziehen
      imker.honigerntevoelker.filter(hv => hv.HonigernteID === initial.ID).forEach(hv => cacheRemove('honigerntevoelker.list', hv.ID));
      toast('Gelöscht.');
      imkerNeuZeichnen();
    } : null
  });
  aktiviereVolkAuswahl(formModalBody);
}

function openKoeniginModal(volk, initial = null) {
  const bearbeiten = !!(initial && initial.ID);
  const jahr = new Date().getFullYear();
  openFormModal({
    title: bearbeiten ? `Königin bearbeiten (${volkLabel(volk)})` : `Neue Königin: ${volkLabel(volk)}`,
    fields: [
      { key: 'Jahrgang', label: 'Jahrgang', type: 'number', required: true },
      { key: 'Farbe', label: 'Zeichenfarbe', type: 'select', options: ['', 'Weiß', 'Gelb', 'Rot', 'Grün', 'Blau'],
        help: 'Wird nach dem Jahrgang vorgeschlagen (internationaler Farbcode).' },
      { key: 'Zeichnung', label: 'Zeichnung / Plättchen-Nr.', help: 'z. B. „Plättchen 12“, „geclippt“' },
      { key: 'Herkunft', label: 'Herkunft', help: 'z. B. eigene Nachzucht, Züchter, stille Umweiselung' },
      { key: 'EingesetztAm', label: 'Eingesetzt / geschlüpft am', type: 'date' },
      { key: 'Sanftmut', label: 'Sanftmut', type: 'select', options: BEWERTUNG_OPTIONEN },
      { key: 'Wabensitz', label: 'Wabensitz', type: 'select', options: BEWERTUNG_OPTIONEN },
      { key: 'Schwarmneigung', label: 'Schwarmneigung', type: 'select', options: BEWERTUNG_OPTIONEN },
      { key: 'Leistung', label: 'Leistung', type: 'select', options: BEWERTUNG_OPTIONEN, help: BEWERTUNG_HILFE },
      { key: 'Aktuell', label: 'Aktive Königin dieses Volkes', type: 'checkbox' },
      { key: 'Notiz', label: 'Notiz', type: 'textarea' }
    ],
    initial: bearbeiten ? initial : { Jahrgang: jahr, Farbe: KOENIGIN_FARBEN[jahr % 10], EingesetztAm: heuteIso(), Aktuell: true },
    onSubmit: async (values) => {
      const saved = await imkerSpeichern('koeniginnen', { ...values, VolkID: volk.ID }, bearbeiten ? initial.ID : null);
      // Es gibt nur eine aktive Königin je Volk - die bisherige wird abgelöst
      if (values.Aktuell) {
        const alte = imker.koeniginnen.filter(k => k.VolkID === volk.ID && k.ID !== saved.ID && k.Aktuell === true);
        await Promise.all(alte.map(k => imkerSpeichern('koeniginnen', { Aktuell: false }, k.ID)));
      }
      toast(bearbeiten ? 'Königin aktualisiert.' : 'Königin erfasst.');
      imkerNeuZeichnen();
    },
    onDelete: bearbeiten && state.user.role === 'Admin' ? async () => {
      await imkerLoeschen('koeniginnen', initial.ID);
      toast('Gelöscht.');
      imkerNeuZeichnen();
    } : null
  });
  const jahrgangFeld = document.getElementById('field_Jahrgang');
  const farbeFeld = document.getElementById('field_Farbe');
  jahrgangFeld.addEventListener('input', () => {
    const j = parseInt(jahrgangFeld.value, 10);
    if (!isNaN(j)) farbeFeld.value = KOENIGIN_FARBEN[j % 10];
  });
}

function aufgabeBezugOptionen() {
  const opts = [{ value: '', label: 'allgemein (Imkerei)' }];
  aktiveStaende().forEach(s => {
    opts.push({ value: 'S:' + s.ID, label: `📍 ${s.Name} (ganzer Stand)` });
    aktiveVoelker().filter(v => v.BienenstandID === s.ID).sort(nachNummer)
      .forEach(v => opts.push({ value: 'V:' + v.ID, label: `   🐝 ${volkLabel(v)}` }));
  });
  return opts;
}

function openAufgabeModal(initial = {}) {
  const bearbeiten = !!initial.ID;
  const bezug = initial.VolkID ? 'V:' + initial.VolkID : initial.BienenstandID ? 'S:' + initial.BienenstandID : '';
  openFormModal({
    title: bearbeiten ? 'Aufgabe bearbeiten' : 'Neue Aufgabe',
    fields: [
      { key: 'Titel', label: 'Was ist zu tun?', required: true, suggestions: ['Varroa-Kontrolle', 'Behandlung', 'Füttern', 'Honigraum aufsetzen', 'Schwarmkontrolle', 'Ableger bilden', 'Einwintern'] },
      { key: 'FaelligAm', label: 'Fällig am', type: 'date' },
      { key: '_Bezug', label: 'Für', type: 'select', options: aufgabeBezugOptionen() },
      { key: 'Erledigt', label: 'Erledigt', type: 'checkbox' },
      { key: 'Notiz', label: 'Notiz', type: 'textarea' }
    ],
    initial: { ...initial, _Bezug: bezug },
    onSubmit: async (values) => {
      const b = values._Bezug || '';
      delete values._Bezug;
      values.VolkID = b.startsWith('V:') ? b.slice(2) : '';
      // Volk-Aufgaben merken sich auch den Stand (für die Anzeige am Stand)
      values.BienenstandID = b.startsWith('S:') ? b.slice(2) : (values.VolkID ? (volkById(values.VolkID) || {}).BienenstandID || '' : '');
      values.ErledigtAm = values.Erledigt ? (initial.ErledigtAm || heuteIso()) : '';
      await imkerSpeichern('bienenaufgaben', values, initial.ID);
      toast(bearbeiten ? 'Aufgabe aktualisiert.' : 'Aufgabe angelegt.');
      imkerNeuZeichnen();
    },
    onDelete: bearbeiten && state.user.role === 'Admin' ? async () => {
      await imkerLoeschen('bienenaufgaben', initial.ID);
      toast('Gelöscht.');
      imkerNeuZeichnen();
    } : null
  });
}

// ============================================================================
// AUFGABEN-LISTE (Imkerei-Reiter, Stockkarte, Dashboard)
// ============================================================================
async function renderImkerAufgabenListe(container, opts = {}) {
  if (!imker.voelker.length && !imker.aufgaben.length) await ladeImkerDaten();
  const { volkId = null, nurOffene = false, mitErledigten = false } = opts;
  let offen = offeneAufgaben();
  if (volkId) offen = offen.filter(a => a.VolkID === volkId);
  const erledigt = imker.aufgaben.filter(a => a.Erledigt === true && (!volkId || a.VolkID === volkId))
    .sort((a, b) => datumWert(b.ErledigtAm) - datumWert(a.ErledigtAm));

  const bezugText = (a) => a.VolkID
    ? `🐝 ${volkLabel(volkById(a.VolkID))} · ${standName((volkById(a.VolkID) || {}).BienenstandID)}`
    : a.BienenstandID ? `📍 ${standName(a.BienenstandID)}` : 'allgemein';

  const zeile = (a) => `<div class="flex items-center gap-3 py-2">
      <button type="button" data-id="${a.ID}" class="btn-aufgabe-erledigt w-12 h-12 shrink-0 rounded-xl border-2 text-xl ${a.Erledigt ? 'bg-green-600 border-green-600 text-white' : 'border-gray-300 text-transparent hover:border-green-600'}" aria-label="erledigt">✓</button>
      <button type="button" data-id="${a.ID}" class="btn-aufgabe-edit flex-1 min-w-0 text-left">
        <span class="block font-medium ${a.Erledigt ? 'line-through text-gray-400' : istUeberfaellig(a) ? 'text-red-700' : ''}">${esc(a.Titel)}</span>
        <span class="block text-xs text-gray-500">${[a.FaelligAm ? (istUeberfaellig(a) ? '⚠️ überfällig seit ' : 'fällig ') + fmtDate(a.FaelligAm) : '', volkId ? '' : esc(bezugText(a))].filter(Boolean).join(' · ')}</span>
      </button>
    </div>`;

  container.innerHTML = `
    ${volkId ? '' : `<button type="button" class="btn-aufgabe-neu bg-green-700 text-white px-3 py-2 rounded text-sm mb-2">+ Aufgabe</button>`}
    <div class="divide-y">${offen.map(zeile).join('') || `<p class="text-sm text-gray-400 py-2">${volkId ? 'Keine offenen Aufgaben.' : 'Keine offenen Aufgaben. 🎉'}</p>`}</div>
    ${mitErledigten && !nurOffene && erledigt.length ? `
      <details class="mt-3"><summary class="text-sm text-gray-500 cursor-pointer">Erledigt (${erledigt.length})</summary>
        <div class="divide-y">${erledigt.slice(0, 50).map(zeile).join('')}</div>
      </details>` : ''}`;

  const neu = container.querySelector('.btn-aufgabe-neu');
  if (neu) neu.onclick = () => openAufgabeModal({});
  container.querySelectorAll('.btn-aufgabe-edit').forEach(b => b.onclick = () => openAufgabeModal(imker.aufgaben.find(a => a.ID === b.dataset.id)));
  container.querySelectorAll('.btn-aufgabe-erledigt').forEach(b => b.onclick = async () => {
    const a = imker.aufgaben.find(x => x.ID === b.dataset.id);
    const erledigtNeu = a.Erledigt !== true;
    b.disabled = true;
    try {
      await imkerSpeichern('bienenaufgaben', { Erledigt: erledigtNeu, ErledigtAm: erledigtNeu ? heuteIso() : '' }, a.ID);
      toast(erledigtNeu ? 'Aufgabe erledigt.' : 'Aufgabe wieder offen.');
    } catch (e) {
      toast(e.message, true);
    }
    imkerNeuZeichnen();
    if (container.isConnected) renderImkerAufgabenListe(container, opts);
  });
}

// ---- Dashboard-Kachel (wird in loadDashboard eingefügt) ----
function imkereiDashTile() {
  imkerSync();
  const voelker = aktiveVoelker();
  const offen = offeneAufgaben();
  if (!voelker.length && !offen.length && !aktiveStaende().length && !einkaufsliste().length) return '';
  const ueberfaellig = offen.filter(istUeberfaellig);
  return dashTileHtml({
    id: 'bienen', icon: document.body.classList.contains('mit-tabbar') ? BIENE_SVG() : lucideIcon('hexagon'), title: 'Imkerei', value: `${voelker.length} ${voelker.length === 1 ? 'Volk' : 'Völker'}`,
    sub: (offen.length ? `${offen.length} ${offen.length === 1 ? 'Aufgabe' : 'Aufgaben'} offen${ueberfaellig.length ? ` · ${ueberfaellig.length} überfällig ⚠️` : ''}` : 'keine offenen Aufgaben')
      + (einkaufsliste().length ? ` · 🛒 ${einkaufsliste().length} zu kaufen` : ''),
    alert: ueberfaellig.length > 0, section: 'imkerei', expandable: true,
    preview: offen.slice(0, 8).map(a => `<div class="drow${istUeberfaellig(a) ? ' text-red-600 font-semibold' : ''}"><span>${esc(a.Titel)}</span><b>${a.FaelligAm ? fmtDate(a.FaelligAm) : ''}</b></div>`).join('')
      || '<p class="text-gray-400 text-xs py-2">Keine offenen Aufgaben.</p>'
  });
}

// ============================================================================
// STOCKKARTE (Steckbrief + Varroa-Diagramm + Zeitleiste)
// ============================================================================
async function openStockkarte(volkId) {
  await ladeImkerDaten();
  const volk = volkById(volkId);
  if (!volk) { toast('Volk nicht gefunden.', true); return; }
  openDetailModal(`Stockkarte: ${volkLabel(volk)}`, () => {});
  _stockkarteVolkId = volkId;
  renderStockkarte(volkId);
}

function steckbriefFeld(label, wert) {
  return `<div class="bg-gray-50 rounded-lg p-3 min-w-0"><span class="text-gray-400 text-xs">${label}</span><div class="font-semibold text-sm mt-0.5">${wert || '–'}</div></div>`;
}

function renderStockkarte(volkId) {
  const volk = volkById(volkId);
  const body = document.getElementById('detailModalBody');
  if (!volk || !body) return;
  document.getElementById('detailModalTitle').textContent = `Stockkarte: ${volkLabel(volk)}`;

  const k = aktuelleKoenigin(volk.ID);
  const letzte = letzteDurchsicht(volk.ID);
  const beh = letzteBehandlung(volk.ID);
  const varroa = letzteVarroa(volk.ID);
  const mutter = volk.MuttervolkID ? volkById(volk.MuttervolkID) : null;
  const ableger = imker.voelker.filter(v => v.MuttervolkID === volk.ID && istSichtbar(v));
  const aktiv = volk.Status === 'Aktiv';

  const koeniginText = k
    ? `${koeniginPunkt(k)} ${esc(k.Jahrgang || '')}${k.Zeichnung ? ' · ' + esc(k.Zeichnung) : ''}${[k.Sanftmut, k.Wabensitz, k.Schwarmneigung, k.Leistung].some(x => x !== '')
      ? `<div class="text-xs font-normal text-gray-500">Sanftmut ${k.Sanftmut || '–'} · Wabensitz ${k.Wabensitz || '–'} · Schwarm ${k.Schwarmneigung || '–'} · Leistung ${k.Leistung || '–'}</div>` : ''}`
    : '';
  const durchsichtText = letzte
    ? `${fmtDate(letzte.d.Datum)} <span class="font-normal text-gray-500">(${tageSeitText(letzte.d.Datum)})</span>
       <div class="text-xs font-normal text-gray-500">${durchsichtKurztext(letzte.dv)}</div>` : '';
  const herkunftText = [volk.Herkunft, mutter ? `aus <button type="button" class="btn-goto-volk text-amber-700 underline" data-volk="${mutter.ID}">${esc(volkLabel(mutter))}</button>` : '']
    .filter(Boolean).join(' ') + (volk.Eingangsdatum ? `<div class="text-xs font-normal text-gray-500">seit ${fmtDate(volk.Eingangsdatum)}</div>` : '');

  body.innerHTML = `
    ${volk.FotoURL ? `<img src="${esc(volk.FotoURL)}" alt="" class="w-full max-h-48 object-cover rounded-xl">` : ''}
    <div class="flex items-center gap-2 flex-wrap text-sm">
      <span class="px-2 py-1 rounded-full ${aktiv ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'}">${esc(volk.Status)}${!aktiv && volk.Abgangsdatum ? ' seit ' + fmtDate(volk.Abgangsdatum) : ''}</span>
      <span class="text-gray-500">📍 ${esc(standName(volk.BienenstandID))}</span>
      ${volk.Beutentyp ? `<span class="text-gray-500">· ${esc(volk.Beutentyp)}</span>` : ''}
      <span class="text-gray-400 text-xs ml-auto">QR ${esc(volk.QRCode)}</span>
    </div>

    <div class="grid grid-cols-2 gap-2">
      ${steckbriefFeld('👑 Königin', koeniginText)}
      ${steckbriefFeld('💪 Volksstärke', letzte && letzte.dv.Volksstaerke !== '' ? zahl(letzte.dv.Volksstaerke) + (letzte.dv.Brutwaben !== '' ? ` <span class="font-normal text-gray-500">· ${zahl(letzte.dv.Brutwaben)} Brutwaben</span>` : '') : '')}
      ${steckbriefFeld('🐝 Letzte Durchsicht', durchsichtText)}
      ${steckbriefFeld('💊 Letzte Behandlung', beh ? `${fmtDate(beh.Datum)} · ${esc(beh.Mittel)}` : '')}
      ${steckbriefFeld('🔬 Letzte Varroa-Kontrolle', varroa ? `${fmtDate(varroa.Datum)} · ${varroaText(varroa)}` : '')}
      ${steckbriefFeld('🌱 Herkunft', herkunftText + (ableger.length ? `<div class="text-xs font-normal text-gray-500">Ableger/Schwärme: ${ableger.map(a => `<button type="button" class="btn-goto-volk text-amber-700 underline" data-volk="${a.ID}">${esc(volkLabel(a))}</button>`).join(', ')}</div>` : ''))}
    </div>

    <div>
      <div class="font-semibold mb-1">✅ Offene Aufgaben</div>
      <div id="stockkarteAufgaben"></div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
      ${aktiv ? `<button type="button" id="skDurchsicht" class="col-span-2 sm:col-span-4 bg-amber-500 hover:bg-amber-600 text-white py-4 rounded-xl text-lg font-semibold">🐝 Durchsicht erfassen</button>` : ''}
      <button type="button" id="skBehandlung" class="bg-white border shadow-sm py-3 rounded-lg text-sm font-medium">💊 Behandlung</button>
      <button type="button" id="skFuetterung" class="bg-white border shadow-sm py-3 rounded-lg text-sm font-medium">🥣 Fütterung</button>
      <button type="button" id="skVarroa" class="bg-white border shadow-sm py-3 rounded-lg text-sm font-medium">🔬 Varroa</button>
      <button type="button" id="skHonig" class="bg-white border shadow-sm py-3 rounded-lg text-sm font-medium">🍯 Honigernte</button>
      <button type="button" id="skKoenigin" class="bg-white border shadow-sm py-3 rounded-lg text-sm font-medium">👑 Königin</button>
      <button type="button" id="skAufgabe" class="bg-white border shadow-sm py-3 rounded-lg text-sm font-medium">✅ Aufgabe</button>
      <button type="button" id="skEreignis" class="bg-white border shadow-sm py-3 rounded-lg text-sm font-medium">🔄 Ereignis</button>
      <button type="button" id="skBearbeiten" class="bg-white border shadow-sm py-3 rounded-lg text-sm font-medium">✏️ Volk bearbeiten</button>
    </div>
    <div id="skEreignisWahl" class="hidden grid grid-cols-2 gap-2 bg-gray-50 rounded-xl p-3">
      <div class="col-span-2 text-sm font-semibold text-gray-600">Welches Ereignis?</div>
      <button type="button" data-typ="Ableger gebildet" class="btn-ereignis bg-white border py-3 rounded-lg text-sm">🌱 Ableger gebildet</button>
      <button type="button" data-typ="Schwarm" class="btn-ereignis bg-white border py-3 rounded-lg text-sm">🐝 Schwarm</button>
      <button type="button" data-typ="Vereinigt" class="btn-ereignis bg-white border py-3 rounded-lg text-sm">🔗 Vereinigt</button>
      <button type="button" data-typ="Standortwechsel" class="btn-ereignis bg-white border py-3 rounded-lg text-sm">🚚 Standortwechsel</button>
      <button type="button" data-typ="Auflösung/Verlust" class="btn-ereignis col-span-2 bg-white border border-red-200 text-red-700 py-3 rounded-lg text-sm">✝️ Auflösung / Verlust</button>
    </div>

    ${qrBereichHtml(volk)}

    <div>
      <div class="font-semibold mb-1">🔬 Varroa – Milbenfall pro Tag</div>
      ${varroaDiagrammSvg(volk.ID)}
    </div>

    <div>
      <div class="font-semibold mb-2">🕓 Verlauf</div>
      <div id="stockkarteZeitleiste"></div>
    </div>`;

  renderImkerAufgabenListe(document.getElementById('stockkarteAufgaben'), { volkId: volk.ID, nurOffene: true });

  const klick = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
  klick('skDurchsicht', () => openDurchsichtErfassung([volk.ID]));
  klick('skBehandlung', () => openBehandlungModal({ volkIds: [volk.ID] }));
  klick('skFuetterung', () => openFuetterungModal({ volkIds: [volk.ID] }));
  klick('skVarroa', () => openVarroaModal(volk));
  klick('skHonig', () => openHonigernteModal({ volkIds: [volk.ID] }));
  klick('skKoenigin', () => openKoeniginModal(volk));
  klick('skAufgabe', () => openAufgabeModal({ VolkID: volk.ID, BienenstandID: volk.BienenstandID }));
  klick('skBearbeiten', () => openVolkModal(volk));
  klick('skEreignis', () => document.getElementById('skEreignisWahl').classList.toggle('hidden'));
  body.querySelectorAll('.btn-ereignis').forEach(b => b.onclick = () => openEreignisModal(volk, b.dataset.typ));
  body.querySelectorAll('.btn-goto-volk').forEach(b => b.onclick = () => { _stockkarteVolkId = b.dataset.volk; renderStockkarte(b.dataset.volk); body.scrollTop = 0; });

  qrBereichVerbinden(volk);
  renderZeitleiste(volk, document.getElementById('stockkarteZeitleiste'));
}

function durchsichtKurztext(dv) {
  const teile = [];
  if (dv.Brutwaben !== '') teile.push(`${zahl(dv.Brutwaben)} Brutwaben`);
  if (dv.KoeniginGesehen === true) teile.push('Königin gesehen');
  if (dv.KoeniginGesehen === false) teile.push('Königin nicht gesehen');
  if (dv.Stifte === true) teile.push('Stifte');
  if (dv.Stifte === false) teile.push('keine Stifte');
  if (dv.Weiselzellen !== '' && Number(dv.Weiselzellen) > 0) teile.push(`${zahl(dv.Weiselzellen, 0)} Weiselzellen`);
  if (dv.Futterwaben !== '') teile.push(`${zahl(dv.Futterwaben)} Futterwaben`);
  if (dv.Volksstaerke !== '') teile.push(`Stärke ${zahl(dv.Volksstaerke)}`);
  if (dv.Sanftmut !== '') teile.push(`Sanftmut ${dv.Sanftmut}`);
  return teile.join(' · ');
}

// Alle Einträge eines Volkes als eine Zeitleiste (neueste oben) - inkl. Ereignissen
// anderer Völker, die dieses Volk betreffen (z.B. "als Ableger aus Volk 2 entstanden").
function renderZeitleiste(volk, container) {
  const eintraege = [];
  const add = (datum, icon, titel, text, onEdit, zeit) => eintraege.push({ datum, icon, titel, text, onEdit, zeit: datumWert(zeit) });

  imker.durchsichtvoelker.filter(dv => dv.VolkID === volk.ID).forEach(dv => {
    const d = imker.durchsichten.find(x => x.ID === dv.DurchsichtID);
    if (!d) return;
    const extra = [d.Wetter, d.TemperaturC !== '' ? zahl(d.TemperaturC, 0) + ' °C' : ''].filter(Boolean).join(' ');
    add(d.Datum, '🐝', 'Durchsicht', [durchsichtKurztext(dv), extra, dv.Notiz, d.Notiz].filter(Boolean).map(esc).join('<br>'), () => openDurchsichtEintragModal(dv, d), d.ErfasstAm);
  });
  imker.behandlungen.filter(b => b.VolkID === volk.ID).forEach(b => {
    add(b.Datum, '💊', `Behandlung: ${b.Mittel}`, [
      b.Wirkstoff, b.Menge !== '' ? `${zahl(b.Menge, 2)} ${b.Einheit || ''}` : '', b.Methode,
      b.DatumBis ? `bis ${fmtDate(b.DatumBis)}` : '', b.Chargennummer ? `Charge ${b.Chargennummer}` : '',
      b.WartezeitTage !== '' ? `Wartezeit ${b.WartezeitTage} Tage` : '', b.Bezugsquelle ? `Lieferant: ${b.Bezugsquelle}` : '',
      b.Belegnummer ? `Beleg ${b.Belegnummer}` : '', b.Tierarzt ? `Verschreibung: ${b.Tierarzt}` : '', b.BehandelndePerson ? `behandelt von ${b.BehandelndePerson}` : '', b.Notiz
    ].filter(Boolean).map(esc).join(' · '), () => openBehandlungModal({ initial: b }), b.ErfasstAm);
  });
  imker.fuetterungen.filter(f => f.VolkID === volk.ID).forEach(f => {
    add(f.Datum, '🥣', `Fütterung: ${f.Futterart}`, [`${zahl(f.Menge, 2)} ${f.Einheit || ''}`, f.Notiz].filter(Boolean).map(esc).join(' · '), () => openFuetterungModal({ initial: f }), f.ErfasstAm);
  });
  imker.varroa.filter(v => v.VolkID === volk.ID).forEach(v => {
    const detail = v.Methode === 'Gemüllwindel' && Number(v.ZeitraumTage) > 0 ? `${zahl(v.MilbenAnzahl, 0)} Milben in ${zahl(v.ZeitraumTage)} Tagen` : '';
    add(v.Datum, '🔬', `Varroa: ${varroaText(v)}`, [v.Methode, detail, v.Notiz].filter(Boolean).map(esc).join(' · '), () => openVarroaModal(volk, v), v.ErfasstAm);
  });
  imker.honigerntevoelker.filter(hv => hv.VolkID === volk.ID).forEach(hv => {
    const h = imker.honigernten.find(x => x.ID === hv.HonigernteID);
    if (!h) return;
    const anzahl = imker.honigerntevoelker.filter(x => x.HonigernteID === h.ID).length;
    add(h.Datum, '🍯', `Honigernte${h.Sorte ? ': ' + h.Sorte : ''}`, [
      hv.MengeKg !== '' ? `${zahl(hv.MengeKg)} kg` : `${zahl(h.MengeKg)} kg gesamt${anzahl > 1 ? ` (${anzahl} Völker)` : ''}`,
      h.Wassergehalt !== '' ? `${zahl(h.Wassergehalt)} % Wasser` : '', h.Losnummer ? `Los ${h.Losnummer}` : '', h.Notiz
    ].filter(Boolean).map(esc).join(' · '), () => openHonigernteModal({ initial: h }), h.ErfasstAm);
  });
  imker.koeniginnen.filter(k => k.VolkID === volk.ID).forEach(k => {
    add(k.EingesetztAm || (k.Jahrgang ? `${k.Jahrgang}-01-01` : String(k.ErstelltAm).slice(0, 10)), '👑', `Königin ${k.Jahrgang || ''}${k.Aktuell ? '' : ' (abgelöst)'}`,
      `${koeniginPunkt(k)} ${[k.Farbe, k.Zeichnung, k.Herkunft, k.Notiz].filter(Boolean).map(esc).join(' · ')}`, () => openKoeniginModal(volk, k), k.ErstelltAm);
  });
  imker.aufgaben.filter(a => a.VolkID === volk.ID && a.Erledigt === true).forEach(a => {
    add(a.ErledigtAm || a.FaelligAm, '✅', `Erledigt: ${a.Titel}`, esc(a.Notiz || ''), () => openAufgabeModal(a), a.ErstelltAm);
  });

  let herkunftAusEreignis = false;
  imker.ereignisse.forEach(ev => {
    const eigenes = ev.VolkID === volk.ID;
    const betrifft = ev.PartnerVolkID === volk.ID;
    if (!eigenes && !betrifft) return;
    const partner = volkById(eigenes ? ev.PartnerVolkID : ev.VolkID);
    const p = partner ? volkLabel(partner) : '';
    let icon = '🔄', titel = ev.Typ, text = '';
    if (ev.Typ === 'Ableger gebildet') {
      icon = '🌱';
      if (eigenes) { titel = 'Ableger gebildet'; text = p ? `→ ${p}` : ''; } else { titel = `Als Ableger aus ${p} entstanden`; herkunftAusEreignis = true; }
    } else if (ev.Typ === 'Schwarm') {
      icon = '🐝';
      if (eigenes) { titel = 'Geschwärmt'; text = p ? `Schwarm eingefangen → ${p}` : 'Schwarm nicht eingefangen'; } else { titel = `Als Schwarm aus ${p} eingefangen`; herkunftAusEreignis = true; }
    } else if (ev.Typ === 'Vereinigt') {
      icon = '🔗';
      titel = eigenes ? `${p} wurde mit diesem Volk vereinigt` : `Mit ${p} vereinigt (aufgegangen)`;
    } else if (ev.Typ === 'Standortwechsel') {
      icon = '🚚';
      text = `${standName(ev.VonBienenstandID)} → ${standName(ev.NachBienenstandID)}`;
    } else if (ev.Typ === 'Auflösung/Verlust') {
      icon = '✝️';
      text = ev.Grund || '';
    }
    add(ev.Datum, icon, titel, [text, ev.Notiz].filter(Boolean).map(esc).join(' · '), () => openEreignisBearbeitenModal(ev), ev.ErfasstAm);
  });

  if (volk.Eingangsdatum && !herkunftAusEreignis) {
    add(volk.Eingangsdatum, '🏠', 'Zugang', esc(volk.Herkunft || ''), () => openVolkModal(volk), volk.ErstelltAm);
  }

  eintraege.sort((a, b) => (datumWert(String(b.datum).slice(0, 10)) - datumWert(String(a.datum).slice(0, 10))) || (b.zeit - a.zeit));
  if (!eintraege.length) { container.innerHTML = '<p class="text-sm text-gray-400">Noch keine Einträge.</p>'; return; }

  container.innerHTML = `<ol class="relative border-l-2 border-amber-200 ml-3 space-y-1">
    ${eintraege.map((e, i) => `<li class="ml-4">
      <span class="absolute -left-[13px] mt-2 w-6 h-6 rounded-full bg-white border-2 border-amber-200 flex items-center justify-center text-xs">${e.icon}</span>
      <button type="button" data-idx="${i}" class="btn-zeitleiste w-full text-left rounded-lg px-2 py-2 hover:bg-gray-50">
        <div class="text-xs text-gray-400">${fmtDate(e.datum)}</div>
        <div class="font-medium text-sm">${esc(e.titel)}</div>
        ${e.text ? `<div class="text-xs text-gray-600">${e.text}</div>` : ''}
      </button>
    </li>`).join('')}
  </ol>`;
  container.querySelectorAll('.btn-zeitleiste').forEach(b => b.onclick = () => eintraege[b.dataset.idx].onEdit());
}

// ---- Durchsicht-Eintrag eines Volkes nachträglich bearbeiten ----
function openDurchsichtEintragModal(dv, d) {
  const janein = [{ value: '', label: '–' }, { value: 'true', label: 'Ja' }, { value: 'false', label: 'Nein' }];
  openFormModal({
    title: `Durchsicht vom ${fmtDate(d.Datum)}: ${volkLabel(volkById(dv.VolkID))}`,
    fields: [
      { key: 'Datum', label: 'Datum (gilt für alle Völker dieser Durchsicht)', type: 'date', required: true },
      { key: 'Brutwaben', label: 'Brutwaben', type: 'number', step: 'any' },
      { key: 'KoeniginGesehen', label: 'Königin gesehen', type: 'select', options: janein },
      { key: 'Stifte', label: 'Stifte', type: 'select', options: janein },
      { key: 'Weiselzellen', label: 'Weiselzellen', type: 'number' },
      { key: 'Futterwaben', label: 'Futterwaben', type: 'number', step: 'any' },
      { key: 'Volksstaerke', label: 'Volksstärke', type: 'number', step: 'any' },
      { key: 'Sanftmut', label: 'Sanftmut (1–4)', type: 'select', options: BEWERTUNG_OPTIONEN },
      { key: 'Notiz', label: 'Notiz zu diesem Volk', type: 'textarea' }
    ],
    initial: { ...dv, Datum: d.Datum, KoeniginGesehen: String(dv.KoeniginGesehen), Stifte: String(dv.Stifte) },
    onSubmit: async (values) => {
      const datum = values.Datum;
      delete values.Datum;
      await imkerSpeichern('durchsichtvoelker', values, dv.ID);
      if (datum !== d.Datum) await imkerSpeichern('durchsichten', { Datum: datum }, d.ID);
      toast('Durchsicht aktualisiert.');
      imkerNeuZeichnen();
    },
    onDelete: state.user.role === 'Admin' ? async () => {
      await imkerLoeschen('durchsichtvoelker', dv.ID);
      // Ohne weitere Völker ist auch der Kopf der Durchsicht überflüssig
      if (!imker.durchsichtvoelker.some(x => x.DurchsichtID === d.ID && x.ID !== dv.ID)) await imkerLoeschen('durchsichten', d.ID);
      toast('Gelöscht.');
      imkerNeuZeichnen();
    } : null
  });
}

// ============================================================================
// EREIGNISSE (Ableger, Schwarm, Vereinigung, Standortwechsel, Auflösung)
// ============================================================================
function openEreignisModal(volk, typ) {
  const standOpts = standOptionen();
  const andereVoelker = aktiveVoelker().filter(v => v.ID !== volk.ID).sort(nachNummer)
    .map(v => ({ value: v.ID, label: `${volkLabel(v)} (${standName(v.BienenstandID)})` }));
  let fields = [{ key: 'Datum', label: 'Datum', type: 'date', required: true }];
  let start = { Datum: heuteIso() };
  let titel = typ;

  if (typ === 'Ableger gebildet') {
    titel = `Ableger aus ${volkLabel(volk)}`;
    fields.push(
      { key: 'Nummer', label: 'Nummer des neuen Volkes', required: true },
      { key: 'Name', label: 'Name (optional)' },
      { key: 'BienenstandID', label: 'Aufgestellt auf', type: 'select', options: standOpts },
      { key: 'Beutentyp', label: 'Beutentyp', suggestions: BEUTENTYPEN });
    start = { ...start, Nummer: String(naechsteVolkNummer()), BienenstandID: volk.BienenstandID, Beutentyp: volk.Beutentyp };
  } else if (typ === 'Schwarm') {
    titel = `Schwarm aus ${volkLabel(volk)}`;
    fields.push(
      { key: 'Eingefangen', label: 'Schwarm eingefangen und als neues Volk aufgestellt', type: 'checkbox' },
      { key: 'Nummer', label: 'Nummer des neuen Volkes', help: 'Nur wenn eingefangen.' },
      { key: 'BienenstandID', label: 'Aufgestellt auf', type: 'select', options: standOpts });
    start = { ...start, Eingefangen: true, Nummer: String(naechsteVolkNummer()), BienenstandID: volk.BienenstandID };
  } else if (typ === 'Vereinigt') {
    if (!andereVoelker.length) { toast('Es gibt kein anderes aktives Volk zum Vereinigen.', true); return; }
    titel = `Mit ${volkLabel(volk)} vereinigen`;
    fields.push({ key: 'PartnerVolkID', label: 'Welches Volk geht in diesem auf?', type: 'select', options: andereVoelker, required: true,
      help: 'Das gewählte Volk wird als „Aufgelöst“ ins Register übernommen, dieses Volk bleibt bestehen.' });
  } else if (typ === 'Standortwechsel') {
    const ziele = standOpts.filter(o => o.value !== volk.BienenstandID);
    if (!ziele.length) { toast('Es gibt keinen anderen Bienenstand.', true); return; }
    titel = `${volkLabel(volk)} umstellen`;
    fields.push({ key: 'NachBienenstandID', label: `Von ${standName(volk.BienenstandID)} nach`, type: 'select', options: ziele, required: true });
  } else if (typ === 'Auflösung/Verlust') {
    titel = `${volkLabel(volk)}: Auflösung / Verlust`;
    fields.push(
      { key: 'Status', label: 'Was ist passiert?', type: 'select', options: VERLUST_STATUS },
      { key: 'Grund', label: 'Grund', suggestions: VERLUST_GRUENDE });
  }
  fields.push({ key: 'Notiz', label: 'Notiz', type: 'textarea' });

  openFormModal({
    title: titel, fields, initial: start,
    onSubmit: async (values) => {
      const ev = { VolkID: volk.ID, Datum: values.Datum, Typ: typ, Notiz: values.Notiz };
      if (typ === 'Ableger gebildet' || (typ === 'Schwarm' && values.Eingefangen)) {
        if (!values.Nummer) throw new Error('Bitte eine Nummer für das neue Volk angeben.');
        const neu = await imkerSpeichern('voelker', {
          BienenstandID: values.BienenstandID, Nummer: values.Nummer, Name: values.Name || '',
          Beutentyp: values.Beutentyp || volk.Beutentyp, Status: 'Aktiv',
          Herkunft: typ === 'Schwarm' ? 'Schwarm' : 'Eigener Ableger', MuttervolkID: volk.ID, Eingangsdatum: values.Datum
        });
        ev.PartnerVolkID = neu.ID;
      } else if (typ === 'Vereinigt') {
        ev.PartnerVolkID = values.PartnerVolkID;
        await imkerSpeichern('voelker', { Status: 'Aufgelöst', Abgangsdatum: values.Datum }, values.PartnerVolkID);
      } else if (typ === 'Standortwechsel') {
        ev.VonBienenstandID = volk.BienenstandID;
        ev.NachBienenstandID = values.NachBienenstandID;
        await imkerSpeichern('voelker', { BienenstandID: values.NachBienenstandID }, volk.ID);
      } else if (typ === 'Auflösung/Verlust') {
        ev.Grund = [values.Status, values.Grund].filter(Boolean).join(': ');
        await imkerSpeichern('voelker', { Status: values.Status, Abgangsdatum: values.Datum }, volk.ID);
      }
      await imkerSpeichern('voelkerereignisse', ev);
      toast('Ereignis erfasst.');
      imkerNeuZeichnen();
    }
  });
}

function openEreignisBearbeitenModal(ev) {
  openFormModal({
    title: `Ereignis: ${ev.Typ}`,
    fields: [
      { key: 'Datum', label: 'Datum', type: 'date', required: true },
      { key: 'Grund', label: 'Grund' },
      { key: 'Notiz', label: 'Notiz', type: 'textarea',
        help: 'Löschen entfernt nur den Eintrag im Verlauf - Status oder Standort des Volkes bitte bei Bedarf über „Volk bearbeiten“ zurücksetzen.' }
    ],
    initial: ev,
    onSubmit: async (values) => {
      await imkerSpeichern('voelkerereignisse', values, ev.ID);
      toast('Ereignis aktualisiert.');
      imkerNeuZeichnen();
    },
    onDelete: state.user.role === 'Admin' ? async () => {
      await imkerLoeschen('voelkerereignisse', ev.ID);
      toast('Gelöscht.');
      imkerNeuZeichnen();
    } : null
  });
}

// ============================================================================
// VARROA-DIAGRAMM (eigenes SVG, keine Bibliothek): Milbenfall/Tag aus der
// Gemüllwindel über die Zeit, Behandlungen als farbige Zeiträume darunter.
// ============================================================================
function varroaDiagrammSvg(volkId) {
  const punkte = imker.varroa
    .filter(v => v.VolkID === volkId && v.Methode === 'Gemüllwindel' && Number(v.ZeitraumTage) > 0 && v.MilbenAnzahl !== '')
    .map(v => ({ t: datumWert(v.Datum), y: Number(v.MilbenAnzahl) / Number(v.ZeitraumTage), datum: v.Datum }))
    .sort((a, b) => a.t - b.t);
  const andere = imker.varroa.filter(v => v.VolkID === volkId && v.Methode !== 'Gemüllwindel').length;

  if (!punkte.length) {
    return `<p class="text-sm text-gray-400">Noch keine Kontrolle mit Gemüllwindel erfasst${andere ? ` (${andere} Kontrollen mit anderer Methode stehen im Verlauf)` : ''}.</p>`;
  }

  const W = 600, H = 230, L = 40, R = 12, T = 12, B = 46;
  const tag = 86400000;
  const fensterVon = punkte[0].t - 60 * tag, fensterBis = punkte[punkte.length - 1].t + 60 * tag;
  const behandlungen = imker.behandlungen.filter(b => b.VolkID === volkId && b.Datum)
    .map(b => ({ von: datumWert(b.Datum), bis: datumWert(b.DatumBis || b.Datum), b }))
    .filter(b => b.bis >= fensterVon && b.von <= fensterBis);
  const zeiten = punkte.map(p => p.t).concat(behandlungen.flatMap(b => [b.von, b.bis]));
  let tMin = Math.min(...zeiten), tMax = Math.max(...zeiten);
  if (tMax - tMin < 30 * 86400000) { const mitte = (tMin + tMax) / 2; tMin = mitte - 15 * 86400000; tMax = mitte + 15 * 86400000; }
  const rand = (tMax - tMin) * 0.04;
  tMin -= rand; tMax += rand;
  const yMaxRoh = Math.max(...punkte.map(p => p.y), 1);
  const schritt = [0.5, 1, 2, 5, 10, 20, 50, 100].find(s => yMaxRoh / s <= 5) || Math.ceil(yMaxRoh / 5);
  const yMax = Math.ceil(yMaxRoh / schritt) * schritt;

  const x = t => L + (t - tMin) / (tMax - tMin) * (W - L - R);
  const y = v => T + (1 - v / yMax) * (H - T - B);
  const datumKurz = t => new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });

  let svg = `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto" role="img" aria-label="Varroa-Milbenfall pro Tag">`;
  // waagrechte Hilfslinien + Beschriftung
  for (let v = 0; v <= yMax + 1e-9; v += schritt) {
    svg += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#e5e7eb" stroke-width="1"/>`;
    svg += `<text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#6b7280">${zahl(v)}</text>`;
  }
  // Zeitachse: bis zu 6 gleichmäßig verteilte Daten
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const t = tMin + (tMax - tMin) * i / ticks;
    const anker = i === 0 ? 'start' : i === ticks ? 'end' : 'middle'; // Rand-Daten nicht abschneiden
    svg += `<text x="${x(t)}" y="${H - B + 16}" text-anchor="${anker}" font-size="11" fill="#6b7280">${datumKurz(t)}</text>`;
  }
  // Behandlungen als Band unter der Zeitachse + zarte Hinterlegung im Diagramm
  behandlungen.forEach(({ von, bis, b }) => {
    const x1 = x(von), breite = Math.max(x(bis) - x1, 4);
    svg += `<g><title>💊 ${esc(b.Mittel)} ${fmtDate(b.Datum)}${b.DatumBis ? ' – ' + fmtDate(b.DatumBis) : ''}</title>
      <rect x="${x1}" y="${T}" width="${breite}" height="${H - T - B}" fill="#fde68a" opacity="0.35"/>
      <rect x="${x1}" y="${H - B + 24}" width="${breite}" height="10" rx="2" fill="#f59e0b"/></g>`;
  });
  // Messreihe
  svg += `<polyline fill="none" stroke="#b45309" stroke-width="2.5" points="${punkte.map(p => `${x(p.t)},${y(p.y)}`).join(' ')}"/>`;
  punkte.forEach(p => {
    svg += `<g><title>${fmtDate(p.datum)}: ${zahl(p.y)} Milben/Tag</title><circle cx="${x(p.t)}" cy="${y(p.y)}" r="5" fill="#b45309" stroke="white" stroke-width="2"/></g>`;
  });
  svg += `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="#9ca3af" stroke-width="1"/>`;
  svg += `</svg>`;

  return `<div class="bg-white border rounded-xl p-2">${svg}
    <div class="flex gap-4 text-xs text-gray-500 px-2 pb-1 flex-wrap">
      <span><span class="inline-block w-3 h-3 rounded-full align-middle" style="background:#b45309"></span> Milben/Tag (Gemüllwindel)</span>
      <span><span class="inline-block w-4 h-2.5 rounded-sm align-middle" style="background:#f59e0b"></span> Behandlung</span>
      ${andere ? `<span>${andere} Kontrolle(n) mit anderer Methode: siehe Verlauf</span>` : ''}
    </div></div>`;
}

// ============================================================================
// SCHNELLE DURCHSICHT (Vollbild, große Knöpfe, ein Volk pro Seite)
// Zahlen starten beim Wert der letzten Durchsicht (grau). Erst durch Antippen
// werden sie übernommen - unberührte Felder werden leer gespeichert, damit nie
// ein alter Wert versehentlich als neue Beobachtung im Protokoll landet.
// Der Zwischenstand wird lokal gesichert (falls das Handy zwischendurch sperrt).
// ============================================================================
const DURCHSICHT_ENTWURF_KEY = 'imker_durchsicht_entwurf';
const durchsichtDialog = document.getElementById('durchsichtDialog');
let ds = null;

function leereVolkWerte() {
  return { Brutwaben: null, Futterwaben: null, Volksstaerke: null, Weiselzellen: null, KoeniginGesehen: null, Stifte: null, Sanftmut: null, Notiz: '' };
}

function entwurfSichern() {
  try { localStorage.setItem(DURCHSICHT_ENTWURF_KEY, JSON.stringify({ ...ds, gesichertAm: new Date().toISOString() })); } catch (e) { /* kein Platz - egal */ }
}
function entwurfVerwerfen() {
  try { localStorage.removeItem(DURCHSICHT_ENTWURF_KEY); } catch (e) { /* egal */ }
}
function entwurfLaden() {
  try { return JSON.parse(localStorage.getItem(DURCHSICHT_ENTWURF_KEY) || 'null'); } catch (e) { return null; }
}

async function openDurchsichtErfassung(volkIds = []) {
  await ladeImkerDaten();
  if (!aktiveVoelker().length) { toast('Noch keine aktiven Völker angelegt.', true); return; }

  const entwurf = entwurfLaden();
  if (entwurf && entwurf.voelker && entwurf.voelker.length &&
      confirm(`Es gibt eine nicht gespeicherte Durchsicht vom ${fmtDate(entwurf.datum)} (${entwurf.voelker.length} Völker). Fortsetzen?`)) {
    ds = entwurf;
  } else {
    entwurfVerwerfen();
    ds = { schritt: 'auswahl', datum: heuteIso(), wetter: '', temperatur: '', notiz: '', voelker: volkIds.slice(), idx: 0, werte: {} };
    wetterVorschlagHolen(volkIds[0]);
  }
  durchsichtDialog.showModal();
  renderDurchsicht();
}

async function wetterVorschlagHolen(volkId) {
  if (!navigator.onLine) return;
  const v = volkId ? volkById(volkId) : null;
  const stand = v ? standById(v.BienenstandID) : aktiveStaende().find(s => s.Lat !== '' && s.Lng !== '');
  const lat = stand && stand.Lat !== '' ? Number(stand.Lat) : CONFIG.MAP_CENTER[0];
  const lng = stand && stand.Lng !== '' ? Number(stand.Lng) : CONFIG.MAP_CENTER[1];
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=temperature_2m,weather_code&timezone=auto`);
    if (!res.ok) return;
    const c = (await res.json()).current;
    if (!ds || ds.wetter || ds.datum !== heuteIso()) return;
    ds.wetter = `${weatherIcon(c.weather_code)} ${weatherLabel(c.weather_code)}`.trim();
    ds.temperatur = Math.round(c.temperature_2m);
    if (ds.schritt === 'auswahl' && durchsichtDialog.open) {
      const w = document.getElementById('dsWetter'); const t = document.getElementById('dsTemp');
      if (w && !w.value) w.value = ds.wetter;
      if (t && !t.value) t.value = ds.temperatur;
    }
  } catch (e) { /* ohne Wetter weiter */ }
}

function dsFooter(html) {
  document.getElementById('durchsichtFooter').innerHTML = html;
}

function renderDurchsicht() {
  const body = document.getElementById('durchsichtBody');
  body.scrollTop = 0;
  if (ds.schritt === 'auswahl') {
    document.getElementById('durchsichtTitel').textContent = '🐝 Durchsicht – Völker wählen';
    body.innerHTML = `
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <label class="block col-span-2"><span class="text-sm font-medium text-gray-600">Datum</span>
            <input id="dsDatum" type="date" value="${esc(ds.datum)}" class="w-full border rounded-lg px-3 py-3 text-lg"></label>
          <label class="block"><span class="text-sm font-medium text-gray-600">Wetter</span>
            <input id="dsWetter" value="${esc(ds.wetter)}" class="w-full border rounded-lg px-3 py-3"></label>
          <label class="block"><span class="text-sm font-medium text-gray-600">Temperatur °C</span>
            <input id="dsTemp" type="number" inputmode="decimal" value="${esc(ds.temperatur)}" class="w-full border rounded-lg px-3 py-3"></label>
        </div>
        ${volkAuswahlHtml(ds.voelker)}
        <label class="block"><span class="text-sm font-medium text-gray-600">Notiz für alle (optional)</span>
          <textarea id="dsNotiz" rows="2" class="w-full border rounded-lg px-3 py-2">${esc(ds.notiz)}</textarea></label>
      </div>`;
    const merken = () => {
      ds.datum = document.getElementById('dsDatum').value;
      ds.wetter = document.getElementById('dsWetter').value;
      ds.temperatur = document.getElementById('dsTemp').value;
      ds.notiz = document.getElementById('dsNotiz').value;
      ds.voelker = gewaehlteVoelker(body);
      entwurfSichern();
    };
    dsFooter(`<button type="button" id="dsWeiter" class="flex-1 bg-amber-500 disabled:bg-gray-300 text-white rounded-xl py-4 text-lg font-semibold"></button>`);
    const aktualisiereWeiter = () => {
      const btn = document.getElementById('dsWeiter');
      btn.disabled = !ds.voelker.length;
      btn.textContent = ds.voelker.length ? `Weiter → (${ds.voelker.length} ${ds.voelker.length === 1 ? 'Volk' : 'Völker'})` : 'Volk wählen';
    };
    body.querySelectorAll('input, textarea').forEach(el => el.addEventListener('change', merken));
    aktiviereVolkAuswahl(body, () => { merken(); aktualisiereWeiter(); });
    document.getElementById('dsWeiter').onclick = () => {
      merken();
      if (!ds.datum) { toast('Bitte ein Datum angeben.', true); return; }
      if (!ds.voelker.length) return;
      // Reihenfolge wie am Stand: nach Bienenstand, dann Nummer
      ds.voelker.sort((a, b) => {
        const va = volkById(a), vb = volkById(b);
        return standName(va.BienenstandID).localeCompare(standName(vb.BienenstandID), 'de') || nachNummer(va, vb);
      });
      ds.voelker.forEach(id => { if (!ds.werte[id]) ds.werte[id] = leereVolkWerte(); });
      ds.schritt = 'volk';
      ds.idx = 0;
      entwurfSichern();
      renderDurchsicht();
    };
    return;
  }

  // ---- Schritt: ein Volk erfassen ----
  const volkId = ds.voelker[ds.idx];
  const volk = volkById(volkId);
  const w = ds.werte[volkId];
  const vorher = letzteDurchsicht(volkId);
  const basis = {
    Brutwaben: vorher && vorher.dv.Brutwaben !== '' ? Number(vorher.dv.Brutwaben) : null,
    Futterwaben: vorher && vorher.dv.Futterwaben !== '' ? Number(vorher.dv.Futterwaben) : null,
    Volksstaerke: vorher && vorher.dv.Volksstaerke !== '' ? Number(vorher.dv.Volksstaerke) : null,
    Weiselzellen: 0
  };
  const letztes = ds.idx === ds.voelker.length - 1;

  document.getElementById('durchsichtTitel').textContent = `${volkLabel(volk)}  (${ds.idx + 1}/${ds.voelker.length})`;
  body.innerHTML = `
    <div class="space-y-1">
      <div class="text-sm text-gray-500">📍 ${esc(standName(volk.BienenstandID))}${vorher ? ` · letzte Durchsicht ${fmtDate(vorher.d.Datum)}` : ' · erste Durchsicht'}</div>
      ${vorher ? `<div class="text-xs text-gray-400">${esc(durchsichtKurztext(vorher.dv))}</div>` : ''}
      ${vorher ? `<button type="button" id="dsWieLetztes" class="mt-2 w-full border-2 border-dashed border-amber-400 text-amber-800 rounded-xl py-3 font-medium">↺ Waben &amp; Stärke wie beim letzten Mal übernehmen</button>` : ''}
    </div>
    <div class="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
      <label for="dsDiktat" class="font-semibold block">🎤 Diktieren</label>
      <div class="text-xs text-gray-500">Ins Feld tippen → auf der Tastatur das <b>Mikrofon</b> drücken → sprechen, z. B. „Sieben Brutwaben, Königin gesehen, zwei Weiselzellen, sanft“. Mit „Volk 3 …“ geht es auch für mehrere Völker auf einmal.</div>
      <textarea id="dsDiktat" rows="2" class="w-full border rounded-lg px-3 py-2 text-base" placeholder="Hier antippen und diktieren …"></textarea>
      <button type="button" id="dsDiktatUebernehmen" class="w-full bg-amber-500 text-white rounded-xl py-3 font-semibold">✓ Diktat übernehmen</button>
      ${ds.diktatMeldung ? `<div class="text-sm text-amber-900">${ds.diktatMeldung}</div>` : ''}
    </div>
    <div class="divide-y mt-2">
      ${dsZaehler('Brutwaben', 'Brutwaben', w.Brutwaben, basis.Brutwaben)}
      ${dsJaNein('KoeniginGesehen', 'Königin gesehen', w.KoeniginGesehen)}
      ${dsJaNein('Stifte', 'Stifte', w.Stifte)}
      ${dsZaehler('Weiselzellen', 'Weiselzellen', w.Weiselzellen, basis.Weiselzellen)}
      ${dsZaehler('Futterwaben', 'Futterwaben', w.Futterwaben, basis.Futterwaben)}
      ${dsZaehler('Volksstaerke', 'Volksstärke', w.Volksstaerke, basis.Volksstaerke)}
      <div class="py-3">
        <div class="font-semibold mb-2">Sanftmut <span class="text-xs font-normal text-gray-400">1 = stechlustig … 4 = sehr sanft</span></div>
        <div class="grid grid-cols-4 gap-2">
          ${[1, 2, 3, 4].map(n => `<button type="button" data-sanftmut="${n}" class="h-14 rounded-xl text-xl font-bold border-2 ${String(w.Sanftmut) === String(n) ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-gray-200'}">${n}</button>`).join('')}
        </div>
      </div>
      <label class="block py-3"><span class="font-semibold">Notiz</span>
        <textarea id="dsVolkNotiz" rows="2" class="w-full border rounded-lg px-3 py-2 mt-1">${esc(w.Notiz)}</textarea></label>
    </div>`;

  body.querySelectorAll('[data-z]').forEach(b => b.onclick = () => {
    const feld = b.dataset.z;
    // Unberührt: Ausgangspunkt ist der letzte Wert (bzw. 0) - Antippen der Zahl übernimmt ihn
    const ausgang = w[feld] !== null ? w[feld] : (basis[feld] !== null ? basis[feld] : 0);
    w[feld] = Math.max(0, ausgang + Number(b.dataset.d));
    entwurfSichern();
    renderDurchsicht();
  });
  body.querySelectorAll('[data-jn]').forEach(b => b.onclick = () => {
    const feld = b.dataset.jn;
    const wert = b.dataset.wert === 'true';
    w[feld] = w[feld] === wert ? null : wert;
    entwurfSichern();
    renderDurchsicht();
  });
  body.querySelectorAll('[data-sanftmut]').forEach(b => b.onclick = () => {
    const n = Number(b.dataset.sanftmut);
    w.Sanftmut = w.Sanftmut === n ? null : n;
    entwurfSichern();
    renderDurchsicht();
  });
  document.getElementById('dsVolkNotiz').addEventListener('input', (e) => { w.Notiz = e.target.value; entwurfSichern(); });
  document.getElementById('dsDiktatUebernehmen').onclick = () => {
    const text = document.getElementById('dsDiktat').value.trim();
    if (!text) { toast('Erst etwas diktieren oder eintippen.', true); return; }
    ds.diktatMeldung = diktatUebernehmen(text);
    entwurfSichern();
    renderDurchsicht();
  };
  const wieLetztes = document.getElementById('dsWieLetztes');
  if (wieLetztes) wieLetztes.onclick = () => {
    ['Brutwaben', 'Futterwaben', 'Volksstaerke'].forEach(f => { if (w[f] === null && basis[f] !== null) w[f] = basis[f]; });
    entwurfSichern();
    renderDurchsicht();
  };

  dsFooter(`
    <button type="button" id="dsZurueck" class="w-28 bg-gray-100 rounded-xl py-4 text-lg font-medium">← Zurück</button>
    <button type="button" id="dsVor" class="flex-1 ${letztes ? 'bg-green-700' : 'bg-amber-500'} text-white rounded-xl py-4 text-lg font-semibold">${letztes ? '✓ Speichern' : 'Nächstes Volk →'}</button>`);
  document.getElementById('dsZurueck').onclick = () => {
    ds.diktatMeldung = '';
    if (ds.idx === 0) ds.schritt = 'auswahl'; else ds.idx--;
    entwurfSichern();
    renderDurchsicht();
  };
  document.getElementById('dsVor').onclick = async () => {
    if (!letztes) { ds.diktatMeldung = ''; ds.idx++; entwurfSichern(); renderDurchsicht(); return; }
    await durchsichtSpeichern(document.getElementById('dsVor'));
  };
}

function dsZaehler(feld, label, wert, basis) {
  const unberuehrt = wert === null;
  const anzeige = unberuehrt ? (basis === null ? '–' : zahl(basis)) : zahl(wert);
  return `<div class="flex items-center justify-between gap-2 py-3">
    <div class="min-w-0"><div class="font-semibold">${label}</div>
      ${unberuehrt ? `<div class="text-xs text-gray-400">${basis === null || feld === 'Weiselzellen' ? 'nicht erfasst' : 'grau = letzter Wert, antippen übernimmt'}</div>` : ''}</div>
    <div class="flex items-center gap-2 shrink-0">
      <button type="button" data-z="${feld}" data-d="-1" class="w-14 h-14 rounded-xl bg-gray-100 active:bg-gray-200 text-3xl font-bold" aria-label="${label} weniger">−</button>
      <button type="button" data-z="${feld}" data-d="0" class="w-16 h-14 rounded-xl text-2xl font-bold border-2 ${unberuehrt ? 'border-dashed border-gray-300 text-gray-300' : 'border-amber-400 bg-amber-50 text-gray-900'}">${anzeige}</button>
      <button type="button" data-z="${feld}" data-d="1" class="w-14 h-14 rounded-xl bg-gray-100 active:bg-gray-200 text-3xl font-bold" aria-label="${label} mehr">+</button>
    </div>
  </div>`;
}

function dsJaNein(feld, label, wert) {
  const knopf = (w, text, farbe) => `<button type="button" data-jn="${feld}" data-wert="${w}" class="h-14 rounded-xl text-lg font-semibold border-2 ${wert === w ? farbe : 'bg-white border-gray-200 text-gray-700'}">${text}</button>`;
  return `<div class="py-3">
    <div class="font-semibold mb-2">${label}</div>
    <div class="grid grid-cols-2 gap-2">
      ${knopf(true, 'Ja', 'bg-green-600 border-green-600 text-white')}
      ${knopf(false, 'Nein', 'bg-red-600 border-red-600 text-white')}
    </div>
  </div>`;
}

let _durchsichtSpeichertGerade = false;

async function durchsichtSpeichern(btn) {
  if (_durchsichtSpeichertGerade) return;
  _durchsichtSpeichertGerade = true;
  btn.disabled = true;
  btn.textContent = 'Speichert …';
  try {
    const kopf = await imkerSpeichern('durchsichten', {
      Datum: ds.datum, Wetter: ds.wetter, TemperaturC: ds.temperatur, Notiz: ds.notiz
    });
    const leerWennNull = v => (v === null || v === undefined ? '' : v);
    await Promise.all(ds.voelker.map(id => {
      const w = ds.werte[id] || leereVolkWerte();
      return imkerSpeichern('durchsichtvoelker', {
        DurchsichtID: kopf.ID, VolkID: id,
        Brutwaben: leerWennNull(w.Brutwaben), Futterwaben: leerWennNull(w.Futterwaben),
        Volksstaerke: leerWennNull(w.Volksstaerke), Weiselzellen: leerWennNull(w.Weiselzellen),
        KoeniginGesehen: leerWennNull(w.KoeniginGesehen), Stifte: leerWennNull(w.Stifte),
        Sanftmut: leerWennNull(w.Sanftmut), Notiz: w.Notiz || ''
      });
    }));
    const anzahl = ds.voelker.length;
    entwurfVerwerfen();
    ds = null;
    durchsichtDialog.close();
    toast(`Durchsicht für ${anzahl} ${anzahl === 1 ? 'Volk' : 'Völker'} gespeichert.`);
    imkerNeuZeichnen();
  } catch (e) {
    // Eingaben bleiben im Dialog und im lokalen Entwurf erhalten
    toast(`Speichern fehlgeschlagen: ${e.message} – deine Eingaben bleiben erhalten, bitte erneut versuchen.`, true);
    btn.disabled = false;
    btn.textContent = '✓ Speichern';
  } finally {
    _durchsichtSpeichertGerade = false;
  }
}

function durchsichtAbbrechen() {
  const hatEingaben = ds && ds.schritt === 'volk';
  if (hatEingaben && !confirm('Durchsicht abbrechen? Die Eingaben bleiben als Entwurf gespeichert und können beim nächsten Mal fortgesetzt werden.')) return;
  durchsichtDialog.close();
}

if (IMKEREI_AKTIV) {
  document.getElementById('durchsichtSchliessen').onclick = durchsichtAbbrechen;
  // ESC / Zurück-Geste soll die Durchsicht nicht unbemerkt schließen
  durchsichtDialog.addEventListener('cancel', (e) => { e.preventDefault(); durchsichtAbbrechen(); });
}

// ============================================================================
// AUSWERTUNGEN & EXPORT (Reiter "Auswertungen")
// ============================================================================

// ---- Spalten des Behandlungs-Exports (PDF/Druck + CSV): HIER anpassen ----
// Reihenfolge hier = Reihenfolge im Export. Spalte entfernen = Zeile löschen,
// neue Spalte = Zeile mit Titel und Wert ergänzen. Welche Angaben verpflichtend
// sind, klärt der Betrieb noch mit Tierarzt bzw. Imkerbund.
// wert(behandlung, zusatz) - zusatz enthält { stand, volk } zum Behandlungsdatum.
// Angelehnt an die Spalten des bisher verwendeten Bestandsbuchs (Imkado).
function behandlungsdauerTage(b) {
  if (!b.DatumBis) return '';
  return Math.round((datumWert(b.DatumBis) - datumWert(b.Datum)) / 86400000) + 1;
}
const BEHANDLUNG_EXPORT_SPALTEN = [
  { titel: 'Datum der Anwendung', wert: (b) => fmtDate(b.Datum) },
  { titel: 'Bienenstand', wert: (b, x) => x.stand },
  { titel: 'Volk', wert: (b, x) => x.volk },
  { titel: 'Arzneimittel', wert: (b) => b.Mittel },
  { titel: 'Wirkstoff', wert: (b) => b.Wirkstoff },
  { titel: 'Lieferant', wert: (b) => b.Bezugsquelle },
  { titel: 'Kaufdatum', wert: (b) => fmtDate(b.Kaufdatum) },
  { titel: 'Charge/MHD', wert: (b) => b.Chargennummer },
  { titel: 'Verabr. Menge', wert: (b) => (b.Menge !== '' ? `${zahl(b.Menge, 2)} ${b.Einheit || ''}`.trim() : '') },
  { titel: 'Behandl.-Dauer (Tage)', wert: (b) => behandlungsdauerTage(b) },
  { titel: 'Wartezeit (Tage)', wert: (b) => b.WartezeitTage },
  { titel: 'Beleg', wert: (b) => b.Belegnummer },
  { titel: 'Verschreibung durch', wert: (b) => b.Tierarzt },
  { titel: 'Behandelnde Person', wert: (b) => b.BehandelndePerson },
  { titel: 'Notiz', wert: (b) => b.Notiz }
];

const auswertung = { von: `${new Date().getFullYear()}-01-01`, bis: '', stand: '', stichtag: '', honigJahr: String(new Date().getFullYear()) };

// Wo stand ein Volk an einem bestimmten Tag? Aus den Standortwechseln rekonstruiert.
function standAm(volk, datum) {
  const wechsel = imker.ereignisse.filter(e => e.VolkID === volk.ID && e.Typ === 'Standortwechsel')
    .sort((a, b) => String(a.Datum).localeCompare(String(b.Datum)) || datumWert(a.ErfasstAm) - datumWert(b.ErfasstAm));
  const bisher = wechsel.filter(e => String(e.Datum) <= datum);
  if (bisher.length) return bisher[bisher.length - 1].NachBienenstandID;
  const spaeter = wechsel.find(e => String(e.Datum) > datum);
  if (spaeter) return spaeter.VonBienenstandID;
  return volk.BienenstandID;
}

// War ein Volk an diesem Tag im Bestand? Zugang bis einschließlich, Abgang ab dem Abgangstag nicht mehr.
function volkAktivAm(volk, datum) {
  if (volk.Aktiv === false) return false;
  const zugang = volk.Eingangsdatum || String(volk.ErstelltAm || '').slice(0, 10);
  if (zugang && zugang > datum) return false;
  if (volk.Abgangsdatum) return volk.Abgangsdatum > datum;
  return volk.Status === 'Aktiv';
}

function behandlungenFuerExport() {
  const von = auswertung.von || '0000-01-01';
  const bis = auswertung.bis || heuteIso();
  return imker.behandlungen
    .filter(b => b.Datum && String(b.Datum) <= bis && String(b.DatumBis || b.Datum) >= von)
    .map(b => {
      const volk = volkById(b.VolkID);
      const standId = volk ? standAm(volk, String(b.Datum)) : '';
      return { b, standId, zusatz: { stand: standName(standId), volk: volk ? volkLabel(volk) : '' } };
    })
    .filter(x => !auswertung.stand || x.standId === auswertung.stand)
    .sort((a, c) => String(a.b.Datum).localeCompare(String(c.b.Datum)) || a.zusatz.stand.localeCompare(c.zusatz.stand, 'de')
      || nachNummer(volkById(a.b.VolkID) || {}, volkById(c.b.VolkID) || {}));
}

// ---- Druck/PDF: Inhalt in den Druckbereich schreiben und Druckdialog öffnen ----
function druckKopf(titel, zeilen) {
  const b = state.betrieb || {};
  const betrieb = [b.HofName, b.Adresse].filter(Boolean).map(esc).join(' · ');
  const kodex = [b.Betriebsnummer ? `Betriebskodex Hof: ${esc(b.Betriebsnummer)}` : '', b.BetriebskodexImkerei ? `Betriebskodex Imkerei: ${esc(b.BetriebskodexImkerei)}` : '']
    .filter(Boolean).join(' · ');
  return `<h1>${esc(titel)}</h1>
    <div class="dk-meta">${betrieb}${kodex ? '<br>' + kodex : ''}${zeilen.length ? '<br>' + zeilen.join('<br>') : ''}</div>`;
}

function druckTabelle(kopf, zeilen, fuss) {
  return `<table><thead><tr>${kopf.map(k => `<th>${esc(k)}</th>`).join('')}</tr></thead>
    <tbody>${zeilen.map(z => `<tr>${z.map(w => `<td>${esc(w)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${kopf.length}">Keine Einträge.</td></tr>`}</tbody>
    ${fuss ? `<tfoot><tr>${fuss.map(w => `<td>${esc(w)}</td>`).join('')}</tr></tfoot>` : ''}</table>`;
}

function drucken(inhalt, { quer = false } = {}) {
  const bereich = document.getElementById('druckBereich');
  const user = state.user ? state.user.name : '';
  bereich.innerHTML = `<style>
      @page { size: A4 ${quer ? 'landscape' : 'portrait'}; margin: 12mm; }
      #druckBereich { font-family: Inter, Arial, sans-serif; color: #111; font-size: 9pt; }
      #druckBereich h1 { font-size: 15pt; margin: 0 0 4px; }
      #druckBereich h2 { font-size: 11pt; margin: 14px 0 4px; }
      #druckBereich .dk-meta { font-size: 9pt; color: #333; margin-bottom: 10px; line-height: 1.4; }
      #druckBereich table { border-collapse: collapse; width: 100%; margin-bottom: 8px; }
      #druckBereich th, #druckBereich td { border: 1px solid #999; padding: 3px 5px; text-align: left; vertical-align: top; }
      #druckBereich th { background: #eee; }
      #druckBereich tfoot td { font-weight: bold; background: #f5f5f5; }
      #druckBereich tr { page-break-inside: avoid; }
      #druckBereich .dk-fuss { margin-top: 10px; font-size: 8pt; color: #555; }
    </style>${inhalt}
    <div class="dk-fuss">Erstellt am ${fmtDate(new Date())}${user ? ' von ' + esc(user) : ''} mit der Hof-App</div>`;
  document.body.classList.add('druckmodus');
  const aufraeumen = () => { document.body.classList.remove('druckmodus'); window.removeEventListener('afterprint', aufraeumen); };
  window.addEventListener('afterprint', aufraeumen);
  setTimeout(() => window.print(), 50);
}

function zeitraumText() {
  return `Zeitraum: ${fmtDate(auswertung.von) || 'Anfang'} – ${fmtDate(auswertung.bis || heuteIso())}`;
}

function exportBehandlungen(art) {
  const daten = behandlungenFuerExport();
  const kopf = BEHANDLUNG_EXPORT_SPALTEN.map(s => s.titel);
  const zeilen = daten.map(x => BEHANDLUNG_EXPORT_SPALTEN.map(s => {
    const w = s.wert(x.b, x.zusatz);
    return w === undefined || w === null ? '' : String(w);
  }));
  const standText = `Bienenstand: ${auswertung.stand ? standName(auswertung.stand) : 'alle'}`;
  if (art === 'csv') {
    downloadCsv(`Behandlungen_${auswertung.von || 'Anfang'}_bis_${auswertung.bis || heuteIso()}.csv`, [kopf, ...zeilen]);
    toast(`${zeilen.length} Behandlungen als CSV heruntergeladen.`);
    return;
  }
  drucken(druckKopf('Behandlungen der Bienenvölker', [zeitraumText(), standText, `${zeilen.length} Einträge`]) + druckTabelle(kopf, zeilen), { quer: true });
}

function voelkerZumStichtag(datum) {
  const proStand = {};
  imker.voelker.filter(v => volkAktivAm(v, datum)).forEach(v => {
    const s = standAm(v, datum) || '';
    (proStand[s] = proStand[s] || []).push(v);
  });
  // aktive Stände auch mit 0 Völkern aufführen
  aktiveStaende().forEach(s => { if (!proStand[s.ID]) proStand[s.ID] = []; });
  return Object.entries(proStand)
    .map(([standId, voelker]) => ({ standId, name: standName(standId), voelker: voelker.sort(nachNummer) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

function exportStichtag(art) {
  const datum = auswertung.stichtag || heuteIso();
  const zeilen = voelkerZumStichtag(datum);
  const summe = zeilen.reduce((n, z) => n + z.voelker.length, 0);
  const kopf = ['Bienenstand', 'Aktive Völker', 'Völker'];
  const daten = zeilen.map(z => [z.name, String(z.voelker.length), z.voelker.map(v => v.Nummer).join(', ')]);
  if (art === 'csv') {
    downloadCsv(`Voelker_Stichtag_${datum}.csv`, [kopf, ...daten, ['Gesamt', String(summe), '']]);
    toast('Völkerzahl als CSV heruntergeladen.');
    return;
  }
  drucken(druckKopf('Anzahl aktiver Bienenvölker', [`Stichtag: ${fmtDate(datum)}`]) + druckTabelle(kopf, daten, ['Gesamt', String(summe), '']));
}

// ---- Honig: Ernte je Jahr/Volk/Stand, Verkäufe aus den Finanzen ----
// Ist bei einer gemeinsamen Ernte keine Menge je Volk erfasst, wird der Rest der
// Gesamtmenge gleichmäßig auf die beteiligten Völker verteilt (als "≈" markiert).
function honigAnteile(ernte) {
  const links = imker.honigerntevoelker.filter(hv => hv.HonigernteID === ernte.ID);
  const bekannt = links.filter(hv => hv.MengeKg !== '');
  const offen = links.filter(hv => hv.MengeKg === '');
  const rest = Math.max(0, Number(ernte.MengeKg || 0) - bekannt.reduce((s, hv) => s + Number(hv.MengeKg), 0));
  return links.map(hv => ({
    volkId: hv.VolkID,
    kg: hv.MengeKg !== '' ? Number(hv.MengeKg) : (offen.length ? rest / offen.length : 0),
    geschaetzt: hv.MengeKg === '' && links.length > 1
  }));
}

function honigVerkaeufe() {
  return (listCache['erntevermarktung.list'] || []).filter(r => r.Kategorie === 'Honig');
}

function honigAuswertung(jahr) {
  const imJahr = d => String(d || '').slice(0, 4) === String(jahr);
  const ernten = imker.honigernten.filter(h => imJahr(h.Datum)).sort((a, b) => String(b.Datum).localeCompare(String(a.Datum)));
  const proVolk = {}, proStand = {};
  ernten.forEach(h => honigAnteile(h).forEach(a => {
    const volk = volkById(a.volkId);
    const standId = volk ? standAm(volk, String(h.Datum)) : '';
    const pv = proVolk[a.volkId] = proVolk[a.volkId] || { kg: 0, geschaetzt: false, volk };
    pv.kg += a.kg; pv.geschaetzt = pv.geschaetzt || a.geschaetzt;
    const ps = proStand[standId] = proStand[standId] || { kg: 0, name: standName(standId) };
    ps.kg += a.kg;
  }));
  const verkaeufe = honigVerkaeufe().filter(r => imJahr(r.Datum)).sort((a, b) => String(b.Datum).localeCompare(String(a.Datum)));
  const kgVerkauf = verkaeufe.filter(r => r.Einheit === 'kg');
  const verkauftKg = kgVerkauf.reduce((s, r) => s + Number(r.Menge || 0), 0);
  const erloes = verkaeufe.reduce((s, r) => s + Number(r.Erloes || 0), 0);
  const erloesKg = kgVerkauf.reduce((s, r) => s + Number(r.Erloes || 0), 0);
  // Lager über alle Jahre: alles Geerntete minus alles in kg Verkaufte
  const geerntetGesamt = imker.honigernten.reduce((s, h) => s + Number(h.MengeKg || 0), 0);
  const verkauftGesamt = honigVerkaeufe().filter(r => r.Einheit === 'kg').reduce((s, r) => s + Number(r.Menge || 0), 0);
  return {
    ernten, verkaeufe,
    geerntetKg: ernten.reduce((s, h) => s + Number(h.MengeKg || 0), 0),
    verkauftKg, erloes, preisKg: verkauftKg ? erloesKg / verkauftKg : null,
    andereEinheiten: verkaeufe.length - kgVerkauf.length,
    lagerKg: geerntetGesamt - verkauftGesamt,
    proVolk: Object.values(proVolk).sort((a, b) => b.kg - a.kg),
    proStand: Object.values(proStand).sort((a, b) => b.kg - a.kg)
  };
}

function exportHonig() {
  const a = honigAuswertung(auswertung.honigJahr);
  drucken(druckKopf(`Honig ${auswertung.honigJahr}`, [
    `Geerntet: ${zahl(a.geerntetKg)} kg · Verkauft: ${zahl(a.verkauftKg)} kg · Erlös: ${euro(a.erloes)}${a.preisKg !== null ? ` · Ø ${euro(a.preisKg)}/kg` : ''}`,
    `Honig auf Lager (rechnerisch, alle Jahre): ${zahl(a.lagerKg)} kg`
  ])
    + '<h2>Ernte je Bienenstand</h2>' + druckTabelle(['Bienenstand', 'kg'], a.proStand.map(s => [s.name, zahl(s.kg)]))
    + '<h2>Ernte je Volk</h2>' + druckTabelle(['Volk', 'kg'], a.proVolk.map(v => [v.volk ? volkLabel(v.volk) : '?', (v.geschaetzt ? '≈ ' : '') + zahl(v.kg)]))
    + '<h2>Ernten</h2>' + druckTabelle(['Datum', 'Sorte', 'kg', 'Wasser %', 'Los', 'Völker'], a.ernten.map(h => [fmtDate(h.Datum), h.Sorte, zahl(h.MengeKg), zahl(h.Wassergehalt), h.Losnummer,
      imker.honigerntevoelker.filter(hv => hv.HonigernteID === h.ID).map(hv => (volkById(hv.VolkID) || {}).Nummer).join(', ')]))
    + '<h2>Verkäufe</h2>' + druckTabelle(['Datum', 'Menge', 'Preis', 'Erlös', 'Beschreibung'], a.verkaeufe.map(r => [fmtDate(r.Datum), `${zahl(r.Menge, 2)} ${r.Einheit || ''}`, r.PreisJeEinheit !== '' ? euro(r.PreisJeEinheit) : '', euro(r.Erloes), r.Beschreibung]))
    + '<p style="font-size:8pt;color:#555">≈ = gemeinsame Ernte ohne Menge je Volk, gleichmäßig aufgeteilt.</p>');
}

function openHonigVerkauf() {
  const letzter = honigVerkaeufe().sort((a, b) => String(b.Datum).localeCompare(String(a.Datum)))[0];
  openErntevermarktungModal(
    { Datum: heuteIso(), Kategorie: 'Honig', Einheit: 'kg', PreisJeEinheit: letzter ? letzter.PreisJeEinheit : '' },
    async () => { imkerNeuZeichnen(); }
  );
}

function auswertungKarte(titel, inhalt) {
  return `<div class="bg-white rounded-xl shadow p-4 space-y-3 min-w-0"><h3 class="font-semibold">${titel}</h3>${inhalt}</div>`;
}

async function renderImkerAuswertung() {
  const container = document.getElementById('imkerAuswertung');
  if (!container) return;
  await cachedList('erntevermarktung.list');
  const bis = auswertung.bis || heuteIso();
  const stichtag = auswertung.stichtag || heuteIso();
  const behandlungen = behandlungenFuerExport();
  const stichtagListe = voelkerZumStichtag(stichtag);
  const stichtagSumme = stichtagListe.reduce((n, z) => n + z.voelker.length, 0);
  const jahre = [...new Set([String(new Date().getFullYear())]
    .concat(imker.honigernten.map(h => String(h.Datum).slice(0, 4)))
    .concat(honigVerkaeufe().map(r => String(r.Datum).slice(0, 4))))].filter(j => /^\d{4}$/.test(j)).sort().reverse();
  const h = honigAuswertung(auswertung.honigJahr);
  const knopf = (id, text, farbe = 'bg-gray-700') => `<button type="button" id="${id}" class="${farbe} text-white px-3 py-3 rounded-lg text-sm">${text}</button>`;
  const kachel = (label, wert, sub = '') => `<div class="bg-gray-50 rounded-lg p-3"><div class="text-xs text-gray-400">${label}</div><div class="font-bold text-lg">${wert}</div>${sub ? `<div class="text-xs text-gray-500">${sub}</div>` : ''}</div>`;

  container.innerHTML = [
    auswertungKarte('💊 Behandlungen exportieren', `
      <div class="grid grid-cols-2 gap-2">
        <label class="text-sm text-gray-600">Von<input type="date" id="awVon" value="${esc(auswertung.von)}" class="w-full border rounded px-3 py-2"></label>
        <label class="text-sm text-gray-600">Bis<input type="date" id="awBis" value="${esc(bis)}" class="w-full border rounded px-3 py-2"></label>
        <label class="text-sm text-gray-600 col-span-2">Bienenstand
          <select id="awStand" class="w-full border rounded px-3 py-2"><option value="">alle Bienenstände</option>
            ${imker.bienenstaende.map(s => `<option value="${s.ID}" ${auswertung.stand === s.ID ? 'selected' : ''}>${esc(s.Name)}${s.Aktiv === false ? ' (aufgelassen)' : ''}</option>`).join('')}
          </select></label>
      </div>
      <p class="text-sm text-gray-600"><b>${behandlungen.length}</b> Behandlungen im gewählten Zeitraum.</p>
      <div class="grid grid-cols-2 gap-2">${knopf('awBehDruck', '🖨️ Drucken / PDF', 'bg-green-700')}${knopf('awBehCsv', '⬇️ CSV (Excel)')}</div>
      <p class="text-xs text-gray-400">Der Bienenstand ergibt sich aus dem Standort des Volkes am Behandlungstag. Die Spalten sind vorläufig und lassen sich leicht anpassen.</p>`),

    auswertungKarte('📅 Aktive Völker zum Stichtag', `
      <label class="text-sm text-gray-600 block">Stichtag<input type="date" id="awStichtag" value="${esc(stichtag)}" class="w-full border rounded px-3 py-2"></label>
      <table class="min-w-full text-sm"><thead><tr class="text-left text-gray-500 border-b"><th class="py-2 pr-4">Bienenstand</th><th class="py-2 pr-4">Völker</th><th class="py-2">Nummern</th></tr></thead>
        <tbody>${stichtagListe.map(z => `<tr class="border-b"><td class="py-2 pr-4">${esc(z.name)}</td><td class="py-2 pr-4 font-semibold">${z.voelker.length}</td><td class="py-2 text-gray-500">${z.voelker.map(v => esc(v.Nummer)).join(', ')}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td class="py-2 pr-4 font-bold">Gesamt</td><td class="py-2 font-bold">${stichtagSumme}</td><td></td></tr></tfoot></table>
      <div class="grid grid-cols-2 gap-2">${knopf('awStDruck', '🖨️ Drucken / PDF', 'bg-green-700')}${knopf('awStCsv', '⬇️ CSV (Excel)')}</div>
      <p class="text-xs text-gray-400">Gezählt werden Völker mit Zugang bis zum Stichtag und ohne Abgang bis dahin, am Standort dieses Tages.</p>`),

    auswertungKarte('🍯 Honig', `
      <div class="flex items-center gap-2 flex-wrap">
        <label class="text-sm text-gray-600">Jahr <select id="awHonigJahr" class="border rounded px-3 py-2">${jahre.map(j => `<option ${String(auswertung.honigJahr) === j ? 'selected' : ''}>${j}</option>`).join('')}</select></label>
        <button type="button" id="awHonigVerkauf" class="ml-auto bg-amber-500 text-white px-3 py-2 rounded-lg text-sm font-medium">+ Honig verkaufen</button>
      </div>
      <div class="grid grid-cols-2 gap-2">
        ${kachel('Geerntet', `${zahl(h.geerntetKg)} kg`, `${h.ernten.length} Ernten`)}
        ${kachel('Verkauft', `${zahl(h.verkauftKg)} kg`, h.andereEinheiten ? `+ ${h.andereEinheiten} Verkäufe in anderer Einheit` : `${h.verkaeufe.length} Verkäufe`)}
        ${kachel('Erlös', euro(h.erloes), h.preisKg !== null ? `Ø ${euro(h.preisKg)} / kg` : '')}
        ${kachel('Auf Lager', `${zahl(h.lagerKg)} kg`, 'rechnerisch, alle Jahre')}
      </div>
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div><div class="font-semibold mb-1">Je Bienenstand</div>${h.proStand.map(s => `<div class="flex justify-between border-b py-1"><span>${esc(s.name)}</span><b>${zahl(s.kg)} kg</b></div>`).join('') || '<p class="text-gray-400">–</p>'}</div>
        <div><div class="font-semibold mb-1">Je Volk</div>${h.proVolk.map(v => `<div class="flex justify-between border-b py-1"><span>${esc(v.volk ? volkLabel(v.volk) : '?')}</span><b>${v.geschaetzt ? '≈ ' : ''}${zahl(v.kg)} kg</b></div>`).join('') || '<p class="text-gray-400">–</p>'}</div>
      </div>
      ${h.proVolk.some(v => v.geschaetzt) ? '<p class="text-xs text-gray-400">≈ = gemeinsame Ernte ohne Menge je Volk, gleichmäßig aufgeteilt.</p>' : ''}
      <div class="font-semibold">Ernten</div><div id="awErnten" class="overflow-x-auto"></div>
      <div class="font-semibold">Verkäufe</div><div id="awVerkaeufe" class="overflow-x-auto"></div>
      <div class="grid grid-cols-1">${knopf('awHonigDruck', '🖨️ Honig-Übersicht drucken / PDF', 'bg-green-700')}</div>`)
  ].join('');

  renderTable(document.getElementById('awErnten'), [
    { label: 'Datum', format: r => fmtDate(r.Datum) }, { label: 'Sorte', format: r => esc(r.Sorte) },
    { label: 'kg', format: r => zahl(r.MengeKg) }, { label: 'Los', format: r => esc(r.Losnummer) },
    { label: 'Völker', format: r => imker.honigerntevoelker.filter(hv => hv.HonigernteID === r.ID).map(hv => esc((volkById(hv.VolkID) || {}).Nummer || '?')).join(', ') }
  ], h.ernten, { onRowClick: (row) => openHonigernteModal({ initial: row }) });
  renderTable(document.getElementById('awVerkaeufe'), [
    { label: 'Datum', format: r => fmtDate(r.Datum) }, { label: 'Menge', format: r => mengeMitPreis(r) },
    { label: 'Erlös', format: r => euro(r.Erloes) }, { label: 'Beschreibung', format: r => esc(r.Beschreibung) }
  ], h.verkaeufe, { onRowClick: (row) => openErntevermarktungBearbeitenModal(row, async () => { imkerNeuZeichnen(); }) });

  const bei = (id, ereignis, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ereignis, fn); };
  bei('awVon', 'change', e => { auswertung.von = e.target.value; renderImkerAuswertung(); });
  bei('awBis', 'change', e => { auswertung.bis = e.target.value; renderImkerAuswertung(); });
  bei('awStand', 'change', e => { auswertung.stand = e.target.value; renderImkerAuswertung(); });
  bei('awStichtag', 'change', e => { auswertung.stichtag = e.target.value; renderImkerAuswertung(); });
  bei('awHonigJahr', 'change', e => { auswertung.honigJahr = e.target.value; renderImkerAuswertung(); });
  bei('awBehDruck', 'click', () => exportBehandlungen('druck'));
  bei('awBehCsv', 'click', () => exportBehandlungen('csv'));
  bei('awStDruck', 'click', () => exportStichtag('druck'));
  bei('awStCsv', 'click', () => exportStichtag('csv'));
  bei('awHonigDruck', 'click', () => exportHonig());
  bei('awHonigVerkauf', 'click', () => openHonigVerkauf());
}

// ============================================================================
// QR-CODES: jedes Volk hat einen eigenen Code (voelker.qr_code). Der QR-Code
// enthält einen Link auf die App mit ?volk=CODE - nach dem Scannen (und ggf.
// Anmelden) öffnet sich direkt die Stockkarte.
// ============================================================================
const QR_ZIEL_KEY = 'imker_qr_ziel';

// Beim Laden der Seite den Code aus dem Link merken - auch über die Google-Anmeldung
// hinweg (die leitet ohne ?volk=... zurück), danach den Link wieder "sauber" machen.
(function merkeQrZiel() {
  const code = new URLSearchParams(location.search).get('volk');
  if (!code) return;
  try { localStorage.setItem(QR_ZIEL_KEY, code); } catch (e) { /* egal */ }
  history.replaceState(null, '', location.pathname + location.hash);
})();

// Wird nach der Anmeldung aufgerufen (onSignedIn in app.js)
async function imkerQrZielOeffnen() {
  let code = null;
  try { code = localStorage.getItem(QR_ZIEL_KEY); localStorage.removeItem(QR_ZIEL_KEY); } catch (e) { /* egal */ }
  if (!code) return;
  await ladeImkerDaten();
  const volk = imker.voelker.find(v => istSichtbar(v) && String(v.QRCode).toUpperCase() === code.trim().toUpperCase());
  if (!volk) { toast(`Zum QR-Code „${code}“ gibt es kein Volk (Etikett ersetzt?).`, true); return; }
  await showSection('imkerei');
  await openStockkarte(volk.ID);
}

function volkLink(volk) {
  return `${location.origin}${location.pathname}?volk=${encodeURIComponent(volk.QRCode)}`;
}

function qrSvg(text) {
  if (typeof qrcode === 'undefined') {
    return '<div class="text-xs text-red-600 p-2">QR-Code kann gerade nicht erzeugt werden (Internetverbindung nötig).</div>';
  }
  const qr = qrcode(0, 'M'); // Typ automatisch, Fehlerkorrektur M (~15 % dürfen verschmutzt sein)
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 8, scalable: true });
}

function neuerQrCode() {
  const vorhandene = new Set(imker.voelker.map(v => String(v.QRCode).toUpperCase()));
  let code;
  do {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    code = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  } while (vorhandene.has(code));
  return code;
}

function qrBereichHtml(volk) {
  return `<details class="bg-gray-50 rounded-xl p-3">
    <summary class="font-semibold cursor-pointer">🏷️ QR-Code &amp; Etikett</summary>
    <div class="flex items-center gap-4 mt-3 flex-wrap">
      <div class="bg-white rounded-lg border p-1 shrink-0" style="width:136px;height:136px">${qrSvg(volkLink(volk)).replace('<svg ', '<svg style="width:100%;height:100%" ')}</div>
      <div class="space-y-2 text-sm min-w-0">
        <div>Code: <b class="font-mono">${esc(volk.QRCode)}</b></div>
        <div class="text-xs text-gray-500">Scannen öffnet diese Stockkarte.</div>
        <div class="flex gap-2 flex-wrap">
          <button type="button" id="skQrDruck" class="bg-green-700 text-white px-3 py-2 rounded text-sm">🖨️ Etikett drucken</button>
          <button type="button" id="skQrNeu" class="bg-white border px-3 py-2 rounded text-sm">Neuen Code vergeben</button>
        </div>
      </div>
    </div>
  </details>`;
}

function qrBereichVerbinden(volk) {
  const druck = document.getElementById('skQrDruck');
  if (druck) druck.onclick = () => druckeQrEtiketten([volk], `QR-Etikett ${volkLabel(volk)}`);
  const neu = document.getElementById('skQrNeu');
  if (neu) neu.onclick = async () => {
    if (!confirm('Neuen QR-Code vergeben? Das bisherige Etikett dieses Volkes funktioniert danach nicht mehr.')) return;
    try {
      await imkerSpeichern('voelker', { QRCode: neuerQrCode() }, volk.ID);
      toast('Neuer QR-Code vergeben - bitte neues Etikett drucken.');
    } catch (e) {
      toast(e.message, true);
    }
    imkerNeuZeichnen();
  };
}

function qrEtikettHtml(volk) {
  const b = state.betrieb || {};
  return `<div class="qr-etikett">
    <div class="qr-bild">${qrSvg(volkLink(volk))}</div>
    <div class="qr-nr">${esc(volkLabel(volk))}</div>
    <div class="qr-info">${esc(standName(volk.BienenstandID))}${b.HofName ? ' · ' + esc(b.HofName) : ''}</div>
    <div class="qr-code">${esc(volk.QRCode)}</div>
  </div>`;
}

function druckeQrEtiketten(voelker, titel) {
  if (!voelker.length) { toast('Keine aktiven Völker für Etiketten.', true); return; }
  if (typeof qrcode === 'undefined') { toast('QR-Codes brauchen eine Internetverbindung - bitte später nochmal versuchen.', true); return; }
  drucken(`<style>
      #druckBereich .qr-raster { display: grid; grid-template-columns: repeat(3, 1fr); }
      #druckBereich .qr-etikett { border: 1px dashed #999; padding: 4mm; text-align: center; break-inside: avoid; page-break-inside: avoid; }
      #druckBereich .qr-bild svg { width: 42mm; height: 42mm; }
      #druckBereich .qr-nr { font-size: 14pt; font-weight: bold; margin-top: 1mm; }
      #druckBereich .qr-info { font-size: 8pt; color: #444; }
      #druckBereich .qr-code { font-family: monospace; font-size: 8pt; color: #666; }
    </style>
    <h1>${esc(titel)}</h1>
    <div class="dk-meta">Entlang der gestrichelten Linien ausschneiden. Wetterfest: laminieren oder mit Klebefolie überziehen.</div>
    <div class="qr-raster">${voelker.map(qrEtikettHtml).join('')}</div>`);
}

// ============================================================================
// SPRACHEINGABE OHNE KI: Text aus der Diktierfunktion des Geräts (Mikrofon auf
// der Tastatur) wird hier per Stichwörtern in die Durchsicht-Felder übertragen.
// Kostenlos, ohne Internet. Was nicht erkannt wird, landet in der Notiz.
// Stichwörter erweitern: einfach die Listen unten ergänzen.
// ============================================================================
const DIKTAT_ZAHLEN = {
  null: 0, kein: 0, keine: 0, keinen: 0, ein: 1, eine: 1, einen: 1, eins: 1, zwei: 2, zwo: 2, drei: 3, vier: 4,
  'fünf': 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, 'zwölf': 12, zwoelf: 12,
  dreizehn: 13, vierzehn: 14, 'fünfzehn': 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19, zwanzig: 20,
  halb: 0.5, halbe: 0.5, anderthalb: 1.5, eineinhalb: 1.5
};
const DIKTAT_ZAEHLFELDER = [
  { feld: 'Brutwaben', woerter: ['brutwaben', 'brutwabe', 'brut', 'bw'] },
  { feld: 'Futterwaben', woerter: ['futterwaben', 'futterwabe', 'fw'] },
  { feld: 'Weiselzellen', woerter: ['weiselzellen', 'weiselzelle', 'schwarmzellen', 'schwarmzelle', 'nachschaffungszellen', 'wz'] },
  { feld: 'Volksstaerke', woerter: ['volksstärke', 'stärke', 'staerke', 'volksstaerke'] }
];
const DIKTAT_KOENIGIN = ['königin', 'koenigin', 'weisel'];
const DIKTAT_STIFTE = ['stifte', 'stift', 'eier', 'eierchen'];
const DIKTAT_NEIN = ['nicht', 'kein', 'keine', 'keinen', 'ohne'];
const DIKTAT_SANFTMUT_WOERTER = { stechlustig: 1, stechfreudig: 1, aggressiv: 1, 'böse': 1, boese: 1, giftig: 1, 'nervös': 2, nervoes: 2, unruhig: 2, sanft: 3, ruhig: 3, friedlich: 3, brav: 3 };
// Füllwörter, die nicht in die Notiz sollen
const DIKTAT_FUELLWOERTER = new Set(['und', 'mit', 'ist', 'sind', 'hat', 'haben', 'es', 'das', 'der', 'die', 'den', 'gesehen', 'gefunden', 'da', 'ja', 'wurde', 'wurden', 'war',
  'sehr', 'bei', 'im', 'in', 'noch', 'auch', 'ca', 'circa', 'etwa', 'ungefähr', 'waben', 'wabe', 'von', 'auf', 'nummer', 'volk']);

function diktatZahl(tok) {
  if (tok === undefined) return null;
  if (/^\d+(\.\d+)?$/.test(tok)) return Number(tok);
  if (tok in DIKTAT_ZAHLEN) return DIKTAT_ZAHLEN[tok];
  const m = tok.match(/^(.+?)einhalb$/); // "sechseinhalb"
  if (m && m[1] in DIKTAT_ZAHLEN) return DIKTAT_ZAHLEN[m[1]] + 0.5;
  return null;
}

function diktatNormalisieren(text) {
  return String(text || '').toLowerCase()
    .replace(/(\d),(\d)/g, '$1.$2')            // 6,5 -> 6.5
    .replace(/[„“"'!?;:,()]/g, ' ')
    .replace(/\.(?!\d)/g, ' ')                 // Satzpunkte weg, Dezimalpunkte bleiben
    .replace(/\b(\S+)\s+einhalb\b/g, '$1einhalb') // "sieben einhalb" -> "siebeneinhalb"
    .replace(/\beine?\s+halbe\b/g, 'halbe')
    .split(/\s+/).filter(Boolean);
}

// Wertet einen Abschnitt (Tokens) aus -> { werte, rest }
function diktatAbschnitt(tokens) {
  const werte = {};
  const benutzt = new Set();
  const nimm = (...idx) => idx.forEach(i => benutzt.add(i));
  // Verneinung: "keine Königin", "keine der Stifte" (davor) bzw. "Königin nicht gesehen" (danach).
  // Ein "keine" danach gehört schon zum nächsten Stichwort ("Königin gesehen, keine Stifte").
  const verneinungsTokens = (i) => {
    const idx = [];
    if (DIKTAT_NEIN.includes(tokens[i - 1])) idx.push(i - 1);
    else if (['die', 'der'].includes(tokens[i - 1]) && DIKTAT_NEIN.includes(tokens[i - 2])) idx.push(i - 2, i - 1);
    if (tokens[i + 1] === 'nicht') idx.push(i + 1);
    else if (tokens[i + 2] === 'nicht' && ['wurde', 'wurden', 'war', 'ist', 'sind'].includes(tokens[i + 1])) idx.push(i + 1, i + 2);
    return idx;
  };
  const jaNeinFeld = (feld, i) => {
    const nein = verneinungsTokens(i);
    werte[feld] = nein.length === 0;
    nimm(i, ...nein);
    // "gesehen"/"da" direkt dahinter (auch nach "nicht") gehört dazu
    const nach = Math.max(i, ...nein) + 1;
    if (['gesehen', 'da', 'gefunden'].includes(tokens[nach])) nimm(nach);
  };

  tokens.forEach((tok, i) => {
    // Zählfelder: Zahl davor ("sieben Brutwaben") oder danach ("Stärke acht", "Stärke ist acht")
    const zf = DIKTAT_ZAEHLFELDER.find(z => z.woerter.includes(tok));
    if (zf) {
      // eine schon vergebene Zahl ("Brutwaben 5 Futterwaben 2") nicht doppelt verwenden
      let zahl = benutzt.has(i - 1) ? null : diktatZahl(tokens[i - 1]);
      if (zahl !== null) { nimm(i, i - 1); }
      else if ((zahl = diktatZahl(tokens[i + 1])) !== null) { nimm(i, i + 1); }
      else if (['ist', 'von', 'mit'].includes(tokens[i + 1]) && (zahl = diktatZahl(tokens[i + 2])) !== null) { nimm(i, i + 1, i + 2); }
      if (zahl !== null) werte[zf.feld] = zahl;
      return;
    }
    if (DIKTAT_KOENIGIN.includes(tok)) { jaNeinFeld('KoeniginGesehen', i); return; }
    if (DIKTAT_STIFTE.includes(tok)) { jaNeinFeld('Stifte', i); return; }
    if (tok === 'sanftmut') {
      let zahl = diktatZahl(tokens[i + 1]);
      if (zahl !== null) nimm(i, i + 1);
      else if ((zahl = diktatZahl(tokens[i - 1])) !== null) nimm(i, i - 1);
      if (zahl !== null && zahl >= 1 && zahl <= 4) werte.Sanftmut = Math.round(zahl);
      return;
    }
    if (tok in DIKTAT_SANFTMUT_WOERTER) {
      let wert = DIKTAT_SANFTMUT_WOERTER[tok];
      if (tok === 'sanft' && tokens[i - 1] === 'sehr') { wert = 4; nimm(i - 1); }
      if (wert === 3 && tokens[i - 1] === 'nicht') { wert = 2; nimm(i - 1); }
      werte.Sanftmut = wert;
      nimm(i);
    }
  });

  const rest = tokens.filter((t, i) => !benutzt.has(i) && !DIKTAT_FUELLWOERTER.has(t) && diktatZahl(t) === null);
  return { werte, rest };
}

// Ganzer Text -> Abschnitte je Volk ("Volk 3 ... Volk 4 ...")
function diktatAuswerten(text) {
  const tokens = diktatNormalisieren(text);
  const abschnitte = [];
  let aktuell = { volkNummer: null, tokens: [] };
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === 'volk') {
      let j = i + 1;
      if (tokens[j] === 'nummer') j++;
      const nr = diktatZahl(tokens[j]);
      const nrText = nr !== null ? String(nr) : (tokens[j] && /^[\w-]+$/.test(tokens[j]) ? tokens[j] : null);
      if (nrText !== null) {
        if (aktuell.tokens.length || aktuell.volkNummer !== null) abschnitte.push(aktuell);
        aktuell = { volkNummer: nrText, tokens: [] };
        i = j;
        continue;
      }
    }
    aktuell.tokens.push(tokens[i]);
  }
  abschnitte.push(aktuell);
  return abschnitte.filter(a => a.tokens.length || a.volkNummer !== null)
    .map(a => ({ volkNummer: a.volkNummer, ...diktatAbschnitt(a.tokens) }));
}

const DIKTAT_FELDNAMEN = { Brutwaben: 'Brutwaben', Futterwaben: 'Futterwaben', Weiselzellen: 'Weiselzellen', Volksstaerke: 'Stärke', Sanftmut: 'Sanftmut' };

function diktatWerteText(werte) {
  return Object.entries(werte).map(([f, w]) => {
    if (f === 'KoeniginGesehen') return w ? 'Königin gesehen' : 'Königin nicht gesehen';
    if (f === 'Stifte') return w ? 'Stifte' : 'keine Stifte';
    return `${DIKTAT_FELDNAMEN[f]} ${zahl(w)}`;
  }).join(' · ');
}

// Überträgt das Diktat in die laufende Durchsicht (ds) und liefert eine Rückmeldung
function diktatUebernehmen(text) {
  const abschnitte = diktatAuswerten(text);
  const meldungen = [];
  let zielIdx = ds.idx;
  abschnitte.forEach(a => {
    let idx = ds.idx;
    if (a.volkNummer !== null) {
      idx = ds.voelker.findIndex(id => String((volkById(id) || {}).Nummer).toLowerCase() === a.volkNummer);
      if (idx === -1) { meldungen.push(`⚠️ Volk ${a.volkNummer} ist in dieser Durchsicht nicht ausgewählt – nicht übernommen.`); return; }
      zielIdx = idx;
    }
    const volkId = ds.voelker[idx];
    const w = ds.werte[volkId];
    Object.assign(w, a.werte);
    if (a.rest.length) w.Notiz = [w.Notiz, a.rest.join(' ')].filter(Boolean).join(' · ');
    const erkannt = diktatWerteText(a.werte);
    meldungen.push(`${volkLabel(volkById(volkId))}: ${erkannt || 'nichts erkannt'}${a.rest.length ? ` · in die Notiz: „${a.rest.join(' ')}“` : ''}`);
  });
  ds.idx = zielIdx;
  return meldungen.join('<br>');
}

// ============================================================================
// MATERIAL & EINKAUFSLISTE (Reiter "Material")
// Bestand je Artikel; was knapp ist (unter Mindestbestand) oder von Hand
// vorgemerkt wurde, steht auf der Einkaufsliste. "Gekauft" erhöht den Bestand
// und kann den Einkauf als Kosten (Kategorie Imkerei) in den Finanzen buchen.
// Bewusst nicht im Voll-Sync: fehlt die Tabelle noch, betrifft das nur diesen Reiter.
// ============================================================================
const MATERIAL_KATEGORIEN = ['Futter', 'Behandlungsmittel', 'Geräte', 'Beuten & Zubehör', 'Kleinteile', 'Gläser & Verpackung', 'Schutzkleidung', 'Sonstiges'];
const MATERIAL_VORSCHLAEGE = [
  'Invertzuckersirup', 'Futterteig', 'Zucker',
  'Ameisensäure 60 %', 'Oxalsäure', 'Milchsäure', 'Thymol',
  'Honigschleuder', 'Entdeckelungsgabel', 'Stockmeißel', 'Smoker', 'Abfüllkübel', 'Honigsieb', 'Refraktometer',
  'Rähmchen', 'Mittelwände', 'Absperrgitter', 'Zarge', 'Futterzarge', 'Gemüllwindel', 'Bienenflucht',
  'Abstandshalter', 'Draht', 'Zeichenplättchen',
  'Honigglas 500 g', 'Honigglas 250 g', 'Deckel', 'Etiketten',
  'Imkerjacke', 'Schleier', 'Handschuhe'
];
const MATERIAL_EINHEITEN = ['Stück', 'kg', 'Liter', 'Packung', 'Karton'];
const MATERIAL_ICONS = { Futter: '🥣', Behandlungsmittel: '💊', 'Geräte': '🛠️', 'Beuten & Zubehör': '📦', Kleinteile: '🔩', 'Gläser & Verpackung': '🫙', Schutzkleidung: '🧤', Sonstiges: '📌' };

function materialListe() {
  return (listCache['imkermaterial.list'] || []).filter(m => m.Aktiv !== false);
}

function istKnapp(m) {
  return m.MindestBestand !== '' && m.MindestBestand !== undefined && Number(m.MengeVorhanden || 0) < Number(m.MindestBestand);
}

function einkaufsliste() {
  return materialListe().filter(m => m.AufEinkaufsliste === true || istKnapp(m))
    .sort((a, b) => MATERIAL_KATEGORIEN.indexOf(a.Kategorie) - MATERIAL_KATEGORIEN.indexOf(b.Kategorie) || String(a.Bezeichnung).localeCompare(String(b.Bezeichnung), 'de'));
}

// Wie viel kaufen? Vorgemerkte Menge, sonst bis zum Mindestbestand auffüllen
function kaufMenge(m) {
  if (m.EinkaufMenge !== '' && m.EinkaufMenge !== undefined) return Number(m.EinkaufMenge);
  if (istKnapp(m)) return Number(m.MindestBestand) - Number(m.MengeVorhanden || 0);
  return '';
}

function bestandText(m) {
  const menge = m.MengeVorhanden === '' ? '–' : zahl(m.MengeVorhanden, 2);
  return `${menge} ${esc(m.Einheit || '')}`.trim() + (m.MindestBestand !== '' ? ` <span class="text-gray-400">/ min ${zahl(m.MindestBestand, 2)}</span>` : '');
}

// Lädt die Materialliste einmal pro Sitzung - still, ohne Fehlermeldung (fehlt die
// Tabelle noch, zeigt der Reiter selbst einen Hinweis). true = Daten vorhanden.
let _materialGeladen = false;
async function ladeMaterialStill() {
  if (_materialGeladen) return true;
  try {
    listCache['imkermaterial.list'] = await Api.call('imkermaterial.list');
    persistCacheDebounced();
    _materialGeladen = true;
  } catch (e) { /* Tabelle fehlt oder offline - vorhandener Stand bleibt */ }
  return _materialGeladen || 'imkermaterial.list' in listCache;
}

async function renderImkerMaterial() {
  const container = document.getElementById('imkerMaterial');
  if (!container) return;
  if (!(await ladeMaterialStill())) {
    container.innerHTML = `<div class="bg-amber-50 border border-amber-300 rounded-xl p-4 text-sm text-amber-900 xl:col-span-2">
      Der Bereich Material ist in der Datenbank noch nicht eingerichtet. Bitte <b>backend/NACHTRAG_IMKER_MATERIAL.sql</b>
      im Supabase SQL Editor ausführen und danach „Aktualisieren“ tippen.</div>`;
    return;
  }
  const liste = einkaufsliste();
  const alle = materialListe();
  const badge = document.getElementById('imkerMaterialBadge');
  if (badge) badge.innerHTML = liste.length ? `<span class="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">🛒 ${liste.length}</span>` : '';

  const einkaufZeile = (m) => {
    const menge = kaufMenge(m);
    return `<div class="flex items-center gap-3 py-2">
      <button type="button" data-id="${m.ID}" class="btn-mat-gekauft w-12 h-12 shrink-0 rounded-xl border-2 border-gray-300 hover:border-green-600 text-xl text-transparent hover:text-green-600" aria-label="gekauft">✓</button>
      <div class="flex-1 min-w-0">
        <div class="font-medium">${MATERIAL_ICONS[m.Kategorie] || '📌'} ${esc(m.Bezeichnung)}${menge !== '' ? ` <span class="text-amber-800">· ${zahl(menge, 2)} ${esc(m.Einheit || '')}</span>` : ''}</div>
        <div class="text-xs text-gray-500">${istKnapp(m) ? '⚠️ knapp · ' : ''}Bestand ${bestandText(m)}${m.Bezugsquelle ? ' · ' + esc(m.Bezugsquelle) : ''}${m.Preis !== '' ? ` · zuletzt ${euro(m.Preis)}/${esc(m.Einheit || 'Einheit')}` : ''}</div>
      </div>
      ${m.AufEinkaufsliste === true && !istKnapp(m) ? `<button type="button" data-id="${m.ID}" class="btn-mat-runter text-gray-400 hover:text-red-600 px-2 text-lg" aria-label="von der Liste nehmen">✕</button>` : ''}
    </div>`;
  };

  const gruppen = MATERIAL_KATEGORIEN.map(k => ({ k, artikel: alle.filter(m => (m.Kategorie || 'Sonstiges') === k).sort((a, b) => String(a.Bezeichnung).localeCompare(String(b.Bezeichnung), 'de')) }))
    .filter(g => g.artikel.length);

  container.innerHTML = `
    <div class="bg-white rounded-xl shadow p-4 space-y-2 min-w-0">
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <h3 class="font-semibold">🛒 Einkaufsliste</h3>
        ${liste.length ? '<button type="button" id="btnMatListeDruck" class="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded">🖨️ Drucken / teilen</button>' : ''}
      </div>
      <div class="divide-y">${liste.map(einkaufZeile).join('') || '<p class="text-sm text-gray-400 py-2">Nichts zu kaufen. 🎉</p>'}</div>
      <p class="text-xs text-gray-400">Auf der Liste steht, was du vormerkst (🛒) oder was unter den Mindestbestand fällt. ✓ = gekauft: Bestand wird erhöht, auf Wunsch als Kosten gebucht.</p>
    </div>
    <div class="bg-white rounded-xl shadow p-4 space-y-3 min-w-0">
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <h3 class="font-semibold">📦 Material &amp; Bestand</h3>
        <button type="button" id="btnMatNeu" class="bg-green-700 text-white px-3 py-2 rounded text-sm">+ Artikel</button>
      </div>
      ${gruppen.map(g => `<div>
        <div class="text-sm font-semibold text-gray-600 mb-1">${MATERIAL_ICONS[g.k] || ''} ${esc(g.k)}</div>
        <div class="divide-y">${g.artikel.map(m => `<div class="flex items-center gap-2 py-2">
          <button type="button" data-id="${m.ID}" class="btn-mat-edit flex-1 min-w-0 text-left">
            <span class="block font-medium ${istKnapp(m) ? 'text-red-700' : ''}">${esc(m.Bezeichnung)}</span>
            <span class="block text-xs text-gray-500">${bestandText(m)}</span>
          </button>
          <button type="button" data-id="${m.ID}" data-d="-1" class="btn-mat-menge w-10 h-10 rounded-lg bg-gray-100 text-xl font-bold" aria-label="weniger">−</button>
          <button type="button" data-id="${m.ID}" data-d="1" class="btn-mat-menge w-10 h-10 rounded-lg bg-gray-100 text-xl font-bold" aria-label="mehr">+</button>
          <button type="button" data-id="${m.ID}" class="btn-mat-liste w-10 h-10 rounded-lg text-lg ${m.AufEinkaufsliste === true ? 'bg-amber-500' : 'bg-gray-100 grayscale opacity-50'}" aria-label="auf die Einkaufsliste" aria-pressed="${m.AufEinkaufsliste === true}">🛒</button>
        </div>`).join('')}</div>
      </div>`).join('') || '<p class="text-sm text-gray-400">Noch keine Artikel. Lege an, was du regelmäßig brauchst – z. B. Futter, Behandlungsmittel, Rähmchen, Gläser.</p>'}
    </div>`;

  const finde = id => materialListe().find(m => m.ID === id);
  const neu = document.getElementById('btnMatNeu');
  if (neu) neu.onclick = () => openMaterialModal();
  const druck = document.getElementById('btnMatListeDruck');
  if (druck) druck.onclick = () => drucken(druckKopf('Einkaufsliste Imkerei', []) + druckTabelle(['', 'Artikel', 'Menge', 'Kategorie', 'Bezugsquelle'],
    liste.map(m => ['☐', m.Bezeichnung, kaufMenge(m) !== '' ? `${zahl(kaufMenge(m), 2)} ${m.Einheit || ''}` : '', m.Kategorie, m.Bezugsquelle])));
  container.querySelectorAll('.btn-mat-edit').forEach(b => b.onclick = () => openMaterialModal(finde(b.dataset.id)));
  container.querySelectorAll('.btn-mat-gekauft').forEach(b => b.onclick = () => openMaterialGekauftModal(finde(b.dataset.id)));
  const aendern = async (id, payload) => {
    try { await imkerSpeichern('imkermaterial', payload, id); } catch (e) { toast(e.message, true); }
    renderImkerMaterial();
  };
  container.querySelectorAll('.btn-mat-runter').forEach(b => b.onclick = () => aendern(b.dataset.id, { AufEinkaufsliste: false, EinkaufMenge: '' }));
  container.querySelectorAll('.btn-mat-liste').forEach(b => b.onclick = () => {
    const m = finde(b.dataset.id);
    aendern(m.ID, { AufEinkaufsliste: m.AufEinkaufsliste !== true });
  });
  container.querySelectorAll('.btn-mat-menge').forEach(b => b.onclick = () => {
    const m = finde(b.dataset.id);
    aendern(m.ID, { MengeVorhanden: Math.max(0, Number(m.MengeVorhanden || 0) + Number(b.dataset.d)) });
  });
}

function openMaterialModal(initial = {}) {
  const bearbeiten = !!initial.ID;
  openFormModal({
    title: bearbeiten ? `${initial.Bezeichnung} bearbeiten` : 'Neuer Artikel',
    fields: [
      { key: 'Kategorie', label: 'Kategorie', type: 'select', options: MATERIAL_KATEGORIEN },
      { key: 'Bezeichnung', label: 'Bezeichnung', required: true, suggestions: MATERIAL_VORSCHLAEGE },
      { key: 'MengeVorhanden', label: 'Bestand (vorhanden)', type: 'number', step: 'any' },
      { key: 'Einheit', label: 'Einheit', suggestions: MATERIAL_EINHEITEN },
      { key: 'MindestBestand', label: 'Mindestbestand (optional)', type: 'number', step: 'any', help: 'Fällt der Bestand darunter, kommt der Artikel automatisch auf die Einkaufsliste.' },
      { key: 'AufEinkaufsliste', label: 'Auf die Einkaufsliste setzen', type: 'checkbox' },
      { key: 'EinkaufMenge', label: 'Wie viel kaufen? (optional)', type: 'number', step: 'any' },
      { key: 'Bezugsquelle', label: 'Bezugsquelle', help: 'z. B. Imkereibedarf, Raiffeisen, Tierarzt' },
      { key: 'Preis', label: 'Preis je Einheit (€, zuletzt bezahlt)', type: 'number', step: '0.01' },
      { key: 'Notiz', label: 'Notiz', type: 'textarea' }
    ],
    initial: bearbeiten ? initial : { Kategorie: 'Futter', Einheit: 'Stück' },
    onSubmit: async (values) => {
      await imkerSpeichern('imkermaterial', values, initial.ID);
      toast(bearbeiten ? 'Artikel aktualisiert.' : 'Artikel angelegt.');
      renderImkerMaterial();
    },
    onDelete: bearbeiten && state.user.role === 'Admin' ? async () => {
      await imkerLoeschen('imkermaterial', initial.ID);
      toast('Artikel entfernt.');
      renderImkerMaterial();
    } : null
  });
}

function openMaterialGekauftModal(m) {
  const menge = kaufMenge(m);
  openFormModal({
    title: `Gekauft: ${m.Bezeichnung}`,
    fields: [
      { key: 'Datum', label: 'Datum', type: 'date', required: true },
      { key: 'Menge', label: `Gekaufte Menge (${m.Einheit || 'Einheit'})`, type: 'number', step: 'any', required: true },
      { key: 'Betrag', label: 'Bezahlt gesamt (€)', type: 'number', step: '0.01', help: 'Wird aus Menge × letztem Preis vorgeschlagen.' },
      { key: 'Bezugsquelle', label: 'Bezugsquelle' },
      { key: 'AlsKosten', label: 'Als Kosten in Finanzen buchen (Kategorie Imkerei)', type: 'checkbox' }
    ],
    initial: {
      Datum: heuteIso(), Menge: menge, Bezugsquelle: m.Bezugsquelle, AlsKosten: true,
      Betrag: menge !== '' && m.Preis !== '' ? (Number(menge) * Number(m.Preis)).toFixed(2) : ''
    },
    onSubmit: async (values) => {
      const gekauft = Number(values.Menge);
      if (!(gekauft > 0)) throw new Error('Bitte eine Menge angeben.');
      const betrag = values.Betrag === '' ? null : Number(values.Betrag);
      await imkerSpeichern('imkermaterial', {
        MengeVorhanden: Number(m.MengeVorhanden || 0) + gekauft,
        AufEinkaufsliste: false, EinkaufMenge: '',
        Bezugsquelle: values.Bezugsquelle || m.Bezugsquelle,
        ...(betrag !== null ? { Preis: (betrag / gekauft).toFixed(2) } : {})
      }, m.ID);
      if (values.AlsKosten && betrag) {
        const kosten = await Api.call('allgemeinekosten.create', {
          Datum: values.Datum, Kategorie: 'Imkerei', Betrag: betrag,
          Beschreibung: `Imkerei-Einkauf: ${m.Bezeichnung} (${zahl(gekauft, 2)} ${m.Einheit || ''})${values.Bezugsquelle ? ' – ' + values.Bezugsquelle : ''}`.replace(/\s+\)/, ')')
        });
        cacheUpsert('allgemeinekosten.list', kosten);
      }
      toast(values.AlsKosten && betrag ? 'Eingekauft und in den Finanzen gebucht.' : 'Eingekauft – Bestand erhöht.');
      renderImkerMaterial();
    }
  });
  // Betrag live aus Menge × letztem Preis vorschlagen
  if (m.Preis !== '') {
    document.getElementById('field_Menge').addEventListener('input', (e) => {
      const n = parseFloat(e.target.value);
      if (!isNaN(n)) document.getElementById('field_Betrag').value = (n * Number(m.Preis)).toFixed(2);
    });
  }
}

// ============================================================================
// WETTER AN DEN BIENENSTÄNDEN (Open-Meteo, kein API-Schlüssel nötig)
// Je Stand: aktuell + 5 Tage. "Durchsicht-Wetter" ist eine Faustregel -
// Schwellen hier anpassen:
// ============================================================================
const DURCHSICHT_WETTER = { minTempMax: 15, maxRegenWk: 40, maxRegenMm: 1, maxWindKmh: 25 };
const WETTER_CACHE_MIN = 30;
let _imkerWetter = { zeit: 0, daten: null, schluessel: '' };

function standKoordinaten(s) {
  const hat = s.Lat !== '' && s.Lng !== '' && s.Lat !== undefined && s.Lng !== undefined;
  return { lat: hat ? Number(s.Lat) : CONFIG.MAP_CENTER[0], lng: hat ? Number(s.Lng) : CONFIG.MAP_CENTER[1], geschaetzt: !hat };
}

function istDurchsichtWetter(tag) {
  const r = DURCHSICHT_WETTER;
  return tag.tMax !== null && tag.tMax >= r.minTempMax
    && (tag.regenWk === null || tag.regenWk <= r.maxRegenWk)
    && (tag.regenMm === null || tag.regenMm <= r.maxRegenMm)
    && (tag.windMax === null || tag.windMax <= r.maxWindKmh);
}

async function ladeStandWetter(staende) {
  const schluessel = staende.map(s => s.ID + standKoordinaten(s).lat + standKoordinaten(s).lng).join('|');
  if (_imkerWetter.daten && _imkerWetter.schluessel === schluessel && Date.now() - _imkerWetter.zeit < WETTER_CACHE_MIN * 60000) return _imkerWetter.daten;
  const ergebnis = await Promise.all(staende.map(async (s) => {
    const k = standKoordinaten(s);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${k.lat.toFixed(4)}&longitude=${k.lng.toFixed(4)}`
      + '&current=temperature_2m,weather_code,wind_speed_10m'
      + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max'
      + '&forecast_days=5&timezone=auto';
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      const d = await res.json();
      const wert = (feld, i) => (d.daily[feld] && d.daily[feld][i] !== null && d.daily[feld][i] !== undefined ? d.daily[feld][i] : null);
      return {
        stand: s, geschaetzt: k.geschaetzt,
        jetzt: d.current ? { temp: d.current.temperature_2m, code: d.current.weather_code, wind: d.current.wind_speed_10m } : null,
        tage: d.daily.time.map((datum, i) => ({
          datum, code: wert('weather_code', i), tMax: wert('temperature_2m_max', i), tMin: wert('temperature_2m_min', i),
          regenMm: wert('precipitation_sum', i), regenWk: wert('precipitation_probability_max', i), windMax: wert('wind_speed_10m_max', i)
        }))
      };
    } catch (e) {
      return { stand: s, fehler: true };
    }
  }));
  _imkerWetter = { zeit: Date.now(), daten: ergebnis, schluessel };
  return ergebnis;
}

async function renderImkerWetter() {
  const box = document.getElementById('imkerWetter');
  if (!box) return;
  const staende = aktiveStaende().sort((a, b) => String(a.Name).localeCompare(String(b.Name), 'de'));
  if (!staende.length) { box.innerHTML = ''; return; }
  if (!navigator.onLine) {
    box.innerHTML = '<div class="bg-white rounded-xl shadow p-4 text-sm text-gray-400">🌤️ Wetter: ohne Internetverbindung nicht verfügbar.</div>';
    return;
  }
  if (!_imkerWetter.daten) box.innerHTML = '<div class="bg-white rounded-xl shadow p-4 text-sm text-gray-400">🌤️ Wetter wird geladen …</div>';
  const daten = await ladeStandWetter(staende);
  const tagName = (datum, i) => (i === 0 ? 'Heute' : i === 1 ? 'Morgen' : new Date(datum).toLocaleDateString('de-DE', { weekday: 'short' }));
  const r = DURCHSICHT_WETTER;

  box.innerHTML = `<details class="bg-white rounded-xl shadow p-4" ${localStorage.getItem('imker_wetter_zu') === '1' ? '' : 'open'}>
    <summary class="font-semibold cursor-pointer">🌤️ Wetter an den Bienenständen</summary>
    <div class="space-y-4 mt-3">
      ${daten.map(w => {
        if (w.fehler) return `<div class="text-sm"><b>📍 ${esc(w.stand.Name)}</b> <span class="text-gray-400">– Wetterdienst nicht erreichbar</span></div>`;
        const guteTage = w.tage.filter(istDurchsichtWetter).length;
        return `<div>
          <div class="flex items-baseline justify-between gap-2 flex-wrap">
            <div class="font-semibold">📍 ${esc(w.stand.Name)}${w.geschaetzt ? ' <span class="text-xs font-normal text-gray-400">(keine Koordinaten – Wetter für Prettau)</span>' : ''}</div>
            ${w.jetzt ? `<div class="text-sm">${weatherIcon(w.jetzt.code)} <b>${Math.round(w.jetzt.temp)} °C</b> <span class="text-gray-500">· Wind ${Math.round(w.jetzt.wind)} km/h</span></div>` : ''}
          </div>
          <div class="grid grid-cols-5 gap-1 mt-2">
            ${w.tage.map((t, i) => {
              const gut = istDurchsichtWetter(t);
              return `<div class="rounded-lg p-1.5 text-center text-xs ${gut ? 'bg-amber-50 border border-amber-300' : 'bg-gray-50'}" title="${esc(weatherLabel(t.code))}">
                <div class="text-gray-500">${tagName(t.datum, i)}</div>
                <div class="text-xl leading-tight">${t.code !== null ? weatherIcon(t.code) : '–'}</div>
                <div><b>${t.tMax !== null ? Math.round(t.tMax) : '–'}°</b> <span class="text-gray-400">${t.tMin !== null ? Math.round(t.tMin) + '°' : ''}</span></div>
                <div class="text-gray-500">${t.regenMm !== null && t.regenMm >= 0.1 ? zahl(t.regenMm) + ' mm' : '&nbsp;'}</div>
                <div class="h-4">${gut ? '🐝' : ''}</div>
              </div>`;
            }).join('')}
          </div>
          <div class="text-xs text-gray-500 mt-1">${guteTage ? `🐝 ${guteTage} ${guteTage === 1 ? 'Tag' : 'Tage'} mit Durchsicht-Wetter` : 'Kein Durchsicht-Wetter in den nächsten 5 Tagen'}</div>
        </div>`;
      }).join('')}
      <p class="text-xs text-gray-400">🐝 = Faustregel fürs Öffnen der Völker: mindestens ${r.minTempMax} °C, Regen höchstens ${r.maxRegenMm} mm bzw. ${r.maxRegenWk} % Wahrscheinlichkeit, Wind bis ${r.maxWindKmh} km/h. Quelle: Open-Meteo.</p>
    </div>
  </details>`;
  // auf- oder zugeklappt merken
  box.querySelector('details').addEventListener('toggle', (e) => {
    try { localStorage.setItem('imker_wetter_zu', e.target.open ? '0' : '1'); } catch (err) { /* egal */ }
  });
}
