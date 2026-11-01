import type { DeepLinkState } from '../core/url-state';
import { GUIDED_TOURS, getGuidedTourById, type GuidedTourId } from '../core/guided-tours';
import {
  OrbitalChallengeEngine,
  type ChallengeOrbital,
  type ChallengeSessionState,
} from '../core/orbital-challenge';
import { getStrings, onLanguageChange, type I18nStrings } from '../i18n';
import { icon, type IconName } from './icons';
import { escapeHtml } from './modal-utils';

export type LauncherTab = 'tours' | 'challenge';
type ActiveGuidedMode = 'idle' | 'tour' | 'challenge';

export interface AppController {
  getCurrentState(): DeepLinkState;
  applyDeepLinkState(state: DeepLinkState): void;
  setChallengeMask(masked: boolean): void;
  shareCurrentUrl(): Promise<void>;
}

const LAUNCHER_TABS: readonly LauncherTab[] = ['tours', 'challenge'];

function isPointerOutsideDialog(event: PointerEvent, dialog: HTMLDialogElement): boolean {
  const rect = dialog.getBoundingClientRect();
  return (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  );
}

function attachDialogLightDismissFallback(dialog: HTMLDialogElement): void {
  if ('closedBy' in HTMLDialogElement.prototype) return;
  let pressedOutside = false;
  dialog.addEventListener('pointerdown', (event: PointerEvent) => {
    pressedOutside = isPointerOutsideDialog(event, dialog);
  });
  dialog.addEventListener('pointerup', (event: PointerEvent) => {
    if (pressedOutside && isPointerOutsideDialog(event, dialog)) {
      dialog.close();
    }
  });
}

function formatStepLabel(strings: I18nStrings, current: string | number, total: number): string {
  return strings.guidedStepLabel
    .replaceAll('{current}', String(current))
    .replaceAll('{total}', String(total));
}

function formatScoreLabel(strings: I18nStrings, state: ChallengeSessionState): string {
  return strings.challengeScoreLabel
    .replaceAll('{score}', String(state.score))
    .replaceAll('{attempts}', String(state.attempts))
    .replaceAll('{streak}', String(state.streak));
}

function formatChallengeHint(strings: I18nStrings, target: ChallengeOrbital): string {
  return strings.challengeHintText
    .replaceAll('{nr}', String(target.radialNodes))
    .replaceAll('{na}', String(target.angularNodes));
}

function formatChallengeExplanation(strings: I18nStrings, target: ChallengeOrbital): string {
  return strings.challengeExplainTemplate
    .replaceAll('{geom}', strings[target.geomKey])
    .replaceAll('{orbital}', target.plainLabel)
    .replaceAll('{n}', String(target.n))
    .replaceAll('{l}', String(target.l))
    .replaceAll('{nr}', String(target.radialNodes))
    .replaceAll('{na}', String(target.angularNodes));
}

function getChoiceStatusClass(
  choiceId: string,
  targetId: string,
  state: ChallengeSessionState,
): string {
  if (state.selectedChoiceId === null) return '';
  if (choiceId === targetId) return ' is-correct';
  if (choiceId === state.selectedChoiceId && !state.isCorrect) return ' is-wrong';
  return '';
}

function renderToursListHtml(strings: I18nStrings): string {
  const cardsHtml = GUIDED_TOURS.map((tour, index) => {
    const locale = strings.guidedTours[tour.id];
    const num = String(index + 1).padStart(2, '0');
    const stepPill = formatStepLabel(strings, `1–${tour.steps.length}`, tour.steps.length);
    const autofocusAttr = index === 0 ? ' autofocus' : '';
    return `
      <article class="guided-tour-card">
        <span class="guided-tour-num">${num}</span>
        <div class="guided-tour-info">
          <div class="guided-tour-heading-row">
            <h3 class="guided-tour-title">${escapeHtml(locale.title)}</h3>
            <span class="guided-step-pill">${escapeHtml(stepPill)}</span>
          </div>
          <p class="guided-tour-subtitle">${escapeHtml(locale.subtitle)}</p>
        </div>
        <button
          type="button"
          class="btn-primary guided-start-tour-btn"
          data-tour-id="${tour.id}"${autofocusAttr}
        >
          ${escapeHtml(strings.guidedStartTour)}
        </button>
      </article>
    `;
  }).join('');

  return `<div class="guided-tours-list">${cardsHtml}</div>`;
}

