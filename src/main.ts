import { sampleOrbitalPoints } from './core/wasm-bridge';
import { OrbitalRenderer } from './render/orbital-renderer';
import { MoleculeRenderer } from './render/molecule-renderer';
import { getStrings } from './i18n';

import { NavigationBar, TabId } from './ui/nav';
import { ControlPanel, ExtendedOrbitalParams } from './ui/controls';
import { PeriodicTableView, ElementData } from './ui/periodic-table';
import { MoleculeView } from './ui/molecule-view';
import { FPSDisplay } from './ui/fps-display';
import { ImageExporterModal } from './ui/image-exporter';
import { InfoModal } from './ui/info-modal';

async function init() {
  const canvas = document.getElementById('orbital-canvas') as HTMLCanvasElement;
  const uiOverlay = document.getElementById('ui-overlay') as HTMLElement;
  const fpsCounter = document.getElementById('fps-counter') as HTMLElement;

  if (!canvas || !uiOverlay || !fpsCounter) {
    console.error('Required DOM elements not found');
    return;
  }

  // 1. Initialize Renderers
  const orbitalRenderer = new OrbitalRenderer(canvas);
  const moleculeRenderer = new MoleculeRenderer(canvas);

  // Active renderer manager
  let activeTab: TabId = 'orbitals';

  // 2. Setup Top Navigation Bar Container
  const navContainer = document.createElement('div');
  navContainer.className = 'top-nav-container';
  uiOverlay.appendChild(navContainer);

  // 3. Setup Tab View Layers
  const viewLayers: Record<TabId, HTMLElement> = {
    'orbitals': document.createElement('div'),
    'periodic-table': document.createElement('div'),
    'molecules': document.createElement('div'),
  };

  Object.entries(viewLayers).forEach(([id, layer]) => {
    layer.className = `view-layer ${id}-layer ${id === activeTab ? 'active' : ''}`;
    uiOverlay.appendChild(layer);
  });

  new FPSDisplay(fpsCounter);

  // 4. Image Exporter Modal
  const imageExporterModal = new ImageExporterModal(async (options) => {
    if (activeTab === 'molecules') {
      return moleculeRenderer.captureSnapshot(options);
    }
    return orbitalRenderer.captureSnapshot(options);
  });

  // 5. Orbital Loader Callback
  const loadOrbital = async (params: ExtendedOrbitalParams) => {
    try {
      document.body.classList.add('loading');
      orbitalRenderer.updateParams(params);

      if (params.mode === 'points') {
        const points = await sampleOrbitalPoints(params);
        orbitalRenderer.setPointCloud(points);
      } else if (params.mode === 'isosurface') {
        orbitalRenderer.updateIsosurface(params);
      } else if (params.mode === 'raymarching') {
        orbitalRenderer.updateRaymarching(params);
      }
    } catch (err) {
      console.error('Failed to load orbital:', err);
    } finally {
      document.body.classList.remove('loading');
    }
  };

  // 6. Instantiate UI Components
  const controlPanel = new ControlPanel(
    viewLayers['orbitals'],
    loadOrbital,
    () => imageExporterModal.open()
  );

  const calculateValenceQuantumNumbers = (Z: number) => {
    let n = 1;
    if (Z >= 3 && Z <= 10) n = 2;
    else if (Z >= 11 && Z <= 18) n = 3;
    else if (Z >= 19) n = 4; // Clamped to max n=4 supported by math engine

    let l = 0;
    if (Z === 1 || Z === 2) {
      l = 0;
    } else if (
      (Z >= 5 && Z <= 10) ||
      (Z >= 13 && Z <= 18) ||
      (Z >= 31 && Z <= 36) ||
      (Z >= 49 && Z <= 54) ||
      (Z >= 81 && Z <= 86)
    ) {
      l = 1;
    } else if (
      (Z >= 21 && Z <= 30) ||
      (Z >= 39 && Z <= 48) ||
      (Z >= 71 && Z <= 80) ||
      (Z >= 103 && Z <= 112)
    ) {
      l = Math.min(n - 1, 2);
    } else if ((Z >= 57 && Z <= 70) || (Z >= 89 && Z <= 102)) {
      l = Math.min(n - 1, 3);
    } else {
      l = 0;
    }

    const m = 0;
    const zEff = Math.min(30.0, Math.max(1.0, 1.0 + (Z - 1) * 0.35));

    return { n, l, m, zEff: parseFloat(zEff.toFixed(2)) };
  };

  const periodicTableView = new PeriodicTableView(viewLayers['periodic-table'], (element: ElementData) => {
    const { n, l, m, zEff } = calculateValenceQuantumNumbers(element.Z);
    controlPanel.setParams({ n, l, m, zEff, elementZ: element.Z });
    switchTab('orbitals');
  });

  const moleculeView = new MoleculeView(viewLayers['molecules'], moleculeRenderer);

  // Keep references to quiet unused linter warnings
  void periodicTableView;
  void moleculeView;

  // 7. Tab Switcher
  const switchTab = (newTab: TabId) => {
    activeTab = newTab;
    navBar.setActiveTab(newTab);

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

  // 8. Initial Load
  await loadOrbital(controlPanel.getParams());
  orbitalRenderer.start();

  InfoModal.show(getStrings().explainIntro as any);
}

window.addEventListener('DOMContentLoaded', init);

