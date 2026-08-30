import { getStrings, onLanguageChange } from '../i18n';
import { icon } from './icons';

export interface ViewportHUDCallbacks {
  onResetCamera: () => void;
  onToggleAutoRotate: () => void;
  onToggleZenMode: () => void;
}

export class ViewportHUD {
  private container: HTMLElement;
  private callbacks: ViewportHUDCallbacks;
  private isAutoRotating: boolean = false;
  private scaleText: string = '1 a₀ = 52.9 pm';

  constructor(parent: HTMLElement, callbacks: ViewportHUDCallbacks) {
    this.callbacks = callbacks;

    this.container = document.createElement('div');
    this.container.className = 'viewport-hud';
    parent.appendChild(this.container);

    this.render();
    onLanguageChange(() => this.render());
  }

  private render(): void {
    const strings = getStrings();

    this.container.innerHTML = `
      <div class="hud-group">
        <button type="button" class="hud-btn" id="hud-btn-reset" title="${strings.hudResetCamera}" aria-label="${strings.hudResetCamera}" data-tooltip="${strings.hudResetCamera}">
          ${icon('rotate-ccw')}
        </button>

        <button type="button" class="hud-btn ${this.isAutoRotating ? 'active' : ''}" id="hud-btn-turntable" title="${strings.hudTurntable}" aria-label="${strings.hudTurntable}" data-tooltip="${strings.hudTurntable}">
          ${icon('turntable')}
        </button>
      </div>

      <div class="hud-divider"></div>

      <div class="hud-scale-badge" id="hud-scale-badge" title="${strings.hudScale}">
        <span class="scale-icon">${icon('grid')}</span>
        <span class="scale-label">${this.scaleText}</span>
      </div>

      <div class="hud-divider"></div>

      <div class="hud-group">
        <button type="button" class="hud-btn" id="hud-btn-zen" title="${strings.hudZenMode}" aria-label="${strings.hudZenMode}" data-tooltip="${strings.hudZenMode}">
          ${icon('zen')}
        </button>
      </div>
    `;

    this.attachEvents();
  }

  private attachEvents(): void {
    const btnReset = this.container.querySelector('#hud-btn-reset');
    const btnTurntable = this.container.querySelector('#hud-btn-turntable');
    const btnZen = this.container.querySelector('#hud-btn-zen');

    if (btnReset) {
      btnReset.addEventListener('click', (e) => {
        e.stopPropagation();
        this.callbacks.onResetCamera();
      });
    }

    if (btnTurntable) {
      btnTurntable.addEventListener('click', (e) => {
        e.stopPropagation();
        this.callbacks.onToggleAutoRotate();
      });
    }

    if (btnZen) {
      btnZen.addEventListener('click', (e) => {
        e.stopPropagation();
        this.callbacks.onToggleZenMode();
      });
    }
  }

  public setAutoRotateState(active: boolean): void {
    this.isAutoRotating = active;
    const btnTurntable = this.container.querySelector('#hud-btn-turntable');
    if (btnTurntable) {
      btnTurntable.classList.toggle('active', active);
    }
  }

  public updateScale(text: string): void {
    this.scaleText = text;
    const label = this.container.querySelector('.scale-label');
    if (label) {
      label.textContent = text;
    }
  }

  public setVisible(visible: boolean): void {
    this.container.style.display = visible ? 'flex' : 'none';
  }

  public destroy(): void {
    this.container.remove();
  }
}