function renderChallengeIntroHtml(strings: I18nStrings, state: ChallengeSessionState): string {
  return `
    <div class="guided-challenge-intro">
      <div class="guided-challenge-icon">${icon('trophy')}</div>
      <h3 class="guided-challenge-title">${escapeHtml(strings.challengeIntroTitle)}</h3>
      <p class="guided-challenge-desc">${escapeHtml(strings.challengeIntroDesc)}</p>
      <span class="guided-step-pill challenge-score-pill">${escapeHtml(formatScoreLabel(strings, state))}</span>
      <button type="button" class="btn-primary" id="btn-start-challenge" autofocus>
        ${escapeHtml(strings.challengeStartBtn)}
      </button>
    </div>
  `;
}

function renderCardHeaderHtml(
  badgeIcon: IconName,
  badgeTitleHtml: string,
  pillText: string,
  minimized: boolean,
  strings: I18nStrings,
): string {
  const minLabel = minimized ? strings.guidedExpand : strings.guidedMinimize;
  const minIcon: IconName = minimized ? 'chevron-up' : 'chevron-down';

  return `
    <div class="guided-card-header">
      <div class="guided-card-badge">
        ${icon(badgeIcon)}
        ${badgeTitleHtml}
      </div>
      <div class="guided-card-actions">
        <span class="guided-step-pill">${escapeHtml(pillText)}</span>
        <button
          type="button"
          class="btn-ghost guided-icon-btn"
          id="btn-guided-switch"
          title="${escapeHtml(strings.guidedSwitch)}"
          aria-label="${escapeHtml(strings.guidedSwitch)}"
        >
          ${icon('compass')}
        </button>
        <button
          type="button"
          class="btn-ghost guided-icon-btn"
          id="btn-guided-minimize"
          aria-expanded="${!minimized}"
          title="${escapeHtml(minLabel)}"
          aria-label="${escapeHtml(minLabel)}"
        >
          ${icon(minIcon)}
        </button>
        <button
          type="button"
          class="btn-ghost guided-icon-btn"
          id="btn-guided-exit"
          title="${escapeHtml(strings.guidedExit)}"
          aria-label="${escapeHtml(strings.guidedExit)}"
        >
          ${icon('close')}
        </button>
      </div>
    </div>
  `;
}

function renderChallengeFeedbackHtml(strings: I18nStrings, state: ChallengeSessionState): string {
  if (state.selectedChoiceId === null) return '';
  const { target } = state.round;
  const verdictText = state.isCorrect
    ? strings.challengeCorrect
    : strings.challengeWrong.replaceAll('{orbital}', target.plainLabel);
  const verdictClass = state.isCorrect ? 'is-correct' : 'is-wrong';
  const verdictIcon = state.isCorrect ? icon('check') : icon('close');

  return `
    <div class="challenge-feedback-box">
      <div class="challenge-verdict ${verdictClass}">
        ${verdictIcon}
        <span>${escapeHtml(verdictText)}</span>
      </div>
      <p class="challenge-explain-text">${escapeHtml(formatChallengeExplanation(strings, target))}</p>
    </div>
  `;
}

export class GuidedLearningController {
  private readonly app: AppController;
  private readonly dialog: HTMLDialogElement;
  private readonly card: HTMLElement;
  private readonly challengeEngine: OrbitalChallengeEngine;

  private launcherTab: LauncherTab = 'tours';
  private activeMode: ActiveGuidedMode = 'idle';
  private activeTourId: GuidedTourId = 'quantum-cloud';
  private stepIndex = 0;
  private minimized = false;
  private challengeMasked = false;

  public constructor(overlayParent: HTMLElement, app: AppController) {
    this.app = app;
    this.challengeEngine = new OrbitalChallengeEngine();

    this.dialog = document.createElement('dialog');
    this.dialog.className = 'guided-launcher-dialog';
    this.dialog.setAttribute('closedby', 'any');
    this.dialog.setAttribute('aria-labelledby', 'guided-launcher-title');
    this.dialog.addEventListener('close', () => {
      this.dialog.returnValue = '';
    });
    attachDialogLightDismissFallback(this.dialog);
    document.body.appendChild(this.dialog);

    this.card = document.createElement('aside');
    this.card.className = 'guided-floating-card glass-panel hidden';
    overlayParent.appendChild(this.card);

    onLanguageChange(() => {
      if (this.dialog.open) {
        this.renderDialog();
      }
      if (this.activeMode !== 'idle') {
        this.renderCard();
      }
    });
  }

