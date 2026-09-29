import moleculesData from '../../assets/data/molecules.json';
import elementsData from '../../assets/data/elements.json';
import { MoleculeRenderer, MoleculeData as BaseMoleculeData } from '../render/molecule-renderer';
import { getStrings, getLanguage, onLanguageChange } from '../i18n';
import { ElementData } from './periodic-table';
import { ExplanationModal } from './info-modal';
import { escapeHtml } from './modal-utils';
import { icon } from './icons';

export interface LocalizedMoleculeData extends BaseMoleculeData {
  name_es: string;
  name_en: string;
  geometry_es: string;
  geometry_en: string;
  description_es: string;
  description_en: string;
}

export class MoleculeView {
  private readonly container: HTMLElement;
  private readonly renderer: MoleculeRenderer;
  private readonly molecules: LocalizedMoleculeData[] = moleculesData as LocalizedMoleculeData[];
  private currentMolecule: LocalizedMoleculeData = this.molecules[1]; // H2O default
  private showLobes: boolean = true;
  private showAngles: boolean = true;
  private isCollapsed: boolean = false;

  constructor(container: HTMLElement, renderer: MoleculeRenderer) {
    this.container = container;
    this.renderer = renderer;
    this.renderer.onLobeClick = (type) => {
      const strings = getStrings();
      const expl = type === 'bonding' ? strings.explainBondingLobe : strings.explainLonePairLobe;
      ExplanationModal.show(expl);
    };
    this.renderer.onAtomClick = (symbol) => {
      const element = (elementsData as ElementData[]).find((e) => e.symbol === symbol);
      let elementName = symbol;
      if (element) {
        elementName = getLanguage() === 'es' ? element.name_es : element.name_en;
      }
      const strings = getStrings();
      const title = `${strings.atomClickTitle}: ${elementName} (${symbol})`;
      ExplanationModal.showSimple(title, strings.atomClickSummary, strings.atomClickDetail);
    };
    this.render();
    onLanguageChange(() => this.render());
  }

  public getSelectedMolecule(): LocalizedMoleculeData {
    return this.currentMolecule;
  }

  private getMoleculeName(m: LocalizedMoleculeData): string {
    return getLanguage() === 'es' ? m.name_es : m.name_en;
  }

  private getMoleculeGeometry(m: LocalizedMoleculeData): string {
    return getLanguage() === 'es' ? m.geometry_es : m.geometry_en;
  }

  private getMoleculeDescription(m: LocalizedMoleculeData): string {
    return getLanguage() === 'es' ? m.description_es : m.description_en;
  }

