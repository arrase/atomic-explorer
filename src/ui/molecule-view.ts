import moleculesData from '../../assets/data/molecules.json';
import elementsData from '../../assets/data/elements.json';
import { MoleculeRenderer, MoleculeData as BaseMoleculeData } from '../render/molecule-renderer';
import {
  computeMolecularPolarity,
  MolecularPolarityResult,
  summarizeSigmaPiBonds,
} from '../core/molecular-polarity';
import { getStrings, getLanguage, onLanguageChange, I18nStrings } from '../i18n';
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

type ArrowDirection = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

function computeAxisGap(cur: DOMRect, cand: DOMRect, dir: ArrowDirection): number | null {
  const tol = 2;
  if (dir === 'ArrowRight' && cand.left >= cur.right - tol) return cand.left - cur.right;
  if (dir === 'ArrowLeft' && cand.right <= cur.left + tol) return cur.left - cand.right;
  if (dir === 'ArrowDown' && cand.top >= cur.bottom - tol) return cand.top - cur.bottom;
  if (dir === 'ArrowUp' && cand.bottom <= cur.top + tol) return cur.top - cand.bottom;
  return null;
}

function measureSpatialScore(cur: DOMRect, cand: DOMRect, dir: ArrowDirection): number | null {
  const rawGap = computeAxisGap(cur, cand, dir);
  if (rawGap === null) return null;

  const isHorizontal = dir === 'ArrowLeft' || dir === 'ArrowRight';
  const [curStart, curEnd, candStart, candEnd] = isHorizontal
    ? [cur.top, cur.bottom, cand.top, cand.bottom]
    : [cur.left, cur.right, cand.left, cand.right];

  const overlaps = Math.min(curEnd, candEnd) > Math.max(curStart, candStart) + 1;
  const perpOffset = Math.abs((curStart + curEnd - candStart - candEnd) * 0.5);
  const gap = Math.max(0, rawGap);

  return overlaps ? gap * 1000 + perpOffset : 1e6 + gap + 2.5 * perpOffset;
}

function findSpatialCandidate(
  current: HTMLElement,
  cards: readonly HTMLElement[],
  dir: ArrowDirection,
): HTMLElement | null {
  const curRect = current.getBoundingClientRect();
  let bestCard: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const cand of cards) {
    if (cand === current || !cand.checkVisibility()) continue;
    const score = measureSpatialScore(curRect, cand.getBoundingClientRect(), dir);
    if (score !== null && score < bestScore) {
      bestScore = score;
      bestCard = cand;
    }
  }

  return bestCard;
}

function isArrowDirection(key: string): key is ArrowDirection {
  return key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight';
}

export class MoleculeView {
  private readonly container: HTMLElement;
  private readonly renderer: MoleculeRenderer;
  private readonly molecules: LocalizedMoleculeData[] = moleculesData as LocalizedMoleculeData[];
  private currentMolecule: LocalizedMoleculeData = this.molecules[1]; // H2O default
  private showLobes: boolean = true;
  private showAngles: boolean = true;
  private showDipoles: boolean = false;
  private showPiBonds: boolean = true;
  private isCollapsed: boolean = false;

  public onStateChange?: () => void;

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
    this.renderer.onPiBondClick = () => ExplanationModal.show(getStrings().explainPiBond);
    this.renderer.onDipoleClick = () => ExplanationModal.show(getStrings().explainPolarity);

