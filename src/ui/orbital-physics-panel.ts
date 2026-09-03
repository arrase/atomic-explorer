import { ExtendedOrbitalParams } from './controls';
import { getStrings, onLanguageChange } from '../i18n';
import { ExplanationModal } from './info-modal';
import { icon } from './icons';
import { RadialDistributionChart } from './radial-distribution-chart';

export class OrbitalPhysicsPanel {
  private container: HTMLElement;
  private currentParams: ExtendedOrbitalParams;
  private panelElement: HTMLElement | null = null;
  private radialChart: RadialDistributionChart | null = null;
  private unsubscribeLang: (() => void) | null = null;
  private isCollapsed: boolean = false;

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

    const { radialNodes, angularNodes, totalNodes, notation, rExpBohr, rExpPm, energyEv, seriesName } =
      this.calculatePhysics(params);

    if (this.radialChart) {
      this.radialChart.update(params.n, params.l, params.zEff);
      const peak = this.radialChart.getPeakRadius();
      const peakVal = this.panelElement.querySelector('#val-peak-radius') as HTMLElement;
      if (peakVal) {
        peakVal.innerHTML = `${peak.rBohr.toFixed(2)} a₀ <small>(${peak.rPm.toFixed(1)} pm)</small>`;
      }
    }

    const badgeVal = this.panelElement.querySelector('#val-active-state') as HTMLElement;
    const radialVal = this.panelElement.querySelector('#val-radial-nodes') as HTMLElement;
    const angularVal = this.panelElement.querySelector('#val-angular-nodes') as HTMLElement;
    const totalVal = this.panelElement.querySelector('#val-total-nodes') as HTMLElement;
    const radiusVal = this.panelElement.querySelector('#val-exp-radius') as HTMLElement;
    const energyVal = this.panelElement.querySelector('#val-energy') as HTMLElement;
    const seriesVal = this.panelElement.querySelector('#val-series') as HTMLElement;
    const zeffVal = this.panelElement.querySelector('#val-zeff') as HTMLElement;

