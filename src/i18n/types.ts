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

export interface GlossaryItem {
  id: string;
  term: string;
  category: string;
  definition: string;
  details: string;
}

export interface HistoryEraText {
  year: string;
  scientist: string;
  title: string;
  discovered: string;
  limitation: string;
}

export interface HalfLifeUnitStrings {
  min: string;
  h: string;
  d: string;
  yr: string;
  Myr: string;
  Gyr: string;
}

export interface IsotopeNotes {
  h1: string;
  h2: string;
  h3: string;
  he3: string;
  he4: string;
  c12: string;
  c13: string;
  c14: string;
  o16: string;
  f18: string;
  k40: string;
  ca40: string;
  fe56: string;
  co60: string;
  tc99m: string;
  i131: string;
  cs137: string;
  pb208: string;
  po210: string;
  ra226: string;
  u235: string;
  u238: string;
  pu239: string;
  am241: string;
}

export type ElementUseKey =
  | 'starsAndFusion'
  | 'waterAndLife'
  | 'cleanFuel'
  | 'cryogenicsAndMri'
  | 'batteriesAndEv'
  | 'aerospaceAlloys'
  | 'spaceTelescopes'
  | 'ceramicsAndGlass'
  | 'steelAndConstruction'
  | 'semiconductorsAndChips'
  | 'solarAndLeds'
  | 'fertilizersAndPlants'
  | 'bonesAndBiology'
  | 'waterPurification'
  | 'dentalAndMedicine'
  | 'lightingAndLasers'
  | 'electricalWiring'
  | 'jewelryAndCoins'
  | 'catalystsAndRefining'
  | 'permanentMagnets'
  | 'fireworksAndPigments'
  | 'atomicClocksAndGps'
  | 'nuclearEnergy'
  | 'spaceProbesRtg'
  | 'smokeAndSensors'
  | 'radiometricAndEarth'
  | 'supernovaNucleosynthesis'
  | 'particleAccelerators'
  | 'fundamentalResearch'
  | 'antiCorrosionAndCoatings';

export type GuidedTourId =
  | 'quantum-cloud'
  | 'cosmic-light'
  | 'chemical-bonds'
  | 'metals-exceptions'
  | 'nuclear-heart';

export interface GuidedTourStepLocale {
  title: string;
  body: string;
}

export interface GuidedTourLocale {
  title: string;
  subtitle: string;
  steps: [
    GuidedTourStepLocale,
    GuidedTourStepLocale,
    GuidedTourStepLocale,
    GuidedTourStepLocale,
  ];
}

export interface I18nStrings {
  title: string;
  tabOrbitals: string;
  tabPeriodicTable: string;
  tabMolecules: string;
  tabSpectroscopy: string;
  tabBonding: string;
  tabHistory: string;
  tabNucleus: string;

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
  orbitalPreviewTitle: string;
  orbitalPreviewHint: string;
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
  exportGenerating: string;
  exportFailed: string;
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
  moleculeGallery: string;
  showDipoles: string;
  hideDipoles: string;
  showPiBonds: string;
  hidePiBonds: string;
  molecularPolarity: string;
  polarityPolar: string;
  polarityNonpolar: string;
  polarityNonpolarSymmetry: string;
  sigmaPiBonds: string;
  aromaticPiSystem: string;

  // Language Switcher
  language: string;

  // Info Modal & Help Labels
  infoModalClose: string;
  dontShowAgain: string;
  analogyLabel: string;
  glossaryTitle: string;
  glossarySubtitle: string;
  glossarySearchPlaceholder: string;
  glossaryEmpty: string;
  btnGlossary: string;
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
  contrastControl: string;
  explainContrast: QuantumExplanation;

  // Physics Panel Labels & Node Explanations
  physicsPanelTitle: string;
  nodalBreakdown: string;
  radialDistributionTitle: string;
  peakRadius: string;
  chartRadiusAxis: string;
  chartProbAxis: string;
  explainRadialDistribution: ConceptExplanation;
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

