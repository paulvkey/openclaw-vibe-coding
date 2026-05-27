(() => {
  'use strict';

  const COLS = 24;
  const ROWS = 24;
  const BASE_TICK_MS = 130;
  const MIN_TICK_MS = 55;
  const STORAGE_KEY = 'neon-snake-high-score';

  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const highScoreEl = document.getElementById('highScore');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayText = document.getElementById('overlayText');
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const restartBtn = document.getElementById('restartBtn');
  const touchPad = document.getElementById('touchPad');
  const scoreCard = scoreEl.parentElement;
  const bestCard = highScoreEl.parentElement;

  let cellSize = 0;
  function fitCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cellSize = rect.width / COLS;
  }
  window.addEventListener('resize', () => { fitCanvas(); draw(); });

  const STATE = { READY: 'ready', RUNNING: 'running', PAUSED: 'paused', OVER: 'over' };

  const game = {
    snake: [],
    dir: { x: 1, y: 0 },
    nextDir: { x: 1, y: 0 },
    food: null,
    score: 0,
    highScore: Number(localStorage.getItem(STORAGE_KEY)) || 0,
    state: STATE.READY,
    tickMs: BASE_TICK_MS,
    lastTickAt: 0,
    rafId: null,
    tween: 0,
    foodPulse: 0,
    deathFlash: 0,
  };

  highScoreEl.textContent = game.highScore;

  function reset() {
    const cx = Math.floor(COLS / 2);
    const cy = Math.floor(ROWS / 2);
    game.snake = [
      { x: cx,     y: cy },
      { x: cx - 1, y: cy },
      { x: cx - 2, y: cy },
    ];
    game.dir = { x: 1, y: 0 };
    game.nextDir = { x: 1, y: 0 };
    game.score = 0;
    game.tickMs = BASE_TICK_MS;
    game.tween = 0;
    game.deathFlash = 0;
    placeFood();
    updateScore(false);
  }

  function placeFood() {
    const occupied = new Set(game.snake.map(s => s.x + ',' + s.y));
    const free = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!occupied.has(x + ',' + y)) free.push({ x, y });
      }
    }
    game.food = free.length ? free[Math.floor(Math.random() * free.length)] : null;
  }

  function setDir(x, y) {
    if (game.state !== STATE.RUNNING && game.state !== STATE.READY) return;
    if (x === -game.dir.x && y === -game.dir.y) return;
    if (x === game.dir.x && y === game.dir.y) return;
    game.nextDir = { x, y };
  }

  function step() {
    game.dir = game.nextDir;
    const head = game.snake[0];
    const newHead = { x: head.x + game.dir.x, y: head.y + game.dir.y };

    if (newHead.x < 0 || newHead.x >= COLS || newHead.y < 0 || newHead.y >= ROWS) {
      return gameOver();
    }
    for (let i = 0; i < game.snake.length - 1; i++) {
      if (game.snake[i].x === newHead.x && game.snake[i].y === newHead.y) {
        return gameOver();
      }
    }

    game.snake.unshift(newHead);

    if (game.food && newHead.x === game.food.x && newHead.y === game.food.y) {
      game.score += 1;
      updateScore(true);
      if (game.score % 5 === 0) {
        game.tickMs = Math.max(MIN_TICK_MS, game.tickMs - 8);
      }
      placeFood();
    } else {
      game.snake.pop();
    }
  }

  function updateScore(bump) {
    scoreEl.textContent = game.score;
    if (bump) {
      scoreCard.classList.remove('bump');
      void scoreCard.offsetWidth;
      scoreCard.classList.add('bump');
    }
    if (game.score > game.highScore) {
      game.highScore = game.score;
      highScoreEl.textContent = game.highScore;
      localStorage.setItem(STORAGE_KEY, String(game.highScore));
      if (bump) {
        bestCard.classList.remove('bump');
        void bestCard.offsetWidth;
        bestCard.classList.add('bump');
      }
    }
  }

  function gameOver() {
    game.state = STATE.OVER;
    game.deathFlash = 1;
    const newBest = game.score === game.highScore && game.score > 0;
    showOverlay(
      'Game Over',
      'You scored <strong>' + game.score + '</strong>' + (newBest ? ' &mdash; new best!' : '') +
      '<br /><br />Press <kbd>Space</kbd> or tap below to play again',
      'Play Again',
      true
    );
  }

  function showOverlay(title, html, btnLabel, isOver) {
    overlayTitle.textContent = title;
    overlayTitle.classList.toggle('gameover', !!isOver);
    overlayText.innerHTML = html;
    startBtn.textContent = btnLabel;
    overlay.classList.remove('hidden');
  }
  function hideOverlay() {
    overlay.classList.add('hidden');
  }

  function startGame() {
    if (game.state === STATE.OVER || game.state === STATE.READY) {
      reset();
    }
    game.state = STATE.RUNNING;
    game.lastTickAt = performance.now();
    hideOverlay();
  }

  function togglePause() {
    if (game.state === STATE.RUNNING) {
      game.state = STATE.PAUSED;
      showOverlay('Paused', 'Press <kbd>Space</kbd> to resume', 'Resume', false);
    } else if (game.state === STATE.PAUSED) {
      startGame();
    } else if (game.state === STATE.OVER || game.state === STATE.READY) {
      startGame();
    }
  }

  function draw() {
    const w = canvas.getBoundingClientRect().width;
    const h = canvas.getBoundingClientRect().height;
    ctx.clearRect(0, 0, w, h);

    drawGrid(w, h);
    drawFood();
    drawSnake();

    if (game.deathFlash > 0) {
      ctx.fillStyle = 'rgba(255, 77, 109, ' + (game.deathFlash * 0.35) + ')';
      ctx.fillRect(0, 0, w, h);
      game.deathFlash = Math.max(0, game.deathFlash - 0.04);
    }
  }

  function drawGrid(w, h) {
    ctx.save();
    ctx.strokeStyle = 'rgba(94, 234, 212, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 1; i < COLS; i++) {
      const x = Math.round(i * cellSize) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let i = 1; i < ROWS; i++) {
      const y = Math.round(i * cellSize) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.restore();
  }

  function drawFood() {
    if (!game.food) return;
    const cx = (game.food.x + 0.5) * cellSize;
    const cy = (game.food.y + 0.5) * cellSize;
    const baseR = cellSize * 0.32;
    const pulse = baseR + Math.sin(game.foodPulse) * cellSize * 0.06;

    ctx.save();
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, cellSize * 1.4);
    glow.addColorStop(0, 'rgba(244, 114, 182, 0.55)');
    glow.addColorStop(0.5, 'rgba(244, 114, 182, 0.18)');
    glow.addColorStop(1, 'rgba(244, 114, 182, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - cellSize * 1.5, cy - cellSize * 1.5, cellSize * 3, cellSize * 3);

    const grad = ctx.createRadialGradient(cx - pulse * 0.3, cy - pulse * 0.3, 0, cx, cy, pulse);
    grad.addColorStop(0, '#ffe0f1');
    grad.addColorStop(0.5, '#f472b6');
    grad.addColorStop(1, '#be185d');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.arc(cx - pulse * 0.35, cy - pulse * 0.35, pulse * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSnake() {
    const t = game.state === STATE.RUNNING ? game.tween : 1;
    const offX = (game.dir.x * (1 - t)) * cellSize;
    const offY = (game.dir.y * (1 - t)) * cellSize;
    const len = game.snake.length;

    for (let i = len - 1; i >= 0; i--) {
      const seg = game.snake[i];
      let x = seg.x * cellSize;
      let y = seg.y * cellSize;
      if (i === 0) { x -= offX; y -= offY; }
      else if (i === len - 1 && len > 1) {
        const next = game.snake[i - 1];
        const dx = seg.x - next.x;
        const dy = seg.y - next.y;
        x -= dx * (1 - t) * cellSize;
        y -= dy * (1 - t) * cellSize;
      }

      const ratio = i / Math.max(1, len - 1);
      drawSegment(x, y, cellSize, ratio, i === 0);
    }
  }

  function drawSegment(x, y, size, ratio, isHead) {
    const pad = size * 0.08;
    const sz = size - pad * 2;
    const r = sz * 0.28;

    const headColor = '#5eead4';
    const tailColor = '#38bdf8';
    const color = lerpColor(headColor, tailColor, ratio);

    ctx.save();
    if (isHead) {
      ctx.shadowBlur = 16;
      ctx.shadowColor = 'rgba(94, 234, 212, 0.65)';
    }

    const grad = ctx.createLinearGradient(x, y, x + size, y + size);
    grad.addColorStop(0, lighten(color, 0.18));
    grad.addColorStop(1, color);
    ctx.fillStyle = grad;
    roundRect(ctx, x + pad, y + pad, sz, sz, r);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    roundRect(ctx, x + pad + sz * 0.18, y + pad + sz * 0.12, sz * 0.5, sz * 0.18, r * 0.6);
    ctx.fill();

    if (isHead) {
      drawSnakeEyes(x, y, size);
    }
    ctx.restore();
  }

  function drawSnakeEyes(x, y, size) {
    const dir = game.dir;
    const cx = x + size / 2;
    const cy = y + size / 2;
    const off = size * 0.18;
    const eyeR = size * 0.09;

    let e1, e2;
    if (dir.x !== 0) {
      const fx = cx + dir.x * size * 0.18;
      e1 = { x: fx, y: cy - off };
      e2 = { x: fx, y: cy + off };
    } else {
      const fy = cy + dir.y * size * 0.18;
      e1 = { x: cx - off, y: fy };
      e2 = { x: cx + off, y: fy };
    }

    ctx.fillStyle = '#06121a';
    ctx.beginPath(); ctx.arc(e1.x, e1.y, eyeR, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(e2.x, e2.y, eyeR, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath(); ctx.arc(e1.x + eyeR * 0.25, e1.y - eyeR * 0.25, eyeR * 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(e2.x + eyeR * 0.25, e2.y - eyeR * 0.25, eyeR * 0.35, 0, Math.PI * 2); ctx.fill();
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y,     x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x,     y + h, rr);
    ctx.arcTo(x,     y + h, x,     y,     rr);
    ctx.arcTo(x,     y,     x + w, y,     rr);
    ctx.closePath();
  }

  function lerpColor(a, b, t) {
    const ca = hexToRgb(a);
    const cb = hexToRgb(b);
    const r = Math.round(ca.r + (cb.r - ca.r) * t);
    const g = Math.round(ca.g + (cb.g - ca.g) * t);
    const bl = Math.round(ca.b + (cb.b - ca.b) * t);
    return 'rgb(' + r + ', ' + g + ', ' + bl + ')';
  }
  function lighten(rgb, amt) {
    const m = rgb.match(/\d+/g);
    if (!m) return rgb;
    const r = Math.min(255, Math.round(+m[0] + (255 - +m[0]) * amt));
    const g = Math.min(255, Math.round(+m[1] + (255 - +m[1]) * amt));
    const b = Math.min(255, Math.round(+m[2] + (255 - +m[2]) * amt));
    return 'rgb(' + r + ', ' + g + ', ' + b + ')';
  }
  function hexToRgb(hex) {
    const v = hex.replace('#', '');
    return { r: parseInt(v.slice(0, 2), 16), g: parseInt(v.slice(2, 4), 16), b: parseInt(v.slice(4, 6), 16) };
  }

  function loop(now) {
    game.foodPulse += 0.08;
    if (game.state === STATE.RUNNING) {
      const elapsed = now - game.lastTickAt;
      game.tween = Math.min(1, elapsed / game.tickMs);
      if (elapsed >= game.tickMs) {
        step();
        game.lastTickAt = now;
        game.tween = 0;
      }
    }
    draw();
    game.rafId = requestAnimationFrame(loop);
  }

  const keyMap = {
    ArrowUp: [0, -1], KeyW: [0, -1],
    ArrowDown: [0, 1], KeyS: [0, 1],
    ArrowLeft: [-1, 0], KeyA: [-1, 0],
    ArrowRight: [1, 0], KeyD: [1, 0],
  };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      togglePause();
      return;
    }
    const dir = keyMap[e.code];
    if (dir) {
      e.preventDefault();
      if (game.state === STATE.READY) startGame();
      setDir(dir[0], dir[1]);
    }
  });

  startBtn.addEventListener('click', () => togglePause());
  pauseBtn.addEventListener('click', () => togglePause());
  restartBtn.addEventListener('click', () => {
    reset();
    game.state = STATE.READY;
    showOverlay('Ready?', 'Use <kbd>arrows</kbd> / <kbd>WASD</kbd> to move<br /><kbd>Space</kbd> to pause or restart', 'Start Game', false);
  });

  touchPad.querySelectorAll('.dpad').forEach(btn => {
    const handler = (e) => {
      e.preventDefault();
      if (game.state === STATE.READY || game.state === STATE.OVER) startGame();
      const map = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
      const dir = map[btn.dataset.dir];
      setDir(dir[0], dir[1]);
    };
    btn.addEventListener('click', handler);
    btn.addEventListener('touchstart', handler, { passive: false });
  });

  let tStart = null;
  const SWIPE_MIN = 22;
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    tStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  canvas.addEventListener('touchend', (e) => {
    if (!tStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - tStart.x;
    const dy = t.clientY - tStart.y;
    tStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
    if (game.state === STATE.READY || game.state === STATE.OVER) startGame();
    if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0);
    else setDir(0, dy > 0 ? 1 : -1);
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === STATE.RUNNING) togglePause();
  });

  fitCanvas();
  reset();
  game.state = STATE.READY;
  game.rafId = requestAnimationFrame(loop);
})();