    if (badgeVal) badgeVal.textContent = `${notation} (n=${params.n}, l=${params.l}, m=${params.m})`;
    if (radialVal) radialVal.textContent = String(radialNodes);
    if (angularVal) angularVal.textContent = String(angularNodes);
    if (totalVal) totalVal.textContent = String(totalNodes);
    if (radiusVal) radiusVal.innerHTML = `${rExpBohr.toFixed(2)} a₀ <small>(${rExpPm.toFixed(1)} pm)</small>`;
    if (energyVal) energyVal.textContent = `${energyEv.toFixed(2)} eV`;
    if (seriesVal) seriesVal.textContent = seriesName;
    if (zeffVal) zeffVal.textContent = params.zEff.toFixed(2);
  }

  private calculatePhysics(params: ExtendedOrbitalParams) {
    const { n, l, m, useRealOrbital, zEff } = params;
    const radialNodes = n - l - 1;
    const angularNodes = l;
    const totalNodes = n - 1;
    const notation = this.getOrbitalNotation(n, l, m, useRealOrbital);

    const rExpBohr = (0.5 / zEff) * (3 * n * n - l * (l + 1));
    const rExpPm = rExpBohr * 52.917721;
    const energyEv = (-13.605693 * (zEff * zEff)) / (n * n);

    const strings = getStrings();
    const seriesMap: Record<number, string> = {
      1: strings.seriesLyman,
      2: strings.seriesBalmer,
      3: strings.seriesPaschen,
      4: strings.seriesBrackett,
      5: strings.seriesPfund,
      6: strings.seriesHumphreys,
    };
    const seriesName = seriesMap[n] || `${strings.seriesShell}${n}`;

    return {
      radialNodes,
      angularNodes,
      totalNodes,
      notation,
      rExpBohr,
      rExpPm,
      energyEv,
      seriesName,
    };
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
      if (m === 2) return `${n}d_{x^2-y^2}`;
      if (m === -2) return `${n}d_{xy}`;
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
    const { n, l, m, zEff } = this.currentParams;
    const { radialNodes, angularNodes, totalNodes, notation, rExpBohr, rExpPm, energyEv, seriesName } =
      this.calculatePhysics(this.currentParams);

    this.container.innerHTML = `
      <!-- Dock Handle / Expand Pill when Right Panel is Collapsed on Desktop -->
      <button class="dock-tab-pill dock-right-pill ${this.isCollapsed ? 'visible' : ''}" id="btn-expand-physics" title="${strings.expandPanel}" aria-label="${strings.expandPanel}" aria-expanded="${!this.isCollapsed}" aria-controls="orbital-physics-panel">
        ${icon('chevron-left', 'pill-chevron')}
        <span>${strings.physicsPanelTitle}</span>
        ${icon('chart')}
      </button>

      <div class="orbital-physics-panel glass-panel ${this.isCollapsed ? 'collapsed' : ''}" id="orbital-physics-panel">
        <div class="mobile-drawer-handle"></div>
        <div class="physics-header">
          <div class="physics-header-top">
            <div class="panel-title-group">
              <span class="panel-header-icon">${icon('chart')}</span>
              <h3>${strings.physicsPanelTitle}</h3>
            </div>
            <div class="panel-header-actions">
              <button class="panel-icon-btn panel-collapse-btn desktop-only" id="btn-collapse-physics" title="${strings.collapsePanel}" aria-label="${strings.collapsePanel}" aria-expanded="${!this.isCollapsed}" aria-controls="orbital-physics-panel">
                ${icon('chevron-right')}
              </button>
              <button class="panel-close-btn mobile-only" id="btn-close-physics" aria-label="Close">
                ${icon('close')}
              </button>
            </div>
          </div>
          <div class="active-state-badge">
            <span class="badge-label">${strings.activeState}:</span>
            <span class="badge-value" id="val-active-state">${notation} (n=${n}, l=${l}, m=${m})</span>
          </div>
        </div>

        <div class="physics-section radial-section">
          <div class="radial-section-header">
            <h4>${strings.radialDistributionTitle}</h4>
            <button class="btn-info-icon" data-explain="explainRadialDistribution" aria-label="Info">${icon('info')}</button>
          </div>
          <div class="radial-chart-wrapper" id="radial-chart-container"></div>
          <div class="radial-stats-row">
            <div class="radial-stat-badge">
              <span class="stat-label">${strings.peakRadius}:</span>
              <span class="stat-value" id="val-peak-radius">--</span>
            </div>
          </div>
        </div>

        <div class="physics-section nodes-section">
          <h4>${strings.nodalBreakdown}</h4>
          <div class="nodes-grid">
            <div class="node-item">
              <div class="node-header">
                <span class="node-label">${strings.radialNodes}</span>
                <button class="btn-info-icon" data-node="radial" aria-label="Info">${icon('info')}</button>
              </div>
              <span class="node-value" id="val-radial-nodes">${radialNodes}</span>
            </div>
            <div class="node-item">
              <div class="node-header">
                <span class="node-label">${strings.angularNodes}</span>
                <button class="btn-info-icon" data-node="angular" aria-label="Info">${icon('info')}</button>
              </div>
              <span class="node-value" id="val-angular-nodes">${angularNodes}</span>
            </div>
            <div class="node-item">
              <div class="node-header">
                <span class="node-label">${strings.totalNodes}</span>
                <button class="btn-info-icon" data-node="total" aria-label="Info">${icon('info')}</button>
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
                <button class="btn-info-icon" data-phys="radius" aria-label="Info">${icon('info')}</button>
              </div>
              <span class="node-value" id="val-exp-radius">${rExpBohr.toFixed(2)} a₀ <small>(${rExpPm.toFixed(1)} pm)</small></span>
            </div>
            <div class="expectation-item">
              <div class="node-header">
                <span class="node-label">${strings.hydrogenicEnergy}</span>
                <button class="btn-info-icon" data-phys="energy" aria-label="Info">${icon('info')}</button>
              </div>
              <span class="node-value" id="val-energy">${energyEv.toFixed(2)} eV</span>
            </div>
          </div>
        </div>

        <div class="physics-section formula-section">
          <div class="formula-header">
            <h4>${strings.wavefunctionFormula}</h4>
            <button class="btn-info-icon" data-formula="wavefunction" aria-label="Info">${icon('info')}</button>
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
            <button class="btn-info-icon" data-explain="explainZeff" aria-label="Info">${icon('info')}</button>
          </div>
          <p class="shielding-note">
            Z_eff = <strong id="val-zeff">${zEff.toFixed(2)}</strong> &mdash; ${strings.shieldingNoteDesc}
          </p>
        </div>
      </div>
    `;

    this.panelElement = this.container.querySelector('.orbital-physics-panel');

    const chartContainer = this.container.querySelector('#radial-chart-container') as HTMLElement;
    if (this.radialChart) {
      this.radialChart.destroy();
    }
    if (chartContainer) {
      this.radialChart = new RadialDistributionChart(chartContainer);
      this.radialChart.update(n, l, zEff);
      const peak = this.radialChart.getPeakRadius();
      const peakVal = this.container.querySelector('#val-peak-radius') as HTMLElement;
      if (peakVal) {
        peakVal.innerHTML = `${peak.rBohr.toFixed(2)} a₀ <small>(${peak.rPm.toFixed(1)} pm)</small>`;
      }
    }

    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    const closePhysicsBtn = this.container.querySelector('#btn-close-physics') as HTMLElement;
    const btnCollapse = this.container.querySelector('#btn-collapse-physics') as HTMLElement;
    const btnExpand = this.container.querySelector('#btn-expand-physics') as HTMLElement;
    const panel = this.panelElement;

    if (btnCollapse) {
      btnCollapse.addEventListener('click', () => {
        this.isCollapsed = true;
        if (panel) panel.classList.add('collapsed');
        btnCollapse.setAttribute('aria-expanded', 'false');
        if (btnExpand) {
          btnExpand.classList.add('visible');
          btnExpand.setAttribute('aria-expanded', 'false');
        }
      });
    }

    if (btnExpand) {
      btnExpand.addEventListener('click', () => {
        this.isCollapsed = false;
        if (panel) panel.classList.remove('collapsed');
        btnCollapse?.setAttribute('aria-expanded', 'true');
        btnExpand.classList.remove('visible');
        btnExpand.setAttribute('aria-expanded', 'true');
      });
    }

    if (closePhysicsBtn) {
      closePhysicsBtn.addEventListener('click', () => {
        this.container.classList.remove('mobile-open');
        const backdrop = document.querySelector('#controls-drawer-backdrop') as HTMLElement;
        if (backdrop) backdrop.classList.remove('active');
        const btnShowPhysics = document.querySelector('#btn-show-physics') as HTMLElement;
        if (btnShowPhysics) btnShowPhysics.classList.remove('active');
      });
    }

    const strings = getStrings();

    const infoBtns = this.container.querySelectorAll<HTMLElement>('.btn-info-icon');
    infoBtns.forEach((btn) => {
      btn.addEventListener('click', (e: Event) => {
        e.preventDefault();
        e.stopPropagation();

        const explainKey = btn.dataset.explain;
        if (explainKey === 'explainZeff') {
          ExplanationModal.show(strings.explainZeff);
          return;
        }
        if (explainKey === 'explainRadialDistribution') {
          ExplanationModal.show(strings.explainRadialDistribution);
          return;
        }

        const nodeType = btn.dataset.node;
        if (nodeType === 'radial') {
          ExplanationModal.showSimple(
            strings.radialNodes,
            `${strings.radialNodes}: ${this.currentParams.n - this.currentParams.l - 1}`,
            strings.radialNodesDesc
          );
          return;
        }
        if (nodeType === 'angular') {
          ExplanationModal.showSimple(
            strings.angularNodes,
            `${strings.angularNodes}: ${this.currentParams.l}`,
            strings.angularNodesDesc
          );
          return;
        }
        if (nodeType === 'total') {
          ExplanationModal.showSimple(
            strings.totalNodes,
            `${strings.totalNodes}: ${this.currentParams.n - 1}`,
            strings.totalNodesDesc
          );
          return;
        }

        const physType = btn.dataset.phys;
        if (physType === 'radius') {
          ExplanationModal.showSimple(
            strings.expectationRadius,
            strings.expectationRadiusDesc,
            strings.expectationRadiusDetail
          );
          return;
        }
        if (physType === 'energy') {
          ExplanationModal.showSimple(
            strings.hydrogenicEnergy,
            strings.hydrogenicEnergyDesc,
            strings.hydrogenicEnergyDetail
          );
          return;
        }

        if (btn.dataset.formula === 'wavefunction') {
          ExplanationModal.showSimple(
            strings.wavefunctionFormula,
            strings.wavefunctionFormulaDesc,
            strings.wavefunctionFormulaDetail
          );
        }
      });
    });
  }

  public destroy(): void {
    if (this.radialChart) {
      this.radialChart.destroy();
      this.radialChart = null;
    }
    if (this.unsubscribeLang) {
      this.unsubscribeLang();
      this.unsubscribeLang = null;
    }
  }
}
