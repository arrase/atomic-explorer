import { getStrings, onLanguageChange } from '../i18n';

export class FPSDisplay {
  private container: HTMLElement;
  private lastTime: number = performance.now();
  private frames: number = 0;
  private fpsValues: number[] = [];
  
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
      
      const currentEl = this.container.querySelector('#fps-current');
      const avgEl = this.container.querySelector('#fps-avg');
      
      if (currentEl) currentEl.textContent = fps.toString();
      if (avgEl) avgEl.textContent = avgFps.toString();
      
      this.frames = 0;
      this.lastTime = now;
    }
    
    requestAnimationFrame(this.update);
  }
}
