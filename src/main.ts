import './styles.css';

import { Simulation } from './core/Simulation';
import { DEFAULT_HEIGHT, DEFAULT_WIDTH, EMPTY_ID } from './core/constants';
import { registerAllElements } from './elements/definitions';
import { registryArray } from './elements/registry';
import { Renderer } from './rendering/Renderer';
import { Camera } from './rendering/Camera';
import { drawBrushCursor } from './rendering/BrushCursor';
import { InputController } from './input/InputController';
import { Sidebar } from './ui/Sidebar';
import { Topbar } from './ui/Topbar';
import { mountHelpOverlay } from './ui/HelpOverlay';
import { store } from './state/Store';
import { getElement } from './core/types';
import { EventBus } from './effects/EventBus';
import { ParticleSystem } from './effects/Particles';
import { ScreenShake } from './effects/ScreenShake';

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
    <main class="flex-1 min-h-0 flex">
      <aside id="sidebar"
        class="w-60 shrink-0 border-r border-neutral-800/70 bg-[var(--color-bg-soft)] px-3 py-4 overflow-y-auto scroll-slim"
      ></aside>
      <section class="flex-1 min-w-0 relative" id="stage">
        <canvas id="sim" class="sim absolute inset-0"></canvas>
      </section>
    </main>
    <footer id="help" class="shrink-0 h-8 px-4 flex items-center border-t border-neutral-800/70 bg-[var(--color-bg-soft)]"></footer>
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
  const simulation = new Simulation(
    { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, seed: Date.now() & 0xffffffff, bus },
    registryArray(),
  );

  const canvas = document.getElementById('sim') as HTMLCanvasElement;
  const stage = document.getElementById('stage') as HTMLElement;
  const camera = new Camera(DEFAULT_WIDTH, DEFAULT_HEIGHT);
  const renderer = new Renderer(canvas, simulation.grid, simulation.field, camera);

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
    if (s.showTemperature !== prev.showTemperature) renderer.showTemperature = s.showTemperature;
  });

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

    renderer.render(shake.offsetX, shake.offsetY);
    particles.draw(renderer.context, camera);
    drawBrushCursor(renderer.context, camera, input.cursor, shake.offsetX, shake.offsetY);

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
