# Tetris 俄罗斯方块

一个精致的霓虹风格俄罗斯方块游戏。纯 HTML + CSS + JavaScript 实现，无框架无构建步骤，打开 `index.html` 即可开玩。

## Features

- **7 种标准方块** — I, O, T, S, Z, J, L，每种 4 个旋转态
- **完整的游戏逻辑** — 碰撞检测、锁定、行消除（1/2/3/4 行对应不同分值）
- **等级系统** — 每消 10 行升 1 级，下落速度逐步加快
- **Hold 保留** — 按 `C` 暂存当前方块
- **幽灵块** — 半透明预览方块落底位置，精准落位
- **下一块预览** — 提前规划下一个方块
- **最高分记录** — 保存在 `localStorage`
- **霓虹视觉** — 渐变方块、发光效果、动态背景、圆角渲染
- **触屏支持** — 移动端触控按钮，手指即可操作
- **暂停 / 继续** — 按 `P` 随时暂停

## 操作方式

| 操作 | 键盘 | 触屏 |
|------|------|------|
| 左移 / 右移 | ← → | 触控按钮 |
| 旋转（顺时针） | ↑ / X | 触控按钮 |
| 旋转（逆时针） | Z | — |
| 软降 | ↓ | 触控按钮 |
| 硬降 | Space | 触控按钮 |
| 保留 | C | — |
| 暂停 | P | 暂停按钮 |
| 重新开始 | — | 重新开始按钮 |

## 本地运行

```bash
git clone git@github.com:paulvkey/openclaw-vibe-coding.git
cd openclaw-vibe-coding
open index.html
```

或用 HTTP 服务：

```bash
python3 -m http.server 8000
# 访问 http://localhost:8000
```

## 文件

```
index.html   — 页面结构
style.css    — 霓虹暗色主题样式
game.js      — 完整游戏逻辑
```

## 技术栈

- Canvas 2D 渲染
- requestAnimationFrame 游戏循环
- DPR 感知高分辨率适配
- 纯函数式游戏状态管理

## License

MIT
