import * as THREE from 'three';
import { sampleOrbitalPoints } from './core/wasm-bridge';
import { calculateValenceQuantumNumbers } from './core/valence-orbital';
import { ANGSTROM_IN_BOHR, meanRadiusBohr, bohrToPm } from './core/physics-constants';
import { createUrlSync, parseUrlState, type DeepLinkState } from './core/url-state';
import type { BaseThreeRenderer } from './render/render-utils';
import { OrbitalRenderer } from './render/orbital-renderer';
import { BondingRenderer } from './render/bonding-renderer';
import { MoleculeRenderer } from './render/molecule-renderer';
import { SpectroscopyRenderer } from './render/spectroscopy-renderer';
import { NucleusRenderer } from './render/nucleus-renderer';
import { HistoryRenderer } from './render/history-renderer';
import { OrbitalPreview } from './render/orbital-preview';
import { OrientationGizmo } from './render/orientation-gizmo';
import { ViewportHUD } from './ui/viewport-hud';
import { getStrings, onLanguageChange } from './i18n';
import { icon } from './ui/icons';

import { NavigationBar, type TabId, DEFAULT_TAB, NAV_TABS } from './ui/nav';
import { ControlPanel, type ExtendedOrbitalParams } from './ui/controls';
import { PeriodicTableView, type ElementData } from './ui/periodic-table';
import { BondingView } from './ui/bonding-view';
import { MoleculeView } from './ui/molecule-view';
import { SpectroscopyView } from './ui/spectroscopy-view';
import { NucleusView } from './ui/nucleus-view';
import { HistoryView } from './ui/history-view';
import { GuidedLearningController, type AppController } from './ui/guided-learning';
import { FPSDisplay } from './ui/fps-display';
import { ImageExporterModal } from './ui/image-exporter';
import { ExplanationModal } from './ui/info-modal';

type Tab3D = Exclude<TabId, 'periodic-table'>;

type StateApplierMap = {
  [K in TabId]: (state: Extract<DeepLinkState, { tab: K }>) => void;
};

const FULL_RENDER_KEYS: readonly (keyof ExtendedOrbitalParams)[] = [
  'n',
  'l',
  'm',
  'useRealOrbital',
  'zEff',
  'mode',
  'quality',
  'pointCount',
  'raymarchingSteps',
  'resolutionScale',
  'colorPalette',
  'contrast',
];

export function isOverlayOnlyUpdate(
  prev: ExtendedOrbitalParams | null,
  next: ExtendedOrbitalParams,
): boolean {
  if (!prev) return false;
  return FULL_RENDER_KEYS.every((key) => prev[key] === next[key]);
}

async function renderOrbitalForMode(
  orbitalRenderer: OrbitalRenderer,
  params: ExtendedOrbitalParams,
  isCurrent: () => boolean,
): Promise<void> {
  if (params.mode === 'points') {
    orbitalRenderer.updateParams(params);
    const points = await sampleOrbitalPoints(params);
    if (isCurrent()) {
      await orbitalRenderer.setPointCloud(points, params);
    }
    return;
  }
  if (!isCurrent()) return;
  if (params.mode === 'isosurface') {
    await orbitalRenderer.updateIsosurface(params);
  } else if (params.mode === 'raymarching') {
    await orbitalRenderer.updateRaymarching(params);
  }
}

