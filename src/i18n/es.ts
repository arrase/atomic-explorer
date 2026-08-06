import { I18nStrings } from './types';

export const strings: I18nStrings = {
  title: 'Atomic Explorer',
  tabOrbitals: 'Orbitales 3D',
  tabPeriodicTable: 'Tabla Periódica',
  tabMolecules: 'Moléculas y VSEPR',

  orbital: 'Orbital',
  orbitalControls: 'Parámetros Cuánticos',
  principalQuantum: 'Principal (n)',
  azimuthalQuantum: 'Azimutal (l)',
  magneticQuantum: 'Magnético (m)',
  spinQuantum: 'Spin (s)',
  orbitalType: 'Tipo de orbital',
  zEffCharge: 'Carga Z_eff',
  quality: 'Calidad de Renderizado',
  qualityLow: 'Baja (20.000 pts / 32³ grid)',
  qualityMedium: 'Media (50.000 pts / 48³ grid)',
  qualityHigh: 'Alta (150.000 pts / 64³ grid)',
  mode: 'Modo de Visualización',
  modePoints: 'Nube de Puntos',
  modeIsosurface: 'Isosuperficie (Marching Cubes)',
  modeRaymarching: 'Raymarching Volumétrico (GLSL)',
  modeEigenstate: 'Autoestado puro (Axialmente simétrico)',
  modeRealOrbital: 'Orbital real (Combinación química)',

  fps: 'FPS',
  avgFps: 'Media',

  // Periodic Table
  colorCoding: 'Codificación de Color',
  colorCategory: 'Categoría Química',
  colorElectronegativity: 'Electronegatividad',
  colorRadius: 'Radio Atómico',
  searchPlaceholder: 'Buscar elemento por nombre, símbolo o Z...',
  selectElementPrompt: 'Selecciona un elemento de la tabla periódica para ver sus detalles e inspeccionar sus orbitales de valencia.',
  btnView3DOrbital: '⚛️ Visualizar Orbitales 3D de Valencia',
  atomicMass: 'Masa Atómica',
  electronConfig: 'Config. Electrónica',
  atomicRadius: 'Radio Atómico',
  electronegativity: 'Electronegatividad',
  ionizationEnergy: 'Energía de Ionización',
  discovery: 'Descubrimiento',
  ancient: 'Antigüedad',

  // Categories
  catNonMetal: 'No metal',
  catNobleGas: 'Gas noble',
  catAlkaliMetal: 'Metal alcalino',
  catAlkalineEarth: 'Alcalinotérreo',
  catMetalloid: 'Metaloide',
  catHalogen: 'Halógeno',
  catTransitionMetal: 'Metal de transición',
  catPostTransitionMetal: 'Metal del bloque p',
  catLanthanide: 'Lantánido',
  catActinide: 'Actínido',

  // Molecules
  moleculesVseprTitle: 'Geometría Molecular y Enlaces VSEPR',
  selectMolecule: 'Seleccionar Molécula',
  showLobes: 'Mostrar Lóbulos Híbridos',
  hideLobes: 'Ocultar Lóbulos Híbridos',
  vseprGeometry: 'Geometría VSEPR',
  hybridization: 'Hibridación',
  bondAngle: 'Ángulo de Enlace',

  // Language Switcher
  language: 'Idioma',
  langEs: 'Español',
  langEn: 'English',
};
