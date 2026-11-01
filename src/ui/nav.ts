import type { TabId } from '../core/url-state';
import { getStrings, getLanguage, setLanguage, onLanguageChange, type Language } from '../i18n';
import { GlossaryModal } from './glossary-modal';
import { ExplanationModal } from './info-modal';
import { icon } from './icons';

export type { TabId } from '../core/url-state';

/**
 * Tab the application opens on.
 *
 * The periodic table is the entry point: it is the map of the 118 elements, and
 * its inspector is where an element's valence cloud is previewed before the full
 * orbital viewer is opened. `NavigationBar` and `main` both read it so the first
 * paint cannot disagree with the tab that is about to be activated.
 */
export const DEFAULT_TAB: TabId = 'periodic-table';

export interface NavTab {
  readonly id: TabId;
  readonly labelKey:
    | 'tabPeriodicTable'
    | 'tabOrbitals'
    | 'tabBonding'
    | 'tabMolecules'
    | 'tabSpectroscopy'
    | 'tabNucleus'
    | 'tabHistory';
  readonly icon: string;
}

/**
 * Tabs in navigation order, which is also the order the number keys select them:
 * `1` is the first tab here, and it is the default. Both read this list, so the
 * bar and the shortcuts cannot drift apart when a tab is added or moved.
 */
export const NAV_TABS: readonly NavTab[] = [
  { id: 'periodic-table', labelKey: 'tabPeriodicTable', icon: icon('table') },
  { id: 'orbitals', labelKey: 'tabOrbitals', icon: icon('atom') },
  { id: 'bonding', labelKey: 'tabBonding', icon: icon('bond') },
  { id: 'molecules', labelKey: 'tabMolecules', icon: icon('molecule') },
  { id: 'spectroscopy', labelKey: 'tabSpectroscopy', icon: icon('spectrum') },
  { id: 'nucleus', labelKey: 'tabNucleus', icon: icon('nucleus') },
  { id: 'history', labelKey: 'tabHistory', icon: icon('history') },
];

export interface NavigationBarCallbacks {
  onTabChange: (tab: TabId) => void;
  onZenToggle?: () => void;
  onOpenGuided?: () => void;
  onShareLink?: () => void;
}

const LANGUAGE_OPTIONS: readonly { readonly code: Language; readonly label: string }[] = [
  { code: 'es', label: '🇪🇸 ES - Español' },
  { code: 'en', label: '🇬🇧 EN - English' },
  { code: 'fr', label: '🇫🇷 FR - Français' },
  { code: 'de', label: '🇩🇪 DE - Deutsch' },
  { code: 'pt', label: '🇵🇹 PT - Português' },
  { code: 'it', label: '🇮🇹 IT - Italiano' },
  { code: 'nl', label: '🇳🇱 NL - Nederlands' },
  { code: 'pl', label: '🇵🇱 PL - Polski' },
  { code: 'ru', label: '🇷🇺 RU - Русский' },
  { code: 'zh', label: '🇨🇳 ZH - 中文' },
  { code: 'ja', label: '🇯🇵 JA - 日本語' },
  { code: 'ko', label: '🇰🇷 KO - 한국어' },
  { code: 'tr', label: '🇹🇷 TR - Türkçe' },
  { code: 'hi', label: '🇮🇳 HI - हिन्दी' },
  { code: 'ar', label: '🇸🇦 AR - العربية' },
];

function renderTabButton(
  id: TabId,
  label: string,
  tabIcon: string,
  shortcut: number,
  isActive: boolean,
): string {
  return `
    <button
      type="button"
      class="nav-tab ${isActive ? 'active' : ''}"
      id="nav-tab-${id}"
      data-tab="${id}"
      role="tab"
      aria-selected="${isActive ? 'true' : 'false'}"
      aria-controls="${id}-layer"
      tabindex="${isActive ? '0' : '-1'}"
      title="${label} [${shortcut}]"
    >
      <span class="tab-icon">${tabIcon}</span>
      <span class="tab-label">${label}</span>
    </button>
  `;
}