function createOrbitalLoader(
  orbitalRenderer: OrbitalRenderer,
  onSettled: () => void,
): {
  loadOrbital: (params: ExtendedOrbitalParams) => Promise<void>;
  resetOverlayCache: () => void;
} {
  let currentLoadRequestId = 0;
  let lastLoadedParams: ExtendedOrbitalParams | null = null;

  const loadOrbital = async (params: ExtendedOrbitalParams): Promise<void> => {
    if (isOverlayOnlyUpdate(lastLoadedParams, params)) {
      lastLoadedParams = { ...params };
      orbitalRenderer.setCrossSection(params.crossSection);
      orbitalRenderer.setShowNodalSurfaces(params.showNodalSurfaces);
      onSettled();
      return;
    }

    lastLoadedParams = null;
    const requestId = ++currentLoadRequestId;
    try {
      document.body.classList.add('loading');
      await renderOrbitalForMode(
        orbitalRenderer,
        params,
        () => requestId === currentLoadRequestId,
      );
      if (requestId === currentLoadRequestId) {
        lastLoadedParams = { ...params };
      }
    } catch (error) {
      // The WASM engine rejects unsupported states rather than clamping them, so
      // a bad parameter set would otherwise reject out of the DOM event handler
      // and leave the canvas blank with nothing in the console.
      console.error('[atomic-explorer] failed to load orbital', params, error);
    } finally {
      if (requestId === currentLoadRequestId) {
        document.body.classList.remove('loading');
        onSettled();
      }
    }
  };

  const resetOverlayCache = (): void => {
    lastLoadedParams = null;
  };

  return { loadOrbital, resetOverlayCache };
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'SELECT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  );
}

function closeOpenDrawers(): boolean {
  const open = document.querySelectorAll('.mobile-open');
  open.forEach((el) => el.classList.remove('mobile-open'));
  document
    .querySelectorAll('.mobile-drawer-backdrop.active')
    .forEach((el) => el.classList.remove('active'));
  document
    .querySelectorAll('.mobile-float-btn')
    .forEach((el) => el.setAttribute('aria-expanded', 'false'));
  return open.length > 0;
}

interface GlobalShortcutContext {
  getActiveTab: () => TabId;
  switchTab: (tab: TabId) => void;
  toggleAutoRotate: () => void;
  resetCamera: () => void;
  openExporter: () => void;
  toggleZenMode: () => void;
  stepPrincipalQuantum: (delta: number) => void;
}

function isZenExitEscape(e: KeyboardEvent): boolean {
  return e.key === 'Escape' && document.body.classList.contains('zen-mode');
}

function handle3DShortcut(e: KeyboardEvent, ctx: GlobalShortcutContext): boolean {
  const target = e.target as HTMLElement | null;
  const is3DTab = ctx.getActiveTab() !== 'periodic-table';

  if (e.code === 'Space') {
    if (target?.closest('button')) return false;
    if (is3DTab) ctx.toggleAutoRotate();
    return true;
  }
  if (e.key.toLowerCase() === 'r') {
    if (is3DTab) ctx.resetCamera();
    return true;
  }
  return false;
}

function handleActionShortcut(e: KeyboardEvent, ctx: GlobalShortcutContext): boolean {
  if (handle3DShortcut(e, ctx)) return true;

  const key = e.key.toLowerCase();
  if (key === 'p') {
    ctx.openExporter();
    return true;
  }
  if (key === 'h' || isZenExitEscape(e)) {
    ctx.toggleZenMode();
    return true;
  }
  return false;
}

function handleArrowShortcut(e: KeyboardEvent, ctx: GlobalShortcutContext): boolean {
  if (ctx.getActiveTab() !== 'orbitals') return false;
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return false;
  const target = e.target as HTMLElement | null;
  if (target?.closest('.subshell-diagram')) return false;
  ctx.stepPrincipalQuantum(e.key === 'ArrowUp' ? 1 : -1);
  return true;
}

function bindGlobalKeyboardShortcuts(ctx: GlobalShortcutContext): void {
  // Derived from the nav's own tab order, so the number keys always mean "the
  // nth tab in the bar" and neither list can fall behind the other.
  const tabShortcuts = new Map(NAV_TABS.map((tab, index) => [String(index + 1), tab.id]));

  const handleTabShortcut = (key: string): boolean => {
    const tab = tabShortcuts.get(key);
    if (!tab) return false;
    ctx.switchTab(tab);
    return true;
  };

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.defaultPrevented || isEditableKeyboardTarget(e.target)) return;

    if (e.key === 'Escape' && closeOpenDrawers()) {
      e.preventDefault();
      return;
    }

    if (handleTabShortcut(e.key) || handleActionShortcut(e, ctx) || handleArrowShortcut(e, ctx)) {
      e.preventDefault();
    }
  });
}

