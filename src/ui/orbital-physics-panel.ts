import { ExtendedOrbitalParams } from './controls';
import { getStrings, onLanguageChange } from '../i18n';
import { ExplanationModal } from './info-modal';
import { escapeHtml } from './modal-utils';
import { icon } from './icons';
import { RadialDistributionChart } from './radial-distribution-chart';
import { bohrToPm, energyLevelEv, meanRadiusBohr } from '../core/physics-constants';

const SUBSHELL_NAMES = ['s', 'p', 'd', 'f', 'g'];

// Values are HTML fragments (real <sub> superscripts/subscripts), not LaTeX:
// they are interpolated raw, so they must only ever be file-local literals.
const REAL_ORBITAL_SUFFIX_HTML: Record<number, Record<number, string>> = {
  0: { 0: 's' },
  1: { 0: 'p<sub>z</sub>', 1: 'p<sub>x</sub>', [-1]: 'p<sub>y</sub>' },
  2: {
    0: 'd<sub>z²</sub>',
    1: 'd<sub>xz</sub>',
    [-1]: 'd<sub>yz</sub>',
    2: 'd<sub>x²−y²</sub>',
    [-2]: 'd<sub>xy</sub>',
  },
  3: {
    0: 'f<sub>z³</sub>',
    1: 'f<sub>xz²</sub>',
    [-1]: 'f<sub>yz²</sub>',
    2: 'f<sub>z(x²−y²)</sub>',
    [-2]: 'f<sub>xyz</sub>',
    3: 'f<sub>x(x²−3y²)</sub>',
    [-3]: 'f<sub>y(3x²−y²)</sub>',
  },
};

export class OrbitalPhysicsPanel {
  private readonly container: HTMLElement;
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

    const { radialNodes, angularNodes, totalNodes, notationHtml, rExpBohr, rExpPm, energyEv, seriesName } =
      this.calculatePhysics(params);

    if (this.radialChart) {
      this.radialChart.update(params.n, params.l, params.zEff);
      const peak = this.radialChart.getPeakRadius();
      const peakVal = this.panelElement.querySelector('#val-peak-radius') as HTMLElement;
      if (peakVal) {
        peakVal.innerHTML = `${peak.rBohr.toFixed(2)} a₀<small>${peak.rPm.toFixed(1)} pm</small>`;
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

    if (badgeVal) badgeVal.innerHTML = `${notationHtml} (n=${params.n}, l=${params.l}, m=${params.m})`;
    if (radialVal) radialVal.textContent = String(radialNodes);
    if (angularVal) angularVal.textContent = String(angularNodes);
    if (totalVal) totalVal.textContent = String(totalNodes);
    if (radiusVal) radiusVal.innerHTML = `${rExpBohr.toFixed(2)} a₀<small>${rExpPm.toFixed(1)} pm</small>`;
    if (energyVal) energyVal.textContent = `${energyEv.toFixed(2)} eV`;
    if (seriesVal) seriesVal.textContent = seriesName;
    if (zeffVal) zeffVal.textContent = params.zEff.toFixed(2);
  }

  private calculatePhysics(params: ExtendedOrbitalParams) {
    const { n, l, m, useRealOrbital, zEff } = params;
    const radialNodes = n - l - 1;
    const angularNodes = l;
    const totalNodes = n - 1;
    const notationHtml = this.getOrbitalNotationHtml(n, l, m, useRealOrbital);

    const rExpBohr = meanRadiusBohr(n, l, zEff);
    const rExpPm = bohrToPm(rExpBohr);
    const energyEv = energyLevelEv(n, zEff);

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
      notationHtml,
      rExpBohr,
      rExpPm,
      energyEv,
      seriesName,
    };
  }

