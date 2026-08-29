import { ExtendedOrbitalParams } from './controls';
import { getStrings, onLanguageChange } from '../i18n';
import { ExplanationModal } from './info-modal';

export class OrbitalPhysicsPanel {
  private container: HTMLElement;
  private currentParams: ExtendedOrbitalParams;
  private panelElement: HTMLElement | null = null;
  private unsubscribeLang: (() => void) | null = null;

  constructor(container: HTMLElement, params: ExtendedOrbitalParams) {
    this.container = container;
    this.currentParams = params;
    this.render();
    this.unsubscribeLang = onLanguageChange(() => this.render());
  }

  public updateParams(params: ExtendedOrbitalParams): void {
    this.currentParams = params;
    if (!this.panelElement) {
      this.render();
      return;
    }

    const { n, l, m, useRealOrbital, zEff } = params;
    const radialNodes = n - l - 1;
    const angularNodes = l;
    const totalNodes = n - 1;
    const notation = this.getOrbitalNotation(n, l, m, useRealOrbital);

    const rExpBohr = (0.5 / zEff) * (3 * n * n - l * (l + 1));
    const rExpPm = rExpBohr * 52.917721;
    const energyEv = -13.605693 * (zEff * zEff) / (n * n);

    const seriesMap: Record<number, string> = {
      1: 'Lyman (UV)',
      2: 'Balmer (Visible/UV)',
      3: 'Paschen (Near-IR)',
      4: 'Brackett (IR)',
      5: 'Pfund (Far-IR)',
      6: 'Humphreys (Far-IR)',
    };
    const seriesName = seriesMap[n] || `Shell n=${n}`;

    const badgeVal = this.panelElement.querySelector('#val-active-state') as HTMLElement;
    const radialVal = this.panelElement.querySelector('#val-radial-nodes') as HTMLElement;
    const angularVal = this.panelElement.querySelector('#val-angular-nodes') as HTMLElement;
    const totalVal = this.panelElement.querySelector('#val-total-nodes') as HTMLElement;
    const radiusVal = this.panelElement.querySelector('#val-exp-radius') as HTMLElement;
    const energyVal = this.panelElement.querySelector('#val-energy') as HTMLElement;
    const seriesVal = this.panelElement.querySelector('#val-series') as HTMLElement;
    const zeffVal = this.panelElement.querySelector('#val-zeff') as HTMLElement;

    badgeVal.textContent = `${notation} (n=${n}, l=${l}, m=${m})`;
    radialVal.textContent = String(radialNodes);
    angularVal.textContent = String(angularNodes);
    totalVal.textContent = String(totalNodes);
    radiusVal.innerHTML = `${rExpBohr.toFixed(2)} a₀ <small>(${rExpPm.toFixed(1)} pm)</small>`;
    energyVal.textContent = `${energyEv.toFixed(2)} eV`;
    seriesVal.textContent = seriesName;
    zeffVal.textContent = zEff.toFixed(2);
  }

  private getOrbitalNotation(n: number, l: number, m: number, useRealOrbital: boolean): string {
    const subshellMap = ['s', 'p', 'd', 'f', 'g'];
    const subshell = subshellMap[l] || 's';

    if (!useRealOrbital) {
      const mSign = m >= 0 ? `+${m}` : `${m}`;
      return `${n}${subshell} (m=${mSign})`;
    }

    if (l === 0) {
      return `${n}s`;
    } else if (l === 1) {
      if (m === 0) return `${n}p_z`;
      if (m === 1) return `${n}p_x`;
      if (m === -1) return `${n}p_y`;
    } else if (l === 2) {
      if (m === 0) return `${n}d_{z^2}`;
      if (m === 1) return `${n}d_{xz}`;
      if (m === -1) return `${n}d_{yz}`;
      if (m === 2) return `${n}d_{xy}`;
      if (m === -2) return `${n}d_{x^2-y^2}`;
    } else if (l === 3) {
      if (m === 0) return `${n}f_{z^3}`;
      if (m === 1) return `${n}f_{xz^2}`;
      if (m === -1) return `${n}f_{yz^2}`;
      if (m === 2) return `${n}f_{z(x^2-y^2)}`;
      if (m === -2) return `${n}f_{xyz}`;
      if (m === 3) return `${n}f_{x(x^2-3y^2)}`;
      if (m === -3) return `${n}f_{y(3x^2-y^2)}`;
    }

    return `${n}${subshell}`;
  }

