import * as THREE from 'three';
import { sampleOrbitalPoints, getSlaterZEff } from './core/wasm-bridge';
import { OrbitalRenderer } from './render/orbital-renderer';
import { MoleculeRenderer } from './render/molecule-renderer';
import { OrientationGizmo } from './render/orientation-gizmo';
import { ViewportHUD } from './ui/viewport-hud';
import { getStrings, onLanguageChange } from './i18n';
import { icon } from './ui/icons';

import { NavigationBar, TabId } from './ui/nav';
import { ControlPanel, ExtendedOrbitalParams } from './ui/controls';
import { PeriodicTableView, ElementData } from './ui/periodic-table';
import { MoleculeView } from './ui/molecule-view';
import { FPSDisplay } from './ui/fps-display';
import { ImageExporterModal } from './ui/image-exporter';
import { ExplanationModal } from './ui/info-modal';

const AUFBAU_TABLE: [number, number, number][] = [
  [2, 1, 0], [4, 2, 0], [10, 2, 1], [12, 3, 0], [18, 3, 1],
  [20, 4, 0], [30, 3, 2], [36, 4, 1], [38, 5, 0], [48, 4, 2],
  [54, 5, 1], [56, 6, 0], [70, 4, 3], [80, 5, 2], [86, 6, 1],
  [88, 7, 0], [102, 5, 3], [112, 6, 2], [Infinity, 7, 1],
];

async function calculateValenceQuantumNumbers(Z: number) {
  const [, n, l] = AUFBAU_TABLE.find(([maxZ]) => Z <= maxZ)!;
  const m = 0;
  const zEff = await getSlaterZEff(Z, n, l);
  return { n, l, m, zEff: Math.round(zEff * 100) / 100 };
}