  /**
   * Returns the orbital notation as an HTML fragment (with real <sub> markup for
   * real-orbital suffixes), safe to interpolate raw because every piece is a
   * literal defined in this file. Callers MUST use innerHTML, never textContent
   * or escapeHtml().
   */
  private getOrbitalNotationHtml(n: number, l: number, m: number, useRealOrbital: boolean): string {
    const subshell = SUBSHELL_NAMES[l] || 's';

    if (!useRealOrbital) {
      const mSign = m >= 0 ? `+${m}` : `${m}`;
      return `${n}${subshell} (m=${mSign})`;
    }

    const realSuffix = REAL_ORBITAL_SUFFIX_HTML[l]?.[m];
    if (realSuffix) {
      return `${n}${realSuffix}`;
    }

    return `${n}${subshell}`;
  }

  private render(): void {
    const strings = getStrings();
    const { n, l, m, zEff } = this.currentParams;
    const { radialNodes, angularNodes, totalNodes, notationHtml, rExpBohr, rExpPm, energyEv, seriesName } =
      this.calculatePhysics(this.currentParams);

    this.container.innerHTML = `
      <!-- Dock Handle / Expand Pill when Right Panel is Collapsed on Desktop -->
      <button type="button" class="dock-tab-pill dock-right-pill ${this.isCollapsed ? 'visible' : ''}" id="btn-expand-physics" title="${escapeHtml(strings.expandPanel)}" aria-label="${escapeHtml(strings.expandPanel)}" aria-expanded="${!this.isCollapsed}" aria-controls="orbital-physics-panel">
        ${icon('chevron-left', 'pill-chevron')}
        <span>${escapeHtml(strings.physicsPanelTitle)}</span>
        ${icon('chart')}
      </button>

      <div class="orbital-physics-panel glass-panel ${this.isCollapsed ? 'collapsed' : ''}" id="orbital-physics-panel">
        <div class="mobile-drawer-handle"></div>
        <div class="physics-header">
          <div class="physics-header-top">
            <div class="panel-title-group">
              <span class="panel-header-icon">${icon('chart')}</span>
              <h3>${escapeHtml(strings.physicsPanelTitle)}</h3>
            </div>
            <div class="panel-header-actions">
              <button type="button" class="panel-icon-btn panel-collapse-btn desktop-only" id="btn-collapse-physics" title="${escapeHtml(strings.collapsePanel)}" aria-label="${escapeHtml(strings.collapsePanel)}" aria-expanded="${!this.isCollapsed}" aria-controls="orbital-physics-panel">
                ${icon('chevron-right')}
              </button>
              <button type="button" class="panel-close-btn mobile-only" id="btn-close-physics" aria-label="${escapeHtml(strings.infoModalClose)}">
                ${icon('close')}
              </button>
            </div>
          </div>
          <div class="active-state-badge">
            <span class="badge-label">${escapeHtml(strings.activeState)}</span>
            <span class="badge-value" id="val-active-state">${notationHtml} (n=${n}, l=${l}, m=${m})</span>
          </div>
        </div>

        <div class="physics-section radial-section">
          <div class="section-title">
            <h4>${escapeHtml(strings.radialDistributionTitle)}</h4>
            <button type="button" class="btn-info-icon" data-explain="explainRadialDistribution" aria-label="Info">${icon('info')}</button>
          </div>
          <div class="radial-chart-wrapper" id="radial-chart-container"></div>
          <div class="radial-stats-row">
            <div class="radial-stat-badge">
              <span class="stat-label">${escapeHtml(strings.peakRadius)}</span>
              <span class="stat-value numeric" id="val-peak-radius">--</span>
            </div>
          </div>
        </div>

        <div class="physics-section nodes-section">
          <h4 class="section-title">${escapeHtml(strings.nodalBreakdown)}</h4>
          <div class="nodes-grid">
            <div class="stat-tile node-item">
              <div class="node-header">
                <span class="node-label">${escapeHtml(strings.radialNodes)}</span>
                <button type="button" class="btn-info-icon" data-node="radial" aria-label="${escapeHtml(strings.radialNodes)}">${icon('info')}</button>
              </div>
              <span class="node-value" id="val-radial-nodes">${radialNodes}</span>
            </div>
            <div class="stat-tile node-item">
              <div class="node-header">
                <span class="node-label">${escapeHtml(strings.angularNodes)}</span>
                <button type="button" class="btn-info-icon" data-node="angular" aria-label="${escapeHtml(strings.angularNodes)}">${icon('info')}</button>
              </div>
              <span class="node-value" id="val-angular-nodes">${angularNodes}</span>
            </div>
            <div class="stat-tile node-item">
              <div class="node-header">
                <span class="node-label">${escapeHtml(strings.totalNodes)}</span>
                <button type="button" class="btn-info-icon" data-node="total" aria-label="${escapeHtml(strings.totalNodes)}">${icon('info')}</button>
              </div>
              <span class="node-value" id="val-total-nodes">${totalNodes}</span>
            </div>
          </div>
        </div>

        <div class="physics-section expectation-section">
          <div class="expectation-grid">
            <div class="stat-tile expectation-item">
              <div class="node-header">
                <span class="node-label">${escapeHtml(strings.expectationRadius)}</span>
                <button type="button" class="btn-info-icon" data-phys="radius" aria-label="${escapeHtml(strings.expectationRadius)}">${icon('info')}</button>
              </div>
              <span class="node-value" id="val-exp-radius">${rExpBohr.toFixed(2)} a₀<small>${rExpPm.toFixed(1)} pm</small></span>
            </div>
            <div class="stat-tile expectation-item">
              <div class="node-header">
                <span class="node-label">${escapeHtml(strings.hydrogenicEnergy)}</span>
                <button type="button" class="btn-info-icon" data-phys="energy" aria-label="${escapeHtml(strings.hydrogenicEnergy)}">${icon('info')}</button>
              </div>
              <span class="node-value" id="val-energy">${energyEv.toFixed(2)} eV</span>
            </div>
          </div>
        </div>

        <div class="physics-section formula-section">
          <div class="section-title">
            <h4>${escapeHtml(strings.wavefunctionFormula)}</h4>
            <button type="button" class="btn-info-icon" data-formula="wavefunction" aria-label="${escapeHtml(strings.wavefunctionFormula)}">${icon('info')}</button>
          </div>
          <div class="formula-display">
            <code>&psi;<sub>n,l,m</sub>(r,&theta;,&phi;) = R<sub>n,l</sub>(r) &middot; Y<sub>l</sub><sup>m</sup>(&theta;,&phi;)</code>
          </div>
          <div class="series-badge">
            <span>${escapeHtml(strings.spectralSeries)}: <strong id="val-series">${escapeHtml(seriesName)}</strong></span>
          </div>
        </div>

        <div class="physics-section shielding-section">
          <div class="section-title">
            <h4>${escapeHtml(strings.shieldingTitle)}</h4>
            <button type="button" class="btn-info-icon" data-explain="explainZeff" aria-label="Info">${icon('info')}</button>
          </div>
          <p class="shielding-note">
            Z<sub>eff</sub> = <strong id="val-zeff">${zEff.toFixed(2)}</strong> &mdash; ${escapeHtml(strings.shieldingNoteDesc)}
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
        peakVal.innerHTML = `${peak.rBohr.toFixed(2)} a₀<small>${peak.rPm.toFixed(1)} pm</small>`;
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

    // The `data-explain` buttons reuse the shared handler (which also derives a
    // meaningful aria-label from the concept title).
    ExplanationModal.attachInfoButtons(this.container);

    // These are contextual explanations built from the live parameters, so they
    // carry their own explicit labels and handler.
    const infoBtns = this.container.querySelectorAll<HTMLElement>('.btn-info-icon:not([data-explain])');
    infoBtns.forEach((btn) => {
      btn.setAttribute('type', 'button');
      btn.addEventListener('click', (e: Event) => {
        e.preventDefault();
        e.stopPropagation();

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
