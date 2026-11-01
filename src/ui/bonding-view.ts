import {
  AtomOrbitalSpec,
  BONDING_PRESETS,
  BOND_R_MAX,
  BOND_R_MIN,
  BondingPreset,
  BondingPresetId,
  LcaoStateResult,
  MoOrderMode,
  PolarBasisPair,
  calculateBondOrder,
  computeLcaoCurveSync,
  computeLcaoStateSync,
  initLcaoEngine,
} from '../core/lcao';
import { bohrToPm } from '../core/physics-constants';
import { I18nStrings, getStrings, onLanguageChange } from '../i18n';
import { BondingRenderer } from '../render/bonding-renderer';
import { ColorPalette } from '../render/orbital-point-cloud';
import { icon } from './icons';
import { ExplanationModal } from './info-modal';
import { escapeHtml } from './modal-utils';
import { PotentialEnergyChart } from './potential-energy-chart';

interface PresetUiMeta {
  readonly labelKey:
    | 'presetH2Label'
    | 'presetHe2Label'
    | 'presetSigma2pLabel'
    | 'presetPi2pLabel'
    | 'presetPolarLabel';
  readonly bondSymbolHtml: string;
  readonly antiSymbolHtml: string;
  readonly bondSymbolPlain: string;
  readonly antiSymbolPlain: string;
}

const PRESET_UI_META: Record<BondingPresetId, PresetUiMeta> = {
  h2_1s: {
    labelKey: 'presetH2Label',
    bondSymbolHtml: 'σ<sub>1s</sub>',
    antiSymbolHtml: 'σ*<sub>1s</sub>',
    bondSymbolPlain: 'σ₁ₛ',
    antiSymbolPlain: 'σ*₁ₛ',
  },
  he2_1s: {
    labelKey: 'presetHe2Label',
    bondSymbolHtml: 'σ<sub>1s</sub>',
    antiSymbolHtml: 'σ*<sub>1s</sub>',
    bondSymbolPlain: 'σ₁ₛ',
    antiSymbolPlain: 'σ*₁ₛ',
  },
  sigma_2pz: {
    labelKey: 'presetSigma2pLabel',
    bondSymbolHtml: 'σ<sub>2p</sub>',
    antiSymbolHtml: 'σ*<sub>2p</sub>',
    bondSymbolPlain: 'σ₂ₚ',
    antiSymbolPlain: 'σ*₂ₚ',
  },
  pi_2px: {
    labelKey: 'presetPi2pLabel',
    bondSymbolHtml: 'π<sub>2p</sub>',
    antiSymbolHtml: 'π*<sub>2p</sub>',
    bondSymbolPlain: 'π₂ₚ',
    antiSymbolPlain: 'π*₂ₚ',
  },
  polar_sigma: {
    labelKey: 'presetPolarLabel',
    bondSymbolHtml: 'σ<sub>pol</sub>',
    antiSymbolHtml: 'σ*<sub>pol</sub>',
    bondSymbolPlain: 'σ_pol',
    antiSymbolPlain: 'σ*_pol',
  },
};

const PRESET_ALIASES: Record<string, BondingPresetId> = {
  h2_1s: 'h2_1s',
  he2_1s: 'he2_1s',
  sigma_2pz: 'sigma_2pz',
  pi_2px: 'pi_2px',
  polar_sigma: 'polar_sigma',
  '1s-1s': 'h2_1s',
  '2pz-2pz': 'sigma_2pz',
  '2px-2px': 'pi_2px',
};

const PALETTE_OPTIONS: readonly { value: ColorPalette; labelKey: keyof I18nStrings }[] = [
  { value: 'default', labelKey: 'paletteDefault' },
  { value: 'fire', labelKey: 'paletteFire' },
  { value: 'emerald', labelKey: 'paletteEmerald' },
  { value: 'spectrum', labelKey: 'paletteSpectrum' },
];

const ZEFF_MIN = 0.8;
const ZEFF_MAX = 3.5;

function syncRangeFill(input: HTMLInputElement): void {
  const min = Number.parseFloat(input.min);
  const max = Number.parseFloat(input.max);
  const val = Number.parseFloat(input.value);
  if (max === min) return;
  const pct = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
  input.style.setProperty('--fill', `${pct}%`);
}

function formatDistanceBadge(rBohr: number): string {
  return `${rBohr.toFixed(2)} a₀ (${bohrToPm(rBohr).toFixed(0)} pm)`;
}

function formatAoLabel(spec: AtomOrbitalSpec, atomTag: 'A' | 'B'): string {
  if (spec.l === 0) return `φ_${atomTag} (${spec.n}s)`;
  let axis = 'y';
  if (spec.m === 0) axis = 'z';
  else if (spec.m === 1) axis = 'x';
  return `φ_${atomTag} (${spec.n}p_${axis})`;
}

function formatSignedCoeff(c: number, isFirst: boolean): string {
  const abs = Math.abs(c).toFixed(3);
  if (isFirst) {
    return `${c >= 0 ? '+' : '−'}${abs}`;
  }
  return `${c >= 0 ? ' + ' : ' − '}${abs}`;
}

export class BondingView {
  private readonly container: HTMLElement;
  private readonly renderer: BondingRenderer;
  private readonly onScaleChange: (scaleText: string) => void;
  private readonly onExportClick: () => void;

  public onStateChange?: () => void;

  private presetId: BondingPresetId = 'h2_1s';
  private mode: MoOrderMode = 'bonding';
  private rBohr: number = BONDING_PRESETS[0].defaultRBohr;
  private polarBasis: PolarBasisPair = '1s_1s';
  private polarZEffA = 1.0;
  private polarZEffB = 1.85;
  private showNodalPlanes = true;
  private palette: ColorPalette = 'default';
  private contrast = 0;

  private isLeftCollapsed = false;
  private isRightCollapsed = false;

  private potentialChart: PotentialEnergyChart | null = null;
  private cachedCurve: Float32Array = new Float32Array(0);
  private lastState: LcaoStateResult | null = null;
  private enginePromise: Promise<void> | null = null;
  private wasmReady = false;
  private isActivated = false;

  constructor(
    container: HTMLElement,
    renderer: BondingRenderer,
    onScaleChange: (scaleText: string) => void,
    onExportClick: () => void,
  ) {
    this.container = container;
    this.renderer = renderer;
    this.onScaleChange = onScaleChange;
    this.onExportClick = onExportClick;

    this.render();

    onLanguageChange(() => {
      this.render();
      if (this.wasmReady) {
        this.recomputeCurveAndSync(false);
      }
    });
  }

