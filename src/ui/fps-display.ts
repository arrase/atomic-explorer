import { getStrings, onLanguageChange } from '../i18n';

export class FPSDisplay {
  private readonly container: HTMLElement;
  private lastTime: number = performance.now();
  private frames: number = 0;
  private readonly fpsValues: number[] = [];
  private currentEl!: HTMLElement;
  private avgEl!: HTMLElement;
  
  constructor(container: HTMLElement) {
    this.container = container;
    this.container.classList.add('fps-display');
    this.render();
    onLanguageChange(() => this.render());
    
    // Start update loop
    requestAnimationFrame(this.update);
  }

  private render(): void {
    const strings = getStrings();
    this.container.innerHTML = `
      <div>${strings.fps}: <span id="fps-current">0</span></div>
      <div class="fps-avg">${strings.avgFps}: <span id="fps-avg">0</span></div>
    `;
    this.currentEl = this.container.querySelector('#fps-current') as HTMLElement;
    this.avgEl = this.container.querySelector('#fps-avg') as HTMLElement;
  }

  private readonly update = (): void => {
    const now = performance.now();

    // Skip the work while the HUD is hidden (the periodic table tab, or a
    // backgrounded tab): a frame counter for a view nobody can see is not worth
    // a per-frame callback, and reading it back would be misleading anyway.
    const visible = !document.hidden && this.container.offsetParent !== null;
    if (visible) {
      this.frames++;
      if (now >= this.lastTime + 1000) {
        const fps = Math.round((this.frames * 1000) / (now - this.lastTime));

        this.fpsValues.push(fps);
        if (this.fpsValues.length > 10) {
          this.fpsValues.shift();
        }

        const avgFps = Math.round(
          this.fpsValues.reduce((a, b) => a + b, 0) / this.fpsValues.length
        );

        this.currentEl.textContent = String(fps);
        this.avgEl.textContent = String(avgFps);
        this.container.classList.remove('is-good', 'is-warn', 'is-bad');
        this.container.classList.add(
          avgFps >= 50 ? 'is-good' : avgFps >= 25 ? 'is-warn' : 'is-bad'
        );

        this.frames = 0;
        this.lastTime = now;
      }
    } else {
      // Restart the window cleanly so the next visible second is not averaged
      // together with the frames that elapsed while hidden.
      this.frames = 0;
      this.lastTime = now;
    }

    requestAnimationFrame(this.update);
  };
}