  /** Opens the native <dialog> launcher on either 'tours' or 'challenge' tab. */
  public openLauncher(initialTab?: LauncherTab): void {
    if (initialTab !== undefined) {
      this.launcherTab = initialTab;
    }
    this.renderDialog();
    if (!this.dialog.open) {
      this.dialog.showModal();
    }
  }

  /** Starts one of the 5 guided tours directly at step 0. */
  public startTour(tourId: GuidedTourId): void {
    if (this.dialog.open) {
      this.dialog.close();
    }
    this.activeMode = 'tour';
    this.activeTourId = tourId;
    this.minimized = false;
    this.goToTourStep(0);
  }

  /** Starts the Quantum Mini-Challenge ("¿Qué orbital soy?") on the orbitals tab. */
  public startChallenge(): void {
    if (this.dialog.open) {
      this.dialog.close();
    }
    this.activeMode = 'challenge';
    this.minimized = false;
    if (this.challengeEngine.getState().selectedChoiceId !== null) {
      this.challengeEngine.nextRound();
    }
    this.applyChallengeRound();
  }

  /** Exits active tour or challenge, unmasks orbitals UI, and hides floating card. */
  public exitActiveMode(): void {
    this.activeMode = 'idle';
    this.minimized = false;
    this.challengeMasked = false;
    this.app.setChallengeMask(false);
    this.renderCard();
  }

  public isChallengeMasked(): boolean {
    return this.challengeMasked;
  }

  private goToTourStep(index: number): void {
    const tour = getGuidedTourById(this.activeTourId);
    this.stepIndex = index;
    this.challengeMasked = false;
    this.app.setChallengeMask(false);
    this.app.applyDeepLinkState(tour.steps[this.stepIndex]);
    this.renderCard();
  }

  private applyChallengeRound(): void {
    const { target } = this.challengeEngine.getState().round;
    this.challengeMasked = true;
    this.app.setChallengeMask(true);
    this.app.applyDeepLinkState({
      tab: 'orbitals',
      n: target.n,
      l: target.l,
      m: target.m,
      zEff: 1.0,
      useRealOrbital: true,
      mode: 'isosurface',
      cut: 'none',
      nodal: false,
    });
    this.renderCard();
  }

  private handleChallengeAnswer(choiceId: string): void {
    this.challengeEngine.submitAnswer(choiceId);
    this.challengeMasked = false;
    this.app.setChallengeMask(false);
    this.renderCard();
    this.card.querySelector<HTMLButtonElement>('#btn-challenge-next')?.focus();
  }

  private renderDialog(): void {
    const strings = getStrings();
    const isTours = this.launcherTab === 'tours';
    const panelBody = isTours
      ? renderToursListHtml(strings)
      : renderChallengeIntroHtml(strings, this.challengeEngine.getState());

    this.dialog.innerHTML = `
      <div class="guided-launcher-header">
        <div class="panel-title-group">
          <span class="panel-header-icon">${icon('compass')}</span>
          <h2 id="guided-launcher-title">${escapeHtml(strings.guidedModalTitle)}</h2>
        </div>
        <button
          type="button"
          class="btn-close-modal"
          id="guided-launcher-close"
          aria-label="${escapeHtml(strings.infoModalClose)}"
        >
          ${icon('close')}
        </button>
      </div>
      <div class="guided-launcher-tabs" role="tablist" aria-labelledby="guided-launcher-title">
        <button
          type="button"
          class="guided-launcher-tab${isTours ? ' active' : ''}"
          id="guided-tab-tours"
          role="tab"
          data-tab="tours"
          aria-selected="${isTours}"
          aria-controls="guided-launcher-panel"
          tabindex="${isTours ? '0' : '-1'}"
        >
          ${icon('compass')}
          <span>${escapeHtml(strings.guidedTabTours)}</span>
        </button>
        <button
          type="button"
          class="guided-launcher-tab${!isTours ? ' active' : ''}"
          id="guided-tab-challenge"
          role="tab"
          data-tab="challenge"
          aria-selected="${!isTours}"
          aria-controls="guided-launcher-panel"
          tabindex="${!isTours ? '0' : '-1'}"
        >
          ${icon('trophy')}
          <span>${escapeHtml(strings.guidedTabChallenge)}</span>
        </button>
      </div>
      <div
        class="guided-launcher-body"
        id="guided-launcher-panel"
        role="tabpanel"
        aria-labelledby="${isTours ? 'guided-tab-tours' : 'guided-tab-challenge'}"
      >
        ${panelBody}
      </div>
    `;

    this.bindDialogEvents();
  }

