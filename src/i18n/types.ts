export type Language = 'es' | 'en' | 'fr' | 'de' | 'pt' | 'it' | 'nl' | 'pl' | 'ru' | 'zh' | 'ja' | 'ko' | 'tr' | 'hi' | 'ar';

export interface ConceptExplanation {
  title: string;
  summary: string;
  detail: string;
  analogy?: string;
}

export interface QuantumExplanation extends ConceptExplanation {
  analogy: string;
}

export interface PropertyExplanation extends ConceptExplanation {}

export interface GlossaryItem {
  id: string;
  term: string;
  category: string;
  definition: string;
  details: string;
}

export interface I18nStrings {
  title: string;
  tabOrbitals: string;
  tabPeriodicTable: string;
  tabMolecules: string;

  orbital: string;
  orbitalControls: string;
  quantumSection: string;
  nuclearSection: string;
  renderSection: string;
  zenMode: string;
  exitZenMode: string;
  hudResetCamera: string;
  hudTurntable: string;
  hudZenMode: string;
  hudScale: string;
  collapsePanel: string;
  expandPanel: string;
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
  scaleNative: string;
  scaleQHD: string;
  scale4K: string;
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
  elementDetails: string;
  swipeToExplore: string;
  viewFullDetails: string;
  atomicMass: string;
  electronConfig: string;
  atomicRadius: string;
  electronegativity: string;
  ionizationEnergy: string;
  oxidationStates: string;
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
  toggleLobesShow: string;
  toggleLobesHide: string;
  exportGenerating: string;
  formatPng: string;
  formatJpeg: string;
  formatWebp: string;
  ssNative: string;
  ssCrisp: string;
  ssUltra: string;
  atomClickTitle: string;
  atomClickSummary: string;
  atomClickDetail: string;
  vseprGeometry: string;
  hybridization: string;
  bondAngle: string;
  showAngles: string;
  hideAngles: string;
  toggleAnglesShow: string;
  toggleAnglesHide: string;
  bondAngles: string;
  moleculeGallery: string;

  // Language Switcher
  language: string;
  langEs: string;
  langEn: string;

  // Info Modal & Help Labels
  infoModalTitle: string;
  infoModalClose: string;
  dontShowAgain: string;
  analogyLabel: string;
  glossaryTitle: string;
  glossarySubtitle: string;
  glossarySearchPlaceholder: string;
  btnGlossary: string;
  btnLearnMore: string;
  btnIntro: string;

  // Orbital Parameter Explanations
  explainIntro: QuantumExplanation;
  explainN: QuantumExplanation;
  explainL: QuantumExplanation;
  explainM: QuantumExplanation;
  explainS: QuantumExplanation;
  explainZeff: QuantumExplanation;
  explainMode: QuantumExplanation;
  explainOrbitalType: QuantumExplanation;
  explainPalette: QuantumExplanation;
  explainQuality: QuantumExplanation;
  explainContrast: QuantumExplanation;
  contrastControl: string;

  // Physics Panel Labels & Node Explanations
  physicsPanelTitle: string;
  nodalBreakdown: string;
  radialDistributionTitle: string;
  peakRadius: string;
  chartRadiusAxis: string;
  chartProbAxis: string;
  explainRadialDistribution: PropertyExplanation;
  shieldingTitle: string;
  shieldingNoteDesc: string;
  activeState: string;
  radialNodes: string;
  angularNodes: string;
  totalNodes: string;
  radialNodesDesc: string;
  angularNodesDesc: string;
  totalNodesDesc: string;
  wavefunctionFormula: string;
  wavefunctionFormulaDesc: string;
  wavefunctionFormulaDetail: string;
  expectationRadius: string;
  expectationRadiusDesc: string;
  expectationRadiusDetail: string;
  hydrogenicEnergy: string;
  hydrogenicEnergyDesc: string;
  hydrogenicEnergyDetail: string;
  spectralSeries: string;
  seriesLyman: string;
  seriesBalmer: string;
  seriesPaschen: string;
  seriesBrackett: string;
  seriesPfund: string;
  seriesHumphreys: string;
  seriesShell: string;
  chartNodeLabel: string;

  // Periodic Table Property Explanations & Filters
  blockFilterAll: string;
  blockFilterS: string;
  blockFilterP: string;
  blockFilterD: string;
  blockFilterF: string;
  legendElectronegativity: string;
  legendAtomicRadius: string;
  groupHeaderLabel: string;
  periodHeaderLabel: string;
  explainAtomicNumber: PropertyExplanation;
  explainAtomicMass: PropertyExplanation;
  explainElectronConfig: PropertyExplanation;
  explainAtomicRadius: PropertyExplanation;
  explainElectronegativity: PropertyExplanation;
  explainIonizationEnergy: PropertyExplanation;
  periodicTrendsGuideTitle: string;
  periodicTrendsGuideText: string;

  // VSEPR & Molecule Explanations
  explainVsepr: PropertyExplanation;
  explainHybridization: PropertyExplanation;
  explainBondAngle: PropertyExplanation;
  explainBondingLobe: PropertyExplanation;
  explainLonePairLobe: PropertyExplanation;
  vseprGuideTitle: string;
  vseprGuideText: string;

  // Glossary Items
  glossaryItems: GlossaryItem[];
}
