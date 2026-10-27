# AERO-HOOK

> High-speed 3D momentum parkour time-trial game built with Three.js, cannon-es, and procedural Web Audio API.

Aero-Hook is a high-octane third-person grappling hook traversal experience built from scratch for the web. Traverse suspended sci-fi monoliths, neon citadels, and treacherous abyss hazards across procedural time-trial courses using independent dual linear-pull grappling hooks.

---

## 🎮 Controls

| Action | Input |
|---|---|
| **Left Grapple Hook** | `Left Click` (Mouse 0) |
| **Right Grapple Hook** | `Right Click` (Mouse 2) |
| **Air Strafe / Influence** | `W` / `A` / `S` / `D` |
| **Look / Aim** | Mouse (Pointer Lock) |
| **Instant Restart** | `R` |
| **Course Selection** | Number keys `1` - `4` (or HUD pills) |
| **Pause / Release Mouse** | `ESC` |

---

## ✨ Features

- **Dual-Hook Physics**: Independent left/right high-tension winches that pull and slingshot the player while conserving 100% directional momentum on release.
- **Procedural 3D World**: Flat-shaded obsidian architecture, wide neon stripes, floating monoliths, rising magma embers, and a 3D singularity black hole finish gate.
- **Zero Asset Dependencies**: 100% procedural geometry and real-time synthesized sound effects using the browser's native Web Audio API (no external MP3s or GLTF model downloads).
- **Comprehensive Test Suite**: Automated unit and integration testing covering physics, camera controller, level generator, UI, and audio subsystems.

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/YinXuanYX/XSOLLA-GAME-JAM-2410-.git
cd XSOLLA-GAME-JAM-2410-

# Install dependencies
npm install
```

### Development Server

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

### Run Tests

```bash
npm test
```

### Production Build

```bash
npm run build
```

The compiled output will be generated in the `dist/` folder, ready for static hosting.

---

## 🛠 Tech Stack

- **Rendering**: [Three.js](https://threejs.org/) (r160)
- **Physics**: [cannon-es](https://github.com/pmndrs/cannon-es) (0.20.0)
- **Audio**: Web Audio API (Procedural Synthesizer)
- **Bundler**: [Vite](https://vitejs.dev/) (5.x)
