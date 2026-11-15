export interface CollapsiblePanelOptions {
  panel: HTMLElement;
  collapseBtn: HTMLElement;
  expandBtn: HTMLElement;
  onChange: (collapsed: boolean) => void;
}

export function bindCollapsiblePanel({
  panel,
  collapseBtn,
  expandBtn,
  onChange,
}: CollapsiblePanelOptions): void {
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

export interface DualDrawerOptions {
  leftPanel: HTMLElement;
  rightContainer: HTMLElement;
  backdrop: HTMLElement;
  showLeftBtn: HTMLElement;
  showRightBtn: HTMLElement;
  closeLeftBtn: HTMLElement;
  closeRightBtn: HTMLElement;
  onOpenRight?: () => void;
}

export function bindDualMobileDrawers({
  leftPanel,
  rightContainer,
  backdrop,
  showLeftBtn,
  showRightBtn,
  closeLeftBtn,
  closeRightBtn,
  onOpenRight,
}: DualDrawerOptions): void {
  const closeAll = () => {
    leftPanel.classList.remove('mobile-open');
    rightContainer.classList.remove('mobile-open');
    backdrop.classList.remove('active');
    showLeftBtn.classList.remove('active');
    showRightBtn.classList.remove('active');
    showLeftBtn.setAttribute('aria-expanded', 'false');
    showRightBtn.setAttribute('aria-expanded', 'false');
  };

  const toggleDrawer = (
    panel: HTMLElement,
    trigger: HTMLElement,
    closeBtn: HTMLElement,
    onOpen?: () => void,
  ) => {
    if (panel.classList.contains('mobile-open')) {
      closeAll();
      return;
    }
    closeAll();
    panel.classList.add('mobile-open');
    backdrop.classList.add('active');
    trigger.classList.add('active');
    trigger.setAttribute('aria-expanded', 'true');
    closeBtn.focus();
    onOpen?.();
  };

  showLeftBtn.addEventListener('click', () =>
    toggleDrawer(leftPanel, showLeftBtn, closeLeftBtn),
  );
  showRightBtn.addEventListener('click', () =>
    toggleDrawer(rightContainer, showRightBtn, closeRightBtn, onOpenRight),
  );
  closeLeftBtn.addEventListener('click', closeAll);
  closeRightBtn.addEventListener('click', closeAll);
  backdrop.addEventListener('click', closeAll);
}