  private bindDialogEvents(): void {
    this.dialog.querySelector('#guided-launcher-close')?.addEventListener('click', () => {
      this.dialog.close();
    });

    const tablist = this.dialog.querySelector<HTMLElement>('.guided-launcher-tabs');
    tablist?.addEventListener('keydown', (event: KeyboardEvent) => {
      this.handleLauncherTabKeydown(event);
    });

    this.dialog.querySelectorAll<HTMLButtonElement>('.guided-launcher-tab').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        const nextTab = tabBtn.dataset.tab as LauncherTab;
        if (nextTab !== this.launcherTab) {
          this.launcherTab = nextTab;
          this.renderDialog();
          this.dialog
            .querySelector<HTMLButtonElement>(`.guided-launcher-tab[data-tab="${nextTab}"]`)
            ?.focus();
        }
      });
    });

    this.dialog.querySelectorAll<HTMLButtonElement>('.guided-start-tour-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.startTour(btn.dataset.tourId as GuidedTourId);
      });
    });

    this.dialog.querySelector('#btn-start-challenge')?.addEventListener('click', () => {
      this.startChallenge();
    });
  }

  private handleLauncherTabKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

    event.preventDefault();
    const isRtl = document.documentElement.dir === 'rtl';
    const forward = event.key === 'ArrowRight' ? !isRtl : isRtl;
    const currentIdx = LAUNCHER_TABS.indexOf(this.launcherTab);
    const nextIdx = (currentIdx + (forward ? 1 : -1) + LAUNCHER_TABS.length) % LAUNCHER_TABS.length;
    this.launcherTab = LAUNCHER_TABS[nextIdx];
    this.renderDialog();
    this.dialog
      .querySelector<HTMLButtonElement>(`.guided-launcher-tab[data-tab="${this.launcherTab}"]`)
      ?.focus();
  }

  private renderCard(): void {
    this.card.classList.toggle('hidden', this.activeMode === 'idle');
    this.card.classList.toggle('minimized', this.minimized);

    if (this.activeMode === 'idle') {
      this.card.innerHTML = '';
      return;
    }

    if (this.activeMode === 'tour') {
      this.renderTourCard();
      return;
    }

    this.renderChallengeCard();
  }

  private renderTourCard(): void {
    const strings = getStrings();
    const tour = getGuidedTourById(this.activeTourId);
    const tourLocale = strings.guidedTours[this.activeTourId];
    const stepLocale = tourLocale.steps[this.stepIndex];
    const totalSteps = tour.steps.length;
    const stepPill = formatStepLabel(strings, this.stepIndex + 1, totalSteps);
    const badgeTitleHtml = `<span class="guided-card-story-title">${escapeHtml(tourLocale.title)}</span>`;
    const nextLabel = this.stepIndex < 3 ? strings.guidedNext : strings.guidedFinish;

    const dotsHtml = tour.steps
      .map((_, i) => {
        const activeClass = i === this.stepIndex ? ' active' : '';
        const stepAriaLabel = `${formatStepLabel(strings, i + 1, totalSteps)}: ${tourLocale.steps[i].title}`;
        return `<button type="button" class="guided-step-dot${activeClass}" data-step="${i}" aria-label="${escapeHtml(stepAriaLabel)}"></button>`;
      })
      .join('');

    this.card.innerHTML = `
      ${renderCardHeaderHtml('compass', badgeTitleHtml, stepPill, this.minimized, strings)}
      <div class="guided-card-body">
        <h4 class="guided-step-title">${escapeHtml(stepLocale.title)}</h4>
        <p class="guided-step-body">${escapeHtml(stepLocale.body)}</p>
      </div>
      <div class="guided-card-footer">
        <button type="button" class="btn-ghost" id="btn-guided-prev"${this.stepIndex === 0 ? ' disabled' : ''}>
          ${escapeHtml(strings.guidedPrev)}
        </button>
        <div class="guided-step-dots">${dotsHtml}</div>
        <button type="button" class="btn-primary" id="btn-guided-next">
          ${escapeHtml(nextLabel)}
        </button>
      </div>
    `;

    this.bindTourCardEvents();
  }

  private renderChallengeCard(): void {
    const strings = getStrings();
    const state = this.challengeEngine.getState();
    const { target, choices } = state.round;
    const answered = state.selectedChoiceId !== null;
    const badgeTitleHtml = `<span>${escapeHtml(strings.guidedTabChallenge)}</span>`;
    const scorePill = formatScoreLabel(strings, state);
    const hintDisabledAttr = state.hintUsed || answered ? ' disabled' : '';

    const mysteryHtml = !answered
      ? `<div class="challenge-mystery-banner">${escapeHtml(strings.challengeMysteryBadge)}</div>`
      : '';
    const hintBoxHtml = state.hintUsed
      ? `<div class="challenge-hint-box">${escapeHtml(formatChallengeHint(strings, target))}</div>`
      : '';
    const choicesHtml = choices
      .map((choice) => {
        const statusClass = getChoiceStatusClass(choice.id, target.id, state);
        const disabledAttr = answered ? ' disabled' : '';
        return `<button type="button" class="challenge-choice-btn${statusClass}" data-choice-id="${choice.id}"${disabledAttr}>${choice.labelHtml}</button>`;
      })
      .join('');
    const footerHtml = answered
      ? `<div class="guided-card-footer">
           <button type="button" class="btn-primary" id="btn-challenge-next">${escapeHtml(strings.challengeNextBtn)}</button>
         </div>`
      : '';

    this.card.innerHTML = `
      ${renderCardHeaderHtml('trophy', badgeTitleHtml, scorePill, this.minimized, strings)}
      <div class="guided-card-body">
        ${mysteryHtml}
        <div class="challenge-prompt-row">
          <span>${escapeHtml(strings.challengePrompt)}</span>
          <button type="button" class="btn-ghost" id="btn-challenge-hint"${hintDisabledAttr}>
            ${icon('lightbulb')}
            <span>${escapeHtml(strings.challengeHintBtn)}</span>
          </button>
        </div>
        ${hintBoxHtml}
        <div class="challenge-choices-grid">${choicesHtml}</div>
        ${renderChallengeFeedbackHtml(strings, state)}
      </div>
      ${footerHtml}
    `;

    this.bindChallengeCardEvents();
  }

  private bindCardHeaderEvents(switcherTab: LauncherTab): void {
    this.card.querySelector('#btn-guided-switch')?.addEventListener('click', () => {
      this.openLauncher(switcherTab);
    });
    this.card.querySelector('#btn-guided-minimize')?.addEventListener('click', () => {
      this.minimized = !this.minimized;
      this.renderCard();
      this.card.querySelector<HTMLButtonElement>('#btn-guided-minimize')?.focus();
    });
    this.card.querySelector('#btn-guided-exit')?.addEventListener('click', () => {
      this.exitActiveMode();
    });
  }

  private bindTourCardEvents(): void {
    this.bindCardHeaderEvents('tours');
    this.card.querySelector('#btn-guided-prev')?.addEventListener('click', () => {
      if (this.stepIndex > 0) {
        this.goToTourStep(this.stepIndex - 1);
        const focusId = this.stepIndex > 0 ? '#btn-guided-prev' : '#btn-guided-next';
        this.card.querySelector<HTMLButtonElement>(focusId)?.focus();
      }
    });
    this.card.querySelector('#btn-guided-next')?.addEventListener('click', () => {
      if (this.stepIndex < 3) {
        this.goToTourStep(this.stepIndex + 1);
        this.card.querySelector<HTMLButtonElement>('#btn-guided-next')?.focus();
      } else {
        this.exitActiveMode();
      }
    });
    this.card.querySelectorAll<HTMLButtonElement>('.guided-step-dot').forEach((dot) => {
      dot.addEventListener('click', () => {
        const targetStep = Number(dot.dataset.step);
        this.goToTourStep(targetStep);
        this.card
          .querySelector<HTMLButtonElement>(`.guided-step-dot[data-step="${targetStep}"]`)
          ?.focus();
      });
    });
  }

  private bindChallengeCardEvents(): void {
    this.bindCardHeaderEvents('challenge');
    this.card.querySelector('#btn-challenge-hint')?.addEventListener('click', () => {
      this.challengeEngine.revealHint();
      this.renderCard();
      this.card.querySelector<HTMLButtonElement>('.challenge-choice-btn')?.focus();
    });
    this.card.querySelectorAll<HTMLButtonElement>('.challenge-choice-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const choiceId = btn.dataset.choiceId;
        if (choiceId) {
          this.handleChallengeAnswer(choiceId);
        }
      });
    });
    this.card.querySelector('#btn-challenge-next')?.addEventListener('click', () => {
      this.challengeEngine.nextRound();
      this.applyChallengeRound();
      this.card.querySelector<HTMLButtonElement>('.challenge-choice-btn')?.focus();
    });
  }
}
