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

  const orbitalRenderer = new OrbitalRenderer(canvas);
  const moleculeRenderer = new MoleculeRenderer(canvas);

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
          orbitalRenderer.updateIsosurface(params);
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

  new PeriodicTableView(viewLayers['periodic-table'], async (element: ElementData) => {
    const { n, l, m, zEff } = await calculateValenceQuantumNumbers(element.Z);
    controlPanel.setParams({ n, l, m, zEff });
    switchTab('orbitals');
  });

  new MoleculeView(viewLayers['molecules'], moleculeRenderer);

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
      getActiveRenderer().resetCamera(true);
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
      moleculeRenderer.start();
      updatePhysicalScaleText();
    } else if (newTab === 'periodic-table') {
      canvas.style.display = 'none';
      orbitalRenderer.stop();
      moleculeRenderer.stop();
      orbitalRenderer.setGizmo(null);
      moleculeRenderer.setGizmo(null);
      orientationGizmo.setVisible(false);
      viewportHud.setVisible(false);
    }
  };

  const navBar = new NavigationBar(navContainer, switchTab, toggleZenMode);

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    ) {
      return;
    }

    if (e.key === '1') {
      e.preventDefault();
      switchTab('orbitals');
    } else if (e.key === '2') {
      e.preventDefault();
      switchTab('periodic-table');
    } else if (e.key === '3') {
      e.preventDefault();
      switchTab('molecules');
    } else if (e.code === 'Space') {
      e.preventDefault();
      if (activeTab === 'orbitals' || activeTab === 'molecules') {
        const renderer = getActiveRenderer();
        const newState = renderer.toggleAutoRotate();
        viewportHud.setAutoRotateState(newState);
      }
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      if (activeTab === 'orbitals' || activeTab === 'molecules') {
        getActiveRenderer().resetCamera(true);
      }
    } else if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      imageExporterModal.open();
    } else if (e.key === 'ArrowUp') {
      if (activeTab === 'orbitals') {
        e.preventDefault();
        const current = controlPanel.getParams();
        if (current.n < 7) {
          controlPanel.setParams({ n: current.n + 1 });
          loadOrbital(controlPanel.getParams());
        }
      }
    } else if (e.key === 'ArrowDown') {
      if (activeTab === 'orbitals') {
        e.preventDefault();
        const current = controlPanel.getParams();
        if (current.n > 1) {
          controlPanel.setParams({ n: current.n - 1 });
          loadOrbital(controlPanel.getParams());
        }
      }
    } else if (e.key === 'h' || e.key === 'H') {
      e.preventDefault();
      toggleZenMode();
    } else if (e.key === 'Escape' && document.body.classList.contains('zen-mode')) {
      e.preventDefault();
      toggleZenMode();
    }
  });

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