function formatPhysicalScaleText(tab: TabId, p: ExtendedOrbitalParams): string | null {
  if (tab === 'orbitals') {
    const meanA0 = meanRadiusBohr(p.n, p.l, p.zEff);
    return `⟨r⟩ ${meanA0.toFixed(2)} a₀ (${bohrToPm(meanA0).toFixed(1)} pm)`;
  }
  if (tab === 'molecules') {
    return `1 Å = 100 pm (${ANGSTROM_IN_BOHR.toFixed(2)} a₀)`;
  }
  return null;
}

function createViewLayers(uiOverlay: HTMLElement): Record<TabId, HTMLElement> {
  const layers = {} as Record<TabId, HTMLElement>;
  for (const tab of NAV_TABS) {
    const layer = document.createElement('div');
    // The id is the target of the nav tab's `aria-controls`, and the panel is
    // labelled by the tab so screen readers announce the pair correctly.
    layer.id = `${tab.id}-layer`;
    layer.className = `view-layer ${tab.id}-layer`;
    layer.classList.toggle('active', tab.id === DEFAULT_TAB);
    layer.setAttribute('role', 'tabpanel');
    layer.setAttribute('aria-labelledby', `nav-tab-${tab.id}`);
    uiOverlay.appendChild(layer);
    layers[tab.id] = layer;
  }
  return layers;
}

function createZenRestoreButton(uiOverlay: HTMLElement, onToggle: () => void): void {
  const zenRestoreBtn = document.createElement('button');
  zenRestoreBtn.type = 'button';
  zenRestoreBtn.className = 'zen-restore-btn';
  zenRestoreBtn.id = 'zen-restore-btn';
  const updateZenRestoreBtnText = (): void => {
    const text = getStrings().exitZenMode;
    zenRestoreBtn.title = text;
    zenRestoreBtn.setAttribute('aria-label', text);
    zenRestoreBtn.innerHTML = `${icon('eye')} <span>${text}</span>`;
  };
  updateZenRestoreBtnText();
  onLanguageChange(updateZenRestoreBtnText);
  zenRestoreBtn.addEventListener('click', onToggle);
  uiOverlay.appendChild(zenRestoreBtn);
}

function createShareToast(uiOverlay: HTMLElement): () => void {
  const shareToast = document.createElement('div');
  shareToast.className = 'share-toast-pill';
  shareToast.id = 'share-toast-pill';
  shareToast.setAttribute('role', 'status');
  shareToast.setAttribute('aria-live', 'polite');
  uiOverlay.appendChild(shareToast);

  let timerId: number | undefined;
  return (): void => {
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
    }
    shareToast.innerHTML = `${icon('check')} <span>${getStrings().shareCopied}</span>`;
    shareToast.classList.add('visible');
    timerId = window.setTimeout(() => {
      shareToast.classList.remove('visible');
      timerId = undefined;
    }, 2000);
  };
}

function createTabScaleHandler(
  getActiveTab: () => TabId,
  hud: ViewportHUD,
  tab: TabId,
): (text: string) => void {
  return (text: string): void => {
    if (getActiveTab() === tab) {
      hud.updateScale(text);
    }
  };
}

function closeAllMobileOverlays(): void {
  document.querySelectorAll('.mobile-open').forEach((el) => el.classList.remove('mobile-open'));
  document
    .querySelectorAll('.mobile-drawer-backdrop.active')
    .forEach((el) => el.classList.remove('active'));
  document
    .querySelectorAll('.mobile-float-btn.active')
    .forEach((el) => el.classList.remove('active'));
  document
    .querySelectorAll('.mobile-float-btn[aria-expanded="true"]')
    .forEach((el) => el.setAttribute('aria-expanded', 'false'));
}

interface ViewportSwitchContext {
  readonly canvas: HTMLCanvasElement;
  readonly renderers3D: Record<Tab3D, BaseThreeRenderer>;
  readonly orientationGizmo: OrientationGizmo;
  readonly viewportHud: ViewportHUD;
  readonly periodicTableView: PeriodicTableView;
  readonly tabActivators: Record<Tab3D, () => void>;
}

