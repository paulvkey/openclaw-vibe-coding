# Neon Snake

A polished, dark-themed take on the classic Snake game. Built with vanilla HTML, CSS, and JavaScript — no frameworks, no build step. Just open `index.html` and play.

## Features

- **Smooth gameplay** — fixed-tick logic with interpolated rendering for buttery motion
- **Neon visuals** — gradient snake body, glowing food, animated background, soft grid
- **Score tracking** — current score and best score persisted in `localStorage`
- **Progressive difficulty** — speed increases every 5 points
- **Multi-input** — arrow keys, WASD, on-screen D-pad, and swipe gestures
- **Mobile-ready** — responsive layout, touch controls, viewport-aware sizing
- **Pause / resume** — auto-pauses when the tab loses focus
- **Crisp on retina** — DPR-aware canvas scaling

## How to play

| Action          | Keyboard                | Touch                   |
| --------------- | ----------------------- | ----------------------- |
| Move            | Arrow keys / WASD       | Swipe or D-pad          |
| Pause / resume  | Space                   | Pause button            |
| Restart         | Space (after game over) | Restart / Play Again    |

Eat the glowing pink orbs to grow longer and score points. Don't hit the walls — and don't bite yourself. Every 5 points the snake gets a little faster.

## Run it locally

```bash
git clone git@github.com:paulvkey/openclaw-vibe-coding.git
cd openclaw-vibe-coding
open index.html
```

Or serve it with anything that speaks HTTP, e.g.:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Files

```
index.html   — markup and game shell
style.css    — dark-theme styling, glow effects, responsive rules
game.js      — game loop, rendering, input handling
```

## License

MIT
