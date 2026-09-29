# Data Directory

Read-only reference data for the periodic table and the 3D molecule viewer.
These files are bundled with the app and loaded at runtime; they are **not**
stored in SQLite and are never written back.

| File | Contents |
| --- | --- |
| `elements.json` | The 118 chemical elements (Z = 1 … 118), in atomic-number order. |
| `molecules.json` | 14 reference molecules for the VSEPR / hybridisation viewer. |

All values are **literature reference values** (see [Data sources](#data-sources)),
not measurements taken by this project.

---

## `elements.json`

A JSON array of 118 element objects. The canonical key order is:

| Field | Type | Meaning |
| --- | --- | --- |
| `Z` | integer | Atomic number, 1–118. |
| `symbol` | string | IUPAC element symbol, e.g. `"Og"`. |
| `name_es` | string | Spanish name, e.g. `"Oxígeno"`. |
| `category` | string | Spanish category key used for colouring and grouping: `metal alcalino`, `alcalinotérreo`, `metal de transición`, `metaloide`, `no metal`, `halógeno`, `gas noble`, `metal del bloque p`, `lantánido`, `actínido`. |
| `atomic_mass` | number | Standard atomic weight in u. |
| `electron_config_str` | string | Ground-state electron configuration with noble-gas core, using superscript digits, e.g. `"[He] 2s² 2p¹"`. |
| `radius_pm` | integer | Empirical atomic radius in picometres. |
| `electronegativity` | number \| null | Pauling electronegativity. `null` where no accepted value exists (noble gases, most synthetic superheavy elements). |
| `ionization_energy` | integer | First ionisation energy in kJ/mol. |
| `oxidation_states` | integer[] | Known oxidation states, ascending, with `+n` implied for positive values. Empty (`[]`) for elements with no confirmed compounds (He, Ne, Ar, Og). |
| `discovery_year` | integer \| string | Year of discovery, or the string `"Antigüedad"` (rendered as "Ancient" in the English UI) for elements known since prehistory. |
| `name_en` | string | English name, e.g. `"Oxygen"`. |

## `molecules.json`

A JSON array of 14 molecule objects, keyed in the same style:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable lookup key, e.g. `"H2O"`. |
| `formula` | string | Display formula with Unicode subscripts, e.g. `"H₂O"`. |
| `hybridization` | string | Hybridisation label shown in the UI, e.g. `"sp³"`. |
| `bond_angle` | string | Display string for the characteristic bond angle(s), e.g. `"104.5°"`, `"90° / 120°"`, or `"—"` for diatomics. |
| `atoms` | object[] | `{ symbol, position, color, radius }` — `position` is `[x, y, z]` in **ångströms**; `radius` is a display radius only, not a van der Waals radius. |
| `bonds` | object[] | `{ fromIndex, toIndex, type }` with `type` = `"single"` or `"double"`, indexing into `atoms`. |
| `hybrid_lobes` | object[] | `{ position, direction, color, scale, type }` — the schematic VSEPR cartoon (see the warning below). `direction` is a unit vector, `position` is the lobe base, `type` is `"bonding"` or `"lone_pair"`. |
| `name_es` / `name_en` | string | Molecule name. |
| `geometry_es` / `geometry_en` | string | VSEPR geometry name, e.g. `"Angular"` / `"Bent"`. |
| `description_es` / `description_en` | string | One-line description shown in the panel. |

> **`hybrid_lobes` are a schematic VSEPR cartoon, not a computed electron
> density.** The lobe positions and directions are idealised hybrids drawn so
> that the *ordering* of the domain angles reproduces the VSEPR rule (a lone
> pair occupies more angular space than a bonding pair, so
> LP–LP > LP–BP > BP–BP). Atom coordinates, by contrast, come from experimental
> structures. Lone pairs are placed symmetrically about the molecular plane.

---

## Data sources

Quantitative values are transcribed from the standard reference literature.
Where a value is a schematic convention rather than a measurement, that is
stated explicitly.

### `elements.json`

- **`atomic_mass`** — IUPAC standard atomic weights, 2021 conventional values
  (CIAAW). Elements with no stable isotope carry the bracketed mass number of
  the most stable known isotope, e.g. Tc → 98, Pm → 145, and the heaviest
  elements → 294.0 for Og.
- **`radius_pm`** — empirical atomic radii, Housecroft & Sharpe, *Inorganic
  Chemistry* (4th ed.). This is the set the UI legend labels "Empirical Atomic
  Radius (pm)"; it is not a calculated or van der Waals radius, so it should not
  be compared directly with tabulated covalent radii.
- **`electronegativity`** — Pauling scale. `null` for He, Ne, Ar, Rn and for
  the superheavy elements, which have no accepted Pauling value.
- **`ionization_energy`** — first ionisation energy in kJ/mol, from the
  standard tables (NIST Atomic Spectra Database / CRC Handbook). Values for the
  heaviest elements (Z ≳ 104) are **theoretical estimates**, not measured.
- **`electron_config_str`** — ground-state configurations written in noble-gas
  core notation, including the standard Aufbau exceptions: Cr, Cu, Nb, Mo, Ru,
  Rh, Pd, Ag, Pt, Au, La, Ce, Gd and Lr.
- **`oxidation_states`** — the commonly encountered oxidation states from the
  standard inorganic-chemistry tables. Only states seen in real compounds are
  listed, so elements with no confirmed compounds (He, Ne, Ar, Og) have an
  empty array rather than a `0`, which would falsely assert oxidation state zero
  for an element that has no compounds.
- **`discovery_year`** — standard historical references (Royal Society of
  Chemistry element pages, Britannica). `"Antigüedad"` is used for C, S, Fe,
  Cu, Ag, Sn, Sb, Au, Hg and Pb, known since prehistory.
- **`name_es` / `name_en` / `category`** — IUPAC nomenclature and the standard
  Spanish periodic-table grouping.

### `molecules.json`

- **Atom coordinates** — experimental gas-phase bond lengths and geometries
  (equilibrium structures; microwave spectroscopy and high-level theory where
  the species is not stable in bulk), e.g. water is placed at an r(O–H) of
  0.958 Å with an H–O–H angle of 104.5°. **Coordinates are in ångströms
  (1 Å = 100 pm)**, with the central atom of each molecule at the origin and
  the molecular frame oriented for display.
- **`bond_angle`** — the same experimental angles, rounded for display.
- **`hybrid_lobes`** — a **schematic VSEPR cartoon, not a computed electron
  density**. Directions are idealised hybrids (or, for lone pairs, a
  hand-placed cartoon lobe) chosen so the domain-angle ordering follows VSEPR;
  they are normalised by the renderer and carry no quantitative meaning beyond
  showing relative size and orientation.
- **`color` / `radius` / `scale`** — presentation only (CPK-style colouring),
  not physical quantities.
