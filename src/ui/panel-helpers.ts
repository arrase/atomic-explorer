export interface PanelCollapseState {
  left: boolean;
  right: boolean;
}

interface PanelElements {
  panel: HTMLElement;
  collapseBtn: HTMLElement;
  expandBtn: HTMLElement;
  showBtn: HTMLElement;
  closeBtn: HTMLElement;
}

function queryPanelElements(container: HTMLElement, key: string): PanelElements {
  return {
    panel: container.querySelector(`#${key}-panel`) as HTMLElement,
    collapseBtn: container.querySelector(`#btn-collapse-${key}`) as HTMLElement,
    expandBtn: container.querySelector(`#btn-expand-${key}`) as HTMLElement,
    showBtn: container.querySelector(`#btn-show-${key}`) as HTMLElement,
    closeBtn: container.querySelector(`#btn-close-${key}`) as HTMLElement,
  };
}

function bindCollapseToggle(
  { panel, collapseBtn, expandBtn }: PanelElements,
  onChange: (collapsed: boolean) => void,
): void {
  const apply = (collapsed: boolean) => {
    onChange(collapsed);
    panel.classList.toggle('collapsed', collapsed);
    expandBtn.classList.toggle('visible', collapsed);
    const expanded = String(!collapsed);
    collapseBtn.setAttribute('aria-expanded', expanded);
    expandBtn.setAttribute('aria-expanded', expanded);
  };

  collapseBtn.addEventListener('click', () => apply(true));
  expandBtn.addEventListener('click', () => apply(false));
}

/**
 * Binds desktop collapse/expand toggles and mobile dual drawers inside a dual-panel view.
 * Expects `#<key>-panel`, `#btn-{collapse|expand|show|close}-<key>`, `.physics-panel-container`, and `.mobile-drawer-backdrop`.
 */
export function bindDualWorkspacePanels(
  container: HTMLElement,
  leftKey: string,
  rightKey: string,
  collapseState: PanelCollapseState,
  onRightReveal?: () => void,
): void {
  const left = queryPanelElements(container, leftKey);
  const right = queryPanelElements(container, rightKey);
  const rightContainer = container.querySelector('.physics-panel-container') as HTMLElement;
  const backdrop = container.querySelector('.mobile-drawer-backdrop') as HTMLElement;

  bindCollapseToggle(left, (collapsed) => {
    collapseState.left = collapsed;
  });
  bindCollapseToggle(right, (collapsed) => {
    collapseState.right = collapsed;
    if (!collapsed) onRightReveal?.();
  });

  const closeAll = () => {
    left.panel.classList.remove('mobile-open');
    rightContainer.classList.remove('mobile-open');
    backdrop.classList.remove('active');
    left.showBtn.classList.remove('active');
    right.showBtn.classList.remove('active');
    left.showBtn.setAttribute('aria-expanded', 'false');
    right.showBtn.setAttribute('aria-expanded', 'false');
  };

  const toggleDrawer = (panel: HTMLElement, elements: PanelElements, onOpen?: () => void) => {
    if (panel.classList.contains('mobile-open')) {
      closeAll();
      return;
    }
    closeAll();
    panel.classList.add('mobile-open');
    backdrop.classList.add('active');
    elements.showBtn.classList.add('active');
    elements.showBtn.setAttribute('aria-expanded', 'true');
    elements.closeBtn.focus();
    onOpen?.();
  };

  left.showBtn.addEventListener('click', () => toggleDrawer(left.panel, left));
  right.showBtn.addEventListener('click', () => toggleDrawer(rightContainer, right, onRightReveal));
  left.closeBtn.addEventListener('click', closeAll);
  right.closeBtn.addEventListener('click', closeAll);
  backdrop.addEventListener('click', closeAll);
}