function syncViewportForTab(newTab: TabId, ctx: ViewportSwitchContext): void {
  for (const r of Object.values(ctx.renderers3D)) {
    r.stop();
    r.setGizmo(null);
  }

  if (newTab === 'periodic-table') {
    ctx.canvas.style.display = 'none';
    ctx.orientationGizmo.setVisible(false);
    ctx.viewportHud.setVisible(false);
    ctx.periodicTableView.getSelectedElement();
    return;
  }

  const activeRenderer = ctx.renderers3D[newTab];
  ctx.canvas.style.display = 'block';
  activeRenderer.setGizmo(ctx.orientationGizmo);
  ctx.orientationGizmo.setVisible(true);
  ctx.viewportHud.setVisible(true);
  ctx.viewportHud.setAutoRotateState(activeRenderer.isAutoRotating());
  activeRenderer.onWindowResize();
  activeRenderer.start();
  ctx.tabActivators[newTab]();
}

function readOrbitalDeepLinkState(p: ExtendedOrbitalParams): DeepLinkState {
  return {
    tab: 'orbitals',
    n: p.n,
    l: p.l,
    m: p.m,
    zEff: p.zEff,
    mode: p.mode,
    useRealOrbital: p.useRealOrbital,
    cut: p.crossSection,
    nodal: p.showNodalSurfaces,
  };
}

function buildOrbitalDeepLinkPatch(
  s: Extract<DeepLinkState, { tab: 'orbitals' }>,
): Partial<ExtendedOrbitalParams> {
  const patch: Partial<ExtendedOrbitalParams> = {
    crossSection: s.cut ?? 'none',
    showNodalSurfaces: s.nodal ?? false,
  };
  if (s.n !== undefined) patch.n = s.n;
  if (s.l !== undefined) patch.l = s.l;
  if (s.m !== undefined) patch.m = s.m;
  if (s.zEff !== undefined) patch.zEff = s.zEff;
  if (s.mode !== undefined) patch.mode = s.mode;
  if (s.useRealOrbital !== undefined) patch.useRealOrbital = s.useRealOrbital;
  return patch;
}

function applyOrbitalDeepLink(
  s: Extract<DeepLinkState, { tab: 'orbitals' }>,
  controlPanel: ControlPanel,
  activeTab: TabId,
  loadOrbital: (params: ExtendedOrbitalParams) => Promise<void>,
  switchTab: (tab: TabId) => void,
): void {
  controlPanel.setParams(buildOrbitalDeepLinkPatch(s));
  if (activeTab === 'orbitals') {
    void loadOrbital(controlPanel.getParams());
  } else {
    switchTab('orbitals');
  }
}

interface DeepLinkTablesDeps {
  readonly getActiveTab: () => TabId;
  readonly switchTab: (tab: TabId) => void;
  readonly loadOrbital: (params: ExtendedOrbitalParams) => Promise<void>;
  readonly controlPanel: ControlPanel;
  readonly periodicTableView: PeriodicTableView;
  readonly bondingView: BondingView;
  readonly moleculeView: MoleculeView;
  readonly spectroscopyView: SpectroscopyView;
  readonly nucleusView: NucleusView;
  readonly historyView: HistoryView;
}

