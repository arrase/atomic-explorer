import { ExtendedOrbitalParams } from './controls';
import { getStrings, onLanguageChange } from '../i18n';
import { InfoModal } from './info-modal';

export class OrbitalPhysicsPanel {
  private container: HTMLElement;
  private currentParams: ExtendedOrbitalParams;
  private panelElement: HTMLElement | null = null;

  constructor(container: HTMLElement, params: ExtendedOrbitalParams) {
    this.container = container;
    this.currentParams = params;
    this.render();
    onLanguageChange(() => this.render());
  }

  public updateParams(params: ExtendedOrbitalParams): void {
    this.currentParams = params;
    this.render();
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

    if (this.panelElement && this.panelElement.parentNode) {
      this.panelElement.parentNode.removeChild(this.panelElement);
    }

    const panel = document.createElement('div');
    panel.className = 'orbital-physics-panel glass-panel';

    panel.innerHTML = `
      <div class="physics-header">
        <h3>${strings.physicsPanelTitle}</h3>
        <div class="active-state-badge">
          <span class="badge-label">${strings.activeState}:</span>
          <span class="badge-value">${notation} (n=${n}, l=${l}, m=${m})</span>
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
            <span class="node-value">${radialNodes}</span>
          </div>
          <div class="node-item">
            <div class="node-header">
              <span class="node-label">${strings.angularNodes}</span>
              <button class="btn-info-icon" data-node="angular" aria-label="Info">ℹ️</button>
            </div>
            <span class="node-value">${angularNodes}</span>
          </div>
          <div class="node-item">
            <div class="node-header">
              <span class="node-label">${strings.totalNodes}</span>
              <button class="btn-info-icon" data-node="total" aria-label="Info">ℹ️</button>
            </div>
            <span class="node-value">${totalNodes}</span>
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
      </div>

      <div class="physics-section shielding-section">
        <div class="shielding-header">
          <h4>${strings.shieldingTitle}</h4>
          <button class="btn-info-icon" data-explain="explainZeff" aria-label="Info">ℹ️</button>
        </div>
        <p class="shielding-note">
          Z_eff = <strong>${zEff.toFixed(2)}</strong> &mdash; ${strings.shieldingNoteDesc}
        </p>
      </div>
    `;

    this.container.appendChild(panel);
    this.panelElement = panel;
    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    if (!this.panelElement) return;

    const strings = getStrings();
    const { n, l } = this.currentParams;
    const radialNodes = n - l - 1;
    const angularNodes = l;
    const totalNodes = n - 1;

    const radialBtn = this.panelElement.querySelector('[data-node="radial"]');
    radialBtn?.addEventListener('click', (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      InfoModal.showSimple(
        strings.radialNodes,
        `${strings.radialNodes}: ${radialNodes}`,
        strings.radialNodesDesc
      );
    });

    const angularBtn = this.panelElement.querySelector('[data-node="angular"]');
    angularBtn?.addEventListener('click', (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      InfoModal.showSimple(
        strings.angularNodes,
        `${strings.angularNodes}: ${angularNodes}`,
        strings.angularNodesDesc
      );
    });

    const totalBtn = this.panelElement.querySelector('[data-node="total"]');
    totalBtn?.addEventListener('click', (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      InfoModal.showSimple(
        strings.totalNodes,
        `${strings.totalNodes}: ${totalNodes}`,
        strings.totalNodesDesc
      );
    });

    const formulaBtn = this.panelElement.querySelector('[data-formula="wavefunction"]');
    formulaBtn?.addEventListener('click', (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      InfoModal.showSimple(
        strings.wavefunctionFormula,
        strings.wavefunctionFormulaDesc,
        strings.wavefunctionFormulaDetail
      );
    });

    const zeffBtn = this.panelElement.querySelector('[data-explain="explainZeff"]');
    zeffBtn?.addEventListener('click', (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      InfoModal.show(strings.explainZeff);
    });
  }
}