  private render(): void {
    const strings = getStrings();
    const { n, l, m, useRealOrbital, zEff } = this.currentParams;

    const radialNodes = n - l - 1;
    const angularNodes = l;
    const totalNodes = n - 1;
    const notation = this.getOrbitalNotation(n, l, m, useRealOrbital);

    const rExpBohr = (0.5 / zEff) * (3 * n * n - l * (l + 1));
    const rExpPm = rExpBohr * 52.917721;
    const energyEv = -13.605693 * (zEff * zEff) / (n * n);

    const seriesMap: Record<number, string> = {
      1: 'Lyman (UV)',
      2: 'Balmer (Visible/UV)',
      3: 'Paschen (Near-IR)',
      4: 'Brackett (IR)',
      5: 'Pfund (Far-IR)',
      6: 'Humphreys (Far-IR)',
    };
    const seriesName = seriesMap[n] || `Shell n=${n}`;

    if (this.panelElement && this.panelElement.parentNode) {
      this.panelElement.parentNode.removeChild(this.panelElement);
    }

    const panel = document.createElement('div');
    panel.className = 'orbital-physics-panel glass-panel';

    panel.innerHTML = `
      <div class="mobile-drawer-handle"></div>
      <div class="physics-header">
        <div class="physics-header-top">
          <h3>${strings.physicsPanelTitle}</h3>
          <button class="panel-close-btn" id="btn-close-physics" aria-label="Close">✕</button>
        </div>
        <div class="active-state-badge">
          <span class="badge-label">${strings.activeState}:</span>
          <span class="badge-value" id="val-active-state">${notation} (n=${n}, l=${l}, m=${m})</span>
        </div>
      </div>

      <div class="physics-section nodes-section">
        <h4>${strings.nodalBreakdown}</h4>
        <div class="nodes-grid">
          <div class="node-item">
            <div class="node-header">
              <span class="node-label">${strings.radialNodes}</span>
              <button class="btn-info-icon" data-node="radial" aria-label="Info">ℹ️</button>
            </div>
            <span class="node-value" id="val-radial-nodes">${radialNodes}</span>
          </div>
          <div class="node-item">
            <div class="node-header">
              <span class="node-label">${strings.angularNodes}</span>
              <button class="btn-info-icon" data-node="angular" aria-label="Info">ℹ️</button>
            </div>
            <span class="node-value" id="val-angular-nodes">${angularNodes}</span>
          </div>
          <div class="node-item">
            <div class="node-header">
              <span class="node-label">${strings.totalNodes}</span>
              <button class="btn-info-icon" data-node="total" aria-label="Info">ℹ️</button>
            </div>
            <span class="node-value" id="val-total-nodes">${totalNodes}</span>
          </div>
        </div>
      </div>

      <div class="physics-section expectation-section">
        <div class="expectation-grid">
          <div class="expectation-item">
            <div class="node-header">
              <span class="node-label">${strings.expectationRadius}</span>
              <button class="btn-info-icon" data-phys="radius" aria-label="Info">ℹ️</button>
            </div>
            <span class="node-value" id="val-exp-radius">${rExpBohr.toFixed(2)} a₀ <small>(${rExpPm.toFixed(1)} pm)</small></span>
          </div>
          <div class="expectation-item">
            <div class="node-header">
              <span class="node-label">${strings.hydrogenicEnergy}</span>
              <button class="btn-info-icon" data-phys="energy" aria-label="Info">ℹ️</button>
            </div>
            <span class="node-value" id="val-energy">${energyEv.toFixed(2)} eV</span>
          </div>
        </div>
      </div>

      <div class="physics-section formula-section">
        <div class="formula-header">
          <h4>${strings.wavefunctionFormula}</h4>
          <button class="btn-info-icon" data-formula="wavefunction" aria-label="Info">ℹ️</button>
        </div>
        <div class="formula-display">
          <code>&psi;_{n,l,m}(r,&theta;,&phi;) = R_{n,l}(r) &middot; Y_l^m(&theta;,&phi;)</code>
        </div>
        <div class="series-badge">
          <span>${strings.spectralSeries}: <strong id="val-series">${seriesName}</strong></span>
        </div>
      </div>

      <div class="physics-section shielding-section">
        <div class="shielding-header">
          <h4>${strings.shieldingTitle}</h4>
          <button class="btn-info-icon" data-explain="explainZeff" aria-label="Info">ℹ️</button>
        </div>
        <p class="shielding-note">
          Z_eff = <strong id="val-zeff">${zEff.toFixed(2)}</strong> &mdash; ${strings.shieldingNoteDesc}
        </p>
      </div>
    `;

    this.container.appendChild(panel);
    this.panelElement = panel;
    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    const closePhysicsBtn = this.panelElement!.querySelector('#btn-close-physics') as HTMLElement;
    closePhysicsBtn.addEventListener('click', () => {
      this.container.classList.remove('mobile-open');
      const backdrop = document.querySelector('#controls-drawer-backdrop') as HTMLElement;
      backdrop.classList.remove('active');
      const btnShowPhysics = document.querySelector('#btn-show-physics') as HTMLElement;
      btnShowPhysics.classList.remove('active');
    });

    const strings = getStrings();

    const radialBtn = this.panelElement!.querySelector('[data-node="radial"]') as HTMLElement;
    radialBtn.addEventListener('click', (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      const radialNodes = this.currentParams.n - this.currentParams.l - 1;
      ExplanationModal.showSimple(
        strings.radialNodes,
        `${strings.radialNodes}: ${radialNodes}`,
        strings.radialNodesDesc
      );
    });

    const angularBtn = this.panelElement!.querySelector('[data-node="angular"]') as HTMLElement;
    angularBtn.addEventListener('click', (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      ExplanationModal.showSimple(
        strings.angularNodes,
        `${strings.angularNodes}: ${this.currentParams.l}`,
        strings.angularNodesDesc
      );
    });

    const totalBtn = this.panelElement!.querySelector('[data-node="total"]') as HTMLElement;
    totalBtn.addEventListener('click', (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      const totalNodes = this.currentParams.n - 1;
      ExplanationModal.showSimple(
        strings.totalNodes,
        `${strings.totalNodes}: ${totalNodes}`,
        strings.totalNodesDesc
      );
    });

    const radiusBtn = this.panelElement!.querySelector('[data-phys="radius"]') as HTMLElement;
    radiusBtn.addEventListener('click', (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      ExplanationModal.showSimple(
        strings.expectationRadius,
        strings.expectationRadiusDesc,
        strings.expectationRadiusDetail
      );
    });

    const energyBtn = this.panelElement!.querySelector('[data-phys="energy"]') as HTMLElement;
    energyBtn.addEventListener('click', (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      ExplanationModal.showSimple(
        strings.hydrogenicEnergy,
        strings.hydrogenicEnergyDesc,
        strings.hydrogenicEnergyDetail
      );
    });

    const formulaBtn = this.panelElement!.querySelector('[data-formula="wavefunction"]') as HTMLElement;
    formulaBtn.addEventListener('click', (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      ExplanationModal.showSimple(
        strings.wavefunctionFormula,
        strings.wavefunctionFormulaDesc,
        strings.wavefunctionFormulaDetail
      );
    });

    const zeffBtn = this.panelElement!.querySelector('[data-explain="explainZeff"]') as HTMLElement;
    zeffBtn.addEventListener('click', (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      ExplanationModal.show(strings.explainZeff);
    });
  }

  public destroy(): void {
    if (this.unsubscribeLang) {
      this.unsubscribeLang();
      this.unsubscribeLang = null;
    }
  }
}
