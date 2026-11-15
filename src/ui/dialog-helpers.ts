let supportsDisplayTransition: boolean | undefined;

export function canTransitionDisplay(): boolean {
  if (supportsDisplayTransition !== undefined) return supportsDisplayTransition;
  if (!window.CSS?.supports?.('transition-behavior', 'allow-discrete') || !document.body) {
    supportsDisplayTransition = false;
    return false;
  }

  const probe = document.createElement('div');
  probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
  document.body.appendChild(probe);
  const initialDisplay = getComputedStyle(probe).display;
  probe.style.display = 'none';
  supportsDisplayTransition =
    initialDisplay === 'block' && getComputedStyle(probe).display === 'block';
  probe.remove();
  return supportsDisplayTransition;
}

export function supportsTopLayerExit(): boolean {
  return Boolean(window.CSS?.supports?.('overlay', 'auto')) && canTransitionDisplay();
}

export function wireModalDialogLifecycle(
  dialog: HTMLDialogElement,
  onRequestClose?: () => void,
): void {
  const requestClose = onRequestClose ?? (() => closeModalDialog(dialog));

  // Fallback for browsers without native `closedby="any"` backdrop light-dismiss.
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    let pointerStartedOutside = false;

    const isBackdropClick = (e: PointerEvent | MouseEvent): boolean => {
      if (e.target !== dialog) return false;
      const rect = dialog.getBoundingClientRect();
      return (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      );
    };

    dialog.addEventListener('pointerdown', (e: PointerEvent) => {
      pointerStartedOutside = isBackdropClick(e);
    });

    dialog.addEventListener('click', (e: MouseEvent) => {
      const dismiss = pointerStartedOutside && isBackdropClick(e);
      pointerStartedOutside = false;
      if (dismiss) {
        requestClose();
      }
    });
  }

  // Fallback for browsers (Firefox, Safari) lacking full `overlay` + `display` transitions.
  dialog.addEventListener('cancel', (e: Event) => {
    if (!supportsTopLayerExit()) {
      e.preventDefault();
      requestClose();
    }
  });
}

export function closeModalDialog(dialog: HTMLDialogElement): void {
  if (!dialog.open || 'closing' in dialog.dataset) {
    return;
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (supportsTopLayerExit() || reducedMotion) {
    dialog.close();
    return;
  }

  dialog.dataset.closing = '';
  const animations = dialog.getAnimations();
  if (animations.length === 0) {
    delete dialog.dataset.closing;
    dialog.close();
    return;
  }

  const finalizeClose = () => {
    delete dialog.dataset.closing;
    if (dialog.open) {
      dialog.close();
    }
  };

  Promise.race([
    Promise.allSettled(animations.map((a) => a.finished)),
    new Promise((resolve) => setTimeout(resolve, 350)),
  ]).then(finalizeClose, finalizeClose);
}

export async function waitDialogExitAnimations(dialog: HTMLDialogElement): Promise<void> {
  const animations = dialog.getAnimations();
  if (animations.length > 0) {
    await Promise.race([
      Promise.allSettled(animations.map((a) => a.finished)),
      new Promise((resolve) => setTimeout(resolve, 350)),
    ]);
  }
}
