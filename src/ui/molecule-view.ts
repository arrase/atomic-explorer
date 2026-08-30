import moleculesData from '../../assets/data/molecules.json';
import elementsData from '../../assets/data/elements.json';
import { MoleculeRenderer, MoleculeData as BaseMoleculeData } from '../render/molecule-renderer';
import { getStrings, getLanguage, onLanguageChange, I18nStrings, ConceptExplanation } from '../i18n';
import { ElementData } from './periodic-table';
import { ExplanationModal } from './info-modal';
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
  private container: HTMLElement;
  private renderer: MoleculeRenderer;
  private molecules: LocalizedMoleculeData[] = moleculesData as LocalizedMoleculeData[];
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
      const elementName = element ? (getLanguage() === 'es' ? element.name_es : element.name_en) : symbol;
      const strings = getStrings();
      const title = `${strings.atomClickTitle}: ${elementName} (${symbol})`;
      ExplanationModal.showSimple(title, strings.atomClickSummary, strings.atomClickDetail);
    };
    this.render();
    onLanguageChange(() => this.render());
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
        <button class="mobile-float-btn" id="btn-show-molecule" title="${strings.moleculesVseprTitle}">
          <span class="btn-icon">${icon('molecule')}</span>
          <span class="btn-label">${strings.moleculesVseprTitle}</span>
        </button>
      </div>

      <!-- Dock Handle / Expand Pill when Left Panel is Collapsed on Desktop -->
      <button class="dock-tab-pill dock-left-pill ${this.isCollapsed ? 'visible' : ''}" id="btn-expand-molecule" title="${strings.expandPanel}">
        ${icon('molecule')}
        <span>${strings.moleculesVseprTitle}</span>
        ${icon('chevron-right', 'pill-chevron')}
      </button>

      <div class="molecule-overlay-panel ${this.isCollapsed ? 'collapsed' : ''}">
        <div class="mobile-drawer-handle"></div>
        <div class="panel-header">
          <div class="panel-title-group">
            <span class="panel-header-icon">${icon('molecule')}</span>
            <h3>${strings.moleculesVseprTitle}</h3>
          </div>
          <div class="panel-header-actions">
            <button class="panel-icon-btn panel-collapse-btn desktop-only" id="btn-collapse-molecule" title="${strings.collapsePanel}" aria-label="${strings.collapsePanel}">
              ${icon('chevron-left')}
            </button>
            <button class="panel-close-btn mobile-only" id="btn-close-molecule" aria-label="Close">${icon('close')}</button>
          </div>
        </div>

        <div class="molecule-gallery-section">
          <div class="molecule-gallery-header">
            <span class="gallery-title">${strings.moleculeGallery}</span>
            <span class="gallery-count">${this.molecules.length}</span>
          </div>
          <div class="molecule-gallery" role="listbox" aria-label="${strings.moleculeGallery}">
            ${this.molecules
              .map((m) => {
                const isActive = m.id === this.currentMolecule.id;
                return `
                  <div
                    class="molecule-card ${isActive ? 'active' : ''}"
                    data-molecule-id="${m.id}"
                    role="option"
                    aria-selected="${isActive}"
                    tabindex="0"
                  >
                    <div class="card-header-row">
                      <span class="card-formula-badge">${m.formula}</span>
                      <span class="card-hybrid-pill">${m.hybridization}</span>
                    </div>
                    <div class="card-body-content">
                      <div class="card-molecule-name">${this.getMoleculeName(m)}</div>
                      <div class="card-vsepr-geom">
                        <span class="geom-pill">${this.getMoleculeGeometry(m)}</span>
                      </div>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>

        <div class="molecule-view-actions">
          <button class="btn-secondary btn-action-toggle ${this.showAngles ? 'active' : ''}" id="btn-toggle-angles" title="${this.showAngles ? strings.hideAngles : strings.showAngles}">
            ${icon('angle')}
            <span>${this.showAngles ? strings.hideAngles : strings.showAngles}</span>
          </button>
          <button class="btn-secondary btn-action-toggle ${this.showLobes ? 'active' : ''}" id="btn-toggle-lobes" title="${this.showLobes ? strings.hideLobes : strings.showLobes}">
            ${this.showLobes ? icon('eye-off') : icon('eye')}
            <span>${this.showLobes ? strings.hideLobes : strings.showLobes}</span>
          </button>
        </div>

        <div class="molecule-info-card" id="molecule-info">
          ${this.renderMoleculeInfo()}
        </div>

        <div class="vsepr-guide-card">
          <div class="vsepr-guide-header">
            <h4>${strings.vseprGuideTitle}</h4>
            <button class="btn-info-icon" data-explain="explainVsepr" aria-label="Info">${icon('info')}</button>
          </div>
          <p>${strings.vseprGuideText}</p>
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
        <span class="mol-formula">${m.formula}</span>
        <h2 class="mol-name">${name}</h2>
      </div>
      <div class="mol-details">
        <div class="detail-row">
          <span>${strings.vseprGeometry} <button class="btn-info-icon" data-explain="explainVsepr" aria-label="Info">${icon('info')}</button>:</span>
          <strong>${geometry}</strong>
        </div>
        <div class="detail-row">
          <span>${strings.hybridization} <button class="btn-info-icon" data-explain="explainHybridization" aria-label="Info">${icon('info')}</button>:</span>
          <strong><code>${m.hybridization}</code></strong>
        </div>
        <div class="detail-row">
          <span>${strings.bondAngle} <button class="btn-info-icon" data-explain="explainBondAngle" aria-label="Info">${icon('info')}</button>:</span>
          <strong class="highlight-angle">${m.bond_angle}</strong>
        </div>
      </div>
      <p class="mol-description">${description}</p>
    `;
  }

  private toggleDrawer(): void {
    const molPanel = this.container.querySelector('.molecule-overlay-panel') as HTMLElement;
    const backdrop = this.container.querySelector('#molecule-drawer-backdrop') as HTMLElement;
    const btnShowMol = this.container.querySelector('#btn-show-molecule') as HTMLElement;

    const isOpen = molPanel.classList.contains('mobile-open');
    if (isOpen) {
      this.closeDrawer();
    } else {
      molPanel.classList.add('mobile-open');
      backdrop.classList.add('active');
      btnShowMol.classList.add('active');
    }
  }

  private closeDrawer(): void {
    const molPanel = this.container.querySelector('.molecule-overlay-panel') as HTMLElement;
    const backdrop = this.container.querySelector('#molecule-drawer-backdrop') as HTMLElement;
    const btnShowMol = this.container.querySelector('#btn-show-molecule') as HTMLElement;

    molPanel.classList.remove('mobile-open');
    backdrop.classList.remove('active');
    btnShowMol.classList.remove('active');
  }

  private selectMolecule(id: string): void {
    const selected = this.molecules.find((m) => m.id === id);
    if (!selected || selected.id === this.currentMolecule.id) return;

    this.currentMolecule = selected;
    this.renderer.loadMolecule(this.currentMolecule);

    const cards = this.container.querySelectorAll('.molecule-card');
    cards.forEach((card) => {
      const cardEl = card as HTMLElement;
      const isMatch = cardEl.dataset.moleculeId === id;
      cardEl.classList.toggle('active', isMatch);
      cardEl.setAttribute('aria-selected', isMatch ? 'true' : 'false');
    });

    const infoCard = this.container.querySelector('#molecule-info') as HTMLElement;
    if (infoCard) {
      infoCard.innerHTML = this.renderMoleculeInfo();
      this.attachInfoButtonEvents(infoCard);
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

    const cards = this.container.querySelectorAll('.molecule-card');
    cards.forEach((card) => {
      const cardEl = card as HTMLElement;
      const molId = cardEl.dataset.moleculeId;
      if (molId) {
        cardEl.addEventListener('click', () => this.selectMolecule(molId));
        cardEl.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.selectMolecule(molId);
          }
        });
      }
    });

    btnToggleAngles.addEventListener('click', () => {
      const strings = getStrings();
      this.showAngles = this.renderer.toggleAngles();
      btnToggleAngles.classList.toggle('active', this.showAngles);
      btnToggleAngles.innerHTML = `${icon('angle')} <span>${this.showAngles ? strings.hideAngles : strings.showAngles}</span>`;
      btnToggleAngles.title = this.showAngles ? strings.hideAngles : strings.showAngles;
    });

    btnToggleLobes.addEventListener('click', () => {
      const strings = getStrings();
      this.showLobes = this.renderer.toggleLobes();
      btnToggleLobes.classList.toggle('active', this.showLobes);
      btnToggleLobes.innerHTML = `${this.showLobes ? icon('eye-off') : icon('eye')} <span>${this.showLobes ? strings.hideLobes : strings.showLobes}</span>`;
      btnToggleLobes.title = this.showLobes ? strings.hideLobes : strings.showLobes;
    });

    this.attachInfoButtonEvents(this.container);
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


