# Atomic Explorer

**Atomic Explorer** is a Linux desktop application for scientific outreach that allows users to visually explore atomic structure at different levels of complexity. It is the quantum world equivalent of a planetarium.

## Tech Stack

| Component | Technology |
|---|---|
| Native Backend | Rust · Tauri 2.x |
| Math Engine | Rust (`atomic-math` crate) → WASM |
| Rendering | Three.js · WebGLRenderer · GLSL (Point clouds, Marching Cubes isosurfaces, 3D Raymarching) |
| Frontend | Strict TypeScript · Vite |
| Packaging | AppImage · .deb · .rpm |

## Prerequisites

### Operating System
- Linux (Ubuntu 22.04+ / Debian 12+ recommended)
- Support for X11 and Wayland

### System Dependencies

```bash
# Ubuntu/Debian
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libgtk-3-dev \
  libsoup-3.0-dev \
  libjavascriptcoregtk-4.1-dev
```

### Development Tools

```bash
# Rust (rustup)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# WASM target
rustup target add wasm32-unknown-unknown

# wasm-pack
cargo install wasm-pack

# Node.js (>= 18.x)
```

## Build and Run

### 1. Install Node Dependencies

```bash
npm install
```

### 2. Compile the Math Engine to WASM

```bash
npm run wasm:build
```

This compiles `crates/atomic-math` to WebAssembly and outputs the package into `crates/atomic-math/pkg/`.

### 3. Run in Development Mode

```bash
npm run tauri dev
```

This starts both the Vite dev server (frontend) and the native Tauri application.

### 4. Build for Production

```bash
npm run tauri build
```

The bundles are generated in `src-tauri/target/release/bundle/`:
- **AppImage**: `atomic-explorer_0.1.0_amd64.AppImage`
- **deb**: `atomic-explorer_0.1.0_amd64.deb`
- **rpm**: `atomic-explorer-0.1.0-1.x86_64.rpm`

## Key Features

1. **3D Atomic Orbital Visualizer**:
   - Full support for quantum numbers $n=1..4$, $l=0..3$ ($s, p, d, f$ orbitals), and $m=-l..l$.
   - 3D rendering modes: Probability Point Cloud, Isosurface (Marching Cubes), and Volume Raymarching in GLSL shader.
   - Toggle between pure eigenstates $|Y_{lm}|^2$ and real chemical orbitals ($p_x, p_y, p_z, d_{z^2}, f_{z^3}$, etc.).
   - Shielding calculations using Slater's Rules for $Z_{\text{eff}}$ across all 118 elements.

2. **Interactive Periodic Table (118 Elements)**:
   - Full database aligned with NIST ASD.
   - Interactive filtering by categories (Alkali Metals, Halogens, Noble Gases, Lanthanides, etc.).
   - Visualization of periodic trends (Pauling Electronegativity, Atomic Radius in pm, Ionization Energy).
   - Direct selector for 3D electron configuration inspection.

3. **VSEPR Molecular Geometry and Hybridization**:
   - Pair electron repulsion geometries: Linear, Bent, Trigonal Planar, Tetrahedral, Trigonal Pyramidal, Trigonal Bipyramidal, Octahedral.
   - Hybrid lobe visualization ($sp, sp^2, sp^3, sp^3d, sp^3d^2$) and bond angle indicators.
   - Interactive molecules: $\text{H}_2, \text{H}_2\text{O}, \text{CO}_2, \text{NH}_3, \text{CH}_4, \text{BeCl}_2, \text{BF}_3, \text{PCl}_5, \text{SF}_6$.

## Project Structure

```
atomic-explorer/
├── src-tauri/                  # Native Rust backend (Tauri 2.x)
├── crates/
│   └── atomic-math/            # Quantum math engine (Rust → WASM)
│       ├── src/
│       │   ├── lib.rs           # WASM exports and public API
│       │   ├── wavefunctions.rs # Radial wavefunctions R_nl(r) (n=1..4)
│       │   ├── spherical_harmonics.rs # Spherical harmonics & real hydrogen orbitals (s, p, d, f)
│       │   ├── sampling.rs      # Rejection sampling
│       │   ├── slater.rs        # Slater's shielding rules (Z=1..118)
│       │   ├── grid.rs          # 3D density grid for isosurfaces/volume
│       │   └── math_utils.rs    # Laguerre and Legendre polynomials
│       └── tests/               # Analytical integration tests
├── src/                         # TypeScript Frontend
│   ├── core/                    # WASM Bridge
│   ├── render/                  # Three.js Renderers (Orbitals, Molecules)
│   ├── ui/                      # Views (Nav, Periodic Table, VSEPR)
│   ├── i18n/                    # Text strings
│   └── main.ts                  # View manager and bootstrap
├── assets/
│   └── data/                    # 118 element JSON & VSEPR molecules
└── DESING.md                    # Project architectural specification
```

## Testing

### Math Engine (Rust)

```bash
cargo test -p atomic-math
```

### Frontend (TypeScript)

```bash
npx tsc --noEmit  # Strict type check
npm run build     # Vite production build
```

## License

MIT

