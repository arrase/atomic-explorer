# Image Attributions

All images of chemical elements used in this project must have verified licenses.
Only public domain or Creative Commons (CC) licensed images are acceptable.

## Sources

- **Wikimedia Commons** — preferred source for element photographs
  - License: verify each image individually (CC-BY-SA, public domain, etc.)
  
## Guidelines

- Each image file must have a corresponding entry in this file
- Include: filename, source URL, license type, author/attribution
- Do not use images without verified licensing

## Current Images

_No element images added yet — this section will be populated in Phase 2._

---

## Data Sources

The above covers **images only**. The scientific data shipped with the app is
attributed separately, because the numbers come from the chemical literature
rather than from image licences.

- **`../data/README.md`** — full provenance for the element and molecule data:
  - `elements.json` (118 elements): per-field sources for `atomic_mass` (IUPAC
    standard atomic weights, 2021), `radius_pm` (Housecroft & Sharpe
    "Inorganic Chemistry" empirical radii, labelled "Empirical" in the UI
    legend), `electronegativity` (Pauling), `ionization_energy` (first
    ionisation energy, kJ/mol, NIST ASD / standard tables; superheavy values are
    theoretical), `electron_config_str` (ground states including the standard
    Aufbau exceptions) and `discovery_year`.
  - `molecules.json` (14 molecules): experimental gas-phase bond lengths and
    bond angles in **ångströms**, plus the note that `hybrid_lobes` are a
    schematic VSEPR cartoon rather than a computed electron density.
