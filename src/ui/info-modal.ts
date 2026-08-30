import { ConceptExplanation, getStrings } from '../i18n';
import { icon } from './icons';

export class ExplanationModal {
  private static overlayElement: HTMLElement | null = null;
  private static keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  public static show(info: ConceptExplanation, options?: { showDontShowAgain?: boolean, storageKey?: string }): void {
    ExplanationModal.close();

    const strings = getStrings();

    const overlay = document.createElement('div');
    overlay.className = 'glass-modal-overlay info-modal-overlay';

    const card = document.createElement('div');
    card.className = 'glass-modal-card info-modal-card';

    const analogyHtml = info.analogy
      ? `<div class="info-modal-analogy">
           <div class="analogy-label">${icon('help')} <span>${strings.analogyLabel}:</span></div>
           <p>${info.analogy}</p>
         </div>`
      : '';

    card.innerHTML = `
      <div class="glass-modal-header">
        <div class="panel-title-group">
          <span class="panel-header-icon">${icon('info')}</span>
          <h3 class="glass-modal-title">${info.title}</h3>
        </div>
        <button class="btn-close-modal" aria-label="${strings.infoModalClose || 'Close'}">${icon('close')}</button>
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
            ${strings.dontShowAgain || "Don't show again"}
          </label>
        ` : ''}
        <button class="btn-primary info-modal-close-btn">${strings.infoModalClose || 'Close'}</button>
      </div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    ExplanationModal.overlayElement = overlay;

    const closeBtn = card.querySelector('.btn-close-modal') as HTMLElement;
    const footerCloseBtn = card.querySelector('.info-modal-close-btn') as HTMLElement;

    const handleClose = () => {
      if (options?.showDontShowAgain && options?.storageKey) {
        const checkbox = card.querySelector('#dont-show-again-checkbox') as HTMLInputElement;
        if (checkbox && checkbox.checked) {
          localStorage.setItem(options.storageKey, 'true');
        }
      }
      ExplanationModal.close();
    };

    closeBtn.addEventListener('click', handleClose);
    footerCloseBtn.addEventListener('click', handleClose);

    overlay.addEventListener('click', (e: MouseEvent) => {
      if (e.target === overlay) {
        handleClose();
      }
    });

    ExplanationModal.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    document.addEventListener('keydown', ExplanationModal.keydownHandler);
  }

  public static showSimple(title: string, summary: string, detail: string): void {
    ExplanationModal.show({ title, summary, detail });
  }

  public static close(): void {
    if (ExplanationModal.keydownHandler) {
      document.removeEventListener('keydown', ExplanationModal.keydownHandler);
      ExplanationModal.keydownHandler = null;
    }

    if (ExplanationModal.overlayElement) {
      const overlay = ExplanationModal.overlayElement;
      ExplanationModal.overlayElement = null;

      overlay.classList.add('fade-out');

      const cleanup = () => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      };

      overlay.addEventListener('animationend', cleanup, { once: true });
      setTimeout(cleanup, 300);
    }
  }
}

