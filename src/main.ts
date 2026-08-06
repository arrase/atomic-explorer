import { sampleOrbitalPoints } from './core/wasm-bridge';
import { OrbitalRenderer } from './render/orbital-renderer';
import { MoleculeRenderer } from './render/molecule-renderer';

import { NavigationBar, TabId } from './ui/nav';
import { ControlPanel, ExtendedOrbitalParams } from './ui/controls';
import { PeriodicTableView, ElementData } from './ui/periodic-table';
import { MoleculeView } from './ui/molecule-view';
import { FPSDisplay } from './ui/fps-display';

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

  // 4. Orbital Loader Callback
  const loadOrbital = async (params: ExtendedOrbitalParams) => {
    try {
      document.body.classList.add('loading');
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

  // 5. Instantiate UI Components
  const controlPanel = new ControlPanel(viewLayers['orbitals'], loadOrbital);

  const periodicTableView = new PeriodicTableView(viewLayers['periodic-table'], (element: ElementData) => {
    // Estimate valence quantum numbers and Z_eff
    const n = Math.min(4, Math.ceil(element.Z / 10));
    const l = Math.min(n - 1, 1);
    const m = 0;
    const zEff = Math.max(1.0, element.Z * 0.3);

    controlPanel.setParams({ n, l, m, zEff });
    switchTab('orbitals');
  });

  const moleculeView = new MoleculeView(viewLayers['molecules'], moleculeRenderer);

  // Keep references to quiet unused linter warnings
  void periodicTableView;
  void moleculeView;

  // 6. Tab Switcher
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
      loadOrbital(controlPanel.getParams());
    } else if (newTab === 'molecules') {
      moleculeRenderer.animate();
    }
  };

  const navBar = new NavigationBar(navContainer, switchTab);

  // 7. Initial Load
  await loadOrbital(controlPanel.getParams());
  orbitalRenderer.animate();
}

window.addEventListener('DOMContentLoaded', init);
