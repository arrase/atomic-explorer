import { getStrings, getLanguage, setLanguage, onLanguageChange, Language } from '../i18n';
import { GlossaryModal } from './glossary-modal';
import { ExplanationModal } from './info-modal';
import { icon } from './icons';

export type TabId = 'orbitals' | 'periodic-table' | 'molecules';

export class NavigationBar {
  private container: HTMLElement;
  private activeTab: TabId = 'orbitals';
  private onTabChange: (tab: TabId) => void;
  private onZenToggle?: () => void;
  private glossaryModal: GlossaryModal;

  constructor(
    container: HTMLElement,
    onTabChange: (tab: TabId) => void,
    onZenToggle?: () => void
  ) {
    this.container = container;
    this.onTabChange = onTabChange;
    this.onZenToggle = onZenToggle;
    this.glossaryModal = new GlossaryModal();
    this.render();
    onLanguageChange(() => this.render());

    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!this.container.contains(target)) {
        const navTabsMenu = this.container.querySelector('#nav-tabs-menu');
        const mobileMenuToggle = this.container.querySelector('#mobile-menu-toggle');
        if (navTabsMenu) navTabsMenu.classList.remove('mobile-open');
        if (mobileMenuToggle) mobileMenuToggle.classList.remove('active');
      }
    });
  }

  private render(): void {
    const strings = getStrings();
    const currentLang = getLanguage();

    const tabs: { id: TabId; label: string; icon: string }[] = [
      { id: 'orbitals', label: strings.tabOrbitals, icon: icon('atom') },
      { id: 'periodic-table', label: strings.tabPeriodicTable, icon: icon('table') },
      { id: 'molecules', label: strings.tabMolecules, icon: icon('molecule') },
    ];

    this.container.innerHTML = `
      <nav class="top-nav">
        <div class="nav-brand">
          <span class="nav-logo">${icon('atom', 'nav-logo-icon')}</span>
          <span class="nav-title">${strings.title}</span>
        </div>
        <div class="nav-tabs" id="nav-tabs-menu" role="tablist" aria-label="${strings.title}">
          ${tabs
            .map(
              (tab) => `
            <button
              class="nav-tab ${tab.id === this.activeTab ? 'active' : ''}"
              id="nav-tab-${tab.id}"
              data-tab="${tab.id}"
              role="tab"
              aria-selected="${tab.id === this.activeTab ? 'true' : 'false'}"
              aria-controls="${tab.id}-layer"
              tabindex="${tab.id === this.activeTab ? '0' : '-1'}"
            >
              <span class="tab-icon">${tab.icon}</span>
              <span class="tab-label">${tab.label}</span>
            </button>
          `
            )
            .join('')}
          <button class="nav-tab nav-glossary-btn" id="nav-glossary-btn" title="${strings.btnGlossary}">
            <span class="tab-icon">${icon('book')}</span>
            <span class="tab-label">${strings.btnGlossary}</span>
          </button>
          <button class="nav-tab nav-intro-btn" id="nav-intro-btn" title="${strings.btnIntro}">
            <span class="tab-icon">${icon('help')}</span>
            <span class="tab-label">${strings.btnIntro}</span>
          </button>
        </div>
        <div class="nav-actions">
          <button class="nav-action-btn nav-zen-btn" id="nav-zen-btn" title="${strings.zenMode}" aria-label="${strings.zenMode}">
            <span class="tab-icon">${icon('zen')}</span>
          </button>
          <div class="nav-lang-switcher">
            <select id="lang-select" aria-label="${strings.language}">
              <option value="es" ${currentLang === 'es' ? 'selected' : ''}>🇪🇸 ES - Español</option>
              <option value="en" ${currentLang === 'en' ? 'selected' : ''}>🇬🇧 EN - English</option>
              <option value="fr" ${currentLang === 'fr' ? 'selected' : ''}>🇫🇷 FR - Français</option>
              <option value="de" ${currentLang === 'de' ? 'selected' : ''}>🇩🇪 DE - Deutsch</option>
              <option value="pt" ${currentLang === 'pt' ? 'selected' : ''}>🇵🇹 PT - Português</option>
              <option value="it" ${currentLang === 'it' ? 'selected' : ''}>🇮🇹 IT - Italiano</option>
              <option value="nl" ${currentLang === 'nl' ? 'selected' : ''}>🇳🇱 NL - Nederlands</option>
              <option value="pl" ${currentLang === 'pl' ? 'selected' : ''}>🇵🇱 PL - Polski</option>
              <option value="ru" ${currentLang === 'ru' ? 'selected' : ''}>🇷🇺 RU - Русский</option>
              <option value="zh" ${currentLang === 'zh' ? 'selected' : ''}>🇨🇳 ZH - 中文</option>
              <option value="ja" ${currentLang === 'ja' ? 'selected' : ''}>🇯🇵 JA - 日本語</option>
              <option value="ko" ${currentLang === 'ko' ? 'selected' : ''}>🇰🇷 KO - 한국어</option>
              <option value="tr" ${currentLang === 'tr' ? 'selected' : ''}>🇹🇷 TR - Türkçe</option>
              <option value="hi" ${currentLang === 'hi' ? 'selected' : ''}>🇮🇳 HI - हिन्दी</option>
              <option value="ar" ${currentLang === 'ar' ? 'selected' : ''}>🇸🇦 AR - العربية</option>
            </select>
          </div>
          <button class="mobile-menu-toggle" id="mobile-menu-toggle" aria-label="Menu" aria-expanded="false" aria-controls="nav-tabs-menu">
            <span class="hamburger-icon">${icon('sliders')}</span>
          </button>
        </div>
      </nav>
    `;

    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    const navTabsMenu = this.container.querySelector('#nav-tabs-menu') as HTMLElement;
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
        const target = (e.currentTarget as HTMLElement).getAttribute('data-tab') as TabId;
        navTabsMenu.classList.remove('mobile-open');
        mobileMenuToggle.classList.remove('active');
        mobileMenuToggle.setAttribute('aria-expanded', 'false');
        if (target && target !== this.activeTab) {
          this.setActiveTab(target);
          this.onTabChange(target);
        }
      });
    });

    navTabsMenu.addEventListener('keydown', (e: KeyboardEvent) => {
      const tabButtons = Array.from(this.container.querySelectorAll<HTMLButtonElement>('.nav-tab[data-tab]'));
      const currentIndex = tabButtons.findIndex((b) => b.getAttribute('data-tab') === this.activeTab);
      let nextIndex = -1;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        nextIndex = (currentIndex + 1) % tabButtons.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        nextIndex = (currentIndex - 1 + tabButtons.length) % tabButtons.length;
      }

      if (nextIndex !== -1) {
        e.preventDefault();
        const nextBtn = tabButtons[nextIndex];
        const nextTab = nextBtn.getAttribute('data-tab') as TabId;
        this.setActiveTab(nextTab);
        this.onTabChange(nextTab);
        nextBtn.focus();
      }
    });

    const glossaryBtn = this.container.querySelector('#nav-glossary-btn') as HTMLElement;
    glossaryBtn.addEventListener('click', () => {
      navTabsMenu.classList.remove('mobile-open');
      mobileMenuToggle.classList.remove('active');
      mobileMenuToggle.setAttribute('aria-expanded', 'false');
      this.glossaryModal.open();
    });

    const introBtn = this.container.querySelector('#nav-intro-btn') as HTMLElement;
    introBtn.addEventListener('click', () => {
      navTabsMenu.classList.remove('mobile-open');
      mobileMenuToggle.classList.remove('active');
      mobileMenuToggle.setAttribute('aria-expanded', 'false');
      ExplanationModal.show(getStrings().explainIntro);
    });

    const zenBtn = this.container.querySelector('#nav-zen-btn') as HTMLElement;
    if (zenBtn && this.onZenToggle) {
      zenBtn.addEventListener('click', () => {
        this.onZenToggle!();
      });
    }

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
      const isTarget = btn.getAttribute('data-tab') === tab;
      if (isTarget) {
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        btn.setAttribute('tabindex', '0');
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
        btn.setAttribute('tabindex', '-1');
      }
    });
  }
}

