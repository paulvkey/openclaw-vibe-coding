(() => {
  "use strict";

  const COLS = 10;
  const ROWS = 20;
  const CELL = 30;
  const PREVIEW_CELL = 24;
  const STORAGE_KEY = "neon-tetris-best";

  const TETROMINOES = {
    I: {
      color: "#00f0ff",
      shapes: [
        [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
        [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
        [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
        [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]],
      ],
    },
    O: {
      color: "#ffe629",
      shapes: [
        [[1,1],[1,1]],
        [[1,1],[1,1]],
        [[1,1],[1,1]],
        [[1,1],[1,1]],
      ],
    },
    T: {
      color: "#b94dff",
      shapes: [
        [[0,1,0],[1,1,1],[0,0,0]],
        [[0,1,0],[0,1,1],[0,1,0]],
        [[0,0,0],[1,1,1],[0,1,0]],
        [[0,1,0],[1,1,0],[0,1,0]],
      ],
    },
    S: {
      color: "#39ff14",
      shapes: [
        [[0,1,1],[1,1,0],[0,0,0]],
        [[0,1,0],[0,1,1],[0,0,1]],
        [[0,0,0],[0,1,1],[1,1,0]],
        [[1,0,0],[1,1,0],[0,1,0]],
      ],
    },
    Z: {
      color: "#ff3860",
      shapes: [
        [[1,1,0],[0,1,1],[0,0,0]],
        [[0,0,1],[0,1,1],[0,1,0]],
        [[0,0,0],[1,1,0],[0,1,1]],
        [[0,1,0],[1,1,0],[1,0,0]],
      ],
    },
    J: {
      color: "#2979ff",
      shapes: [
        [[1,0,0],[1,1,1],[0,0,0]],
        [[0,1,1],[0,1,0],[0,1,0]],
        [[0,0,0],[1,1,1],[0,0,1]],
        [[0,1,0],[0,1,0],[1,1,0]],
      ],
    },
    L: {
      color: "#ff9a1f",
      shapes: [
        [[0,0,1],[1,1,1],[0,0,0]],
        [[0,1,0],[0,1,0],[0,1,1]],
        [[0,0,0],[1,1,1],[1,0,0]],
        [[1,1,0],[0,1,0],[0,1,0]],
      ],
    },
  };

  const PIECE_TYPES = Object.keys(TETROMINOES);

  const SCORE_TABLE = [0, 100, 300, 500, 800];

  const board = document.getElementById("board");
  const ctx = board.getContext("2d");
  const nextCanvas = document.getElementById("nextCanvas");
  const nextCtx = nextCanvas.getContext("2d");
  const holdCanvas = document.getElementById("holdCanvas");
  const holdCtx = holdCanvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const highEl = document.getElementById("highScore");
  const levelEl = document.getElementById("level");
  const linesEl = document.getElementById("lines");

  const overlay = document.getElementById("overlay");
  const overlayCard = document.getElementById("overlayCard");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayText = document.getElementById("overlayText");
  const startBtn = document.getElementById("startBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const restartBtn = document.getElementById("restartBtn");
  const boardWrap = document.querySelector(".board-wrap");
  const touchPad = document.getElementById("touchPad");

  const state = {
    grid: createGrid(),
    current: null,
    next: null,
    hold: null,
    canHold: true,
    bag: [],
    score: 0,
    high: parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10) || 0,
    level: 1,
    lines: 0,
    dropTimer: 0,
    dropInterval: 1000,
    lastFrame: 0,
    running: false,
    paused: false,
    gameOver: false,
    flashRows: [],
    flashTimer: 0,
  };

  function createGrid() {
    const grid = [];
    for (let y = 0; y < ROWS; y++) {
      grid.push(new Array(COLS).fill(null));
    }
    return grid;
  }

  function refillBag() {
    const bag = PIECE_TYPES.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    state.bag.push(...bag);
  }

  function nextType() {
    if (state.bag.length === 0) refillBag();
    return state.bag.shift();
  }

  function makePiece(type) {
    const def = TETROMINOES[type];
    const shape = def.shapes[0];
    const x = Math.floor((COLS - shape.length) / 2);
    return { type, color: def.color, rotation: 0, x, y: -getTopOffset(shape) };
  }

  function getTopOffset(shape) {
    for (let r = 0; r < shape.length; r++) {
      if (shape[r].some(v => v)) return r;
    }
    return 0;
  }

  function getShape(piece) {
    return TETROMINOES[piece.type].shapes[piece.rotation];
  }

  function collides(piece, dx = 0, dy = 0, rotation = piece.rotation) {
    const shape = TETROMINOES[piece.type].shapes[rotation];
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const nx = piece.x + c + dx;
        const ny = piece.y + r + dy;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && state.grid[ny][nx]) return true;
      }
    }
    return false;
  }

  function rotate(dir = 1) {
    if (!state.current) return;
    const p = state.current;
    const newRot = (p.rotation + dir + 4) % 4;
    const kicks = [0, -1, 1, -2, 2];
    for (const k of kicks) {
      if (!collides(p, k, 0, newRot)) {
        p.x += k;
        p.rotation = newRot;
        return;
      }
    }
  }

  function move(dx) {
    if (!state.current) return;
    if (!collides(state.current, dx, 0)) state.current.x += dx;
  }

  function softDrop() {
    if (!state.current) return false;
    if (!collides(state.current, 0, 1)) {
      state.current.y += 1;
      state.score += 1;
      updateHud();
      return true;
    }
    lockPiece();
    return false;
  }

  function hardDrop() {
    if (!state.current) return;
    let dist = 0;
    while (!collides(state.current, 0, 1)) {
      state.current.y += 1;
      dist += 1;
    }
    state.score += dist * 2;
    lockPiece();
  }

  function lockPiece() {
    const p = state.current;
    const shape = getShape(p);
    let topOut = false;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const x = p.x + c;
        const y = p.y + r;
        if (y < 0) {
          topOut = true;
          continue;
        }
        state.grid[y][x] = p.color;
      }
    }
    state.current = null;

    if (topOut) {
      endGame();
      return;
    }

    const cleared = clearLines();
    if (cleared > 0) {
      state.score += SCORE_TABLE[cleared] * state.level;
      state.lines += cleared;
      const newLevel = Math.floor(state.lines / 10) + 1;
      if (newLevel !== state.level) {
        state.level = newLevel;
        state.dropInterval = Math.max(80, 1000 - (state.level - 1) * 80);
      }
      flashBoard();
    }

    if (state.score > state.high) {
      state.high = state.score;
      localStorage.setItem(STORAGE_KEY, String(state.high));
    }

    updateHud();
    spawn();
    state.canHold = true;
  }

  function clearLines() {
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (state.grid[y].every(v => v !== null)) {
        state.grid.splice(y, 1);
        state.grid.unshift(new Array(COLS).fill(null));
        cleared += 1;
        y += 1;
      }
    }
    return cleared;
  }

  function spawn() {
    if (!state.next) state.next = makePiece(nextType());
    state.current = state.next;
    state.next = makePiece(nextType());
    if (collides(state.current, 0, 0)) {
      endGame();
      return;
    }
    drawNext();
  }

  function holdPiece() {
    if (!state.current || !state.canHold) return;
    const curType = state.current.type;
    if (state.hold) {
      const swapType = state.hold;
      state.hold = curType;
      state.current = makePiece(swapType);
    } else {
      state.hold = curType;
      state.current = state.next;
      state.next = makePiece(nextType());
      drawNext();
    }
    state.canHold = false;
    drawHold();
  }

  function ghostY(piece) {
    let dy = 0;
    while (!collides(piece, 0, dy + 1)) dy += 1;
    return piece.y + dy;
  }

  function drawCell(c, x, y, color, opts = {}) {
    const px = x * CELL;
    const py = y * CELL;
    const size = CELL;
    const inner = opts.inner ?? 2;

    if (opts.ghost) {
      c.save();
      c.globalAlpha = 0.22;
      c.strokeStyle = color;
      c.lineWidth = 2;
      c.strokeRect(px + inner, py + inner, size - inner * 2, size - inner * 2);
      c.fillStyle = color;
      c.globalAlpha = 0.08;
      c.fillRect(px + inner, py + inner, size - inner * 2, size - inner * 2);
      c.restore();
      return;
    }

    const grad = c.createLinearGradient(px, py, px + size, py + size);
    grad.addColorStop(0, lighten(color, 0.35));
    grad.addColorStop(1, color);

    c.save();
    c.shadowColor = color;
    c.shadowBlur = opts.glow ?? 14;
    c.fillStyle = grad;
    roundRect(c, px + inner, py + inner, size - inner * 2, size - inner * 2, 5);
    c.fill();
    c.restore();

    c.save();
    c.strokeStyle = lighten(color, 0.55);
    c.lineWidth = 1.5;
    roundRect(c, px + inner + 1, py + inner + 1, size - inner * 2 - 2, size - inner * 2 - 2, 4);
    c.stroke();
    c.restore();

    c.save();
    c.globalAlpha = 0.4;
    c.fillStyle = "#ffffff";
    c.fillRect(px + inner + 4, py + inner + 4, size - inner * 2 - 10, 3);
    c.restore();
  }

  function roundRect(c, x, y, w, h, r) {
    if (w <= 0 || h <= 0) return;
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }

  function lighten(hex, amount) {
    const m = hex.replace("#", "");
    const num = parseInt(m, 16);
    let r = (num >> 16) & 255;
    let g = (num >> 8) & 255;
    let b = num & 255;
    r = Math.round(r + (255 - r) * amount);
    g = Math.round(g + (255 - g) * amount);
    b = Math.round(b + (255 - b) * amount);
    return `rgb(${r}, ${g}, ${b})`;
  }

  function drawGrid() {
    ctx.save();
    ctx.strokeStyle = "rgba(0, 240, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let x = 1; x < COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL + 0.5, 0);
      ctx.lineTo(x * CELL + 0.5, ROWS * CELL);
      ctx.stroke();
    }
    for (let y = 1; y < ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL + 0.5);
      ctx.lineTo(COLS * CELL, y * CELL + 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, board.width, board.height);
    drawGrid();

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const v = state.grid[y][x];
        if (v) drawCell(ctx, x, y, v);
      }
    }

    if (state.flashRows.length > 0 && state.flashTimer > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(255, 255, 255, ${state.flashTimer / 200})`;
      for (const r of state.flashRows) {
        ctx.fillRect(0, r * CELL, COLS * CELL, CELL);
      }
      ctx.restore();
    }

    if (state.current && !state.gameOver) {
      const gy = ghostY(state.current);
      const shape = getShape(state.current);
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (!shape[r][c]) continue;
          const x = state.current.x + c;
          const y = gy + r;
          if (y >= 0) drawCell(ctx, x, y, state.current.color, { ghost: true });
        }
      }

      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (!shape[r][c]) continue;
          const x = state.current.x + c;
          const y = state.current.y + r;
          if (y >= 0) drawCell(ctx, x, y, state.current.color, { glow: 18 });
        }
      }
    }
  }

  function drawPreview(c, canvas, type) {
    c.clearRect(0, 0, canvas.width, canvas.height);
    if (!type) return;
    const def = TETROMINOES[type];
    const shape = def.shapes[0];
    const cells = [];
    for (let r = 0; r < shape.length; r++) {
      for (let col = 0; col < shape[r].length; col++) {
        if (shape[r][col]) cells.push([col, r]);
      }
    }
    if (cells.length === 0) return;
    const xs = cells.map(p => p[0]);
    const ys = cells.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const offX = (canvas.width - w * PREVIEW_CELL) / 2 - minX * PREVIEW_CELL;
    const offY = (canvas.height - h * PREVIEW_CELL) / 2 - minY * PREVIEW_CELL;

    for (const [cx, cy] of cells) {
      const px = offX + cx * PREVIEW_CELL;
      const py = offY + cy * PREVIEW_CELL;
      const grad = c.createLinearGradient(px, py, px + PREVIEW_CELL, py + PREVIEW_CELL);
      grad.addColorStop(0, lighten(def.color, 0.35));
      grad.addColorStop(1, def.color);
      c.save();
      c.shadowColor = def.color;
      c.shadowBlur = 12;
      c.fillStyle = grad;
      roundRect(c, px + 2, py + 2, PREVIEW_CELL - 4, PREVIEW_CELL - 4, 4);
      c.fill();
      c.restore();
    }
  }

  function drawNext() {
    drawPreview(nextCtx, nextCanvas, state.next ? state.next.type : null);
  }

  function drawHold() {
    drawPreview(holdCtx, holdCanvas, state.hold);
  }

  function updateHud() {
    scoreEl.textContent = state.score;
    highEl.textContent = state.high;
    levelEl.textContent = state.level;
    linesEl.textContent = state.lines;
  }

  function flashBoard() {
    if (boardWrap.classList.contains("flash")) {
      boardWrap.classList.remove("flash");
      void boardWrap.offsetWidth;
    }
    boardWrap.classList.add("flash");
    setTimeout(() => boardWrap.classList.remove("flash"), 220);
  }

  function showOverlay(title, text, btnLabel, mode) {
    overlayCard.classList.remove("gameover", "paused");
    if (mode) overlayCard.classList.add(mode);
    overlayTitle.textContent = title;
    overlayText.innerHTML = text;
    startBtn.textContent = btnLabel;
    overlay.classList.remove("hidden");
  }

  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  function startGame() {
    state.grid = createGrid();
    state.bag = [];
    state.current = null;
    state.next = makePiece(nextType());
    state.hold = null;
    state.canHold = true;
    state.score = 0;
    state.lines = 0;
    state.level = 1;
    state.dropInterval = 1000;
    state.dropTimer = 0;
    state.running = true;
    state.paused = false;
    state.gameOver = false;
    state.flashRows = [];
    state.flashTimer = 0;
    spawn();
    drawHold();
    updateHud();
    hideOverlay();
    state.lastFrame = performance.now();
    requestAnimationFrame(loop);
  }

  function pauseGame() {
    if (!state.running || state.gameOver) return;
    state.paused = !state.paused;
    if (state.paused) {
      showOverlay(
        "已暂停",
        "按 <kbd>P</kbd> 或点击按钮继续",
        "继续",
        "paused"
      );
    } else {
      hideOverlay();
      state.lastFrame = performance.now();
      requestAnimationFrame(loop);
    }
  }

  function endGame() {
    state.running = false;
    state.gameOver = true;
    if (state.score > state.high) {
      state.high = state.score;
      localStorage.setItem(STORAGE_KEY, String(state.high));
    }
    updateHud();
    showOverlay(
      "游戏结束",
      `本局得分 <strong style="color:var(--neon-cyan)">${state.score}</strong><br />消除行数 ${state.lines} · 等级 ${state.level}`,
      "再来一局",
      "gameover"
    );
  }

  function loop(now) {
    if (!state.running || state.paused) return;
    const dt = now - state.lastFrame;
    state.lastFrame = now;
    state.dropTimer += dt;
    if (state.flashTimer > 0) state.flashTimer = Math.max(0, state.flashTimer - dt);

    if (state.dropTimer >= state.dropInterval) {
      state.dropTimer = 0;
      if (state.current && !collides(state.current, 0, 1)) {
        state.current.y += 1;
      } else if (state.current) {
        lockPiece();
      }
    }

    draw();
    if (state.running && !state.paused) requestAnimationFrame(loop);
  }

  document.addEventListener("keydown", (e) => {
    if (!state.running && (e.key === "Enter" || e.key === " ")) {
      if (state.gameOver || !state.running) {
        e.preventDefault();
        startGame();
        return;
      }
    }
    if (!state.running || state.gameOver) return;

    if (e.key === "p" || e.key === "P") {
      e.preventDefault();
      pauseGame();
      return;
    }
    if (state.paused) return;

    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        move(-1);
        draw();
        break;
      case "ArrowRight":
        e.preventDefault();
        move(1);
        draw();
        break;
      case "ArrowUp":
      case "x":
      case "X":
        e.preventDefault();
        rotate(1);
        draw();
        break;
      case "z":
      case "Z":
        e.preventDefault();
        rotate(-1);
        draw();
        break;
      case "ArrowDown":
        e.preventDefault();
        softDrop();
        draw();
        break;
      case " ":
        e.preventDefault();
        hardDrop();
        draw();
        break;
      case "c":
      case "C":
      case "Shift":
        e.preventDefault();
        holdPiece();
        draw();
        break;
    }
  });

  startBtn.addEventListener("click", () => {
    if (state.paused && state.running) {
      pauseGame();
    } else {
      startGame();
    }
  });

  pauseBtn.addEventListener("click", () => {
    if (!state.running && !state.paused) {
      startGame();
    } else {
      pauseGame();
    }
  });

  restartBtn.addEventListener("click", () => {
    startGame();
  });

  if (touchPad) {
    const triggers = touchPad.querySelectorAll("[data-action]");
    triggers.forEach((btn) => {
      const handler = (e) => {
        e.preventDefault();
        if (!state.running || state.paused || state.gameOver) return;
        const action = btn.dataset.action;
        if (action === "left") move(-1);
        else if (action === "right") move(1);
        else if (action === "rotate") rotate(1);
        else if (action === "down") softDrop();
        else if (action === "drop") hardDrop();
        draw();
      };
      btn.addEventListener("touchstart", handler, { passive: false });
      btn.addEventListener("click", handler);
    });
  }

  updateHud();
  drawNext();
  drawHold();
  draw();
  showOverlay(
    "READY?",
    `<kbd>&larr;</kbd> <kbd>&rarr;</kbd> 移动 &nbsp;|&nbsp; <kbd>&uarr;</kbd> 旋转<br /><kbd>&darr;</kbd> 软降 &nbsp;|&nbsp; <kbd>Space</kbd> 硬降<br /><kbd>P</kbd> 暂停 &nbsp;|&nbsp; <kbd>C</kbd> 保留`,
    "开始游戏",
    null
  );
})();