  private async activateAsync(firstActivation: boolean): Promise<void> {
    if (!this.wasmReady) {
      this.enginePromise ??= initLcaoEngine();
      await this.enginePromise;
      this.wasmReady = true;
    }
    this.recomputeCurveAndSync(firstActivation);
    this.emitScaleHud();
    this.potentialChart?.draw();
  }

  public activate(): void {
    const firstActivation = !this.isActivated;
    this.isActivated = true;
    this.emitScaleHud();
    void this.activateAsync(firstActivation);
  }

  public getDeepLinkParams(): { preset: BondingPresetId; r: number; anti: boolean } {
    return {
      preset: this.presetId,
      r: Number(this.rBohr.toFixed(2)),
      anti: this.mode === 'antibonding',
    };
  }

  public applyDeepLinkParams(opts: { preset?: string; r?: number; anti?: boolean }): void {
    let reframe = false;
    if (opts.preset) {
      const mapped = PRESET_ALIASES[opts.preset];
      if (mapped && mapped !== this.presetId) {
        this.applyPresetDefaults(mapped);
        reframe = true;
      }
    }

    if (opts.r !== undefined && Number.isFinite(opts.r)) {
      const quantized = Math.round(opts.r / 0.02) * 0.02;
      this.rBohr = Math.max(BOND_R_MIN, Math.min(BOND_R_MAX, Number(quantized.toFixed(2))));
    }

    if (opts.anti !== undefined) {
      this.mode = opts.anti ? 'antibonding' : 'bonding';
    }

    this.syncControlsToState();
    if (this.isActivated) {
      this.emitScaleHud();
    }
    if (this.wasmReady) {
      this.recomputeCurveAndSync(reframe);
    }
  }

  private getPreset(id: BondingPresetId = this.presetId): BondingPreset {
    return BONDING_PRESETS.find((p) => p.id === id) ?? BONDING_PRESETS[0];
  }

  private applyPresetDefaults(id: BondingPresetId): void {
    const preset = this.getPreset(id);
    this.presetId = preset.id;
    this.rBohr = preset.defaultRBohr;
    if (preset.isPolar) {
      this.polarBasis = '1s_1s';
      this.polarZEffA = preset.atomA.zEff;
      this.polarZEffB = preset.atomB.zEff;
    }
  }

  private resolveAtoms(preset: BondingPreset): { atomA: AtomOrbitalSpec; atomB: AtomOrbitalSpec } {
    if (!preset.isPolar) {
      return { atomA: preset.atomA, atomB: preset.atomB };
    }
    const atomA: AtomOrbitalSpec = { n: 1, l: 0, m: 0, zEff: this.polarZEffA };
    const atomB: AtomOrbitalSpec =
      this.polarBasis === '1s_2pz'
        ? { n: 2, l: 1, m: 0, zEff: this.polarZEffB }
        : { n: 1, l: 0, m: 0, zEff: this.polarZEffB };
    return { atomA, atomB };
  }

  private emitScaleHud(): void {
    this.onScaleChange(`R = ${formatDistanceBadge(this.rBohr)}`);
  }

  private render(): void {
    const strings = getStrings();
    const preset = this.getPreset();

    if (this.potentialChart) {
      this.potentialChart.destroy();
      this.potentialChart = null;
    }

    this.container.innerHTML = `
      <div class="mobile-drawer-backdrop" id="bonding-drawer-backdrop"></div>

      <div class="mobile-floating-actions">
        <button type="button" class="mobile-float-btn" id="btn-show-bonding-controls" title="${escapeHtml(strings.bondingTitle)}" aria-label="${escapeHtml(strings.bondingTitle)}" aria-expanded="false" aria-controls="bonding-controls-panel">
          <span class="btn-icon">${icon('sliders')}</span>
          <span class="btn-label">${escapeHtml(strings.bondingTitle)}</span>
        </button>
        <button type="button" class="mobile-float-btn" id="btn-show-bonding-energy" title="${escapeHtml(strings.bondingEnergyPanelTitle)}" aria-label="${escapeHtml(strings.bondingEnergyPanelTitle)}" aria-expanded="false" aria-controls="bonding-energy-panel">
          <span class="btn-icon">${icon('chart')}</span>
          <span class="btn-label">${escapeHtml(strings.bondingEnergyPanelTitle)}</span>
        </button>
      </div>

      <button type="button" class="dock-tab-pill dock-left-pill ${this.isLeftCollapsed ? 'visible' : ''}" id="btn-expand-bonding-controls" title="${escapeHtml(strings.expandPanel)}" aria-label="${escapeHtml(strings.expandPanel)}" aria-expanded="${!this.isLeftCollapsed}" aria-controls="bonding-controls-panel">
        ${icon('bond')}
        <span>${escapeHtml(strings.bondingTitle)}</span>
        ${icon('chevron-right', 'pill-chevron')}
      </button>

      <div class="control-panel ${this.isLeftCollapsed ? 'collapsed' : ''}" id="bonding-controls-panel">
        <div class="mobile-drawer-handle"></div>
        ${this.renderLeftHeader(strings)}
        <div class="control-accordion-container bonding-controls-scroll">
          <div class="control-grid">
            ${this.renderPresetSection(strings)}
            ${this.renderBondControlsSection(strings)}
            ${this.renderPolarSection(strings, preset)}
            ${this.renderVisualSection(strings)}
          </div>
        </div>
      </div>

      <div class="physics-panel-container" id="bonding-physics-container">
        ${this.renderRightPanel(strings, preset)}
      </div>
    `;

    const chartHost = this.container.querySelector('#bonding-potential-chart') as HTMLElement;
    this.potentialChart = new PotentialEnergyChart(chartHost, (newR) => {
      this.setDistanceR(newR, true);
    });

    this.attachEventListeners();
    this.syncAllRangeFills();
  }

  private renderLeftHeader(strings: I18nStrings): string {
    return `
      <div class="panel-header">
        <div class="panel-title-group">
          <span class="panel-header-icon">${icon('bond')}</span>
          <h3>${escapeHtml(strings.bondingTitle)}</h3>
        </div>
        <div class="panel-header-actions">
          <button type="button" class="btn-export-hdr" id="btn-bonding-export" title="${escapeHtml(strings.exportImage)}" aria-label="${escapeHtml(strings.exportImage)}">
            ${icon('camera')}
            <span>${escapeHtml(strings.exportImage)}</span>
          </button>
          <button type="button" class="panel-icon-btn panel-collapse-btn desktop-only" id="btn-collapse-bonding-controls" title="${escapeHtml(strings.collapsePanel)}" aria-label="${escapeHtml(strings.collapsePanel)}" aria-expanded="${!this.isLeftCollapsed}" aria-controls="bonding-controls-panel">
            ${icon('chevron-left')}
          </button>
          <button type="button" class="panel-close-btn mobile-only" id="btn-close-bonding-controls" aria-label="${escapeHtml(strings.infoModalClose)}">
            ${icon('close')}
          </button>
        </div>
      </div>
    `;
  }

