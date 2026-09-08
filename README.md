# 🌌 CosmoCraft

在无垠太空的星球之间，自由探索与建造的体素沙盒游戏——融合了《无人深空》式的程序化星球探索与《我的世界》式的挖掘与建造。基于 **Three.js**。

![WebGL](https://img.shields.io/badge/WebGL-Three.js-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## 特性

- 🗺️ **程序化地形生成** — 使用分形噪声（fBm）实时生成无限体素地形
- 🔨 **挖掘与建造** — 左键挖掘、右键放置 12 种方块，快捷栏 12 格（数字键 1-0 或滚轮选择）
- 🌲 **植被生成** — 翡翠星与冰霜星地表自然长出树木，跨区块无缝拼接
- 🪐 **多星球探索** — 按 `X` 传送到 4 类程序化生成的星球：翡翠星、红砂星、冰霜星、深渊星，各自拥有独特配色、海平面、地形与天空
- ⛏️ **矿物系统** — 地表与地下分布矿石、铁矿、金矿、钻石矿
- 🚀 **自由移动** — 飞行模式 + 重力行走双模式，支持冲刺
- 📦 **体素网格** — 分块（chunk）管理，仅渲染可见面，流式加载

## 操作

| 操作 | 按键 |
| --- | --- |
| 移动 | WASD |
| 跳跃 | 空格（长按空中轻微悬浮） |
| 飞行模式 | F（Shift 加速，Space 上升，Ctrl/`Z` 下降） |
| 挖掘方块 | 鼠标左键 |
| 放置方块 | 鼠标右键 |
| 选择方块 | 1-0 数字键 或 滚轮（共 12 格） |
| 切换星球 | X |
| 释放鼠标 | Esc |

## 本地运行

```bash
npm install
npm run dev        # 打开 http://localhost:5173
```

生产构建：

```bash
npm run build      # 产物输出到 dist/
```

## 技术栈

- [Three.js](https://threejs.org/) — WebGL 渲染
- [Vite](https://vitejs.dev/) — 开发与构建
- 纯 JavaScript + 自定义分块体素网格与碰撞系统

## 项目结构

```
cosmocraft/
├── index.html         # 入口与 HUD/菜单
├── src/
│   ├── main.js        # 游戏主循环、拾取、渲染
│   ├── world.js       # 分块网格、地形生成、方块网格化
│   ├── player.js      # 第一人称控制、物理、碰撞
│   ├── blocks.js      # 方块定义与星球配色
│   └── noise.js       # 种子化 PRNG 与分形噪声
└── package.json
```

## License

MIT