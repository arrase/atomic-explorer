import { sampleOrbitalPoints, getSlaterZEff } from './core/wasm-bridge';
import { OrbitalRenderer } from './render/orbital-renderer';
import { MoleculeRenderer } from './render/molecule-renderer';
import { getStrings } from './i18n';

import { NavigationBar, TabId } from './ui/nav';
import { ControlPanel, ExtendedOrbitalParams } from './ui/controls';
import { PeriodicTableView, ElementData } from './ui/periodic-table';
import { MoleculeView } from './ui/molecule-view';
import { FPSDisplay } from './ui/fps-display';
import { ImageExporterModal } from './ui/image-exporter';
import { ExplanationModal } from './ui/info-modal';

async function calculateValenceQuantumNumbers(Z: number) {
  let n = 1;
  let l = 0;

  if (Z <= 2) {
    n = 1; l = 0; // 1s
  } else if (Z <= 4) {
    n = 2; l = 0; // 2s
  } else if (Z <= 10) {
    n = 2; l = 1; // 2p
  } else if (Z <= 12) {
    n = 3; l = 0; // 3s
  } else if (Z <= 18) {
    n = 3; l = 1; // 3p
  } else if (Z <= 20) {
    n = 4; l = 0; // 4s
  } else if (Z <= 30) {
    n = 3; l = 2; // 3d
  } else if (Z <= 36) {
    n = 4; l = 1; // 4p
  } else if (Z <= 38) {
    n = 5; l = 0; // 5s
  } else if (Z <= 48) {
    n = 4; l = 2; // 4d
  } else if (Z <= 54) {
    n = 5; l = 1; // 5p
  } else if (Z <= 56) {
    n = 6; l = 0; // 6s
  } else if (Z <= 70) {
    n = 4; l = 3; // 4f (Lanthanides)
  } else if (Z <= 80) {
    n = 5; l = 2; // 5d
  } else if (Z <= 86) {
    n = 6; l = 1; // 6p
  } else if (Z <= 88) {
    n = 7; l = 0; // 7s
  } else if (Z <= 102) {
    n = 5; l = 3; // 5f (Actinides: e.g. Americium Z=95)
  } else if (Z <= 112) {
    n = 6; l = 2; // 6d
  } else {
    n = 7; l = 1; // 7p
  }

  const m = 0;
  const zEff = await getSlaterZEff(Z, n, l);
  return { n, l, m, zEff: parseFloat(zEff.toFixed(2)) };
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

  const imageExporterModal = new ImageExporterModal(async (options) => {
    if (activeTab === 'molecules') {
      return moleculeRenderer.captureSnapshot(options);
    }
    return orbitalRenderer.captureSnapshot(options);
  });

  let currentLoadRequestId = 0;

  const loadOrbital = async (params: ExtendedOrbitalParams) => {
    const requestId = ++currentLoadRequestId;
    try {
      document.body.classList.add('loading');
      orbitalRenderer.updateParams(params);

      if (params.mode === 'points') {
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
    controlPanel.setParams({ n, l, m, zEff, elementZ: element.Z });
    switchTab('orbitals');
  });

  new MoleculeView(viewLayers['molecules'], moleculeRenderer);

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
      orbitalRenderer.start();
      loadOrbital(controlPanel.getParams());
    } else if (newTab === 'molecules') {
      canvas.style.display = 'block';
      orbitalRenderer.stop();
      moleculeRenderer.start();
    } else if (newTab === 'periodic-table') {
      canvas.style.display = 'none';
      orbitalRenderer.stop();
      moleculeRenderer.stop();
    }
  };

  const navBar = new NavigationBar(navContainer, switchTab);

  await loadOrbital(controlPanel.getParams());
  orbitalRenderer.start();

  if (localStorage.getItem('skipIntroModal') !== 'true') {
    ExplanationModal.show(getStrings().explainIntro, {
      showDontShowAgain: true,
      storageKey: 'skipIntroModal'
    });
  }
}

window.addEventListener('DOMContentLoaded', init);