  private render(): void {
    const strings = getStrings();
    this.renderer.loadMolecule(this.currentMolecule);

    this.container.innerHTML = `
      <div class="mobile-drawer-backdrop" id="molecule-drawer-backdrop"></div>

      <div class="mobile-floating-actions">
        <button type="button" class="mobile-float-btn" id="btn-show-molecule" title="${escapeHtml(strings.moleculesVseprTitle)}" aria-label="${escapeHtml(strings.moleculesVseprTitle)}" aria-expanded="false" aria-controls="molecule-panel">
          <span class="btn-icon">${icon('molecule')}</span>
          <span class="btn-label">${escapeHtml(strings.moleculesVseprTitle)}</span>
        </button>
      </div>

      <!-- Dock Handle / Expand Pill when Left Panel is Collapsed on Desktop -->
      <button type="button" class="dock-tab-pill dock-left-pill ${this.isCollapsed ? 'visible' : ''}" id="btn-expand-molecule" title="${escapeHtml(strings.expandPanel)}" aria-label="${escapeHtml(strings.expandPanel)}" aria-expanded="${!this.isCollapsed}" aria-controls="molecule-panel">
        ${icon('molecule')}
        <span>${escapeHtml(strings.moleculesVseprTitle)}</span>
        ${icon('chevron-right', 'pill-chevron')}
      </button>

      <div class="molecule-overlay-panel ${this.isCollapsed ? 'collapsed' : ''}" id="molecule-panel">
        <div class="mobile-drawer-handle"></div>
        <div class="panel-header">
          <div class="panel-title-group">
            <span class="panel-header-icon">${icon('molecule')}</span>
            <h3>${escapeHtml(strings.moleculesVseprTitle)}</h3>
          </div>
          <div class="panel-header-actions">
            <button type="button" class="panel-icon-btn panel-collapse-btn desktop-only" id="btn-collapse-molecule" title="${escapeHtml(strings.collapsePanel)}" aria-label="${escapeHtml(strings.collapsePanel)}" aria-expanded="${!this.isCollapsed}" aria-controls="molecule-panel">
              ${icon('chevron-left')}
            </button>
            <button type="button" class="panel-close-btn mobile-only" id="btn-close-molecule" aria-label="${escapeHtml(strings.infoModalClose)}">${icon('close')}</button>
          </div>
        </div>

        <div class="molecule-gallery-section">
          <div class="molecule-gallery-header">
            <span class="gallery-title">${escapeHtml(strings.moleculeGallery)}</span>
            <span class="gallery-count">${this.molecules.length}</span>
          </div>
          <div class="molecule-gallery" role="listbox" aria-label="${escapeHtml(strings.moleculeGallery)}">
            ${this.molecules
              .map((m) => {
                const isActive = m.id === this.currentMolecule.id;
                return `
                  <div
                    class="molecule-card ${isActive ? 'active' : ''}"
                    data-molecule-id="${escapeHtml(m.id)}"
                    role="option"
                    aria-selected="${isActive}"
                    tabindex="${isActive ? '0' : '-1'}"
                  >
                    <div class="card-header-row">
                      <span class="card-formula-badge">${escapeHtml(m.formula)}</span>
                      <span class="card-hybrid-pill">${escapeHtml(m.hybridization)}</span>
                    </div>
                    <div class="card-body-content">
                      <div class="card-molecule-name">${escapeHtml(this.getMoleculeName(m))}</div>
                      <div class="card-vsepr-geom">
                        <span class="geom-pill">${escapeHtml(this.getMoleculeGeometry(m))}</span>
                      </div>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>

        <div class="molecule-view-actions">
          <button type="button" class="btn-action-toggle ${this.showAngles ? 'active' : ''}" id="btn-toggle-angles" aria-pressed="${this.showAngles}" title="${escapeHtml(this.showAngles ? strings.hideAngles : strings.showAngles)}">
            ${icon('angle')}
            <span>${escapeHtml(this.showAngles ? strings.hideAngles : strings.showAngles)}</span>
          </button>
          <button type="button" class="btn-action-toggle ${this.showLobes ? 'active' : ''}" id="btn-toggle-lobes" aria-pressed="${this.showLobes}" title="${escapeHtml(this.showLobes ? strings.hideLobes : strings.showLobes)}">
            ${this.showLobes ? icon('eye-off') : icon('eye')}
            <span>${escapeHtml(this.showLobes ? strings.hideLobes : strings.showLobes)}</span>
          </button>
        </div>

        <div class="molecule-info-card" id="molecule-info">
          ${this.renderMoleculeInfo()}
        </div>

        <div class="vsepr-guide-card">
          <div class="vsepr-guide-header">
            <h4>${escapeHtml(strings.vseprGuideTitle)}</h4>
            <button type="button" class="btn-info-icon" data-explain="explainVsepr" aria-label="Info">${icon('info')}</button>
          </div>
          <p>${escapeHtml(strings.vseprGuideText)}</p>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  private renderMoleculeInfo(): string {
    const strings = getStrings();
    const m = this.currentMolecule;
    const name = this.getMoleculeName(m);
    const geometry = this.getMoleculeGeometry(m);
    const description = this.getMoleculeDescription(m);

    return `
      <div class="mol-header">
        <span class="mol-formula">${escapeHtml(m.formula)}</span>
        <h2 class="mol-name">${escapeHtml(name)}</h2>
      </div>
      <div class="mol-details">
        ${this.infoDetailRow(strings.vseprGeometry, 'explainVsepr', escapeHtml(geometry))}
        ${this.infoDetailRow(strings.hybridization, 'explainHybridization', `<code>${escapeHtml(m.hybridization)}</code>`)}
        ${this.infoDetailRow(strings.bondAngle, 'explainBondAngle', escapeHtml(String(m.bond_angle)), 'highlight-angle')}
      </div>
      <p class="mol-description">${escapeHtml(description)}</p>
    `;
  }

  private infoDetailRow(label: string, explainKey: string, valueHtml: string, valueClass = ''): string {
    return `
      <div class="detail-row">
        <span class="detail-row-label">
          ${escapeHtml(label)}
          <button type="button" class="btn-info-icon" data-explain="${explainKey}" aria-label="Info">${icon('info')}</button>
        </span>
        <strong class="${valueClass}">${valueHtml}</strong>
      </div>
    `;
  }

  private toggleDrawer(): void {
    const molPanel = this.container.querySelector('.molecule-overlay-panel') as HTMLElement;

    if (molPanel.classList.contains('mobile-open')) {
      this.closeDrawer();
    } else {
      const backdrop = this.container.querySelector('#molecule-drawer-backdrop') as HTMLElement;
      const btnShowMol = this.container.querySelector('#btn-show-molecule') as HTMLElement;
      molPanel.classList.add('mobile-open');
      molPanel.removeAttribute('aria-hidden');
      backdrop.classList.add('active');
      btnShowMol.classList.add('active');
      btnShowMol.setAttribute('aria-expanded', 'true');
      this.container.querySelector<HTMLElement>('#btn-close-molecule')?.focus();
    }
  }

  private closeDrawer(): void {
    const molPanel = this.container.querySelector('.molecule-overlay-panel') as HTMLElement;
    const backdrop = this.container.querySelector('#molecule-drawer-backdrop') as HTMLElement;
    const btnShowMol = this.container.querySelector('#btn-show-molecule') as HTMLElement;

    molPanel.classList.remove('mobile-open');
    backdrop.classList.remove('active');
    btnShowMol.classList.remove('active');
    btnShowMol.setAttribute('aria-expanded', 'false');
  }

  private selectMolecule(id: string): void {
    const selected = this.molecules.find((m) => m.id === id);
    if (!selected || selected.id === this.currentMolecule.id) return;

    this.currentMolecule = selected;
    this.renderer.loadMolecule(this.currentMolecule);

    const cards = this.container.querySelectorAll<HTMLElement>('.molecule-card');
    cards.forEach((card) => {
      const isMatch = card.dataset.moleculeId === id;
      card.classList.toggle('active', isMatch);
      card.setAttribute('aria-selected', isMatch ? 'true' : 'false');
      card.tabIndex = isMatch ? 0 : -1;
    });

    const infoCard = this.container.querySelector('#molecule-info') as HTMLElement;
    if (infoCard) {
      infoCard.innerHTML = this.renderMoleculeInfo();
      ExplanationModal.attachInfoButtons(infoCard);
    }
  }

  private attachEventListeners(): void {
    const backdrop = this.container.querySelector('#molecule-drawer-backdrop') as HTMLElement;
    const btnShowMol = this.container.querySelector('#btn-show-molecule') as HTMLElement;
    const btnCloseMol = this.container.querySelector('#btn-close-molecule') as HTMLElement;
    const btnCollapse = this.container.querySelector('#btn-collapse-molecule') as HTMLElement;
    const btnExpand = this.container.querySelector('#btn-expand-molecule') as HTMLElement;
    const molPanel = this.container.querySelector('.molecule-overlay-panel') as HTMLElement;
    const btnToggleAngles = this.container.querySelector('#btn-toggle-angles') as HTMLButtonElement;
    const btnToggleLobes = this.container.querySelector('#btn-toggle-lobes') as HTMLButtonElement;

    btnShowMol.addEventListener('click', () => this.toggleDrawer());
    if (btnCloseMol) btnCloseMol.addEventListener('click', () => this.closeDrawer());
    backdrop.addEventListener('click', () => this.closeDrawer());

    if (btnCollapse) {
      btnCollapse.addEventListener('click', () => {
        this.isCollapsed = true;
        molPanel.classList.add('collapsed');
        if (btnExpand) btnExpand.classList.add('visible');
      });
    }

    if (btnExpand) {
      btnExpand.addEventListener('click', () => {
        this.isCollapsed = false;
        molPanel.classList.remove('collapsed');
        btnExpand.classList.remove('visible');
      });
    }

    const gallery = this.container.querySelector<HTMLElement>('.molecule-gallery');
    const cards = Array.from(this.container.querySelectorAll<HTMLElement>('.molecule-card'));

    cards.forEach((card, index) => {
      const molId = card.dataset.moleculeId;
      if (!molId) return;

      card.addEventListener('click', () => this.selectMolecule(molId));
      card.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.selectMolecule(molId);
          return;
        }
        // Roving focus across the gallery grid.
        const cols = gallery
          ? getComputedStyle(gallery).gridTemplateColumns.split(' ').filter(Boolean).length || 1
          : 1;
        let nextIndex = -1;
        if (e.key === 'ArrowRight') nextIndex = index + 1;
        else if (e.key === 'ArrowLeft') nextIndex = index - 1;
        else if (e.key === 'ArrowDown') nextIndex = index + cols;
        else if (e.key === 'ArrowUp') nextIndex = index - cols;
        if (nextIndex < 0 || nextIndex >= cards.length) return;

        e.preventDefault();
        const next = cards[nextIndex];
        this.selectMolecule(next.dataset.moleculeId!);
        next.focus();
      });
    });

    if (gallery) {
      gallery.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key !== 'Home' && e.key !== 'End') return;
        e.preventDefault();
        const target = e.key === 'Home' ? cards[0] : cards.at(-1);
        if (!target) return;
        this.selectMolecule(target.dataset.moleculeId!);
        target.focus();
      });
    }

    btnToggleAngles.addEventListener('click', () => {
      const strings = getStrings();
      this.showAngles = this.renderer.toggleAngles();
      const label = this.showAngles ? strings.hideAngles : strings.showAngles;
      btnToggleAngles.classList.toggle('active', this.showAngles);
      btnToggleAngles.setAttribute('aria-pressed', String(this.showAngles));
      btnToggleAngles.innerHTML = `${icon('angle')} <span>${escapeHtml(label)}</span>`;
      btnToggleAngles.title = label;
    });

    btnToggleLobes.addEventListener('click', () => {
      const strings = getStrings();
      this.showLobes = this.renderer.toggleLobes();
      const label = this.showLobes ? strings.hideLobes : strings.showLobes;
      btnToggleLobes.classList.toggle('active', this.showLobes);
      btnToggleLobes.setAttribute('aria-pressed', String(this.showLobes));
      btnToggleLobes.innerHTML = `${this.showLobes ? icon('eye-off') : icon('eye')} <span>${escapeHtml(label)}</span>`;
      btnToggleLobes.title = label;
    });

    ExplanationModal.attachInfoButtons(this.container);
  }
}
