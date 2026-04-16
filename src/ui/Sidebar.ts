import { listElements } from '@/elements/registry';
import { store } from '@/state/Store';
import { ElementDefinition } from '@/core/types';
import { recipesFor } from '@/state/Recipes';

const hexToCss = (hex: number): string =>
  `#${hex.toString(16).padStart(6, '0')}`;

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const categoryOrder: ElementDefinition['category'][] = [
  'empty',
  'powder',
  'liquid',
  'gas',
  'solid',
  'special',
];

const categoryLabel: Record<ElementDefinition['category'], string> = {
  empty: 'Tools',
  powder: 'Powders',
  liquid: 'Liquids',
  gas: 'Gases',
  solid: 'Solids',
  special: 'Reactive',
};

/**
 * Renders the element palette. Subscribes to the store to keep the
 * active element highlighted.
 */
export class Sidebar {
  private readonly root: HTMLElement;
  private buttons = new Map<string, HTMLButtonElement>();
  private query = '';
  private tooltip!: HTMLElement;
  private tooltipTarget: string | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.build();
    this.mountTooltip();
    store.subscribe((s, prev) => {
      if (s.selectedKey !== prev.selectedKey) this.updateSelection(s.selectedKey);
    });
    this.updateSelection(store.getState().selectedKey);
  }

  private build(): void {
    const elements = listElements();
    const grouped = new Map<ElementDefinition['category'], ElementDefinition[]>();
    for (const el of elements) {
      const arr = grouped.get(el.category) ?? [];
      arr.push(el);
      grouped.set(el.category, arr);
    }

    this.root.innerHTML = '';

    // Search input.
    const search = document.createElement('input');
    search.type = 'text';
    search.placeholder = 'Search…';
    search.className =
      'w-full mb-4 px-2.5 py-1.5 text-xs rounded-md bg-neutral-900/60 border border-neutral-800/80 text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600 transition-colors';
    search.addEventListener('input', () => {
      this.query = search.value.trim().toLowerCase();
      this.applyFilter();
    });
    this.root.appendChild(search);

    for (const cat of categoryOrder) {
      const items = grouped.get(cat);
      if (!items?.length) continue;

      const group = document.createElement('section');
      group.className = 'mb-4';

      const heading = document.createElement('h3');
      heading.className =
        'text-[10px] uppercase tracking-[0.18em] text-neutral-500 mb-2 px-1';
      heading.textContent = categoryLabel[cat];
      group.appendChild(heading);

      const gridEl = document.createElement('div');
      gridEl.className = 'grid grid-cols-2 gap-1.5';

      for (const el of items) {
        const btn = this.createButton(el);
        this.buttons.set(el.key, btn);
        gridEl.appendChild(btn);
      }

      group.appendChild(gridEl);
      this.root.appendChild(group);
    }
  }

  private createButton(el: ElementDefinition): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.key = el.key;
    btn.className =
      'group flex items-center gap-2 px-2 py-1.5 rounded-md border border-neutral-800/60 bg-neutral-900/40 hover:bg-neutral-800/60 text-left transition-colors text-xs';
    btn.title = el.description ?? el.label;

    const swatch = document.createElement('span');
    swatch.className =
      'h-3.5 w-3.5 rounded-sm shrink-0 ring-1 ring-inset ring-white/10';
    swatch.style.backgroundColor = hexToCss(el.color);
    btn.appendChild(swatch);

    const label = document.createElement('span');
    label.className = 'text-neutral-200 font-medium truncate';
    label.textContent = el.label;
    btn.appendChild(label);

    if (el.hotkey) {
      const kbd = document.createElement('span');
      kbd.className =
        'ml-auto text-[9px] uppercase tracking-wider text-neutral-500 border border-neutral-800 rounded px-1 py-[1px]';
      kbd.textContent = el.hotkey;
      btn.appendChild(kbd);
    }

    btn.addEventListener('click', () => {
      store.getState().setSelected(el.key);
      // Auto-close the drawer on mobile after picking an element.
      if (window.matchMedia('(max-width: 767px)').matches) {
        store.getState().setDrawerOpen(false);
      }
    });
    btn.addEventListener('mouseenter', () => this.showTooltip(el, btn));
    btn.addEventListener('mouseleave', () => this.hideTooltip(el.key));
    return btn;
  }

  private updateSelection(key: string): void {
    for (const [k, btn] of this.buttons) {
      if (k === key) {
        btn.classList.add('is-active');
      } else {
        btn.classList.remove('is-active');
      }
    }
  }

  private mountTooltip(): void {
    this.tooltip = document.createElement('div');
    this.tooltip.className =
      'recipe-tip fixed z-50 w-64 pointer-events-none opacity-0 transition-opacity duration-100';
    document.body.appendChild(this.tooltip);
  }

  private showTooltip(el: ElementDefinition, anchor: HTMLElement): void {
    this.tooltipTarget = el.key;
    const rect = anchor.getBoundingClientRect();
    const lines = recipesFor(el.key);
    const body = lines.length
      ? lines
          .map(
            (l) =>
              `<div class="text-[11px] text-neutral-300 leading-snug">${escapeHtml(l)}</div>`,
          )
          .join('')
      : `<div class="text-[11px] text-neutral-500 italic">No notable interactions.</div>`;
    const descr = el.description
      ? `<div class="text-[10px] text-neutral-500 mb-1.5">${escapeHtml(el.description)}</div>`
      : '';
    this.tooltip.innerHTML = `
      <div class="rounded-lg border border-neutral-800 bg-[var(--color-panel)]/95 backdrop-blur px-3 py-2 shadow-xl">
        <div class="flex items-center gap-2 mb-1">
          <span class="h-2.5 w-2.5 rounded-sm ring-1 ring-inset ring-white/10" style="background:${hexToCss(el.color)}"></span>
          <span class="text-xs font-semibold text-neutral-100">${escapeHtml(el.label)}</span>
          <span class="ml-auto text-[9px] uppercase tracking-wider text-neutral-500">${el.category}</span>
        </div>
        ${descr}
        <div class="flex flex-col gap-0.5 mt-1">${body}</div>
      </div>
    `;
    this.tooltip.style.left = `${rect.right + 8}px`;
    this.tooltip.style.top = `${Math.max(8, rect.top - 4)}px`;
    this.tooltip.style.opacity = '1';
  }

  private hideTooltip(key: string): void {
    if (this.tooltipTarget !== key) return;
    this.tooltipTarget = null;
    this.tooltip.style.opacity = '0';
  }

  private applyFilter(): void {
    const q = this.query;
    for (const [k, btn] of this.buttons) {
      const label = btn.textContent?.toLowerCase() ?? '';
      const visible = q === '' || label.includes(q) || k.includes(q);
      btn.style.display = visible ? '' : 'none';
    }
    // Hide empty category headings.
    this.root.querySelectorAll<HTMLElement>('section').forEach((section) => {
      const anyVisible = Array.from(section.querySelectorAll<HTMLButtonElement>('button'))
        .some((b) => b.style.display !== 'none');
      section.style.display = anyVisible ? '' : 'none';
    });
  }
}
