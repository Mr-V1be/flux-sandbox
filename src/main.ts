import './styles.css';

import { Simulation } from './core/Simulation';
import {
  CELL_BUDGET_DESKTOP,
  CELL_BUDGET_MOBILE,
  EMPTY_ID,
  computeGridSize,
} from './core/constants';
import { registerAllElements } from './elements/definitions';
import { registryArray } from './elements/registry';
import { Renderer } from './rendering/Renderer';
import { Camera } from './rendering/Camera';
import { drawBrushCursor } from './rendering/BrushCursor';
import { buildVisualLookups } from './rendering/VisualLookups';
import { InputController } from './input/InputController';
import { Sidebar } from './ui/Sidebar';
import { Topbar } from './ui/Topbar';
import { mountHelpOverlay } from './ui/HelpOverlay';
import { store } from './state/Store';
import { getElement } from './core/types';
import { EventBus } from './effects/EventBus';
import { ParticleSystem } from './effects/Particles';
import { ScreenShake } from './effects/ScreenShake';
import { deserialize } from './state/Serializer';
import { showToast } from './ui/Toast';

/**
 * Bootstraps the app.
 * Wires Simulation <-> Camera <-> Renderer <-> Input <-> Effects <-> UI.
 */
const bootstrap = () => {
  registerAllElements();

  const app = document.getElementById('app');
  if (!app) throw new Error('missing #app');
  app.className = 'h-full w-full flex flex-col bg-[var(--color-bg)] text-neutral-200';

  app.innerHTML = `
    <header id="topbar"
      class="shrink-0 h-12 px-4 flex items-center justify-between border-b border-neutral-800/70 bg-[var(--color-bg-soft)]"
    ></header>
    <main class="flex-1 min-h-0 flex relative">
      <aside id="sidebar"
        class="w-60 shrink-0 border-r border-neutral-800/70 bg-[var(--color-bg-soft)] px-3 py-4 overflow-y-auto scroll-slim"
      ></aside>
      <div id="drawer-overlay"></div>
      <section class="flex-1 min-w-0 relative" id="stage">
        <canvas id="sim" class="sim absolute inset-0"></canvas>
      </section>
    </main>
    <footer id="help" class="shrink-0 h-8 px-3 flex items-center border-t border-neutral-800/70 bg-[var(--color-bg-soft)] overflow-x-auto scroll-slim"></footer>
  `;

  // ─── Effects ────────────────────────────────────────────────────────
  const bus = new EventBus();
  const particles = new ParticleSystem(1500);
  const shake = new ScreenShake();

  bus.on((e) => {
    switch (e.type) {
      case 'explosion':
        particles.spawn(e.x, e.y, {
          count: 12 + e.radius * 3,
          color: 0xffb84a,
          speed: 0.3 + e.radius * 0.15,
          life: 22 + e.radius,
          size: 1.2,
          gravity: 0.015,
        });
        particles.spawn(e.x, e.y, {
          count: 6 + e.radius,
          color: 0x5a5a62,
          speed: 0.15 + e.radius * 0.08,
          life: 40 + e.radius * 2,
          size: 1.5,
          gravity: -0.015,
        });
        shake.kick(e.radius * 4);
        renderer.kickFlash(Math.min(0.65, 0.12 + e.radius * 0.025));
        break;
      case 'ignition':
        particles.spawn(e.x, e.y, {
          count: 3,
          color: 0xffcc4a,
          speed: 0.4,
          life: 14,
          size: 0.8,
          gravity: -0.02,
        });
        break;
      case 'zap':
        particles.spawn(e.x, e.y, {
          count: 6,
          color: 0xfff0a6,
          speed: 0.7,
          life: 12,
          size: 0.8,
          gravity: 0,
        });
        break;
    }
  });

  // ─── Simulation + view ─────────────────────────────────────────────
  // Size the grid so its aspect matches the actual stage the user has
  // right now (portrait phone, landscape desktop, ultrawide, …) under a
  // per-device cell-count budget. We derive from window dimensions minus
  // the known chrome (topbar + footer + sidebar on desktop) because
  // `stage.clientHeight` may be zero before the flex layout settles.
  const stage = document.getElementById('stage') as HTMLElement;
  const isSmallDevice =
    window.matchMedia('(max-width: 767px), (pointer: coarse)').matches;
  const budget = isSmallDevice ? CELL_BUDGET_MOBILE : CELL_BUDGET_DESKTOP;
  const TOPBAR_H = 48;
  const FOOTER_H = 32;
  const SIDEBAR_W = 240;
  const availableW = window.innerWidth - (isSmallDevice ? 0 : SIDEBAR_W);
  const availableH = window.innerHeight - TOPBAR_H - FOOTER_H;
  const { w: gridW, h: gridH } = computeGridSize(availableW, availableH, budget);

  const simulation = new Simulation(
    { width: gridW, height: gridH, seed: Date.now() & 0xffffffff, bus },
    registryArray(),
  );

  const canvas = document.getElementById('sim') as HTMLCanvasElement;
  const camera = new Camera(gridW, gridH);
  const visualLookups = buildVisualLookups(registryArray());
  const renderer = new Renderer(
    canvas,
    simulation.grid,
    simulation.field,
    camera,
    visualLookups,
  );

  const syncCameraState = () => {
    const dpr = window.devicePixelRatio || 1;
    store.getState().setStats({ zoom: camera.zoom / dpr });
  };

  const fitCanvas = () => {
    const cssW = stage.clientWidth;
    const cssH = stage.clientHeight;
    const { pixelW, pixelH } = renderer.resize(cssW, cssH);
    camera.fit(pixelW, pixelH);
    syncCameraState();
  };

  const input = new InputController(
    canvas,
    simulation.grid,
    simulation.field,
    camera,
    syncCameraState,
  );

  const ro = new ResizeObserver(fitCanvas);
  ro.observe(stage);
  fitCanvas();

  // ─── UI ────────────────────────────────────────────────────────────
  new Sidebar(document.getElementById('sidebar') as HTMLElement);
  new Topbar(
    document.getElementById('topbar') as HTMLElement,
    simulation.grid,
    simulation.field,
    camera,
    () => {
      camera.fit(canvas.width, canvas.height);
      syncCameraState();
    },
  );
  mountHelpOverlay(document.getElementById('help') as HTMLElement);

  store.subscribe((s, prev) => {
    if (s.heatMode !== prev.heatMode) renderer.heatMode = s.heatMode;
    if (s.drawerOpen !== prev.drawerOpen) {
      document.body.dataset.drawerOpen = s.drawerOpen ? 'true' : 'false';
    }
  });

  // Overlay closes the drawer when tapped.
  const overlay = document.getElementById('drawer-overlay');
  overlay?.addEventListener('click', () => store.getState().setDrawerOpen(false));

  // If the URL carries an encoded state (e.g. from the Share button), load it.
  const hash = window.location.hash;
  if (hash.startsWith('#s=')) {
    const encoded = hash.slice(3);
    deserialize(encoded, simulation.grid, simulation.field)
      .then((res) => {
        if (res.ok) showToast('Loaded shared scene', 'success');
        else showToast(`Could not load scene: ${res.reason}`, 'error', 4000);
      })
      .catch((e) => showToast(`Load failed: ${e}`, 'error'));
  }

  // ─── Main loop ─────────────────────────────────────────────────────
  let lastTime = performance.now();
  let simAccumulator = 0;
  const simStep = 1000 / 60;
  let frames = 0;
  let fpsTimer = lastTime;

  const countActive = (): number => {
    const cells = simulation.grid.cells;
    let count = 0;
    for (let i = 0; i < cells.length; i++) {
      if (getElement(cells[i]) !== EMPTY_ID) count++;
    }
    return count;
  };

  const loop = (now: number) => {
    const dt = Math.min(64, now - lastTime);
    lastTime = now;
    simAccumulator += dt;

    const paused = store.getState().paused;
    let steps = 0;
    while (simAccumulator >= simStep && steps < 4) {
      if (!paused) simulation.step();
      simAccumulator -= simStep;
      steps++;
    }

    shake.update();
    particles.update();

    // Grid + bloom, overlays, then post-process — in that order so
    // the vignette and flash sit on top of particles and the cursor.
    renderer.renderGrid(shake.offsetX, shake.offsetY);
    particles.draw(renderer.context, camera);
    drawBrushCursor(renderer.context, camera, input.cursor, shake.offsetX, shake.offsetY);
    renderer.renderPostProcess();

    frames++;
    if (now - fpsTimer >= 500) {
      const fps = (frames * 1000) / (now - fpsTimer);
      frames = 0;
      fpsTimer = now;
      store.getState().setStats({
        fps,
        activeCells: countActive(),
        activeChunks: simulation.grid.activeChunkCount(),
        tick: simulation.tick,
      });
    }

    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};

bootstrap();
