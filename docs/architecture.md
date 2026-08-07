# Architecture

Atomic Explorer is built on a modern, high-performance tech stack leveraging web technologies for the UI and system-level languages for computation and desktop integration.

## Core Components

- **Tauri**: Provides desktop packaging and system APIs. It creates a lightweight native shell around our web application for deep Linux integration.
- **Rust (WASM Math Engine)**: The heavy mathematical lifting, especially the quantum mechanics equations and orbital probability densities, are calculated by our Rust crate `crates/atomic-math` compiled to WebAssembly (WASM).
- **TypeScript + Vite + Three.js**: The frontend leverages TypeScript for type safety, Vite for fast development builds, Vue for UI components, and Three.js (WebGL) for real-time 3D rendering of orbitals and molecules.

## Architecture Diagram

```mermaid
graph TD
    subgraph Frontend ["Web Frontend (TypeScript + Vite + Three.js)"]
        UI["Vue Components / UI"]
        Render["Three.js WebGL Renderer"]
    end

    subgraph Core ["Core Processing"]
        WASM["Rust WASM Math Engine<br>'crates/atomic-math'"]
    end

    subgraph Desktop ["System Layer"]
        Tauri["Tauri Desktop Shell"]
        OS["Linux OS"]
    end

    UI -->|Requests calculations| WASM
    WASM -->|Returns vertex/density data| Render
    UI -->|Interacts| Render
    UI -->|System calls| Tauri
    Tauri --> OS
```