    this.render();
    onLanguageChange(() => this.render());
  }

  public getSelectedMolecule(): LocalizedMoleculeData {
    return this.currentMolecule;
  }

  public getCurrentMoleculeId(): string {
    return this.currentMolecule.id;
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

  private loadAndSyncRenderer(): void {
    this.renderer.loadMolecule(this.currentMolecule);
    this.renderer.toggleAngles(this.showAngles);
    this.renderer.toggleLobes(this.showLobes);
    this.renderer.toggleDipoles(this.showDipoles);
    this.renderer.togglePiBonds(this.showPiBonds);
  }

  private renderGalleryCards(): string {
    return this.molecules
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
      .join('');
  }

  private renderActionButtons(strings: I18nStrings): string {
    const anglesLabel = this.showAngles ? strings.hideAngles : strings.showAngles;
    const lobesLabel = this.showLobes ? strings.hideLobes : strings.showLobes;
    const dipolesLabel = this.showDipoles ? strings.hideDipoles : strings.showDipoles;
    const hasPi = summarizeSigmaPiBonds(this.currentMolecule.bonds).hasPiSystem;
    const piActive = hasPi && this.showPiBonds;
    const piLabel = piActive ? strings.hidePiBonds : strings.showPiBonds;

    return `
      <div class="molecule-view-actions">
        <button type="button" class="btn-action-toggle ${this.showAngles ? 'active' : ''}" id="btn-toggle-angles" aria-pressed="${this.showAngles}" title="${escapeHtml(anglesLabel)}">
          ${icon('angle')}
          <span>${escapeHtml(anglesLabel)}</span>
        </button>
        <button type="button" class="btn-action-toggle ${this.showLobes ? 'active' : ''}" id="btn-toggle-lobes" aria-pressed="${this.showLobes}" title="${escapeHtml(lobesLabel)}">
          ${this.showLobes ? icon('eye-off') : icon('eye')}
          <span>${escapeHtml(lobesLabel)}</span>
        </button>
        <button type="button" class="btn-action-toggle ${this.showDipoles ? 'active' : ''}" id="btn-toggle-dipoles" aria-pressed="${this.showDipoles}" title="${escapeHtml(dipolesLabel)}">
          ${icon('dipole')}
          <span>${escapeHtml(dipolesLabel)}</span>
        </button>
        <button type="button" class="btn-action-toggle ${piActive ? 'active' : ''}" id="btn-toggle-pi" aria-pressed="${piActive}" ${hasPi ? '' : 'disabled'} title="${escapeHtml(piLabel)}">
          ${icon('pi-bond')}
          <span>${escapeHtml(piLabel)}</span>
        </button>
      </div>
    `;
  }

  private render(): void {
    const strings = getStrings();
    this.loadAndSyncRenderer();

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
            ${this.renderGalleryCards()}
          </div>
        </div>

        ${this.renderActionButtons(strings)}

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

  private formatBondSummary(m: LocalizedMoleculeData, strings: I18nStrings): string {
    const bondSummary = summarizeSigmaPiBonds(m.bonds);
    if (bondSummary.isAromatic) {
      return `${bondSummary.sigmaCount}σ + ${escapeHtml(strings.aromaticPiSystem)}`;
    }
    if (bondSummary.piCount > 0) {
      return `${bondSummary.sigmaCount}σ + ${bondSummary.piCount}π`;
    }
    return `${bondSummary.sigmaCount}σ`;
  }

  private formatPolarityBadge(polarity: MolecularPolarityResult, strings: I18nStrings): string {
    if (polarity.isPolar) {
      return `<span class="polarity-badge is-polar">${escapeHtml(strings.polarityPolar)}</span>`;
    }
    if (polarity.cancelledBySymmetry) {
      return `<span class="polarity-badge is-nonpolar-symmetry">${escapeHtml(strings.polarityNonpolarSymmetry)}</span>`;
    }
    return `<span class="polarity-badge is-nonpolar">${escapeHtml(strings.polarityNonpolar)}</span>`;
  }

  private renderMoleculeInfo(): string {
    const strings = getStrings();
    const m = this.currentMolecule;
    const name = this.getMoleculeName(m);
    const geometry = this.getMoleculeGeometry(m);
    const description = this.getMoleculeDescription(m);
    const bondText = this.formatBondSummary(m, strings);
    const polarity = computeMolecularPolarity(m.atoms, m.bonds);
    const polarityBadgeHtml = this.formatPolarityBadge(polarity, strings);

    return `
      <div class="mol-header">
        <span class="mol-formula">${escapeHtml(m.formula)}</span>
        <h2 class="mol-name">${escapeHtml(name)}</h2>
      </div>
      <div class="mol-details">
        ${this.infoDetailRow(strings.vseprGeometry, 'explainVsepr', escapeHtml(geometry))}
        ${this.infoDetailRow(strings.hybridization, 'explainHybridization', `<code>${escapeHtml(m.hybridization)}</code>`)}
        ${this.infoDetailRow(strings.bondAngle, 'explainBondAngle', escapeHtml(String(m.bond_angle)), 'highlight-angle')}
        ${this.infoDetailRow(strings.sigmaPiBonds, 'explainPiBond', `<code>${bondText}</code>`, 'highlight-bonds')}
        ${this.infoDetailRow(strings.molecularPolarity, 'explainPolarity', polarityBadgeHtml)}
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

  private syncPiToggleButton(): void {
    const btnTogglePi = this.container.querySelector<HTMLButtonElement>('#btn-toggle-pi')!;
    const strings = getStrings();
    const hasPi = summarizeSigmaPiBonds(this.currentMolecule.bonds).hasPiSystem;
    const piActive = hasPi && this.showPiBonds;
    const label = piActive ? strings.hidePiBonds : strings.showPiBonds;

    btnTogglePi.disabled = !hasPi;
    btnTogglePi.classList.toggle('active', piActive);
    btnTogglePi.setAttribute('aria-pressed', String(piActive));
    btnTogglePi.innerHTML = `${icon('pi-bond')} <span>${escapeHtml(label)}</span>`;
    btnTogglePi.title = label;
  }

  public selectMolecule(id: string): void {
    const selected = this.molecules.find((m) => m.id === id);
    if (!selected || selected.id === this.currentMolecule.id) return;

    this.currentMolecule = selected;
    this.loadAndSyncRenderer();

    const cards = this.container.querySelectorAll<HTMLElement>('.molecule-card');
    cards.forEach((card) => {
      const isMatch = card.dataset.moleculeId === id;
      card.classList.toggle('active', isMatch);
      card.setAttribute('aria-selected', isMatch ? 'true' : 'false');
      card.tabIndex = isMatch ? 0 : -1;
    });

    const infoCard = this.container.querySelector<HTMLElement>('#molecule-info')!;
    infoCard.innerHTML = this.renderMoleculeInfo();
    ExplanationModal.attachInfoButtons(infoCard);

    this.syncPiToggleButton();
    this.onStateChange?.();
  }

  private attachEventListeners(): void {
    this.attachPanelListeners();
    this.attachGalleryListeners();
    this.attachToggleListeners();
    ExplanationModal.attachInfoButtons(this.container);
  }

  private attachPanelListeners(): void {
    const backdrop = this.container.querySelector<HTMLElement>('#molecule-drawer-backdrop')!;
    const btnShowMol = this.container.querySelector<HTMLElement>('#btn-show-molecule')!;
    const btnCloseMol = this.container.querySelector<HTMLElement>('#btn-close-molecule')!;
    const btnCollapse = this.container.querySelector<HTMLElement>('#btn-collapse-molecule')!;
    const btnExpand = this.container.querySelector<HTMLElement>('#btn-expand-molecule')!;
    const molPanel = this.container.querySelector<HTMLElement>('.molecule-overlay-panel')!;

    btnShowMol.addEventListener('click', () => this.toggleDrawer());
    btnCloseMol.addEventListener('click', () => this.closeDrawer());
    backdrop.addEventListener('click', () => this.closeDrawer());

    btnCollapse.addEventListener('click', () => {
      this.isCollapsed = true;
      molPanel.classList.add('collapsed');
      btnExpand.classList.add('visible');
      btnCollapse.setAttribute('aria-expanded', 'false');
      btnExpand.setAttribute('aria-expanded', 'false');
    });

    btnExpand.addEventListener('click', () => {
      this.isCollapsed = false;
      molPanel.classList.remove('collapsed');
      btnExpand.classList.remove('visible');
      btnExpand.setAttribute('aria-expanded', 'true');
      btnCollapse.setAttribute('aria-expanded', 'true');
    });
  }

  private attachGalleryListeners(): void {
    const cards = Array.from(this.container.querySelectorAll<HTMLElement>('.molecule-card'));

    for (const card of cards) {
      const molId = card.dataset.moleculeId!;
      card.addEventListener('click', () => this.selectMolecule(molId));
      card.addEventListener('keydown', (e: KeyboardEvent) => this.handleCardKeydown(e, card, cards));
    }
  }

  private focusAndSelectCard(e: KeyboardEvent, target: HTMLElement): void {
    e.preventDefault();
    this.selectMolecule(target.dataset.moleculeId!);
    target.focus();
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  private handleCardKeydown(e: KeyboardEvent, card: HTMLElement, cards: readonly HTMLElement[]): void {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.selectMolecule(card.dataset.moleculeId!);
      return;
    }

    if (e.shiftKey) return;

    if (e.key === 'Home' || e.key === 'End') {
      const target = e.key === 'Home' ? cards[0] : cards.at(-1);
      if (!target || target === card) return;
      this.focusAndSelectCard(e, target);
      return;
    }

    if (isArrowDirection(e.key)) {
      const next = findSpatialCandidate(card, cards, e.key);
      if (!next) return;
      this.focusAndSelectCard(e, next);
    }
  }

  private attachToggleListeners(): void {
    const btnToggleAngles = this.container.querySelector<HTMLButtonElement>('#btn-toggle-angles')!;
    const btnToggleLobes = this.container.querySelector<HTMLButtonElement>('#btn-toggle-lobes')!;
    const btnToggleDipoles = this.container.querySelector<HTMLButtonElement>('#btn-toggle-dipoles')!;
    const btnTogglePi = this.container.querySelector<HTMLButtonElement>('#btn-toggle-pi')!;

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

    btnToggleDipoles.addEventListener('click', () => {
      const strings = getStrings();
      this.showDipoles = this.renderer.toggleDipoles();
      const label = this.showDipoles ? strings.hideDipoles : strings.showDipoles;
      btnToggleDipoles.classList.toggle('active', this.showDipoles);
      btnToggleDipoles.setAttribute('aria-pressed', String(this.showDipoles));
      btnToggleDipoles.innerHTML = `${icon('dipole')} <span>${escapeHtml(label)}</span>`;
      btnToggleDipoles.title = label;
    });

    btnTogglePi.addEventListener('click', () => {
      if (btnTogglePi.disabled) return;
      this.showPiBonds = this.renderer.togglePiBonds();
      this.syncPiToggleButton();
    });
  }
}