  // 3D Cross-Section & Nodal Surfaces
  crossSectionControl: string;
  crossSectionNone: string;
  crossSectionX: string;
  crossSectionY: string;
  crossSectionZ: string;
  explainCrossSection: ConceptExplanation;
  showNodalSurfaces: string;
  explainNodalSurfaces: ConceptExplanation;

  // Element & Spin-Box Explorer (Aufbau, Pauli, Hund)
  elementPreset: string;
  spinBoxExplorerTitle: string;
  spinBoxExplorerHint: string;
  explainSpinBox: ConceptExplanation;

  // Hydrogenic vs. Slater-Type Orbital (STO) Comparison
  compareStoToggle: string;
  legendHydrogenic: string;
  legendSto: string;
  explainStoComparison: ConceptExplanation;

  // Periodic Table Property Explanations & Filters
  blockFilterAll: string;
  blockFilterS: string;
  blockFilterP: string;
  blockFilterD: string;
  blockFilterF: string;
  legendElectronegativity: string;
  legendAtomicRadius: string;
  explainAtomicNumber: ConceptExplanation;
  explainAtomicMass: ConceptExplanation;
  explainElectronConfig: ConceptExplanation;
  explainAtomicRadius: ConceptExplanation;
  explainElectronegativity: ConceptExplanation;
  explainIonizationEnergy: ConceptExplanation;
  periodicTrendsGuideTitle: string;
  periodicTrendsGuideText: string;

  // VSEPR & Molecule Explanations
  explainVsepr: ConceptExplanation;
  explainHybridization: ConceptExplanation;
  explainBondAngle: ConceptExplanation;
  explainBondingLobe: ConceptExplanation;
  explainLonePairLobe: ConceptExplanation;
  vseprGuideTitle: string;
  vseprGuideText: string;
  explainPolarity: ConceptExplanation;
  explainPiBond: ConceptExplanation;

  // Periodic Table — Interactive Modes & Inspector Additions
  colorPhase: string;
  colorDiscovery: string;
  legendIonizationEnergy: string;
  legendPhase: string;
  legendDiscovery: string;
  phaseSolid: string;
  phaseLiquid: string;
  phaseGas: string;
  phaseUnknown: string;
  tempPresetRoom: string;
  tempPresetLava: string;
  tempPresetSun: string;
  meltingPoint: string;
  boilingPoint: string;
  dailyLifeTitle: string;
  elementUses: Record<ElementUseKey, string>;

  // Spectroscopy & Quantum Jumps Lab
  spectroscopyTitle: string;
  spectroscopyAnalysisTitle: string;
  modeEmission: string;
  modeAbsorption: string;
  famousLinesSection: string;
  upperStateSection: string;
  lowerStateSection: string;
  ionPresetLabel: string;
  ionCustom: string;
  antennaSection: string;
  antennaPlay: string;
  antennaPause: string;
  antennaSpeed: string;
  energyDiagramTitle: string;
  spectrumStripTitle: string;
  transitionAllowed: string;
  transitionForbidden: string;
  transitionDeltaE: string;
  transitionWavelength: string;
  transitionFrequency: string;
  einsteinACoeff: string;
  stateLifetime: string;
  metastableInfinite: string;
  bandUV: string;
  bandVisible: string;
  bandIR: string;
  presetForbidden2s1s: string;
  explainQuantumAntenna: ConceptExplanation;
  explainSelectionRules: ConceptExplanation;
  explainEinsteinA: ConceptExplanation;

  // Chemical Bonding (LCAO-MO)
  bondingTitle: string;
  bondingPresetsLabel: string;
  presetH2Label: string;
  presetHe2Label: string;
  presetSigma2pLabel: string;
  presetPi2pLabel: string;
  presetPolarLabel: string;
  interferenceModeLabel: string;
  modeBonding: string;
  modeAntibonding: string;
  internuclearDistanceLabel: string;
  snapToEquilibrium: string;
  polarAsymmetryLabel: string;
  polarBasisLabel: string;
  toggleNodalPlanes: string;
  bondingEnergyPanelTitle: string;
  potentialCurveTitle: string;
  chartDistanceAxis: string;
  chartEnergyAxis: string;
  equilibriumDistanceLabel: string;
  dissociationEnergyLabel: string;
  overlapIntegralLabel: string;
  moDiagramTitle: string;
  bondOrderLabel: string;
  bondStableBadge: string;
  bondUnstableBadge: string;
  chargeSharingLabel: string;
  explainLcao: ConceptExplanation;
  explainPotentialCurve: ConceptExplanation;
  explainBondOrder: ConceptExplanation;

