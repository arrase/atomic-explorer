export type Language = 'es' | 'en';

export interface I18nStrings {
  title: string;
  tabOrbitals: string;
  tabPeriodicTable: string;
  tabMolecules: string;

  orbital: string;
  orbitalControls: string;
  principalQuantum: string;
  azimuthalQuantum: string;
  magneticQuantum: string;
  spinQuantum: string;
  orbitalType: string;
  zEffCharge: string;
  quality: string;
  qualityLow: string;
  qualityMedium: string;
  qualityHigh: string;
  qualityUltra: string;
  qualityExtreme: string;
  qualityCustom: string;
  raymarchingSteps: string;
  pointCount: string;
  superSampling: string;
  colorPalette: string;
  paletteDefault: string;
  paletteFire: string;
  paletteEmerald: string;
  paletteSpectrum: string;
  exportImage: string;
  exportTitle: string;
  exportResolution: string;
  exportBackground: string;
  exportFormat: string;
  exportBtn: string;
  exportClose: string;
  bgDark: string;
  bgBlack: string;
  bgWhite: string;
  bgTransparent: string;
  resScreen: string;
  res1080p: string;
  res2K: string;
  res4K: string;
  res8K: string;
  mode: string;
  modePoints: string;
  modeIsosurface: string;
  modeRaymarching: string;
  modeEigenstate: string;
  modeRealOrbital: string;

  fps: string;
  avgFps: string;

  // Periodic Table
  colorCoding: string;
  colorCategory: string;
  colorElectronegativity: string;
  colorRadius: string;
  searchPlaceholder: string;
  selectElementPrompt: string;
  btnView3DOrbital: string;
  atomicMass: string;
  electronConfig: string;
  atomicRadius: string;
  electronegativity: string;
  ionizationEnergy: string;
  discovery: string;
  ancient: string;

  // Categories
  catNonMetal: string;
  catNobleGas: string;
  catAlkaliMetal: string;
  catAlkalineEarth: string;
  catMetalloid: string;
  catHalogen: string;
  catTransitionMetal: string;
  catPostTransitionMetal: string;
  catLanthanide: string;
  catActinide: string;

  // Molecules
  moleculesVseprTitle: string;
  selectMolecule: string;
  showLobes: string;
  hideLobes: string;
  vseprGeometry: string;
  hybridization: string;
  bondAngle: string;

  // Language Switcher
  language: string;
  langEs: string;
  langEn: string;
}