  private renderPresetSection(strings: I18nStrings): string {
    const cardsHtml = BONDING_PRESETS.map((preset) => {
      const meta = PRESET_UI_META[preset.id];
      const isActive = preset.id === this.presetId;
      return `
        <button
          type="button"
          class="bonding-preset-btn ${isActive ? 'active' : ''}"
          role="radio"
          aria-checked="${isActive}"
          tabindex="${isActive ? '0' : '-1'}"
          data-preset-id="${preset.id}"
        >
          <span class="bonding-preset-symbol">${meta.bondSymbolHtml}</span>
          <span class="bonding-preset-text">${escapeHtml(strings[meta.labelKey])}</span>
        </button>
      `;
    }).join('');

    return `
      <div class="control-group">
        <div class="control-label-row">
          <span class="control-label" id="bonding-presets-heading">${escapeHtml(strings.bondingPresetsLabel)}</span>
          <button type="button" class="btn-info-icon" data-explain="explainLcao" aria-label="Info">${icon('info')}</button>
        </div>
        <div class="bonding-preset-list" role="radiogroup" aria-labelledby="bonding-presets-heading">
          ${cardsHtml}
        </div>
      </div>
    `;
  }

  private renderBondControlsSection(strings: I18nStrings): string {
    const isBonding = this.mode === 'bonding';
    const rFill = ((this.rBohr - BOND_R_MIN) / (BOND_R_MAX - BOND_R_MIN)) * 100;

    return `
      <div class="control-group">
        <div class="control-label-row">
          <span class="control-label">${escapeHtml(strings.interferenceModeLabel)}</span>
        </div>
        <div class="segmented-toggle" role="group" aria-label="${escapeHtml(strings.interferenceModeLabel)}">
          <button type="button" class="segmented-toggle-btn ${isBonding ? 'active' : ''}" data-mo-mode="bonding" aria-pressed="${isBonding}">
            ${escapeHtml(strings.modeBonding)}
          </button>
          <button type="button" class="segmented-toggle-btn ${!isBonding ? 'active' : ''}" data-mo-mode="antibonding" aria-pressed="${!isBonding}">
            ${escapeHtml(strings.modeAntibonding)}
          </button>
        </div>
      </div>

      <div class="control-group">
        <div class="control-label-row">
          <label class="control-label" for="bonding-r-slider">
            ${escapeHtml(strings.internuclearDistanceLabel)}
            <span class="val-badge" id="bonding-r-val">${escapeHtml(formatDistanceBadge(this.rBohr))}</span>
          </label>
        </div>
        <input type="range" id="bonding-r-slider" min="${BOND_R_MIN}" max="${BOND_R_MAX}" step="0.02" value="${this.rBohr}" style="--fill: ${rFill}%" />
        <button type="button" class="btn-secondary bonding-snap-btn" id="btn-snap-equilibrium">
          ${escapeHtml(strings.snapToEquilibrium)}
        </button>
      </div>
    `;
  }

  private renderPolarSection(strings: I18nStrings, preset: BondingPreset): string {
    const is1s1s = this.polarBasis === '1s_1s';
    const fillA = ((this.polarZEffA - ZEFF_MIN) / (ZEFF_MAX - ZEFF_MIN)) * 100;
    const fillB = ((this.polarZEffB - ZEFF_MIN) / (ZEFF_MAX - ZEFF_MIN)) * 100;

    return `
      <div class="bonding-polar-controls ${preset.isPolar ? '' : 'hidden'}" id="bonding-polar-section">
        <div class="control-group">
          <div class="control-label-row">
            <span class="control-label">${escapeHtml(strings.polarBasisLabel)}</span>
          </div>
          <div class="segmented-toggle" role="group" aria-label="${escapeHtml(strings.polarBasisLabel)}">
            <button type="button" class="segmented-toggle-btn ${is1s1s ? 'active' : ''}" data-polar-basis="1s_1s" aria-pressed="${is1s1s}">
              1s + 1s
            </button>
            <button type="button" class="segmented-toggle-btn ${!is1s1s ? 'active' : ''}" data-polar-basis="1s_2pz" aria-pressed="${!is1s1s}">
              1s + 2p<sub>z</sub>
            </button>
          </div>
        </div>

        <div class="control-group">
          <div class="control-label-row">
            <label class="control-label" for="bonding-zeff-a">
              ${escapeHtml(strings.polarAsymmetryLabel)} · A
              <span class="val-badge" id="bonding-zeff-a-val">${this.polarZEffA.toFixed(2)}</span>
            </label>
          </div>
          <input type="range" id="bonding-zeff-a" min="${ZEFF_MIN}" max="${ZEFF_MAX}" step="0.05" value="${this.polarZEffA}" style="--fill: ${fillA}%" />
        </div>

        <div class="control-group">
          <div class="control-label-row">
            <label class="control-label" for="bonding-zeff-b">
              ${escapeHtml(strings.polarAsymmetryLabel)} · B
              <span class="val-badge" id="bonding-zeff-b-val">${this.polarZEffB.toFixed(2)}</span>
            </label>
          </div>
          <input type="range" id="bonding-zeff-b" min="${ZEFF_MIN}" max="${ZEFF_MAX}" step="0.05" value="${this.polarZEffB}" style="--fill: ${fillB}%" />
        </div>
      </div>
    `;
  }

