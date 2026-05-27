const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('highScore');

const GRID_SIZE = 20;
const CELL_SIZE = canvas.width / GRID_SIZE;

let snake = [{ x: 10, y: 10 }];
let direction = { x: 1, y: 0 };
let nextDirection = { x: 1, y: 0 };
let food = {};
let score = 0;
let highScore = parseInt(localStorage.getItem('snakeHighScore')) || 0;
let gameOver = false;
let gameLoop = null;
let speed = 150;

// Initialize
highScoreEl.textContent = highScore;
generateFood();

// Event listeners
document.addEventListener('keydown', handleKeydown);
document.getElementById('restartBtn').addEventListener('click', restart);

function handleKeydown(e) {
  const key = e.key;
  // Prevent page scrolling
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(key)) {
    e.preventDefault();
  }

  if ((key === ' ' || key === 'Space') && gameOver) {
    restart();
    return;
  }

  if (gameOver) return;

  switch (key) {
    case 'ArrowUp':
    case 'w':
    case 'W':
      if (direction.y !== 1) nextDirection = { x: 0, y: -1 };
      break;
    case 'ArrowDown':
    case 's':
    case 'S':
      if (direction.y !== -1) nextDirection = { x: 0, y: 1 };
      break;
    case 'ArrowLeft':
    case 'a':
    case 'A':
      if (direction.x !== 1) nextDirection = { x: -1, y: 0 };
      break;
    case 'ArrowRight':
    case 'd':
    case 'D':
      if (direction.x !== -1) nextDirection = { x: 1, y: 0 };
      break;
  }
}

function generateFood() {
  const maxAttempts = 1000;
  for (let i = 0; i < maxAttempts; i++) {
    const x = Math.floor(Math.random() * GRID_SIZE);
    const y = Math.floor(Math.random() * GRID_SIZE);
    if (!snake.some(seg => seg.x === x && seg.y === y)) {
      food = { x, y };
      return;
    }
  }
  // If no free cell found (very rare), scan all cells
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (!snake.some(seg => seg.x === x && seg.y === y)) {
        food = { x, y };
        return;
      }
    }
  }
  // Truly full - player won!
  gameOver = true;
}

function update() {
  if (gameOver) return;

  direction = { ...nextDirection };
  const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };

  // Wall collision
  if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
    endGame();
    return;
  }

  // Self collision
  if (snake.some(seg => seg.x === head.x && seg.y === head.y)) {
    endGame();
    return;
  }

  snake.unshift(head);

  // Food collision
  if (head.x === food.x && head.y === food.y) {
    score++;
    scoreEl.textContent = score;
    generateFood();
    // Speed up slightly every 5 points
    if (score % 5 === 0 && speed > 60) {
      speed = Math.max(60, speed - 10);
    }
  } else {
    snake.pop();
  }
}

function endGame() {
  gameOver = true;
  if (score > highScore) {
    highScore = score;
    highScoreEl.textContent = highScore;
    localStorage.setItem('snakeHighScore', highScore);
  }
  draw();
}

function restart() {
  gameOver = false;
  snake = [{ x: 10, y: 10 }];
  direction = { x: 1, y: 0 };
  nextDirection = { x: 1, y: 0 };
  score = 0;
  speed = 150;
  scoreEl.textContent = '0';
  generateFood();
}

function draw() {
  // Background
  ctx.fillStyle = '#0f1628';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= GRID_SIZE; i++) {
    ctx.beginPath();
    ctx.moveTo(i * CELL_SIZE, 0);
    ctx.lineTo(i * CELL_SIZE, canvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * CELL_SIZE);
    ctx.lineTo(canvas.width, i * CELL_SIZE);
    ctx.stroke();
  }

  // Snake body
  snake.forEach((seg, i) => {
    const x = seg.x * CELL_SIZE;
    const y = seg.y * CELL_SIZE;
    const padding = 1;

    if (i === 0) {
      // Head
      ctx.fillStyle = '#4ade80';
      ctx.shadowColor = '#4ade80';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.roundRect(x + padding, y + padding, CELL_SIZE - padding * 2, CELL_SIZE - padding * 2, 4);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Eyes
      ctx.fillStyle = '#0a0e17';
      const eyeSize = 3;
      ctx.beginPath();
      ctx.arc(x + CELL_SIZE / 2 - 4, y + CELL_SIZE / 2 - 3, eyeSize, 0, Math.PI * 2);
      ctx.arc(x + CELL_SIZE / 2 + 4, y + CELL_SIZE / 2 - 3, eyeSize, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Body - gradient from bright green to darker
      const ratio = 1 - (i / snake.length) * 0.5;
      ctx.fillStyle = `rgb(${Math.floor(74 * ratio)}, ${Math.floor(222 * ratio)}, ${Math.floor(128 * ratio)})`;
      ctx.beginPath();
      ctx.roundRect(x + padding, y + padding, CELL_SIZE - padding * 2, CELL_SIZE - padding * 2, 3);
      ctx.fill();
    }
  });

  // Food
  const fx = food.x * CELL_SIZE;
  const fy = food.y * CELL_SIZE;
  const pulse = Math.sin(Date.now() / 200) * 0.15 + 1;
  const foodSize = (CELL_SIZE / 2 - 1) * pulse;

  ctx.shadowColor = '#f43f5e';
  ctx.shadowBlur = 15;
  ctx.fillStyle = '#f43f5e';
  ctx.beginPath();
  ctx.arc(fx + CELL_SIZE / 2, fy + CELL_SIZE / 2, foodSize, 0, Math.PI * 2);
  ctx.fill();

  // Inner glow
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fb7185';
  ctx.beginPath();
  ctx.arc(fx + CELL_SIZE / 2, fy + CELL_SIZE / 2, foodSize * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Game over overlay
  if (gameOver) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 32px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('游戏结束', canvas.width / 2, canvas.height / 2 - 20);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '18px "Segoe UI", sans-serif';
    ctx.fillText('按 空格键 重新开始', canvas.width / 2, canvas.height / 2 + 30);
  }
}

// Game loop
function tick() {
  update();
  draw();
  if (!gameOver) {
    gameLoop = setTimeout(tick, speed);
  } else {
    draw();
  }
}

// Start game
tick();
