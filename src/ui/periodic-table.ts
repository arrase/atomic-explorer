import elementsData from '../../assets/data/elements.json';
import { getStrings, getLanguage, onLanguageChange, I18nStrings, ConceptExplanation } from '../i18n';
import { ExplanationModal } from './info-modal';
import { icon } from './icons';

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

export class PeriodicTableView {
  private container: HTMLElement;
  private elements: ElementData[] = elementsData as ElementData[];
  private selectedElement: ElementData | null = null;
  private currentColorScheme: 'category' | 'electronegativity' | 'radius' = 'category';
  private selectedBlock: ChemicalBlock = 'all';
  private onSelectElementOrbital: (element: ElementData) => void;

  constructor(container: HTMLElement, onSelectElementOrbital: (element: ElementData) => void) {
    this.container = container;
    this.onSelectElementOrbital = onSelectElementOrbital;
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
          <div class="periodic-grid" id="periodic-grid">
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
            <button class="panel-close-btn" id="btn-close-inspector" aria-label="Close">${icon('close')}</button>
          </div>
          ${this.renderInspectorContent()}
        </div>
      </div>
    `;

    this.attachEventListeners();
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
            <div class="legend-gradient-track en-gradient"></div>
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
            <span class="legend-val-min">30 pm (He)</span>
            <div class="legend-gradient-track radius-gradient"></div>
            <span class="legend-val-max">260 pm (Cs)</span>
          </div>
        </div>
      `;
    } else {
      return `
        <div class="periodic-legend-bar category-legend-bar">
          <div class="category-chips">
            <span class="cat-chip" style="--chip-color: rgba(40, 160, 220, 0.8)">${strings.catNonMetal}</span>
            <span class="cat-chip" style="--chip-color: rgba(160, 60, 220, 0.8)">${strings.catNobleGas}</span>
            <span class="cat-chip" style="--chip-color: rgba(240, 90, 90, 0.8)">${strings.catAlkaliMetal}</span>
            <span class="cat-chip" style="--chip-color: rgba(240, 160, 60, 0.8)">${strings.catAlkalineEarth}</span>
            <span class="cat-chip" style="--chip-color: rgba(40, 180, 140, 0.8)">${strings.catMetalloid}</span>
            <span class="cat-chip" style="--chip-color: rgba(200, 200, 40, 0.8)">${strings.catHalogen}</span>
            <span class="cat-chip" style="--chip-color: rgba(120, 140, 220, 0.8)">${strings.catTransitionMetal}</span>
            <span class="cat-chip" style="--chip-color: rgba(100, 180, 240, 0.8)">${strings.catPostTransitionMetal}</span>
            <span class="cat-chip" style="--chip-color: rgba(220, 140, 180, 0.8)">${strings.catLanthanide}</span>
            <span class="cat-chip" style="--chip-color: rgba(200, 100, 160, 0.8)">${strings.catActinide}</span>
          </div>
        </div>
      `;
    }
  }

  private renderGridCells(filterText: string = ''): string {
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

        return `
          <div class="element-cell ${isDimmed ? 'dimmed' : ''} ${this.selectedElement?.Z === el.Z ? 'selected' : ''}"
               data-z="${el.Z}"
               data-block="${block}"
               style="grid-column: ${gridPos.col}; grid-row: ${gridPos.row}; background-color: ${color};">
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
    if (z === 1) return { row: 2, col: 2 };
    if (z === 2) return { row: 2, col: 19 };

    if (z >= 3 && z <= 4) return { row: 3, col: z - 1 };
    if (z >= 5 && z <= 10) return { row: 3, col: z + 9 };

    if (z >= 11 && z <= 12) return { row: 4, col: z - 9 };
    if (z >= 13 && z <= 18) return { row: 4, col: z + 1 };

    if (z >= 19 && z <= 36) return { row: 5, col: z - 17 };
    if (z >= 37 && z <= 54) return { row: 6, col: z - 35 };

    if (z === 55 || z === 56) return { row: 7, col: z - 53 };
    if (z >= 57 && z <= 71) return { row: 10, col: z - 53 }; // Lanthanides: 57 -> Col 4, 71 -> Col 18
    if (z >= 72 && z <= 86) return { row: 7, col: z - 67 };

    if (z === 87 || z === 88) return { row: 8, col: z - 85 };
    if (z >= 89 && z <= 103) return { row: 11, col: z - 85 }; // Actinides: 89 -> Col 4, 103 -> Col 18
    if (z >= 104 && z <= 118) return { row: 8, col: z - 99 };

    return { row: 2, col: 2 };
  }

  private getElementColor(el: ElementData): string {
    if (this.currentColorScheme === 'category') {
      const categoryColors: Record<string, string> = {
        'no metal': 'rgba(40, 160, 220, 0.7)',
        'gas noble': 'rgba(160, 60, 220, 0.7)',
        'metal alcalino': 'rgba(240, 90, 90, 0.7)',
        'alcalinotérreo': 'rgba(240, 160, 60, 0.7)',
        'metaloide': 'rgba(40, 180, 140, 0.7)',
        'halógeno': 'rgba(200, 200, 40, 0.7)',
        'metal de transición': 'rgba(120, 140, 220, 0.7)',
        'metal del bloque p': 'rgba(100, 180, 240, 0.7)',
        'lantánido': 'rgba(220, 140, 180, 0.7)',
        'actínido': 'rgba(200, 100, 160, 0.7)',
      };
      return categoryColors[el.category] || 'rgba(100, 100, 120, 0.7)';
    } else if (this.currentColorScheme === 'electronegativity') {
      if (el.electronegativity === null) return 'rgba(60, 60, 70, 0.6)';
      const t = Math.min(1, Math.max(0, (el.electronegativity - 0.7) / (4.0 - 0.7)));
      const r = Math.round(t * 255);
      const b = Math.round((1 - t) * 255);
      return `rgba(${r}, 100, ${b}, 0.75)`;
    } else {
      const t = Math.min(1, Math.max(0, (el.radius_pm - 30) / (260 - 30)));
      const g = Math.round(t * 220);
      const b = Math.round((1 - t) * 240);
      return `rgba(50, ${g}, ${b}, 0.75)`;
    }
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
            <span class="insp-z">Z = ${el.Z}${strings.explainAtomicNumber ? ` <button class="btn-info-icon" data-explain="explainAtomicNumber" aria-label="Info">${icon('info')}</button>` : ''}</span>
            <h2 class="insp-symbol">${el.symbol}</h2>
            <span class="insp-name">${elementName}</span>
            <span class="insp-category">${categoryName}</span>
          </div>
          <button class="btn-primary btn-inspector-view-3d" id="btn-view-orbital">
            ${icon('atom')}
            <span>${strings.btnView3DOrbital}</span>
          </button>
        </div>

        <div class="inspector-details">
          <div class="detail-row">
            <span>${strings.atomicMass} <button class="btn-info-icon" data-explain="explainAtomicMass" aria-label="Info">${icon('info')}</button>:</span>
            <strong>${el.atomic_mass} u</strong>
          </div>
          <div class="detail-row">
            <span>${strings.electronConfig} <button class="btn-info-icon" data-explain="explainElectronConfig" aria-label="Info">${icon('info')}</button>:</span>
            <strong><code>${el.electron_config_str}</code></strong>
          </div>
          <div class="detail-row">
            <span>${strings.atomicRadius} <button class="btn-info-icon" data-explain="explainAtomicRadius" aria-label="Info">${icon('info')}</button>:</span>
            <strong>${el.radius_pm} pm</strong>
          </div>
          <div class="detail-row">
            <span>${strings.electronegativity} <button class="btn-info-icon" data-explain="explainElectronegativity" aria-label="Info">${icon('info')}</button>:</span>
            <strong>${el.electronegativity ?? 'N/A'}</strong>
          </div>
          <div class="detail-row">
            <span>${strings.ionizationEnergy} <button class="btn-info-icon" data-explain="explainIonizationEnergy" aria-label="Info">${icon('info')}</button>:</span>
            <strong>${el.ionization_energy ? `${el.ionization_energy} kJ/mol` : 'N/A'}</strong>
          </div>
          <div class="detail-row">
            <span>${strings.oxidationStates}:</span>
            <strong>${el.oxidation_states && el.oxidation_states.length > 0 ? el.oxidation_states.map(s => s > 0 ? `+${s}` : `${s}`).join(', ') : 'N/A'}</strong>
          </div>
          <div class="detail-row">
            <span>${strings.discovery}:</span>
            <strong>${discoveryStr}</strong>
          </div>
        </div>
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

  private attachEventListeners(): void {
    const colorSelect = this.container.querySelector('#color-scheme-select') as HTMLSelectElement;
    const searchInput = this.container.querySelector('#element-search') as HTMLInputElement;
    const grid = this.container.querySelector('#periodic-grid') as HTMLElement;
    const legendContainer = this.container.querySelector('#periodic-legend-container') as HTMLElement;
    const backdrop = this.container.querySelector('#periodic-drawer-backdrop') as HTMLElement;
    const btnCloseInspector = this.container.querySelector('#btn-close-inspector') as HTMLButtonElement;

    btnCloseInspector.addEventListener('click', () => this.closeFullInspector());
    backdrop.addEventListener('click', () => this.closeFullInspector());

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

    grid.addEventListener('click', (e) => {
      const cell = (e.target as HTMLElement).closest('.element-cell:not(.placeholder-cell)');
      if (!cell) return;
      const zStr = cell.getAttribute('data-z');
      if (!zStr) return;
      const z = parseInt(zStr, 10);
      this.selectedElement = this.elements.find((el) => el.Z === z)!;

      grid.querySelectorAll('.element-cell').forEach((c) => c.classList.remove('selected'));
      cell.classList.add('selected');

      const quickInspector = this.container.querySelector('#mobile-quick-inspector') as HTMLElement;
      quickInspector.innerHTML = this.renderQuickInspectorContent();

      const inspector = this.container.querySelector('#element-inspector') as HTMLElement;
      inspector.innerHTML = `
        <div class="mobile-drawer-handle"></div>
        <div class="panel-header-actions mobile-only-header">
          <button class="panel-close-btn" id="btn-close-inspector" aria-label="Close">${icon('close')}</button>
        </div>
        ${this.renderInspectorContent()}
      `;
      this.attachInfoButtonEvents(inspector);

      const closeBtn = inspector.querySelector('#btn-close-inspector') as HTMLButtonElement;
      closeBtn.addEventListener('click', () => this.closeFullInspector());

      this.attachQuickInspectorEvents();
    });

    this.attachQuickInspectorEvents();
    this.attachInfoButtonEvents(this.container);
  }

  private attachQuickInspectorEvents(): void {
    const quick3dBtn = this.container.querySelector('#btn-quick-3d') as HTMLElement;
    const quickDetailsBtn = this.container.querySelector('#btn-quick-details') as HTMLElement;
    const quickTrigger = this.container.querySelector('#quick-inspector-trigger') as HTMLElement;
    const inspector3dBtn = this.container.querySelector('#btn-view-orbital') as HTMLElement;

    if (quick3dBtn) {
      quick3dBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.selectedElement) {
          this.closeFullInspector();
          this.onSelectElementOrbital(this.selectedElement);
        }
      });
    }

    if (quickDetailsBtn) {
      quickDetailsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openFullInspector();
      });
    }

    if (quickTrigger) {
      quickTrigger.addEventListener('click', () => {
        this.openFullInspector();
      });
    }

    if (inspector3dBtn) {
      inspector3dBtn.addEventListener('click', () => {
        if (this.selectedElement) {
          this.closeFullInspector();
          this.onSelectElementOrbital(this.selectedElement);
        }
      });
    }
  }

  private attachInfoButtonEvents(parent: HTMLElement): void {
    const infoBtns = parent.querySelectorAll('.btn-info-icon');
    const strings = getStrings();
    infoBtns.forEach((btn) => {
      btn.addEventListener('click', (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        const explainKey = (btn as HTMLElement).dataset.explain as keyof I18nStrings;
        if (explainKey && strings[explainKey]) {
          const explanation = strings[explainKey] as ConceptExplanation;
          ExplanationModal.show(explanation);
        }
      });
    });
  }
}
