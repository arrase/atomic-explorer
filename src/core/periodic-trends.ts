export type MatterPhase = 'solid' | 'liquid' | 'gas' | 'unknown';

export const MIN_TEMPERATURE_K = 0;
export const MAX_TEMPERATURE_K = 6000;
export const DEFAULT_TEMPERATURE_K = 298;

/** Slider sentinel representing 'Antigüedad' (pre-modern antiquity, before numeric years). */
export const ANCIENT_DISCOVERY_SENTINEL = 1699;
export const MAX_DISCOVERY_YEAR = 2016;

export function kelvinToCelsius(tempK: number): number {
  return Math.round(tempK - 273.15);
}

export function getElementPhase(
  meltingK: number | null,
  boilingK: number | null,
  tempK: number
): MatterPhase {
  if (meltingK === null && boilingK === null) return 'unknown';
  if (boilingK !== null && tempK >= boilingK) return 'gas';
  if (meltingK !== null && tempK < meltingK) return 'solid';
  if (meltingK !== null && boilingK === null) return 'unknown';
  return 'liquid';
}

export function isAncientDiscovery(discoveryYear: number | string): discoveryYear is string {
  return typeof discoveryYear === 'string';
}

export function isElementDiscovered(discoveryYear: number | string, cutoffYear: number): boolean {
  if (isAncientDiscovery(discoveryYear)) return true;
  if (cutoffYear <= ANCIENT_DISCOVERY_SENTINEL) return false;
  return discoveryYear <= cutoffYear;
}
