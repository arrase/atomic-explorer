import elementsData from '../../assets/data/elements.json';
import { getStrings, getLanguage, onLanguageChange, I18nStrings } from '../i18n';
import { ExplanationModal } from './info-modal';
import { icon } from './icons';
import { OrbitalPreview } from '../render/orbital-preview';
import { calculateValenceQuantumNumbers, subshellName } from '../core/valence-orbital';
import { meanRadiusBohr } from '../core/physics-constants';
import {
  ELECTRONEGATIVITY_GRADIENT,
  RADIUS_GRADIENT,
  getCategoryColor,
  getElectronegativityColor,
  getLegendCategoryOrder,
  getRadiusColor,
} from './element-colors';

export interface ElementData {
  Z: number;
  symbol: string;
  name_es: string;
  name_en: string;
  category: string;
  atomic_mass: number;
  electron_config_str: string;
  radius_pm: number;
  electronegativity: number | null;
  ionization_energy: number | null;
  oxidation_states?: number[];
  discovery_year: number | string;
}

export type ChemicalBlock = 'all' | 's' | 'p' | 'd' | 'f';

interface GridRange {
  readonly maxZ: number;
  readonly row: number;
  readonly colOffset: number;
}

const GRID_RANGES: readonly GridRange[] = [
  { maxZ: 1, row: 2, colOffset: 1 },
  { maxZ: 2, row: 2, colOffset: 17 },
  { maxZ: 4, row: 3, colOffset: -1 },
  { maxZ: 10, row: 3, colOffset: 9 },
  { maxZ: 12, row: 4, colOffset: -9 },
  { maxZ: 18, row: 4, colOffset: 1 },
  { maxZ: 36, row: 5, colOffset: -17 },
  { maxZ: 54, row: 6, colOffset: -35 },
  { maxZ: 56, row: 7, colOffset: -53 },
  { maxZ: 71, row: 10, colOffset: -53 },
  { maxZ: 86, row: 7, colOffset: -67 },
  { maxZ: 88, row: 8, colOffset: -85 },
  { maxZ: 103, row: 11, colOffset: -85 },
  { maxZ: 118, row: 8, colOffset: -99 },
];

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export class PeriodicTableView {
  private readonly container: HTMLElement;
  private readonly elements: ElementData[] = elementsData as ElementData[];
  private readonly preview: OrbitalPreview;
  private selectedElement: ElementData | null = null;
  private currentColorScheme: 'category' | 'electronegativity' | 'radius' = 'category';
  private selectedBlock: ChemicalBlock = 'all';
  private readonly onSelectElementOrbital: (element: ElementData) => void;

  constructor(
    container: HTMLElement,
    onSelectElementOrbital: (element: ElementData) => void,
    preview: OrbitalPreview
  ) {
    this.container = container;
    this.onSelectElementOrbital = onSelectElementOrbital;
    this.preview = preview;
    this.selectedElement = this.elements[0];
    this.render();
    onLanguageChange(() => this.render());
  }

  private render(): void {
    const strings = getStrings();

    this.container.innerHTML = `
      <div class="periodic-table-wrapper">
        <div class="table-toolbar">
          <div class="toolbar-left-group">
            <div class="toolbar-group">
              <label for="color-scheme-select">${strings.colorCoding}:</label>
              <select id="color-scheme-select">
                <option value="category" ${this.currentColorScheme === 'category' ? 'selected' : ''}>${strings.colorCategory}</option>
                <option value="electronegativity" ${this.currentColorScheme === 'electronegativity' ? 'selected' : ''}>${strings.colorElectronegativity}</option>
                <option value="radius" ${this.currentColorScheme === 'radius' ? 'selected' : ''}>${strings.colorRadius}</option>
              </select>
            </div>
            <div class="block-filter-bar">
              <button class="btn-block-filter ${this.selectedBlock === 'all' ? 'active' : ''}" data-block="all">${strings.blockFilterAll}</button>
              <button class="btn-block-filter ${this.selectedBlock === 's' ? 'active' : ''}" data-block="s">${strings.blockFilterS}</button>
              <button class="btn-block-filter ${this.selectedBlock === 'p' ? 'active' : ''}" data-block="p">${strings.blockFilterP}</button>
              <button class="btn-block-filter ${this.selectedBlock === 'd' ? 'active' : ''}" data-block="d">${strings.blockFilterD}</button>
              <button class="btn-block-filter ${this.selectedBlock === 'f' ? 'active' : ''}" data-block="f">${strings.blockFilterF}</button>
            </div>
          </div>
          <div class="toolbar-group search-group">
            <div class="search-input-wrapper">
              <span class="search-icon-inside">${icon('search')}</span>
              <input type="text" id="element-search" placeholder="${strings.searchPlaceholder}" />
            </div>
          </div>
        </div>

        <div class="periodic-legend-container" id="periodic-legend-container">
          ${this.renderLegendBar()}
        </div>

        <div class="periodic-grid-container">
          <div class="periodic-grid" id="periodic-grid" role="listbox" aria-label="${escapeHtml(strings.periodicTrendsGuideTitle)}" aria-orientation="horizontal">
            ${this.renderGridCells()}
          </div>
          <div class="periodic-scroll-hint">
            <span>${icon('chevron-left')} ${strings.swipeToExplore} ${icon('chevron-right')}</span>
          </div>
          <div class="periodic-trends-card">
            <div class="trends-card-header">
              <h4>${strings.periodicTrendsGuideTitle}</h4>
              <button class="btn-info-icon" data-explain="explainAtomicRadius" aria-label="Info">${icon('info')}</button>
            </div>
            <p>${strings.periodicTrendsGuideText}</p>
          </div>
        </div>

        <!-- Persistent Mobile Quick Inspector Bar (Visible on mobile/tablet <=1024px) -->
        <div class="mobile-quick-inspector" id="mobile-quick-inspector">
          ${this.renderQuickInspectorContent()}
        </div>

        <!-- Mobile Drawer Backdrop -->
        <div class="mobile-drawer-backdrop" id="periodic-drawer-backdrop"></div>

        <!-- Full Element Inspector Panel (Desktop sidebar / Mobile bottom sheet) -->
        <div class="element-inspector-panel" id="element-inspector">
          <div class="mobile-drawer-handle"></div>
          <div class="panel-header-actions mobile-only-header">
            <button class="panel-close-btn" id="btn-close-inspector" aria-label="${escapeHtml(strings.infoModalClose)}">${icon('close')}</button>
          </div>
          ${this.renderInspectorContent()}
        </div>
      </div>
    `;

    this.attachEventListeners();
    this.updatePreview();
  }

  private getElementName(el: ElementData): string {
    return getLanguage() === 'es' ? el.name_es : (el.name_en || el.name_es);
  }

  private getCategoryName(categoryKey: string, strings: I18nStrings): string {
    switch (categoryKey) {
      case 'no metal': return strings.catNonMetal;
      case 'gas noble': return strings.catNobleGas;
      case 'metal alcalino': return strings.catAlkaliMetal;
      case 'alcalinotérreo': return strings.catAlkalineEarth;
      case 'metaloide': return strings.catMetalloid;
      case 'halógeno': return strings.catHalogen;
      case 'metal de transición': return strings.catTransitionMetal;
      case 'metal del bloque p': return strings.catPostTransitionMetal;
      case 'lantánido': return strings.catLanthanide;
      case 'actínido': return strings.catActinide;
      default: return categoryKey;
    }
  }

  public getElementBlock(el: ElementData): 's' | 'p' | 'd' | 'f' {
    const z = el.Z;
    if ((z >= 57 && z <= 71) || (z >= 89 && z <= 103)) return 'f';
    if (z === 1 || z === 2 || [3, 4, 11, 12, 19, 20, 37, 38, 55, 56, 87, 88].includes(z)) return 's';
    if (
      (z >= 5 && z <= 10) ||
      (z >= 13 && z <= 18) ||
      (z >= 31 && z <= 36) ||
      (z >= 49 && z <= 54) ||
      (z >= 81 && z <= 86) ||
      (z >= 113 && z <= 118)
    ) {
      return 'p';
    }
    return 'd';
  }

  private renderLegendBar(): string {
    const strings = getStrings();
    if (this.currentColorScheme === 'electronegativity') {
      return `
        <div class="periodic-legend-bar">
          <div class="legend-header">
            <span class="legend-title">${strings.legendElectronegativity}</span>
            <span class="legend-na-badge">N/A: ${strings.catNobleGas}</span>
          </div>
          <div class="legend-gradient-wrapper">
            <span class="legend-val-min">0.7 (Fr)</span>
            <div class="legend-gradient-track" style="background: ${ELECTRONEGATIVITY_GRADIENT}"></div>
            <span class="legend-val-max">4.0 (F)</span>
          </div>
        </div>
      `;
    } else if (this.currentColorScheme === 'radius') {
      return `
        <div class="periodic-legend-bar">
          <div class="legend-header">
            <span class="legend-title">${strings.legendAtomicRadius}</span>
          </div>
          <div class="legend-gradient-wrapper">
            <span class="legend-val-min">32 pm (He)</span>
            <div class="legend-gradient-track" style="background: ${RADIUS_GRADIENT}"></div>
            <span class="legend-val-max">260 pm (Fr)</span>
          </div>
        </div>
      `;
    } else {
      const chips = getLegendCategoryOrder()
        .map(
          (key) =>
            `<span class="cat-chip" style="--cat: ${getCategoryColor(key)}">${this.getCategoryName(key, strings)}</span>`
        )
        .join('');
      return `
        <div class="periodic-legend-bar category-legend-bar">
          <div class="category-chips">${chips}</div>
        </div>
      `;
    }
  }

  private renderGridCells(filterText: string = ''): string {
    const strings = getStrings();
    const query = filterText.toLowerCase().trim();
    let html = '';

    // 1. Group Headers (Columns 1 to 18) -> Row 1, Cols 2 to 19
    for (let g = 1; g <= 18; g++) {
      html += `
        <div class="grid-header-cell group-header-cell" style="grid-column: ${g + 1}; grid-row: 1;">
          <span>${g}</span>
        </div>
      `;
    }

    // 2. Period Headers (Rows 1 to 7) -> Col 1, Rows 2 to 8
    for (let p = 1; p <= 7; p++) {
      html += `
        <div class="grid-header-cell period-header-cell" style="grid-column: 1; grid-row: ${p + 1};">
          <span>${p}</span>
        </div>
      `;
    }

    // 3. Series Placeholders in Main Table (Period 6 and 7, Group 3 -> Row 7 Col 4 and Row 8 Col 4)
    html += `
      <div class="element-cell placeholder-cell" style="grid-column: 4; grid-row: 7;">
        <span class="el-z">57-71</span>
        <span class="el-symbol">*</span>
        <span class="el-name">La-Lu</span>
      </div>
      <div class="element-cell placeholder-cell" style="grid-column: 4; grid-row: 8;">
        <span class="el-z">89-103</span>
        <span class="el-symbol">**</span>
        <span class="el-name">Ac-Lr</span>
      </div>
    `;

    // 4. Series Row Labels for Lanthanides (Row 10) & Actinides (Row 11)
    html += `
      <div class="grid-header-cell series-header-cell" style="grid-column: 1 / 4; grid-row: 10;">
        <span>* 57-71</span>
      </div>
      <div class="grid-header-cell series-header-cell" style="grid-column: 1 / 4; grid-row: 11;">
        <span>** 89-103</span>
      </div>
    `;

    // 5. Element Cells
    const elementCellsHtml = this.elements
      .map((el) => {
        const nameEs = el.name_es.toLowerCase();
        const nameEn = el.name_en.toLowerCase();
        const textMatches =
          !query ||
          nameEs.includes(query) ||
          nameEn.includes(query) ||
          el.symbol.toLowerCase().includes(query) ||
          String(el.Z).includes(query);

        const block = this.getElementBlock(el);
        const blockMatches = this.selectedBlock === 'all' || block === this.selectedBlock;
        const isDimmed = !textMatches || !blockMatches;

        const gridPos = this.getElementGridPosition(el.Z);
        const color = this.getElementColor(el);
        const name = this.getElementName(el);
        const catName = this.getCategoryName(el.category, strings);
        const ariaLabel = `${name} (${el.symbol}), Z=${el.Z}, ${catName}`;
        const isSelected = this.selectedElement?.Z === el.Z;

        return `
          <div class="element-cell ${isDimmed ? 'dimmed' : ''} ${isSelected ? 'selected' : ''}"
               role="option"
               tabindex="${isSelected ? '0' : '-1'}"
               aria-selected="${isSelected ? 'true' : 'false'}"
               aria-label="${escapeHtml(ariaLabel)}"
               data-z="${el.Z}"
               data-row="${gridPos.row}"
               data-col="${gridPos.col}"
               data-block="${block}"
               style="grid-column: ${gridPos.col}; grid-row: ${gridPos.row}; --cat: ${color};">
            <span class="el-z">${el.Z}</span>
            <span class="el-symbol">${el.symbol}</span>
            <span class="el-name">${name}</span>
          </div>
        `;
      })
      .join('');

    return html + elementCellsHtml;
  }

  private getElementGridPosition(z: number): { row: number; col: number } {
    for (const range of GRID_RANGES) {
      if (z <= range.maxZ) {
        return { row: range.row, col: z + range.colOffset };
      }
    }
    return { row: 2, col: 2 };
  }

  private getElementColor(el: ElementData): string {
    if (this.currentColorScheme === 'category') {
      return getCategoryColor(el.category);
    }
    if (this.currentColorScheme === 'electronegativity') {
      return getElectronegativityColor(el.electronegativity);
    }
    return getRadiusColor(el.radius_pm);
  }

  private renderQuickInspectorContent(): string {
    const strings = getStrings();
    if (!this.selectedElement) {
      return `<div class="quick-inspector-placeholder"><span>${strings.selectElementPrompt}</span></div>`;
    }

    const el = this.selectedElement;
    const name = this.getElementName(el);
    const color = this.getElementColor(el);

    return `
      <div class="quick-inspector-card" id="quick-inspector-trigger">
        <div class="quick-el-badge" style="border-color: ${color}">
          <span class="quick-z">${el.Z}</span>
          <span class="quick-symbol">${el.symbol}</span>
        </div>
        <div class="quick-el-info">
          <span class="quick-name">${name}</span>
          <span class="quick-config"><code>${el.electron_config_str}</code></span>
        </div>
        <div class="quick-actions">
          <button class="btn-primary btn-quick-3d" id="btn-quick-3d" title="${strings.btnView3DOrbital}">
            ${icon('atom')}
            <span>3D</span>
          </button>
          <button class="btn-secondary btn-quick-details" id="btn-quick-details" title="${strings.viewFullDetails}">
            ${icon('chart')}
          </button>
        </div>
      </div>
    `;
  }

  private renderInspectorContent(): string {
    const strings = getStrings();

    if (!this.selectedElement) {
      return `
        <div class="inspector-placeholder">
          <p>${strings.selectElementPrompt}</p>
        </div>
      `;
    }

    const el = this.selectedElement;
    const elementName = this.getElementName(el);
    const categoryName = this.getCategoryName(el.category, strings);

    const discoveryStr =
      el.discovery_year === 'Antigüedad' || el.discovery_year === 'Ancient'
        ? strings.ancient
        : String(el.discovery_year);

    return `
      <div class="inspector-card">
        <div class="inspector-header">
          <div class="insp-header-title">
            <span class="insp-z">Z = ${el.Z} <button type="button" class="btn-info-icon" data-explain="explainAtomicNumber" aria-label="Info">${icon('info')}</button></span>
            <h2 class="insp-symbol">${escapeHtml(el.symbol)}</h2>
            <span class="insp-name">${escapeHtml(elementName)}</span>
            <span class="insp-category">${escapeHtml(categoryName)}</span>
          </div>
        </div>

        ${this.renderPreview()}

        <button type="button" class="btn-primary btn-inspector-view-3d" id="btn-view-orbital">
          ${icon('atom')}
          <span>${escapeHtml(strings.btnView3DOrbital)}</span>
        </button>

        <div class="inspector-details">
          ${this.detailRow(strings.atomicMass, 'explainAtomicMass', `${el.atomic_mass} u`)}
          ${this.detailRow(strings.electronConfig, 'explainElectronConfig', `<code>${escapeHtml(el.electron_config_str)}</code>`)}
          ${this.detailRow(strings.atomicRadius, 'explainAtomicRadius', `${el.radius_pm} pm`)}
          ${this.detailRow(strings.electronegativity, 'explainElectronegativity', escapeHtml(String(el.electronegativity ?? 'N/A')))}
          ${this.detailRow(strings.ionizationEnergy, 'explainIonizationEnergy', el.ionization_energy ? `${el.ionization_energy} kJ/mol` : 'N/A')}
          ${this.detailRow(strings.oxidationStates, null, escapeHtml(el.oxidation_states && el.oxidation_states.length > 0 ? el.oxidation_states.map(s => s > 0 ? `+${s}` : `${s}`).join(', ') : 'N/A'))}
          ${this.detailRow(strings.discovery, null, escapeHtml(discoveryStr))}
        </div>
      </div>
    `;
  }

  /**
   * Thumbnail of the element's valence cloud.
   *
   * The readout under it is filled in by `updatePreview`, because both halves of
   * it come out of WASM: the subshell name and the mean radius are properties of
   * the state, not of the element, and the element alone does not determine them
   * until the valence solve comes back.
   */
  private renderPreview(): string {
    const strings = getStrings();
    return `
      <div
        class="orbital-preview"
        id="orbital-preview"
        title="${escapeHtml(strings.orbitalPreviewHint)}"
      >
        <div class="orbital-preview-head">
          <span class="orbital-preview-label">${escapeHtml(strings.orbitalPreviewTitle)}</span>
          <span class="orbital-preview-state" id="orbital-preview-state"></span>
        </div>
        <div class="orbital-preview-stage" id="orbital-preview-stage" role="img"></div>
        <div class="orbital-preview-readout" id="orbital-preview-readout"></div>
      </div>
    `;
  }

  /**
   * Resolves the valence state of the selection and hands it to the thumbnail.
   *
   * The same solve feeds the 3D tab, so the preview cannot advertise an orbital
   * the big renderer would never show. Both of its steps are async, so the
   * selection is re-checked afterwards: walking a row of the table can leave
   * several solves in flight, and the slowest one is the first, not the last.
   */
  private async updatePreview(): Promise<void> {
    const element = this.selectedElement;
    if (!element) return;
    const z = element.Z;

    try {
      const { n, l, m, zEff } = await calculateValenceQuantumNumbers(z);
      if (this.selectedElement?.Z !== z) return;

      const state = this.container.querySelector<HTMLElement>('#orbital-preview-state');
      if (state) {
        state.textContent = subshellName(n, l);
      }

      const readout = this.container.querySelector<HTMLElement>('#orbital-preview-readout');
      if (readout) {
        readout.textContent = `Z_eff ${zEff.toFixed(2)} · ⟨r⟩ ${meanRadiusBohr(n, l, zEff).toFixed(2)} a₀`;
      }

      const stage = this.container.querySelector<HTMLElement>('#orbital-preview-stage');
      if (stage) {
        stage.setAttribute(
          'aria-label',
          `${getStrings().orbitalPreviewTitle} ${subshellName(n, l)}`
        );
        this.preview.mount(stage);
      }
      await this.preview.showOrbital({ n, l, m, useRealOrbital: true, zEff });
    } catch (error) {
      // The WASM engine rejects unsupported states rather than clamping them, and
      // this runs detached from any event handler, so a rejection would otherwise
      // surface as an unhandled promise with an empty thumbnail and no clue.
      console.error('[atomic-explorer] failed to preview valence orbital', z, error);
    }
  }

  private detailRow(label: string, explainKey: string | null, valueHtml: string): string {
    const infoBtn = explainKey
      ? `<button type="button" class="btn-info-icon" data-explain="${explainKey}" aria-label="Info">${icon('info')}</button>`
      : '';
    return `
      <div class="detail-row">
        <span class="detail-row-label">${escapeHtml(label)}${infoBtn}</span>
        <strong>${valueHtml}</strong>
      </div>
    `;
  }

  private openFullInspector(): void {
    if (window.innerWidth <= 1024) {
      const inspector = this.container.querySelector('#element-inspector') as HTMLElement;
      const backdrop = this.container.querySelector('#periodic-drawer-backdrop') as HTMLElement;
      inspector.classList.add('mobile-open');
      backdrop.classList.add('active');
    }
  }

  private closeFullInspector(): void {
    const inspector = this.container.querySelector('#element-inspector') as HTMLElement;
    const backdrop = this.container.querySelector('#periodic-drawer-backdrop') as HTMLElement;
    inspector.classList.remove('mobile-open');
    backdrop.classList.remove('active');
  }

  public selectElement(el: ElementData): void {
    this.selectedElement = el;

    const grid = this.container.querySelector('#periodic-grid');
    if (grid) {
      grid.querySelectorAll<HTMLElement>('.element-cell').forEach((c) => {
        const isMatch = c.dataset.z === String(el.Z);
        c.classList.toggle('selected', isMatch);
        c.setAttribute('aria-selected', isMatch ? 'true' : 'false');
        // Roving tabindex: the whole grid is a single tab stop.
        c.tabIndex = isMatch ? 0 : -1;
      });
    }

    const quickInspector = this.container.querySelector<HTMLElement>('#mobile-quick-inspector');
    if (quickInspector) {
      quickInspector.innerHTML = this.renderQuickInspectorContent();
    }

    const inspector = this.container.querySelector<HTMLElement>('#element-inspector');
    if (inspector) {
      const closeLabel = escapeHtml(getStrings().infoModalClose);
      inspector.innerHTML = `
        <div class="mobile-drawer-handle"></div>
        <div class="panel-header-actions mobile-only-header">
          <button class="panel-close-btn" id="btn-close-inspector" aria-label="${closeLabel}">${icon('close')}</button>
        </div>
        ${this.renderInspectorContent()}
      `;
      ExplanationModal.attachInfoButtons(inspector);
    }

    this.updatePreview();
  }

  public getSelectedElement(): ElementData | null {
    return this.selectedElement;
  }

  private attachEventListeners(): void {
    const colorSelect = this.container.querySelector('#color-scheme-select') as HTMLSelectElement;
    const searchInput = this.container.querySelector('#element-search') as HTMLInputElement;
    const grid = this.container.querySelector('#periodic-grid') as HTMLElement;
    const legendContainer = this.container.querySelector('#periodic-legend-container') as HTMLElement;

    colorSelect.addEventListener('change', () => {
      this.currentColorScheme = colorSelect.value as 'category' | 'electronegativity' | 'radius';
      legendContainer.innerHTML = this.renderLegendBar();
      grid.innerHTML = this.renderGridCells(searchInput.value);
    });

    // Block Filter Buttons
    const blockBtns = this.container.querySelectorAll('.btn-block-filter');
    blockBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const block = (btn as HTMLElement).dataset.block as ChemicalBlock;
        if (block) {
          this.selectedBlock = block;
          blockBtns.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          grid.innerHTML = this.renderGridCells(searchInput.value);
        }
      });
    });

    searchInput.addEventListener('input', () => {
      grid.innerHTML = this.renderGridCells(searchInput.value);
    });

    // Click on element cell
    grid.addEventListener('click', (e) => {
      const data = this.getElementFromEvent(e);
      if (data) {
        this.selectElement(data.el);
      }
    });

    // Double-click to launch 3D orbital directly
    grid.addEventListener('dblclick', (e) => {
      const data = this.getElementFromEvent(e);
      if (data) {
        this.selectElement(data.el);
        this.closeFullInspector();
        this.onSelectElementOrbital(data.el);
      }
    });

    // Keyboard navigation & selection
    grid.addEventListener('keydown', (e: KeyboardEvent) => {
      this.handleGridKeydown(e, grid);
    });

    // Unified container click delegation. Assigned rather than added because
    // `render` runs on every language change while the container element itself
    // is never replaced, so addEventListener would stack a handler per change.
    this.container.onclick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      const orbitalBtn = target.closest<HTMLElement>('#btn-quick-3d, #btn-view-orbital, #orbital-preview');
      if (orbitalBtn) {
        e.stopPropagation();
        if (this.selectedElement) {
          this.closeFullInspector();
          this.onSelectElementOrbital(this.selectedElement);
        }
        return;
      }

      const detailsBtn = target.closest<HTMLElement>('#btn-quick-details, #quick-inspector-trigger');
      if (detailsBtn) {
        e.stopPropagation();
        this.openFullInspector();
        return;
      }

      const closeBtn = target.closest<HTMLElement>('#btn-close-inspector, #periodic-drawer-backdrop');
      if (closeBtn) {
        this.closeFullInspector();
      }
    };

    ExplanationModal.attachInfoButtons(this.container);
  }

  private getElementFromEvent(e: Event): { cell: HTMLElement; el: ElementData; z: number } | null {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('.element-cell:not(.placeholder-cell)');
    const zStr = cell?.dataset.z;
    if (!cell || !zStr) return null;
    const z = Number.parseInt(zStr, 10);
    const el = this.elements.find((item) => item.Z === z);
    if (!el) return null;
    return { cell, el, z };
  }

  private handleGridKeydown(e: KeyboardEvent, grid: HTMLElement): void {
    const data = this.getElementFromEvent(e);
    if (!data) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.handleCellActivation(e.key, data.el);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      this.handleCellArrowNavigation(e.key, data.cell, data.z, grid);
    }
  }

  private handleCellActivation(key: string, el: ElementData): void {
    if (this.selectedElement?.Z === el.Z && key === 'Enter') {
      this.closeFullInspector();
      this.onSelectElementOrbital(el);
    } else {
      this.selectElement(el);
    }
  }

  private handleCellArrowNavigation(key: string, target: HTMLElement, currentZ: number, grid: HTMLElement): void {
    const cells = Array.from(grid.querySelectorAll<HTMLElement>('.element-cell:not(.placeholder-cell)'));
    const nextCell = this.findNextCell(key, target, currentZ, cells);

    if (nextCell) {
      target.tabIndex = -1;
      nextCell.tabIndex = 0;
      nextCell.focus();
      const nextZ = Number.parseInt(nextCell.dataset.z!, 10);
      const nextEl = this.elements.find((item) => item.Z === nextZ);
      if (nextEl) {
        this.selectElement(nextEl);
      }
    }
  }

  private findNextCell(
    key: string,
    target: HTMLElement,
    currentZ: number,
    cells: HTMLElement[]
  ): HTMLElement | undefined {
    const currentRow = Number.parseInt(target.dataset.row!, 10);
    const currentCol = Number.parseInt(target.dataset.col!, 10);

    switch (key) {
      case 'ArrowRight':
        return this.findCellRight(cells, currentRow, currentCol, currentZ);
      case 'ArrowLeft':
        return this.findCellLeft(cells, currentRow, currentCol, currentZ);
      case 'ArrowDown':
        return this.findCellDown(cells, currentRow, currentCol);
      case 'ArrowUp':
        return this.findCellUp(cells, currentRow, currentCol);
      default:
        return undefined;
    }
  }

  private findCellRight(cells: HTMLElement[], currentRow: number, currentCol: number, currentZ: number): HTMLElement | undefined {
    const nextInRow = cells
      .filter((c) => Number.parseInt(c.dataset.row!, 10) === currentRow && Number.parseInt(c.dataset.col!, 10) > currentCol)
      .sort((a, b) => Number.parseInt(a.dataset.col!, 10) - Number.parseInt(b.dataset.col!, 10))[0];

    if (nextInRow) {
      return nextInRow;
    }
    return cells.find((c) => Number.parseInt(c.dataset.z!, 10) === currentZ + 1);
  }

  private findCellLeft(cells: HTMLElement[], currentRow: number, currentCol: number, currentZ: number): HTMLElement | undefined {
    const nextInRow = cells
      .filter((c) => Number.parseInt(c.dataset.row!, 10) === currentRow && Number.parseInt(c.dataset.col!, 10) < currentCol)
      .sort((a, b) => Number.parseInt(b.dataset.col!, 10) - Number.parseInt(a.dataset.col!, 10))[0];

    if (nextInRow) {
      return nextInRow;
    }
    return cells.find((c) => Number.parseInt(c.dataset.z!, 10) === currentZ - 1);
  }

  private findCellDown(cells: HTMLElement[], currentRow: number, currentCol: number): HTMLElement | undefined {
    return cells
      .filter((c) => Number.parseInt(c.dataset.col!, 10) === currentCol && Number.parseInt(c.dataset.row!, 10) > currentRow)
      .sort((a, b) => Number.parseInt(a.dataset.row!, 10) - Number.parseInt(b.dataset.row!, 10))[0];
  }

  private findCellUp(cells: HTMLElement[], currentRow: number, currentCol: number): HTMLElement | undefined {
    return cells
      .filter((c) => Number.parseInt(c.dataset.col!, 10) === currentCol && Number.parseInt(c.dataset.row!, 10) < currentRow)
      .sort((a, b) => Number.parseInt(b.dataset.row!, 10) - Number.parseInt(a.dataset.row!, 10))[0];
  }
}