  private renderVisualSection(strings: I18nStrings): string {
    const paletteOptionsHtml = PALETTE_OPTIONS.map((opt) => {
      const selected = opt.value === this.palette ? 'selected' : '';
      return `<option value="${opt.value}" ${selected}>${escapeHtml(strings[opt.labelKey] as string)}</option>`;
    }).join('');

    return `
      <div class="control-group">
        <button type="button" class="btn-action-toggle ${this.showNodalPlanes ? 'active' : ''}" id="btn-bonding-nodal-planes" aria-pressed="${this.showNodalPlanes}">
          ${this.showNodalPlanes ? icon('eye') : icon('eye-off')}
          <span>${escapeHtml(strings.toggleNodalPlanes)}</span>
        </button>
      </div>

      <div class="control-group">
        <div class="control-label-row">
          <label class="control-label" for="bonding-palette-select">${escapeHtml(strings.colorPalette)}</label>
          <button type="button" class="btn-info-icon" data-explain="explainPalette" aria-label="Info">${icon('info')}</button>
        </div>
        <select id="bonding-palette-select">${paletteOptionsHtml}</select>
      </div>

      <div class="control-group">
        <div class="control-label-row">
          <label class="control-label" for="bonding-contrast-slider">
            ${escapeHtml(strings.contrastControl)}
            <span class="val-badge" id="bonding-contrast-val">${this.contrast}</span>
          </label>
          <button type="button" class="btn-info-icon" data-explain="explainContrast" aria-label="Info">${icon('info')}</button>
        </div>
        <input type="range" id="bonding-contrast-slider" min="0" max="100" step="1" value="${this.contrast}" style="--fill: ${this.contrast}%" />
      </div>
    `;
  }

