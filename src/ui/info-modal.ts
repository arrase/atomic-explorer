import { ConceptExplanation, getStrings, I18nStrings } from '../i18n';
import {
  closeModalDialog,
  waitDialogExitAnimations,
  wireModalDialogLifecycle,
} from './dialog-helpers';
import { icon } from './icons';
import { escapeHtml } from './modal-utils';

export class ExplanationModal {
  private static dialogElement: HTMLDialogElement | null = null;

  public static show(info: ConceptExplanation, options?: { showDontShowAgain?: boolean, storageKey?: string }): void {
    if (ExplanationModal.dialogElement) {
      const prev = ExplanationModal.dialogElement;
      ExplanationModal.dialogElement = null;
      if (prev.open) {
        prev.close();
      }
      prev.remove();
    }

    const strings = getStrings();

    const dialog = document.createElement('dialog');
    dialog.className = 'glass-modal-card info-modal-card app-dialog';
    dialog.setAttribute('closedby', 'any');
    dialog.setAttribute('aria-labelledby', 'info-modal-title');

    const analogyHtml = info.analogy
      ? `<div class="info-modal-analogy">
           <div class="analogy-label">${icon('help')} <span>${strings.analogyLabel}:</span></div>
           <p>${info.analogy}</p>
         </div>`
      : '';

    dialog.innerHTML = `
      <div class="glass-modal-header">
        <div class="panel-title-group">
          <span class="panel-header-icon">${icon('info')}</span>
          <h2 class="glass-modal-title" id="info-modal-title">${info.title}</h2>
        </div>
        <button type="button" class="btn-close-modal" aria-label="${escapeHtml(strings.infoModalClose)}">${icon('close')}</button>
      </div>
      <div class="glass-modal-body">
        <p class="info-modal-summary">${info.summary}</p>
        <div class="info-modal-detail">${info.detail}</div>
        ${analogyHtml}
      </div>
      <div class="glass-modal-footer">
        ${options?.showDontShowAgain ? `
          <label class="info-modal-dont-show-again">
            <input type="checkbox" id="dont-show-again-checkbox">
            <span>${strings.dontShowAgain}</span>
          </label>
        ` : ''}
        <button type="button" class="btn-primary info-modal-close-btn">${strings.infoModalClose}</button>
      </div>
    `;

    document.body.appendChild(dialog);
    ExplanationModal.dialogElement = dialog;

    const persistPreferences = () => {
      if (options?.showDontShowAgain && options?.storageKey) {
        const checkbox = dialog.querySelector('#dont-show-again-checkbox') as HTMLInputElement | null;
        if (checkbox?.checked) {
          localStorage.setItem(options.storageKey, 'true');
        }
      }
    };

    const requestClose = () => {
      persistPreferences();
      closeModalDialog(dialog);
    };

    wireModalDialogLifecycle(dialog, requestClose);

    dialog.addEventListener('close', async () => {
      persistPreferences();
      if (ExplanationModal.dialogElement === dialog) {
        ExplanationModal.dialogElement = null;
      }
      await waitDialogExitAnimations(dialog);
      dialog.remove();
    });

    const closeBtn = dialog.querySelector('.btn-close-modal') as HTMLElement;
    const footerCloseBtn = dialog.querySelector('.info-modal-close-btn') as HTMLElement;
    closeBtn.addEventListener('click', requestClose);
    footerCloseBtn.addEventListener('click', requestClose);

    dialog.showModal();
  }

  public static showSimple(title: string, summary: string, detail: string): void {
    ExplanationModal.show({ title, summary, detail });
  }

  public static attachInfoButtons(parent: HTMLElement): void {
    const infoBtns = parent.querySelectorAll<HTMLElement>('.btn-info-icon');
    const strings = getStrings();

    infoBtns.forEach((btn) => {
      const explainKey = btn.dataset.explain as keyof I18nStrings | undefined;
      const concept = explainKey ? (strings[explainKey] as ConceptExplanation | undefined) : undefined;

      // Give every affordance a distinct, meaningful name instead of 15
      // identical "Info" labels.
      if (concept?.title) {
        const label = escapeHtml(concept.title);
        btn.setAttribute('aria-label', label);
        btn.title = concept.title;
      }
      if (!btn.getAttribute('type')) {
        btn.setAttribute('type', 'button');
      }

      btn.addEventListener('click', (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        if (explainKey && concept) {
          ExplanationModal.show(concept);
        }
      });
    });
  }

  public static close(): void {
    if (ExplanationModal.dialogElement) {
      closeModalDialog(ExplanationModal.dialogElement);
    }
  }
}