function createDeepLinkTables(deps: DeepLinkTablesDeps): {
  stateReaders: Record<TabId, () => DeepLinkState>;
  stateAppliers: StateApplierMap;
} {
  const ensureTab = (target: TabId): void => {
    if (deps.getActiveTab() !== target) {
      deps.switchTab(target);
    }
  };

  const stateReaders: Record<TabId, () => DeepLinkState> = {
    'periodic-table': () => ({
      tab: 'periodic-table',
      ...deps.periodicTableView.getDeepLinkState(),
    }),
    orbitals: () => readOrbitalDeepLinkState(deps.controlPanel.getParams()),
    bonding: () => ({ tab: 'bonding', ...deps.bondingView.getDeepLinkParams() }),
    molecules: () => ({ tab: 'molecules', mol: deps.moleculeView.getCurrentMoleculeId() }),
    spectroscopy: () => ({
      tab: 'spectroscopy',
      ...deps.spectroscopyView.getDeepLinkParams(),
    }),
    nucleus: () => ({ tab: 'nucleus', ...deps.nucleusView.getDeepLinkParams() }),
    history: () => ({ tab: 'history', era: deps.historyView.getEra() }),
  };

  const stateAppliers: StateApplierMap = {
    'periodic-table': (s) => {
      deps.periodicTableView.setToolbarState({
        block: s.block,
        colorScheme: s.colorScheme,
      });
      if (s.el !== undefined) deps.periodicTableView.selectElementByZ(s.el);
      deps.switchTab('periodic-table');
    },
    orbitals: (s) =>
      applyOrbitalDeepLink(
        s,
        deps.controlPanel,
        deps.getActiveTab(),
        deps.loadOrbital,
        deps.switchTab,
      ),
    bonding: (s) => {
      ensureTab('bonding');
      deps.bondingView.applyDeepLinkParams(s);
    },
    molecules: (s) => {
      if (s.mol) deps.moleculeView.selectMolecule(s.mol);
      ensureTab('molecules');
    },
    spectroscopy: (s) => {
      ensureTab('spectroscopy');
      deps.spectroscopyView.applyDeepLinkParams(s);
    },
    nucleus: (s) => {
      ensureTab('nucleus');
      deps.nucleusView.applyDeepLinkParams(s);
    },
    history: (s) => {
      if (s.era) deps.historyView.setEra(s.era);
      ensureTab('history');
    },
  };

  return { stateReaders, stateAppliers };
}

interface AppStateControllerDeps {
  readonly getActiveTab: () => TabId;
  readonly stateReaders: Record<TabId, () => DeepLinkState>;
  readonly stateAppliers: StateApplierMap;
  readonly showShareToast: () => void;
}

function createAppStateController(deps: AppStateControllerDeps): {
  appController: AppController;
  scheduleUrlSync: () => void;
} {
  const urlSync = createUrlSync(250);
  let isApplyingDeepLink = false;
  let challengeMasked = false;

  const getCurrentState = (): DeepLinkState => deps.stateReaders[deps.getActiveTab()]();

  const getUrlTargetState = (): DeepLinkState =>
    challengeMasked ? { tab: 'orbitals' } : getCurrentState();

  const scheduleUrlSync = (): void => {
    if (isApplyingDeepLink) return;
    urlSync.sync(getUrlTargetState());
  };

  const applyDeepLinkState = (state: DeepLinkState): void => {
    isApplyingDeepLink = true;
    const apply = deps.stateAppliers[state.tab] as (s: DeepLinkState) => void;
    apply(state);
    isApplyingDeepLink = false;
    scheduleUrlSync();
  };

  const setChallengeMask = (masked: boolean): void => {
    const wasMasked = challengeMasked;
    challengeMasked = masked;
    document.body.classList.toggle('orbital-challenge-active', masked);
    if (wasMasked && !masked) {
      scheduleUrlSync();
    }
  };

  const shareCurrentUrl = async (): Promise<void> => {
    urlSync.flush(getUrlTargetState());
    await navigator.clipboard.writeText(window.location.href);
    deps.showShareToast();
  };

  return {
    appController: {
      getCurrentState,
      applyDeepLinkState,
      setChallengeMask,
      shareCurrentUrl,
    },
    scheduleUrlSync,
  };
}

function stepOrbitalPrincipalQuantum(
  delta: number,
  controlPanel: ControlPanel,
  loadOrbital: (params: ExtendedOrbitalParams) => Promise<void>,
  onChanged: () => void,
): void {
  const prevN = controlPanel.getParams().n;
  controlPanel.setParams({ n: prevN + delta });
  if (controlPanel.getParams().n !== prevN) {
    void loadOrbital(controlPanel.getParams());
    onChanged();
  }
}

function bootInitialState(
  appController: AppController,
  switchTab: (tab: TabId) => void,
): void {
  const initialLink = parseUrlState(window.location.search);
  if (initialLink !== null) {
    appController.applyDeepLinkState(initialLink);
    return;
  }

  // Boots through `switchTab` rather than starting the orbital renderer by hand,
  // so the canvas, all renderers, the gizmo, the HUD and the inspector preview
  // all begin in the state DEFAULT_TAB implies. A renderer left running behind a
  // hidden tab is a tab that costs a full frame budget for nothing.
  switchTab(DEFAULT_TAB);

  if (localStorage.getItem('skipIntroModal') !== 'true') {
    ExplanationModal.show(getStrings().explainIntro, {
      showDontShowAgain: true,
      storageKey: 'skipIntroModal',
    });
  }
}

