/**
 * Minimal hint strip at the bottom.
 */
export const mountHelpOverlay = (root: HTMLElement): void => {
  root.innerHTML = `
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-500">
      <span><kbd>LMB</kbd> paint</span>
      <span><kbd>Ctrl+Click</kbd> pipette</span>
      <span><kbd>RMB</kbd>/<kbd>Shift</kbd> erase</span>
      <span><kbd>Tab</kbd> shape</span>
      <span><kbd>Wheel</kbd> brush</span>
      <span><kbd>Ctrl+Wheel</kbd> zoom</span>
      <span><kbd>Mid</kbd>/<kbd>Alt+Drag</kbd> pan</span>
      <span><kbd>F</kbd> fit</span>
      <span><kbd>T</kbd> heat</span>
      <span><kbd>N</kbd> night</span>
      <span><kbd>C</kbd> clear</span>
    </div>
  `;
};