  private renderRightPanel(strings: I18nStrings, preset: BondingPreset): string {
    const bondOrder = calculateBondOrder(preset.electronsBonding, preset.electronsAntibonding);
    const isStable = bondOrder > 0;
    const meta = PRESET_UI_META[preset.id];
    const initialSymbol = this.mode === 'bonding' ? meta.bondSymbolHtml : meta.antiSymbolHtml;

    return `
      <button type="button" class="dock-tab-pill dock-right-pill ${this.isRightCollapsed ? 'visible' : ''}" id="btn-expand-bonding-energy" title="${escapeHtml(strings.expandPanel)}" aria-label="${escapeHtml(strings.expandPanel)}" aria-expanded="${!this.isRightCollapsed}" aria-controls="bonding-energy-panel">
        ${icon('chevron-left', 'pill-chevron')}
        <span>${escapeHtml(strings.bondingEnergyPanelTitle)}</span>
        ${icon('chart')}
      </button>

      <div class="orbital-physics-panel glass-panel ${this.isRightCollapsed ? 'collapsed' : ''}" id="bonding-energy-panel">
        <div class="mobile-drawer-handle"></div>
        <div class="physics-header">
          <div class="physics-header-top">
            <div class="panel-title-group">
              <span class="panel-header-icon">${icon('chart')}</span>
              <h3>${escapeHtml(strings.bondingEnergyPanelTitle)}</h3>
            </div>
            <div class="panel-header-actions">
              <button type="button" class="panel-icon-btn panel-collapse-btn desktop-only" id="btn-collapse-bonding-energy" title="${escapeHtml(strings.collapsePanel)}" aria-label="${escapeHtml(strings.collapsePanel)}" aria-expanded="${!this.isRightCollapsed}" aria-controls="bonding-energy-panel">
                ${icon('chevron-right')}
              </button>
              <button type="button" class="panel-close-btn mobile-only" id="btn-close-bonding-energy" aria-label="${escapeHtml(strings.infoModalClose)}">
                ${icon('close')}
              </button>
            </div>
          </div>
          <div class="active-state-badge">
            <span class="badge-label">${escapeHtml(strings.activeState)}</span>
            <span class="badge-value" id="bonding-active-equation">${initialSymbol}</span>
          </div>
        </div>

        <div class="physics-section">
          <div class="section-title">
            <h4>${escapeHtml(strings.potentialCurveTitle)}</h4>
            <button type="button" class="btn-info-icon" data-explain="explainPotentialCurve" aria-label="Info">${icon('info')}</button>
          </div>
          <div class="radial-chart-wrapper potential-chart-wrapper" id="bonding-potential-chart"></div>
          <div class="nodes-grid bonding-stats-grid">
            <div class="stat-tile">
              <span class="stat-label">${escapeHtml(strings.equilibriumDistanceLabel)}</span>
              <span class="stat-value" id="bonding-stat-req">--</span>
            </div>
            <div class="stat-tile">
              <span class="stat-label">${escapeHtml(strings.dissociationEnergyLabel)}</span>
              <span class="stat-value" id="bonding-stat-de">--</span>
            </div>
            <div class="stat-tile">
              <span class="stat-label">${escapeHtml(strings.overlapIntegralLabel)}</span>
              <span class="stat-value" id="bonding-stat-overlap">--</span>
            </div>
          </div>
        </div>

        <div class="physics-section">
          <div class="section-title">
            <h4>${escapeHtml(strings.moDiagramTitle)}</h4>
            <button type="button" class="btn-info-icon" data-explain="explainBondOrder" aria-label="Info">${icon('info')}</button>
          </div>
          ${this.renderCorrelationSvg(strings)}
          <div class="bond-order-banner ${isStable ? 'is-stable' : 'is-unstable'}" id="bonding-bo-banner">
            <span class="bond-order-value" id="bonding-bo-value">${escapeHtml(strings.bondOrderLabel)}: BO = ${bondOrder}</span>
            <span class="bond-order-badge" id="bonding-bo-badge">${escapeHtml(isStable ? strings.bondStableBadge : strings.bondUnstableBadge)}</span>
          </div>
          <div class="charge-share-bar">
            <div class="charge-share-header">
              <span class="charge-share-label">${escapeHtml(strings.chargeSharingLabel)}</span>
              <span class="charge-share-readout" id="bonding-share-readout">A: 50% / B: 50%</span>
            </div>
            <div class="charge-share-track">
              <div class="charge-share-fill-a" id="bonding-share-bar-a" style="width: 50%"></div>
              <div class="charge-share-fill-b" id="bonding-share-bar-b" style="width: 50%"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderCorrelationSvg(strings: I18nStrings): string {
    return `
      <svg viewBox="0 0 280 142" class="mo-correlation-svg" role="img" aria-label="${escapeHtml(strings.moDiagramTitle)}">
        <line id="mo-corr-a-anti" x1="72" y1="72" x2="108" y2="38" stroke="rgba(248, 113, 113, 0.42)" stroke-width="1.2" stroke-dasharray="3 3" />
        <line id="mo-corr-b-anti" x1="208" y1="72" x2="172" y2="38" stroke="rgba(248, 113, 113, 0.42)" stroke-width="1.2" stroke-dasharray="3 3" />
        <line id="mo-corr-a-bond" x1="72" y1="72" x2="108" y2="106" stroke="rgba(79, 143, 247, 0.45)" stroke-width="1.2" stroke-dasharray="3 3" />
        <line id="mo-corr-b-bond" x1="208" y1="72" x2="172" y2="106" stroke="rgba(79, 143, 247, 0.45)" stroke-width="1.2" stroke-dasharray="3 3" />

        <line id="mo-line-ao-a" x1="18" y1="72" x2="72" y2="72" stroke="rgba(169, 177, 194, 0.85)" stroke-width="2.2" stroke-linecap="round" />
        <text id="mo-spin-ao-a" x="45" y="67" text-anchor="middle" fill="#eef1f7" font-size="11" font-weight="700">↑</text>
        <text id="mo-label-ao-a" x="45" y="84" text-anchor="middle" fill="#a9b1c2" font-size="9.5" font-weight="600">φ_A</text>
        <text id="mo-eps-ao-a" x="45" y="95" text-anchor="middle" fill="#7f8899" font-size="8.5">-- eV</text>

        <line id="mo-line-ao-b" x1="208" y1="72" x2="262" y2="72" stroke="rgba(169, 177, 194, 0.85)" stroke-width="2.2" stroke-linecap="round" />
        <text id="mo-spin-ao-b" x="235" y="67" text-anchor="middle" fill="#eef1f7" font-size="11" font-weight="700">↓</text>
        <text id="mo-label-ao-b" x="235" y="84" text-anchor="middle" fill="#a9b1c2" font-size="9.5" font-weight="600">φ_B</text>
        <text id="mo-eps-ao-b" x="235" y="95" text-anchor="middle" fill="#7f8899" font-size="8.5">-- eV</text>

        <g id="mo-hit-anti" class="mo-level-hit" role="button" tabindex="0" aria-label="${escapeHtml(strings.modeAntibonding)}" style="cursor: pointer">
          <rect id="mo-rect-anti" x="102" y="26" width="76" height="20" rx="5" fill="transparent" />
          <line id="mo-line-anti" x1="108" y1="38" x2="172" y2="38" stroke="#f87171" stroke-width="2.2" stroke-linecap="round" />
          <text id="mo-spin-anti" x="140" y="34" text-anchor="middle" fill="#fde2e2" font-size="11" font-weight="700"></text>
          <text id="mo-caption-anti" x="140" y="23" text-anchor="middle" fill="#f87171" font-size="9.5" font-weight="600">Ψ₋</text>
        </g>

        <g id="mo-hit-bond" class="mo-level-hit" role="button" tabindex="0" aria-label="${escapeHtml(strings.modeBonding)}" style="cursor: pointer">
          <rect id="mo-rect-bond" x="102" y="94" width="76" height="20" rx="5" fill="transparent" />
          <line id="mo-line-bond" x1="108" y1="106" x2="172" y2="106" stroke="#4f8ff7" stroke-width="2.8" stroke-linecap="round" />
          <text id="mo-spin-bond" x="140" y="102" text-anchor="middle" fill="#e0edff" font-size="11" font-weight="700">↑↓</text>
          <text id="mo-caption-bond" x="140" y="120" text-anchor="middle" fill="#8ab4ff" font-size="9.5" font-weight="600">Ψ₊</text>
        </g>
      </svg>
    `;
  }

  private attachEventListeners(): void {
    this.bindPanelCollapseListeners();
    this.bindMobileDrawerListeners();
    this.bindPresetRadioListeners();
    this.bindBondControlListeners();
    this.bindPolarAndVisualListeners();
    this.bindSvgMoHitListeners();
    ExplanationModal.attachInfoButtons(this.container);
  }

  private bindPanelCollapseListeners(): void {
    const leftPanel = this.container.querySelector('#bonding-controls-panel') as HTMLElement;
    const btnCollapseLeft = this.container.querySelector('#btn-collapse-bonding-controls') as HTMLElement;
    const btnExpandLeft = this.container.querySelector('#btn-expand-bonding-controls') as HTMLElement;

    const rightPanel = this.container.querySelector('#bonding-energy-panel') as HTMLElement;
    const btnCollapseRight = this.container.querySelector('#btn-collapse-bonding-energy') as HTMLElement;
    const btnExpandRight = this.container.querySelector('#btn-expand-bonding-energy') as HTMLElement;

    btnCollapseLeft.addEventListener('click', () => {
      this.isLeftCollapsed = true;
      leftPanel.classList.add('collapsed');
      btnCollapseLeft.setAttribute('aria-expanded', 'false');
      btnExpandLeft.classList.add('visible');
      btnExpandLeft.setAttribute('aria-expanded', 'false');
    });

    btnExpandLeft.addEventListener('click', () => {
      this.isLeftCollapsed = false;
      leftPanel.classList.remove('collapsed');
      btnCollapseLeft.setAttribute('aria-expanded', 'true');
      btnExpandLeft.classList.remove('visible');
      btnExpandLeft.setAttribute('aria-expanded', 'true');
    });

    btnCollapseRight.addEventListener('click', () => {
      this.isRightCollapsed = true;
      rightPanel.classList.add('collapsed');
      btnCollapseRight.setAttribute('aria-expanded', 'false');
      btnExpandRight.classList.add('visible');
      btnExpandRight.setAttribute('aria-expanded', 'false');
    });

    btnExpandRight.addEventListener('click', () => {
      this.isRightCollapsed = false;
      rightPanel.classList.remove('collapsed');
      btnCollapseRight.setAttribute('aria-expanded', 'true');
      btnExpandRight.classList.remove('visible');
      btnExpandRight.setAttribute('aria-expanded', 'true');
      this.potentialChart?.draw();
    });
  }

  private bindMobileDrawerListeners(): void {
    const leftPanel = this.container.querySelector('#bonding-controls-panel') as HTMLElement;
    const rightContainer = this.container.querySelector('#bonding-physics-container') as HTMLElement;
    const backdrop = this.container.querySelector('#bonding-drawer-backdrop') as HTMLElement;
    const btnShowControls = this.container.querySelector('#btn-show-bonding-controls') as HTMLElement;
    const btnShowEnergy = this.container.querySelector('#btn-show-bonding-energy') as HTMLElement;
    const btnCloseControls = this.container.querySelector('#btn-close-bonding-controls') as HTMLElement;
    const btnCloseEnergy = this.container.querySelector('#btn-close-bonding-energy') as HTMLElement;

    const closeAll = () => {
      leftPanel.classList.remove('mobile-open');
      rightContainer.classList.remove('mobile-open');
      backdrop.classList.remove('active');
      btnShowControls.classList.remove('active');
      btnShowEnergy.classList.remove('active');
      btnShowControls.setAttribute('aria-expanded', 'false');
      btnShowEnergy.setAttribute('aria-expanded', 'false');
    };

    const toggleDrawer = (panel: HTMLElement, trigger: HTMLElement, closeBtn: HTMLElement) => {
      if (panel.classList.contains('mobile-open')) {
        closeAll();
        return;
      }
      closeAll();
      panel.classList.add('mobile-open');
      backdrop.classList.add('active');
      trigger.classList.add('active');
      trigger.setAttribute('aria-expanded', 'true');
      closeBtn.focus();
      this.potentialChart?.draw();
    };

    btnShowControls.addEventListener('click', () =>
      toggleDrawer(leftPanel, btnShowControls, btnCloseControls),
    );
    btnShowEnergy.addEventListener('click', () =>
      toggleDrawer(rightContainer, btnShowEnergy, btnCloseEnergy),
    );
    btnCloseControls.addEventListener('click', closeAll);
    btnCloseEnergy.addEventListener('click', closeAll);
    backdrop.addEventListener('click', closeAll);
  }

  private bindPresetRadioListeners(): void {
    const buttons = Array.from(
      this.container.querySelectorAll<HTMLButtonElement>('.bonding-preset-btn'),
    );

    buttons.forEach((btn, index) => {
      const id = btn.dataset.presetId as BondingPresetId;
      btn.addEventListener('click', () => this.selectPreset(id));
      btn.addEventListener('keydown', (e) => this.handlePresetKeydown(e, index, buttons));
    });
  }

  private getPresetNavDelta(key: string, isRtl: boolean): number | null {
    if (key === 'ArrowDown') return 1;
    if (key === 'ArrowUp') return -1;
    if (key === 'ArrowRight') return isRtl ? -1 : 1;
    if (key === 'ArrowLeft') return isRtl ? 1 : -1;
    return null;
  }

  private handlePresetKeydown(
    e: KeyboardEvent,
    index: number,
    buttons: HTMLButtonElement[],
  ): void {
    if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;

    const delta = this.getPresetNavDelta(e.key, document.documentElement.dir === 'rtl');
    if (delta === null) return;

    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= buttons.length) {
      return;
    }

    e.preventDefault();
    const targetBtn = buttons[nextIndex];
    const nextId = targetBtn.dataset.presetId as BondingPresetId;
    this.selectPreset(nextId);
    targetBtn.focus();
    targetBtn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  private bindBondControlListeners(): void {
    const exportBtn = this.container.querySelector('#btn-bonding-export') as HTMLElement;
    exportBtn.addEventListener('click', () => this.onExportClick());

    const modeButtons = this.container.querySelectorAll<HTMLButtonElement>('[data-mo-mode]');
    modeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextMode = btn.dataset.moMode as MoOrderMode;
        this.setMode(nextMode, true);
      });
    });

    const rSlider = this.container.querySelector('#bonding-r-slider') as HTMLInputElement;
    rSlider.addEventListener('input', () => {
      this.setDistanceR(Number.parseFloat(rSlider.value), true);
    });

    const snapBtn = this.container.querySelector('#btn-snap-equilibrium') as HTMLButtonElement;
    snapBtn.addEventListener('click', () => {
      if (!this.lastState) return;
      const quantized = Math.round(this.lastState.rEqBohr / 0.02) * 0.02;
      const clamped = Math.max(BOND_R_MIN, Math.min(BOND_R_MAX, Number(quantized.toFixed(2))));
      this.setDistanceR(clamped, true);
    });
  }

  private bindPolarAndVisualListeners(): void {
    const basisBtns = this.container.querySelectorAll<HTMLButtonElement>('[data-polar-basis]');
    basisBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextBasis = btn.dataset.polarBasis as PolarBasisPair;
        if (nextBasis === this.polarBasis) return;
        this.polarBasis = nextBasis;
        this.syncControlsToState();
        this.recomputeCurveAndSync(true);
      });
    });

    const zeffASlider = this.container.querySelector('#bonding-zeff-a') as HTMLInputElement;
    const zeffBSlider = this.container.querySelector('#bonding-zeff-b') as HTMLInputElement;

    zeffASlider.addEventListener('input', () => {
      this.polarZEffA = Number.parseFloat(zeffASlider.value);
      syncRangeFill(zeffASlider);
      const badge = this.container.querySelector('#bonding-zeff-a-val') as HTMLElement;
      badge.textContent = this.polarZEffA.toFixed(2);
      this.recomputeCurveAndSync(false);
    });

    zeffBSlider.addEventListener('input', () => {
      this.polarZEffB = Number.parseFloat(zeffBSlider.value);
      syncRangeFill(zeffBSlider);
      const badge = this.container.querySelector('#bonding-zeff-b-val') as HTMLElement;
      badge.textContent = this.polarZEffB.toFixed(2);
      this.recomputeCurveAndSync(false);
    });

    const nodalBtn = this.container.querySelector('#btn-bonding-nodal-planes') as HTMLButtonElement;
    nodalBtn.addEventListener('click', () => {
      this.showNodalPlanes = !this.showNodalPlanes;
      this.syncControlsToState();
      this.syncPhysics(false);
    });

    const paletteSelect = this.container.querySelector('#bonding-palette-select') as HTMLSelectElement;
    paletteSelect.addEventListener('change', () => {
      this.palette = paletteSelect.value as ColorPalette;
      this.syncPhysics(false);
    });

    const contrastSlider = this.container.querySelector('#bonding-contrast-slider') as HTMLInputElement;
    contrastSlider.addEventListener('input', () => {
      this.contrast = Number.parseInt(contrastSlider.value, 10);
      syncRangeFill(contrastSlider);
      const badge = this.container.querySelector('#bonding-contrast-val') as HTMLElement;
      badge.textContent = String(this.contrast);
      this.syncPhysics(false);
    });
  }

  private bindSvgMoHitListeners(): void {
    const bindGroup = (selector: string, targetMode: MoOrderMode) => {
      const group = this.container.querySelector(selector) as SVGGElement;
      group.addEventListener('click', () => this.setMode(targetMode, true));
      group.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.setMode(targetMode, true);
        }
      });
    };

    bindGroup('#mo-hit-anti', 'antibonding');
    bindGroup('#mo-hit-bond', 'bonding');
  }

  private selectPreset(id: BondingPresetId): void {
    if (id === this.presetId) return;
    this.applyPresetDefaults(id);
    this.syncControlsToState();
    if (this.isActivated) {
      this.emitScaleHud();
    }
    this.recomputeCurveAndSync(true);
    this.onStateChange?.();
  }

  private setMode(nextMode: MoOrderMode, notify: boolean): void {
    if (nextMode === this.mode) return;
    this.mode = nextMode;
    this.syncControlsToState();
    this.syncPhysics(false);
    if (notify) {
      this.onStateChange?.();
    }
  }

  private setDistanceR(newR: number, notify: boolean): void {
    if (newR === this.rBohr) return;
    this.rBohr = newR;

    const rSlider = this.container.querySelector('#bonding-r-slider') as HTMLInputElement;
    const rBadge = this.container.querySelector('#bonding-r-val') as HTMLElement;
    rSlider.value = String(this.rBohr);
    syncRangeFill(rSlider);
    rBadge.textContent = formatDistanceBadge(this.rBohr);

    if (this.isActivated) {
      this.emitScaleHud();
    }
    this.syncPhysics(false);
    if (notify) {
      this.onStateChange?.();
    }
  }

  private syncAllRangeFills(): void {
    const ranges = this.container.querySelectorAll<HTMLInputElement>('input[type="range"]');
    ranges.forEach((input) => syncRangeFill(input));
  }

  private syncControlsToState(): void {
    const preset = this.getPreset();
    const strings = getStrings();

    const presetButtons = this.container.querySelectorAll<HTMLButtonElement>('.bonding-preset-btn');
    presetButtons.forEach((btn) => {
      const isMatch = btn.dataset.presetId === this.presetId;
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-checked', String(isMatch));
      btn.tabIndex = isMatch ? 0 : -1;
    });

    const modeButtons = this.container.querySelectorAll<HTMLButtonElement>('[data-mo-mode]');
    modeButtons.forEach((btn) => {
      const isMatch = btn.dataset.moMode === this.mode;
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-pressed', String(isMatch));
    });

    const rSlider = this.container.querySelector('#bonding-r-slider') as HTMLInputElement;
    const rBadge = this.container.querySelector('#bonding-r-val') as HTMLElement;
    rSlider.value = String(this.rBohr);
    syncRangeFill(rSlider);
    rBadge.textContent = formatDistanceBadge(this.rBohr);

    const polarSection = this.container.querySelector('#bonding-polar-section') as HTMLElement;
    polarSection.classList.toggle('hidden', !preset.isPolar);

    const basisBtns = this.container.querySelectorAll<HTMLButtonElement>('[data-polar-basis]');
    basisBtns.forEach((btn) => {
      const isMatch = btn.dataset.polarBasis === this.polarBasis;
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-pressed', String(isMatch));
    });

    const zeffASlider = this.container.querySelector('#bonding-zeff-a') as HTMLInputElement;
    const zeffBSlider = this.container.querySelector('#bonding-zeff-b') as HTMLInputElement;
    const zeffABadge = this.container.querySelector('#bonding-zeff-a-val') as HTMLElement;
    const zeffBBadge = this.container.querySelector('#bonding-zeff-b-val') as HTMLElement;
    zeffASlider.value = String(this.polarZEffA);
    zeffBSlider.value = String(this.polarZEffB);
    syncRangeFill(zeffASlider);
    syncRangeFill(zeffBSlider);
    zeffABadge.textContent = this.polarZEffA.toFixed(2);
    zeffBBadge.textContent = this.polarZEffB.toFixed(2);

    const nodalBtn = this.container.querySelector('#btn-bonding-nodal-planes') as HTMLButtonElement;
    nodalBtn.classList.toggle('active', this.showNodalPlanes);
    nodalBtn.setAttribute('aria-pressed', String(this.showNodalPlanes));
    nodalBtn.innerHTML = `${this.showNodalPlanes ? icon('eye') : icon('eye-off')}<span>${escapeHtml(strings.toggleNodalPlanes)}</span>`;
  }

  private recomputeCurveAndSync(reframeCamera: boolean): void {
    if (!this.wasmReady) return;
    const preset = this.getPreset();
    const { atomA, atomB } = this.resolveAtoms(preset);
    this.cachedCurve = computeLcaoCurveSync(atomA, atomB);
    this.syncPhysics(reframeCamera);
  }

  private syncPhysics(reframeCamera: boolean): void {
    if (!this.wasmReady) return;
    const preset = this.getPreset();
    const { atomA, atomB } = this.resolveAtoms(preset);
    const state = computeLcaoStateSync(atomA, atomB, this.rBohr);
    this.lastState = state;

    const isBonding = this.mode === 'bonding';
    const cA = isBonding ? state.cABond : state.cAAnti;
    const cB = isBonding ? state.cBBond : state.cBAnti;
    const hasTransverseNode = !isBonding && state.nodalZAnti !== null;

    this.renderer.updateState(
      {
        atomA,
        atomB,
        rBohr: this.rBohr,
        cA,
        cB,
        peakRefDensity: state.peakRefDensity,
        showNodalPlanes: this.showNodalPlanes,
        hasTransverseNode,
        nodalZ: state.nodalZAnti ?? 0,
        hasPiPlane: preset.symmetry === 'pi',
        palette: this.palette,
        contrast: this.contrast,
      },
      reframeCamera,
    );

    const bondOrder = calculateBondOrder(preset.electronsBonding, preset.electronsAntibonding);
    this.potentialChart?.update({
      curve: this.cachedCurve,
      currentR: this.rBohr,
      rEqBohr: state.rEqBohr,
      dEEv: state.dEEv,
      mode: this.mode,
      isUnstableDimer: bondOrder === 0,
    });

    this.updateEnergeticsDom(preset, state, cA, cB, bondOrder);
    this.updateCorrelationSvg(preset, atomA, atomB, state);
  }

  private updateEnergeticsDom(
    preset: BondingPreset,
    state: LcaoStateResult,
    cA: number,
    cB: number,
    bondOrder: number,
  ): void {
    const strings = getStrings();
    const meta = PRESET_UI_META[preset.id];
    const isBonding = this.mode === 'bonding';
    const symbolHtml = isBonding ? meta.bondSymbolHtml : meta.antiSymbolHtml;
    const psiHtml = isBonding ? 'Ψ<sub>+</sub>' : 'Ψ<sub>−</sub>';
    const termA = `${formatSignedCoeff(cA, true)} φ<sub>A</sub>`;
    const termB = `${formatSignedCoeff(cB, false)} φ<sub>B</sub>`;

    const eqEl = this.container.querySelector('#bonding-active-equation') as HTMLElement;
    eqEl.innerHTML = `${symbolHtml} &middot; ${psiHtml} = ${termA}${termB}`;

    const reqEl = this.container.querySelector('#bonding-stat-req') as HTMLElement;
    reqEl.innerHTML = `${state.rEqBohr.toFixed(2)} a₀<small>${bohrToPm(state.rEqBohr).toFixed(0)} pm</small>`;

    const deEl = this.container.querySelector('#bonding-stat-de') as HTMLElement;
    deEl.textContent = `${state.dEEv.toFixed(2)} eV`;

    const overlapEl = this.container.querySelector('#bonding-stat-overlap') as HTMLElement;
    overlapEl.textContent = state.overlapS.toFixed(3);

    const isStable = bondOrder > 0;
    const boBanner = this.container.querySelector('#bonding-bo-banner') as HTMLElement;
    boBanner.classList.toggle('is-stable', isStable);
    boBanner.classList.toggle('is-unstable', !isStable);

    const boValue = this.container.querySelector('#bonding-bo-value') as HTMLElement;
    boValue.textContent = `${strings.bondOrderLabel}: BO = ${bondOrder}`;

    const boBadge = this.container.querySelector('#bonding-bo-badge') as HTMLElement;
    boBadge.textContent = isStable ? strings.bondStableBadge : strings.bondUnstableBadge;

    const pctA = Math.round(state.shareABond * 100);
    const pctB = Math.round(state.shareBBond * 100);
    const shareReadout = this.container.querySelector('#bonding-share-readout') as HTMLElement;
    const shareBarA = this.container.querySelector('#bonding-share-bar-a') as HTMLElement;
    const shareBarB = this.container.querySelector('#bonding-share-bar-b') as HTMLElement;
    shareReadout.textContent = `A: ${pctA}% / B: ${pctB}%`;
    shareBarA.style.width = `${pctA}%`;
    shareBarB.style.width = `${100 - pctA}%`;
  }

  private updateCorrelationSvg(
    preset: BondingPreset,
    atomA: AtomOrbitalSpec,
    atomB: AtomOrbitalSpec,
    state: LcaoStateResult,
  ): void {
    const eMinRaw = Math.min(state.epsAEv, state.epsBEv, state.moEpsBondEv, state.moEpsAntiEv);
    const eMaxRaw = Math.max(state.epsAEv, state.epsBEv, state.moEpsBondEv, state.moEpsAntiEv);
    const span = Math.max(eMaxRaw - eMinRaw, 2.0);
    const eLow = eMinRaw - span * 0.14;
    const eHigh = eMaxRaw + span * 0.14;

    const yTop = 34;
    const yBottom = 110;
    const toY = (ev: number) => yTop + ((eHigh - ev) / (eHigh - eLow)) * (yBottom - yTop);

    const yA = toY(state.epsAEv);
    const yB = toY(state.epsBEv);
    const yAnti = toY(state.moEpsAntiEv);
    const yBond = toY(state.moEpsBondEv);

    this.setSvgLineY('#mo-line-ao-a', yA, yA);
    this.setSvgLineY('#mo-line-ao-b', yB, yB);
    this.setSvgLineY('#mo-line-anti', yAnti, yAnti);
    this.setSvgLineY('#mo-line-bond', yBond, yBond);

    this.setSvgLineY('#mo-corr-a-anti', yA, yAnti);
    this.setSvgLineY('#mo-corr-b-anti', yB, yAnti);
    this.setSvgLineY('#mo-corr-a-bond', yA, yBond);
    this.setSvgLineY('#mo-corr-b-bond', yB, yBond);

    const isFourElectron = preset.electronsAntibonding === 2;
    this.setSvgText('#mo-spin-ao-a', yA - 4, isFourElectron ? '↑↓' : '↑');
    this.setSvgText('#mo-label-ao-a', yA + 11, formatAoLabel(atomA, 'A'));
    this.setSvgText('#mo-eps-ao-a', yA + 21, `${state.epsAEv.toFixed(1)} eV`);

    this.setSvgText('#mo-spin-ao-b', yB - 4, isFourElectron ? '↑↓' : '↓');
    this.setSvgText('#mo-label-ao-b', yB + 11, formatAoLabel(atomB, 'B'));
    this.setSvgText('#mo-eps-ao-b', yB + 21, `${state.epsBEv.toFixed(1)} eV`);

    const meta = PRESET_UI_META[preset.id];
    this.setSvgText('#mo-spin-anti', yAnti - 3, isFourElectron ? '↑↓' : '');
    this.setSvgText('#mo-caption-anti', yAnti - 14, `${meta.antiSymbolPlain} (${state.moEpsAntiEv.toFixed(1)} eV)`);

    this.setSvgText('#mo-spin-bond', yBond - 3, '↑↓');
    this.setSvgText('#mo-caption-bond', yBond + 13, `${meta.bondSymbolPlain} (${state.moEpsBondEv.toFixed(1)} eV)`);

    const halfGap = Math.max(4, Math.min(11, (yBond - yAnti) * 0.48));
    this.updateSvgMoHighlight('#mo-rect-anti', '#mo-line-anti', yAnti, halfGap, this.mode === 'antibonding', true);
    this.updateSvgMoHighlight('#mo-rect-bond', '#mo-line-bond', yBond, halfGap, this.mode === 'bonding', false);
  }

  private setSvgLineY(selector: string, y1: number, y2: number): void {
    const el = this.container.querySelector(selector) as SVGLineElement;
    el.setAttribute('y1', y1.toFixed(1));
    el.setAttribute('y2', y2.toFixed(1));
  }

  private setSvgText(selector: string, y: number, text: string): void {
    const el = this.container.querySelector(selector) as SVGTextElement;
    el.setAttribute('y', y.toFixed(1));
    el.textContent = text;
  }

  private updateSvgMoHighlight(
    rectSelector: string,
    lineSelector: string,
    centerY: number,
    halfHeight: number,
    isActive: boolean,
    isAnti: boolean,
  ): void {
    const rect = this.container.querySelector(rectSelector) as SVGRectElement;
    const line = this.container.querySelector(lineSelector) as SVGLineElement;

    rect.setAttribute('y', (centerY - halfHeight).toFixed(1));
    rect.setAttribute('height', (halfHeight * 2).toFixed(1));
    if (isActive) {
      rect.setAttribute('fill', isAnti ? 'rgba(248, 113, 113, 0.14)' : 'rgba(79, 143, 247, 0.14)');
      rect.setAttribute('stroke', isAnti ? 'rgba(248, 113, 113, 0.45)' : 'rgba(79, 143, 247, 0.45)');
      rect.setAttribute('stroke-width', '1');
      line.setAttribute('stroke-width', '3.1');
    } else {
      rect.setAttribute('fill', 'transparent');
      rect.removeAttribute('stroke');
      rect.removeAttribute('stroke-width');
      line.setAttribute('stroke-width', '2.1');
    }
  }
}
