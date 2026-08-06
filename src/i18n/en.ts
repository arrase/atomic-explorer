import { I18nStrings } from './types';

export const strings: I18nStrings = {
  title: 'Atomic Explorer',
  tabOrbitals: '3D Orbitals',
  tabPeriodicTable: 'Periodic Table',
  tabMolecules: 'Molecules & VSEPR',

  orbital: 'Orbital',
  orbitalControls: 'Quantum Parameters',
  principalQuantum: 'Principal (n)',
  azimuthalQuantum: 'Azimuthal (l)',
  magneticQuantum: 'Magnetic (m)',
  spinQuantum: 'Spin (s)',
  orbitalType: 'Orbital type',
  zEffCharge: 'Z_eff charge',
  quality: 'Rendering Quality',
  qualityLow: 'Low (20,000 pts / 32³ grid)',
  qualityMedium: 'Medium (50,000 pts / 48³ grid)',
  qualityHigh: 'High (150,000 pts / 64³ grid)',
  mode: 'Visualization Mode',
  modePoints: 'Point Cloud',
  modeIsosurface: 'Isosurface (Marching Cubes)',
  modeRaymarching: 'Volumetric Raymarching (GLSL)',
  modeEigenstate: 'Pure eigenstate (Axially symmetric)',
  modeRealOrbital: 'Real orbital (Chemical combination)',

  fps: 'FPS',
  avgFps: 'Avg',

  // Periodic Table
  colorCoding: 'Color Coding',
  colorCategory: 'Chemical Category',
  colorElectronegativity: 'Electronegativity',
  colorRadius: 'Atomic Radius',
  searchPlaceholder: 'Search element by name, symbol or Z...',
  selectElementPrompt: 'Select an element from the periodic table to view details and inspect valence orbitals.',
  btnView3DOrbital: '⚛️ View 3D Valence Orbitals',
  atomicMass: 'Atomic Mass',
  electronConfig: 'Electron Config.',
  atomicRadius: 'Atomic Radius',
  electronegativity: 'Electronegativity',
  ionizationEnergy: 'Ionization Energy',
  discovery: 'Discovery',
  ancient: 'Ancient',

  // Categories
  catNonMetal: 'Non-metal',
  catNobleGas: 'Noble gas',
  catAlkaliMetal: 'Alkali metal',
  catAlkalineEarth: 'Alkaline earth metal',
  catMetalloid: 'Metalloid',
  catHalogen: 'Halogen',
  catTransitionMetal: 'Transition metal',
  catPostTransitionMetal: 'Post-transition metal',
  catLanthanide: 'Lanthanide',
  catActinide: 'Actinide',

  // Molecules
  moleculesVseprTitle: 'Molecular Geometry & VSEPR Bonds',
  selectMolecule: 'Select Molecule',
  showLobes: 'Show Hybrid Lobes',
  hideLobes: 'Hide Hybrid Lobes',
  vseprGeometry: 'VSEPR Geometry',
  hybridization: 'Hybridization',
  bondAngle: 'Bond Angle',

  // Language Switcher
  language: 'Language',
  langEs: 'Español',
  langEn: 'English',
};