function init(): void {
  const canvas = document.getElementById('orbital-canvas') as HTMLCanvasElement;
  const uiOverlay = document.getElementById('ui-overlay') as HTMLElement;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
    precision: 'highp',
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(new THREE.Color('#08090d'));

  const orbitalRenderer = new OrbitalRenderer({ canvas, renderer });
  const bondingRenderer = new BondingRenderer({ canvas, renderer });
  const moleculeRenderer = new MoleculeRenderer({ canvas, renderer });
  moleculeRenderer.stop();
  const spectroscopyRenderer = new SpectroscopyRenderer({ canvas, renderer });
  const nucleusRenderer = new NucleusRenderer({ canvas, renderer });
  const historyRenderer = new HistoryRenderer({ canvas, renderer });

  const renderers3D: Record<Tab3D, BaseThreeRenderer> = {
    orbitals: orbitalRenderer,
    bonding: bondingRenderer,
    molecules: moleculeRenderer,
    spectroscopy: spectroscopyRenderer,
    nucleus: nucleusRenderer,
    history: historyRenderer,
  };

  // The element inspector's thumbnail keeps its own context, so it is not part of
  // the shared canvas above and is driven off the tab switch instead.
  const orbitalPreview = new OrbitalPreview();

  let activeTab: TabId = DEFAULT_TAB;
  const getActiveTab = (): TabId => activeTab;
  const getActiveRenderer = (): BaseThreeRenderer =>
    activeTab === 'periodic-table' ? orbitalRenderer : renderers3D[activeTab];

  const navContainer = document.createElement('div');
  navContainer.className = 'top-nav-container';
  uiOverlay.appendChild(navContainer);

  const viewLayers = createViewLayers(uiOverlay);
  const orientationGizmo = new OrientationGizmo(uiOverlay);

  const toggleZenMode = (): void => {
    document.body.classList.toggle('zen-mode');
  };
  createZenRestoreButton(uiOverlay, toggleZenMode);

  const viewportHud = new ViewportHUD(uiOverlay, {
    onResetCamera: () => {
      getActiveRenderer().resetCamera();
    },
    onToggleAutoRotate: () => {
      const newState = getActiveRenderer().toggleAutoRotate();
      viewportHud.setAutoRotateState(newState);
    },
    onToggleZenMode: toggleZenMode,
    onShareLink: () => {
      void appController.shareCurrentUrl();
    },
  });

  // The FPS readout lives inside the HUD so the side panels can never cover it.
  FPSDisplay.start(viewportHud.getExtraSlot());

  const showShareToast = createShareToast(uiOverlay);

  const imageExporterModal = new ImageExporterModal((options) => {
    return getActiveRenderer().captureSnapshot(options);
  });
  const openExporter = (): void => imageExporterModal.open();

  const updatePhysicalScaleText = (): void => {
    const text = formatPhysicalScaleText(activeTab, controlPanel.getParams());
    if (text) viewportHud.updateScale(text);
  };

  const { loadOrbital, resetOverlayCache } = createOrbitalLoader(
    orbitalRenderer,
    updatePhysicalScaleText,
  );

  const controlPanel = new ControlPanel(
    viewLayers['orbitals'],
    (params) => {
      void loadOrbital(params);
      scheduleUrlSync();
    },
    openExporter,
  );

  const periodicTableView = new PeriodicTableView(
    viewLayers['periodic-table'],
    async (element: ElementData) => {
      const { n, l, m, s, zEff } = await calculateValenceQuantumNumbers(element.Z);
      controlPanel.setParams({ atomicNumber: element.Z, n, l, m, s, zEff });
      switchTab('orbitals');
    },
    orbitalPreview,
  );

  const bondingView = new BondingView(
    viewLayers['bonding'],
    bondingRenderer,
    createTabScaleHandler(getActiveTab, viewportHud, 'bonding'),
    openExporter,
  );

  const moleculeView = new MoleculeView(viewLayers['molecules'], moleculeRenderer);

  const spectroscopyView = new SpectroscopyView(
    viewLayers['spectroscopy'],
    spectroscopyRenderer,
    openExporter,
    createTabScaleHandler(getActiveTab, viewportHud, 'spectroscopy'),
  );

  const nucleusView = new NucleusView(
    viewLayers['nucleus'],
    nucleusRenderer,
    createTabScaleHandler(getActiveTab, viewportHud, 'nucleus'),
    openExporter,
  );

  historyRenderer.onScaleChange = createTabScaleHandler(getActiveTab, viewportHud, 'history');
  const historyView = new HistoryView(
    viewLayers['history'],
    historyRenderer,
    ({ n, l, m }) => {
      controlPanel.setParams({ n, l, m, zEff: 1.0, useRealOrbital: true });
      switchTab('orbitals');
    },
  );

  const tabActivators: Record<Tab3D, () => void> = {
    orbitals: () => {
      void loadOrbital(controlPanel.getParams());
    },
    bonding: () => bondingView.activate(),
    molecules: () => {
      updatePhysicalScaleText();
      moleculeView.getSelectedMolecule();
    },
    spectroscopy: () => spectroscopyView.activate(),
    nucleus: () => nucleusView.activate(),
    history: () => historyView.activate(),
  };

  const viewportContext: ViewportSwitchContext = {
    canvas,
    renderers3D,
    orientationGizmo,
    viewportHud,
    periodicTableView,
    tabActivators,
  };

  const switchTab = (newTab: TabId): void => {
    if (newTab !== 'orbitals' && guidedLearning.isChallengeMasked()) {
      guidedLearning.exitActiveMode();
    }
    activeTab = newTab;
    resetOverlayCache();
    navBar.setActiveTab(newTab);
    orbitalPreview.setActive(newTab === 'periodic-table');
    closeAllMobileOverlays();

    Object.entries(viewLayers).forEach(([id, layer]) => {
      layer.classList.toggle('active', id === newTab);
    });

    syncViewportForTab(newTab, viewportContext);
    scheduleUrlSync();
  };

  const { stateReaders, stateAppliers } = createDeepLinkTables({
    getActiveTab,
    switchTab,
    loadOrbital,
    controlPanel,
    periodicTableView,
    bondingView,
    moleculeView,
    spectroscopyView,
    nucleusView,
    historyView,
  });

  const { appController, scheduleUrlSync } = createAppStateController({
    getActiveTab,
    stateReaders,
    stateAppliers,
    showShareToast,
  });

  periodicTableView.onStateChange = scheduleUrlSync;
  bondingView.onStateChange = scheduleUrlSync;
  moleculeView.onStateChange = scheduleUrlSync;
  spectroscopyView.onStateChange = scheduleUrlSync;
  nucleusView.onStateChange = scheduleUrlSync;
  historyView.onStateChange = scheduleUrlSync;

  const guidedLearning = new GuidedLearningController(uiOverlay, appController);

  const navBar = new NavigationBar(navContainer, {
    onTabChange: switchTab,
    onZenToggle: toggleZenMode,
    onOpenGuided: () => guidedLearning.openLauncher(),
    onShareLink: () => {
      void appController.shareCurrentUrl();
    },
  });

  window.addEventListener('resize', () => {
    if (activeTab !== 'periodic-table') {
      getActiveRenderer().onWindowResize();
    }
  });

  bindGlobalKeyboardShortcuts({
    getActiveTab,
    switchTab,
    toggleAutoRotate: () => {
      const activeRenderer = getActiveRenderer();
      viewportHud.setAutoRotateState(activeRenderer.toggleAutoRotate());
    },
    resetCamera: () => getActiveRenderer().resetCamera(),
    openExporter,
    toggleZenMode,
    stepPrincipalQuantum: (delta) =>
      stepOrbitalPrincipalQuantum(delta, controlPanel, loadOrbital, scheduleUrlSync),
  });

  bootInitialState(appController, switchTab);
}

window.addEventListener('DOMContentLoaded', () => {
  init();
});
