# Atomic Explorer

**Atomic Explorer** is an interactive science popularization web application. It allows students, teachers, and science enthusiasts to visually explore the atomic structure at different levels of complexity. It's the equivalent of a planetarium, but for the quantum world!

> 🌐 **Try it Live in your Browser:** [https://arrase.github.io/atomic-explorer/](https://arrase.github.io/atomic-explorer/)

## What does the application do?

The quantum world can be abstract and difficult to imagine. Atomic Explorer solves this by offering an interactive 3D environment where you can:

1. **Visualize Atomic Orbitals in 3D:** Observe the actual shape of atomic orbitals (s, p, d, f) where electrons reside. You can view probability densities and three-dimensional surfaces using advanced rendering.
2. **Explore the Interactive Periodic Table:** Navigate through the 118 elements, filter by categories (such as alkali metals or noble gases), and discover their periodic properties, such as electronegativity or atomic radius.
3. **Learn Molecular Geometry (VSEPR):** Understand how atoms bond to form molecules like water or methane, visualizing how electron pairs repel each other to form linear, tetrahedral structures, etc.

---

## Screenshots

### Quantum Orbital Visualizer
![Orbitals](./assets/screenshots/01_orbitals.png)
*3D exploration of wave functions and atomic orbitals.*

### Complete Periodic Table
![Periodic Table](./assets/screenshots/02_table.png)
*Access to all element information and configurations.*

### Geometry and Molecules
![Molecules](./assets/screenshots/03_molecules.png)
*Visualization of hybridization and valence shell electron pair repulsion (VSEPR) models.*

---

## Requirements

- Any modern web browser with **WebGL** support (Chrome, Firefox, Edge, Safari).
- Graphics acceleration enabled for 3D orbital rendering and WebAssembly calculations.

---

## Development and Building Locally

If you want to run or develop Atomic Explorer locally:

### Prerequisites
- [Node.js](https://nodejs.org/) (v20+)
- [Rust](https://www.rust-lang.org/) and [`wasm-pack`](https://rustwasm.github.io/wasm-pack/installer/)

### Setup & Run
1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the WebAssembly math engine:
   ```bash
   npm run wasm:build
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Build for production:
   ```bash
   npm run build
   ```

---

## Automated Deployment

This repository uses a **GitHub Actions** workflow (`.github/workflows/deploy.yml`) to automatically compile the WASM math engine, build the web application, and deploy it to **GitHub Pages** on every push to `main` or new version tag.


