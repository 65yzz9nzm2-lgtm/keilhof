// ============================================================================
// KONFIGURATION KEILHOF - hier trägst du deine eigenen Werte ein
// ============================================================================

const CONFIG = {
  // Name, der vor dem Login und als Standard in der Kopfzeile erscheint.
  // (Nach dem ersten Login kann er unter Einstellungen -> Betrieb geändert werden.)
  HOF_NAME: 'Keilhof',

  // Supabase-Projekt-URL und öffentlicher ("publishable") API-Key DEINES Projekts.
  // Zu finden in Supabase: Project Settings -> API (bzw. "API Keys").
  SUPABASE_URL: 'https://DEIN-PROJEKT.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_YqWlLwXBDoAqSPKEHhoFsg_GfWlwrJm',

  // Module ein-/ausschalten. Weinbau & Keller ist für den Keilhof deaktiviert.
  MODULE: {
    WEINBAU: false
  },

  // GeoServer-WMS der Autonomen Provinz Bozen (Kataster-Workspace).
  GEOSERVER_WMS_URL: 'https://geoservices5.civis.bz.it/geoserver/p_bz-Cadastre/ows',
  GEOSERVER_LAYER_VISUAL: 'WebRepresentation',   // Kataster-Grenzen als Kartenbild (GetMap)
  GEOSERVER_LAYER_INFO: 'ParcelsAggregate',      // Sachdaten je Parzelle (GetFeatureInfo, JSON)

  // Startposition der Karte: Prettau / Ahrntal
  MAP_CENTER: [47.0405, 12.1035],
  MAP_ZOOM: 15
};
