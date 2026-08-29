import { getStrings, onLanguageChange } from '../i18n';

export class FPSDisplay {
  private container: HTMLElement;
  private lastTime: number = performance.now();
  private frames: number = 0;
  private fpsValues: number[] = [];
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

  private update = (): void => {
    this.frames++;
    const now = performance.now();
    
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
      
      this.frames = 0;
      this.lastTime = now;
    }
    
    requestAnimationFrame(this.update);
  };
}
