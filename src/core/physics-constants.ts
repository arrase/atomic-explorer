/**
 * Physical constants and the closed-form results derived from them.
 *
 * These were previously spelled out at each use site, which meant the same
 * formula was maintained in three places and the Bohr conversion in four. They
 * are collected here so there is a single definition to check against CODATA and
 * a single place to update if it ever moves.
 */

/** Bohr radius a0 in picometres (CODATA 2018: a0 = 52.917721 pm). */
export const BOHR_RADIUS_PM = 52.9177210903;

/** Rydberg energy in electronvolts, E_∞ = R_∞ · h · c (CODATA 2018). */
export const RYDBERG_ENERGY_EV = 13.605693122994;

/** Angstrom in Bohr radii, for the molecular tab's unit note. */
export const ANGSTROM_IN_BOHR = 1.88972612546;

/**
 * Expectation value of the radius for a hydrogenic orbital, in Bohr radii.
 *
 * <r>_nl = (a0 / 2Z) · (3n² − l(l + 1))
 */
export function meanRadiusBohr(n: number, l: number, zEff: number): number {
  return (0.5 / zEff) * (3 * n * n - l * (l + 1));
}

/** The same expectation value, in picometres. */
export function meanRadiusPm(n: number, l: number, zEff: number): number {
  return meanRadiusBohr(n, l, zEff) * BOHR_RADIUS_PM;
}

/** Hydrogenic energy level in eV, E_n = −R_∞ · Z² / n². */
export function energyLevelEv(n: number, zEff: number): number {
  return (-RYDBERG_ENERGY_EV * (zEff * zEff)) / (n * n);
}

/** Converts a length in Bohr radii to picometres. */
export function bohrToPm(bohr: number): number {
  return bohr * BOHR_RADIUS_PM;
}