function renderLanguageOptions(currentLang: Language): string {
  return LANGUAGE_OPTIONS.map(
    ({ code, label }) =>
      `<option value="${code}" ${currentLang === code ? 'selected' : ''}>${label}</option>`,
  ).join('');
}

function resolveTabStep(key: string, isRtl: boolean): number {
  if (key === 'ArrowDown') return 1;
  if (key === 'ArrowUp') return -1;
  if (key === 'ArrowRight') return isRtl ? -1 : 1;
  if (key === 'ArrowLeft') return isRtl ? 1 : -1;
  return 0;
}

function resolveNextTabIndex(
  key: string,
  currentIndex: number,
  count: number,
  isRtl: boolean,
): number {
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  const step = resolveTabStep(key, isRtl);
  if (step === 0) return -1;
  return (currentIndex + step + count) % count;
}

export class NavigationBar {
  private readonly container: HTMLElement;
  private activeTab: TabId = DEFAULT_TAB;
  private readonly callbacks: NavigationBarCallbacks;
  private readonly glossaryModal: GlossaryModal;

  constructor(container: HTMLElement, callbacks: NavigationBarCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.glossaryModal = new GlossaryModal();
    this.render();
    onLanguageChange(() => this.render());

    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target as Node)) {
        this.closeMobileMenu();
      }
    });
  }

  private closeMobileMenu(): void {
    const navTabsMenu = this.container.querySelector('#nav-tabs-menu');
    const mobileMenuToggle = this.container.querySelector('#mobile-menu-toggle');
    navTabsMenu?.classList.remove('mobile-open');
    mobileMenuToggle?.classList.remove('active');
    mobileMenuToggle?.setAttribute('aria-expanded', 'false');
  }

  private render(): void {
    const strings = getStrings();
    const currentLang = getLanguage();

    const tabsHtml = NAV_TABS.map((tab, index) =>
      renderTabButton(
        tab.id,
        strings[tab.labelKey],
        tab.icon,
        index + 1,
        tab.id === this.activeTab,
      ),
    ).join('');

    this.container.innerHTML = `
      <nav class="top-nav">
        <div class="nav-brand">
          <span class="nav-logo">${icon('atom', 'nav-logo-icon')}</span>
          <span class="nav-title">${strings.title}</span>
        </div>
        <div class="nav-tabs" id="nav-tabs-menu">
          <div class="nav-tablist" role="tablist" aria-label="${strings.title}">
            ${tabsHtml}
          </div>
          <button type="button" class="btn-ghost nav-aux-btn nav-guided-btn" id="nav-guided-btn" title="${strings.navGuidedBtn}" aria-label="${strings.navGuidedBtn}">
            <span class="tab-icon">${icon('compass')}</span>
            <span class="tab-label">${strings.navGuidedBtn}</span>
          </button>
          <button type="button" class="btn-ghost nav-aux-btn nav-glossary-btn" id="nav-glossary-btn" title="${strings.btnGlossary}" aria-label="${strings.btnGlossary}">
            <span class="tab-icon">${icon('book')}</span>
            <span class="tab-label">${strings.btnGlossary}</span>
          </button>
          <button type="button" class="btn-ghost nav-aux-btn nav-intro-btn" id="nav-intro-btn" title="${strings.btnIntro}" aria-label="${strings.btnIntro}">
            <span class="tab-icon">${icon('help')}</span>
            <span class="tab-label">${strings.btnIntro}</span>
          </button>
        </div>
        <div class="nav-actions">
          <span class="nav-divider" aria-hidden="true"></span>
          <button type="button" class="nav-action-btn nav-share-btn" id="nav-share-btn" title="${strings.shareLink}" aria-label="${strings.shareLink}">
            <span class="tab-icon">${icon('share')}</span>
          </button>
          <button type="button" class="nav-action-btn nav-zen-btn" id="nav-zen-btn" title="${strings.zenMode}" aria-label="${strings.zenMode}">
            <span class="tab-icon">${icon('zen')}</span>
          </button>
          <div class="nav-lang-switcher">
            <select id="lang-select" aria-label="${strings.language}">
              ${renderLanguageOptions(currentLang)}
            </select>
          </div>
          <button type="button" class="mobile-menu-toggle" id="mobile-menu-toggle" aria-label="Menu" aria-expanded="false" aria-controls="nav-tabs-menu">
            <span class="hamburger-icon">${icon('sliders')}</span>
          </button>
        </div>
      </nav>
    `;

    this.attachEventListeners();
  }

  private handleTablistKeydown(e: KeyboardEvent): void {
    if (e.altKey || e.ctrlKey || e.metaKey) return;

    const tabButtons = Array.from(
      this.container.querySelectorAll<HTMLButtonElement>('.nav-tab[data-tab]'),
    );
    const currentIndex = tabButtons.findIndex((b) => b.dataset.tab === this.activeTab);
    if (currentIndex === -1) return;

    const isRtl = document.documentElement.dir === 'rtl';
    const nextIndex = resolveNextTabIndex(e.key, currentIndex, tabButtons.length, isRtl);
    if (nextIndex === -1) return;

    e.preventDefault();
    const nextBtn = tabButtons[nextIndex];
    const nextTab = nextBtn.dataset.tab as TabId;
    if (nextTab !== this.activeTab) {
      this.setActiveTab(nextTab);
      this.callbacks.onTabChange(nextTab);
    }
    nextBtn.focus();
    nextBtn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  private attachEventListeners(): void {
    const navTabsMenu = this.container.querySelector('#nav-tabs-menu') as HTMLElement;
    const navTablist = this.container.querySelector('.nav-tablist') as HTMLElement;
    const mobileMenuToggle = this.container.querySelector('#mobile-menu-toggle') as HTMLElement;

    mobileMenuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = navTabsMenu.classList.toggle('mobile-open');
      mobileMenuToggle.classList.toggle('active', isOpen);
      mobileMenuToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    const buttons = this.container.querySelectorAll<HTMLButtonElement>('.nav-tab[data-tab]');
    buttons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = (e.currentTarget as HTMLElement).dataset.tab as TabId;
        this.closeMobileMenu();
        if (target && target !== this.activeTab) {
          this.setActiveTab(target);
          this.callbacks.onTabChange(target);
        }
      });
    });

    navTablist.addEventListener('keydown', (e: KeyboardEvent) => {
      this.handleTablistKeydown(e);
    });

    const guidedBtn = this.container.querySelector('#nav-guided-btn') as HTMLElement;
    guidedBtn.addEventListener('click', () => {
      this.closeMobileMenu();
      this.callbacks.onOpenGuided?.();
    });

    const glossaryBtn = this.container.querySelector('#nav-glossary-btn') as HTMLElement;
    glossaryBtn.addEventListener('click', () => {
      this.closeMobileMenu();
      this.glossaryModal.open();
    });

    const introBtn = this.container.querySelector('#nav-intro-btn') as HTMLElement;
    introBtn.addEventListener('click', () => {
      this.closeMobileMenu();
      ExplanationModal.show(getStrings().explainIntro);
    });

    const shareBtn = this.container.querySelector('#nav-share-btn') as HTMLElement;
    shareBtn.addEventListener('click', () => {
      this.callbacks.onShareLink?.();
    });

    const zenBtn = this.container.querySelector('#nav-zen-btn') as HTMLElement;
    zenBtn.addEventListener('click', () => {
      this.callbacks.onZenToggle?.();
    });

    const langSelect = this.container.querySelector('#lang-select') as HTMLSelectElement;
    langSelect.addEventListener('change', (e) => {
      const selectedLang = (e.target as HTMLSelectElement).value as Language;
      setLanguage(selectedLang);
    });
  }

  public setActiveTab(tab: TabId): void {
    this.activeTab = tab;
    const buttons = this.container.querySelectorAll<HTMLButtonElement>('.nav-tab[data-tab]');
    buttons.forEach((btn) => {
      const isTarget = btn.dataset.tab === tab;
      btn.classList.toggle('active', isTarget);
      btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
      btn.setAttribute('tabindex', isTarget ? '0' : '-1');
    });
  }
}
