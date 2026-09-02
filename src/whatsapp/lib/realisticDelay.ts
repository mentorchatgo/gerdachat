// Instelling: "Realistische reactietijd".
// Aan => extra vertraging voor chatantwoorden (ca. 5-20s, afhankelijk van de
// lengte van het bericht) en voor het opnemen van (video)gesprekken (2-10s).

const STORAGE_KEY = "app_realisticResponseTime";

export function isRealisticDelayEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "1";
}

export function setRealisticDelayEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
}

/** Vertraging in ms voor een chatbericht, gebaseerd op de lengte. */
export function chatDelayMs(text: string): number {
  const len = (text || "").trim().length;
  // 0 tekens -> ~5s, 400+ tekens -> ~20s
  const ratio = Math.min(1, len / 400);
  const base = 5000 + ratio * 15000;
  const jitter = (Math.random() - 0.5) * 2000;
  return Math.max(5000, Math.min(20000, base + jitter));
}

/** Vertraging in ms voordat er wordt opgenomen bij (video)bellen. */
export function callPickupDelayMs(): number {
  return 2000 + Math.random() * 8000;
}

export function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