  // Atomic History (Dalton to Schrödinger)
  historyTitle: string;
  historyTimelineLabel: string;
  historyDiscoveredLabel: string;
  historyLimitationLabel: string;
  historyEraDalton: HistoryEraText;
  historyEraThomson: HistoryEraText;
  historyEraRutherford: HistoryEraText;
  historyEraBohr: HistoryEraText;
  historyEraSchrodinger: HistoryEraText;
  historyThomsonOscillation: string;
  historyRutherfordFireBtn: string;
  historyRutherfordStreamBtn: string;
  historyRutherfordEnergy: string;
  historyRutherfordSpread: string;
  historyRutherfordResetStats: string;
  historyRutherfordStatsLabels: [string, string, string];
  historyBohrWaveNumber: string;
  historyBohrAllowed: string;
  historyBohrForbidden: string;
  historySchrodingerExperimentLabel: string;
  historySchrodingerCta: string;

  // Nucleus & Isotopes View
  nucleusTitle: string;
  protonsLabel: string;
  neutronsLabel: string;
  massNumberLabel: string;
  simulateDecayBtn: string;
  scaleCompareToggle: string;
  scaleAnalogyText: string;
  famousIsotopesTitle: string;
  nuclearStabilityTitle: string;
  bindingEnergyTotal: string;
  bindingEnergyPerNucleon: string;
  nuclearRadiusLabel: string;
  optimalZLabel: string;
  decayModeLabel: string;
  halfLifeLabel: string;
  magicNumberBadge: string;
  doublyMagicBadge: string;
  semfPredictedBadge: string;
  decayStable: string;
  decayAlpha: string;
  decayBetaMinus: string;
  decayBetaPlus: string;
  decayGamma: string;
  decayProtonDrip: string;
  decayNeutronDrip: string;
  segreChartTitle: string;
  bindingCurveTitle: string;
  chartFusionZone: string;
  chartFissionZone: string;
  halfLifeUnits: HalfLifeUnitStrings;
  isotopeNotes: IsotopeNotes;
  explainNuclearBinding: ConceptExplanation;
  explainValleyOfStability: ConceptExplanation;
  explainBindingCurve: ConceptExplanation;

  // Section 8: Share / Deep Linking
  shareLink: string;
  shareCopied: string;

  // Section 8: Guided Learning Launcher & Narrator UI
  navGuidedBtn: string;
  guidedModalTitle: string;
  guidedTabTours: string;
  guidedTabChallenge: string;
  guidedStartTour: string;
  guidedStepLabel: string;
  guidedPrev: string;
  guidedNext: string;
  guidedFinish: string;
  guidedExit: string;
  guidedSwitch: string;
  guidedMinimize: string;
  guidedExpand: string;
  guidedTours: Record<GuidedTourId, GuidedTourLocale>;

  // Section 8: Quantum Mini-Challenge ("¿Qué orbital soy?")
  challengeIntroTitle: string;
  challengeIntroDesc: string;
  challengeStartBtn: string;
  challengeMysteryBadge: string;
  challengePrompt: string;
  challengeScoreLabel: string;
  challengeHintBtn: string;
  challengeHintText: string;
  challengeCorrect: string;
  challengeWrong: string;
  challengeExplainTemplate: string;
  challengeNextBtn: string;
  challengeGeomS: string;
  challengeGeomPz: string;
  challengeGeomPx: string;
  challengeGeomDxy: string;
  challengeGeomDx2y2: string;
  challengeGeomDz2: string;
  challengeGeomFz3: string;

  // Glossary Items
  glossaryItems: GlossaryItem[];
}