async function init() {
  const canvas = document.getElementById('orbital-canvas') as HTMLCanvasElement;
  const uiOverlay = document.getElementById('ui-overlay') as HTMLElement;
  const fpsCounter = document.getElementById('fps-counter') as HTMLElement;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
    precision: 'highp',
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(new THREE.Color('#0a0a1a'));

  const orbitalRenderer = new OrbitalRenderer({ canvas, renderer });
  const moleculeRenderer = new MoleculeRenderer({ canvas, renderer });
  moleculeRenderer.stop();

  let activeTab: TabId = 'orbitals';

  const navContainer = document.createElement('div');
  navContainer.className = 'top-nav-container';
  uiOverlay.appendChild(navContainer);

  const viewLayers: Record<TabId, HTMLElement> = {
    orbitals: document.createElement('div'),
    'periodic-table': document.createElement('div'),
    molecules: document.createElement('div'),
  };

  Object.entries(viewLayers).forEach(([id, layer]) => {
    layer.className = `view-layer ${id}-layer ${id === activeTab ? 'active' : ''}`;
    uiOverlay.appendChild(layer);
  });

  new FPSDisplay(fpsCounter);

  const orientationGizmo = new OrientationGizmo(uiOverlay);
  orbitalRenderer.setGizmo(orientationGizmo);

  const getActiveRenderer = () => (activeTab === 'molecules' ? moleculeRenderer : orbitalRenderer);

  const imageExporterModal = new ImageExporterModal(async (options) => {
    return getActiveRenderer().captureSnapshot(options);
  });

  let currentLoadRequestId = 0;

  const updatePhysicalScaleText = () => {
    if (activeTab === 'orbitals') {
      const p = controlPanel.getParams();
      const extent = (4.0 * (p.n * p.n)) / p.zEff;
      const pm = Math.round(extent * 52.9177);
      viewportHud.updateScale(`r ≈ ${extent.toFixed(1)} a₀ (${pm} pm)`);
    } else if (activeTab === 'molecules') {
      viewportHud.updateScale(`1 Å = 100 pm (1.89 a₀)`);
    }
  };

  const loadOrbital = async (params: ExtendedOrbitalParams) => {
    const requestId = ++currentLoadRequestId;
    try {
      document.body.classList.add('loading');

      if (params.mode === 'points') {
        orbitalRenderer.updateParams(params);
        const points = await sampleOrbitalPoints(params);
        if (requestId === currentLoadRequestId) {
          orbitalRenderer.setPointCloud(points);
        }
      } else if (params.mode === 'isosurface') {
        if (requestId === currentLoadRequestId) {
          await orbitalRenderer.updateIsosurface(params);
        }
      } else if (params.mode === 'raymarching') {
        if (requestId === currentLoadRequestId) {
          orbitalRenderer.updateRaymarching(params);
        }
      }
    } finally {
      if (requestId === currentLoadRequestId) {
        document.body.classList.remove('loading');
        updatePhysicalScaleText();
      }
    }
  };

  const controlPanel = new ControlPanel(
    viewLayers['orbitals'],
    loadOrbital,
    () => imageExporterModal.open()
  );

  const periodicTableView = new PeriodicTableView(viewLayers['periodic-table'], async (element: ElementData) => {
    const { n, l, m, zEff } = await calculateValenceQuantumNumbers(element.Z);
    controlPanel.setParams({ n, l, m, zEff });
    switchTab('orbitals');
  });

  const moleculeView = new MoleculeView(viewLayers['molecules'], moleculeRenderer);

  // Zen Mode Setup

  const zenRestoreBtn = document.createElement('button');
  zenRestoreBtn.className = 'zen-restore-btn';
  zenRestoreBtn.id = 'zen-restore-btn';
  const updateZenRestoreBtnText = () => {
    const text = getStrings().exitZenMode;
    zenRestoreBtn.title = text;
    zenRestoreBtn.setAttribute('aria-label', text);
    zenRestoreBtn.innerHTML = `${icon('eye')} <span>${text}</span>`;
  };
  updateZenRestoreBtnText();
  onLanguageChange(updateZenRestoreBtnText);
  uiOverlay.appendChild(zenRestoreBtn);

  const toggleZenMode = () => {
    document.body.classList.toggle('zen-mode');
  };

  zenRestoreBtn.addEventListener('click', toggleZenMode);

  const viewportHud = new ViewportHUD(uiOverlay, {
    onResetCamera: () => {
      getActiveRenderer().resetCamera();
    },
    onToggleAutoRotate: () => {
      const renderer = getActiveRenderer();
      const newState = renderer.toggleAutoRotate();
      viewportHud.setAutoRotateState(newState);
    },
    onToggleZenMode: () => {
      toggleZenMode();
    },
  });

  const switchTab = (newTab: TabId) => {
    activeTab = newTab;
    navBar.setActiveTab(newTab);

    // Close any open mobile drawers, backdrops, or floating buttons when switching tabs
    document.querySelectorAll('.mobile-open').forEach((el) => el.classList.remove('mobile-open'));
    document.querySelectorAll('.mobile-drawer-backdrop.active').forEach((el) => el.classList.remove('active'));
    document.querySelectorAll('.mobile-float-btn.active').forEach((el) => el.classList.remove('active'));
    document.querySelectorAll('.nav-tabs.mobile-open').forEach((el) => el.classList.remove('mobile-open'));

    Object.entries(viewLayers).forEach(([id, layer]) => {
      if (id === newTab) {
        layer.classList.add('active');
      } else {
        layer.classList.remove('active');
      }
    });

    if (newTab === 'orbitals') {
      canvas.style.display = 'block';
      moleculeRenderer.stop();
      moleculeRenderer.setGizmo(null);
      orbitalRenderer.setGizmo(orientationGizmo);
      orientationGizmo.setVisible(true);
      viewportHud.setVisible(true);
      viewportHud.setAutoRotateState(orbitalRenderer.isAutoRotating());
      orbitalRenderer.onWindowResize();
      orbitalRenderer.start();
      loadOrbital(controlPanel.getParams());
    } else if (newTab === 'molecules') {
      canvas.style.display = 'block';
      orbitalRenderer.stop();
      orbitalRenderer.setGizmo(null);
      moleculeRenderer.setGizmo(orientationGizmo);
      orientationGizmo.setVisible(true);
      viewportHud.setVisible(true);
      viewportHud.setAutoRotateState(moleculeRenderer.isAutoRotating());
      moleculeRenderer.onWindowResize();
      moleculeRenderer.start();
      updatePhysicalScaleText();
      moleculeView.getSelectedMolecule();
    } else if (newTab === 'periodic-table') {
      canvas.style.display = 'none';
      orbitalRenderer.stop();
      moleculeRenderer.stop();
      orbitalRenderer.setGizmo(null);
      moleculeRenderer.setGizmo(null);
      orientationGizmo.setVisible(false);
      viewportHud.setVisible(false);
      periodicTableView.getSelectedElement();
    }
  };

  window.addEventListener('resize', () => {
    if (activeTab !== 'periodic-table') {
      getActiveRenderer().onWindowResize();
    }
  });

  const navBar = new NavigationBar(navContainer, switchTab, toggleZenMode);

  // Global Keyboard Shortcuts
  const handleTabShortcut = (key: string): boolean => {
    const tabMap: Record<string, TabId> = {
      '1': 'orbitals',
      '2': 'periodic-table',
      '3': 'molecules',
    };
    const tab = tabMap[key];
    if (tab) {
      switchTab(tab);
      return true;
    }
    return false;
  };

  const handleActionShortcut = (e: KeyboardEvent): boolean => {
    const key = e.key.toLowerCase();
    if (e.code === 'Space') {
      if (activeTab === 'orbitals' || activeTab === 'molecules') {
        const renderer = getActiveRenderer();
        viewportHud.setAutoRotateState(renderer.toggleAutoRotate());
      }
      return true;
    }
    if (key === 'r') {
      if (activeTab === 'orbitals' || activeTab === 'molecules') {
        getActiveRenderer().resetCamera();
      }
      return true;
    }
    if (key === 'p') {
      imageExporterModal.open();
      return true;
    }
    if (key === 'h' || (e.key === 'Escape' && document.body.classList.contains('zen-mode'))) {
      toggleZenMode();
      return true;
    }
    return false;
  };

  const handleArrowShortcut = (key: string): boolean => {
    if (activeTab !== 'orbitals') return false;
    if (key !== 'ArrowUp' && key !== 'ArrowDown') return false;
    const current = controlPanel.getParams();
    const nextN = key === 'ArrowUp' ? current.n + 1 : current.n - 1;
    if (nextN >= 1 && nextN <= 7) {
      controlPanel.setParams({ n: nextN });
      loadOrbital(controlPanel.getParams());
    }
    return true;
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    ) {
      return;
    }

    if (handleTabShortcut(e.key) || handleActionShortcut(e) || handleArrowShortcut(e.key)) {
      e.preventDefault();
    }
  };

  window.addEventListener('keydown', handleKeyDown);



  await loadOrbital(controlPanel.getParams());
  orbitalRenderer.start();

  if (localStorage.getItem('skipIntroModal') !== 'true') {
    ExplanationModal.show(getStrings().explainIntro, {
      showDontShowAgain: true,
      storageKey: 'skipIntroModal',
    });
  }
}

window.addEventListener('DOMContentLoaded', init);
