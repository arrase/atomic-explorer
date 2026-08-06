## 0. Visión del producto

**Atomic Explorer** es una aplicación de escritorio para Linux de divulgación científica que permite explorar visualmente la estructura atómica desde distintos niveles de complejidad. Es el equivalente de un planetario, pero para el mundo cuántico.

**No es:**
- Software de investigación ni un motor de química cuántica ab initio.
- Una herramienta que necesite hardware de gama alta para ser útil (ver §5).
- Una demo técnica de shaders — cada visualización debe ir acompañada de una explicación educativa correcta.

**Público objetivo:** curiosos sin conocimientos previos, estudiantes, docentes, museos y planetarios. La accesibilidad de hardware es un requisito de primera clase, no un "nice to have".

**Precedente relevante:** las simulaciones de PhET (Univ. de Colorado Boulder) — "Models of the Hydrogen Atom", "Build an Atom" — son el estándar de facto en aulas desde hace dos décadas, pero son 2D y deliberadamente simples. El diferenciador de Atomic Explorer es la fidelidad 3D en tiempo real, el raymarching volumétrico, y un hilo narrativo continuo desde el átomo hasta la molécula.

## 1. Principios de diseño

1. **Separación estricta entre física/matemáticas y renderizado.** Ver §3 para cómo se traduce esto en la arquitectura real de Tauri (no es simplemente "dos carpetas distintas").
2. **Honestidad científica explícita.** Cuando se simplifique o aproxime algo (orbitales de átomos multielectrónicos, geometría de moléculas, reglas de Aufbau), el sistema educativo debe decirlo, no ocultarlo.
3. **Accesible por defecto, espectacular si el hardware lo permite.** Niveles de calidad desde la Fase 1, no añadidos después.
4. **Contenido educativo como datos, no como código.** Los textos explicativos deben poder editarse y ampliarse sin recompilar ni tocar lógica.
5. **Español primero, arquitectura preparada para i18n.** Todo el contenido de usuario vive en archivos de recursos indexados por clave, nunca como cadenas embebidas en el código.

## 2. Stack tecnológico

Confirmado: **Rust · Tauri 2 · Three.js · TypeScript · Vite**. Es una elección correcta para una app de escritorio Linux nativa, ligera y con acceso a GPU. Con dos matices importantes respecto al planteamiento original:

### 2.1 Sobre WebGPU (léase antes de tocar el motor de render)

Tauri en Linux no usa Chromium: usa **WebKitGTK** a través de WRY (la misma capa que unifica WKWebView en macOS, WebView2 en Windows y WebKitGTK en Linux), y Tauri 2 requiere específicamente **webkit2gtk 4.1**. A fecha de este documento, el soporte de WebGPU en Linux está "en progreso" incluso en la implementación de Chromium (Dawn), y no hay indicios de que WebKitGTK lo tenga disponible de forma estable. El propio manual oficial de Three.js, además, advierte de que su `WebGPURenderer` **no soporta `ShaderMaterial`/`RawShaderMaterial` personalizados ni el `EffectComposer` clásico** — habría que reescribir todo el raymarching y postprocesado en TSL.

**Decisión para este proyecto: `WebGLRenderer` + GLSL como render path único hasta nueva orden.** WebGPU (vía `three/webgpu` o vía `wgpu` nativo en el backend Rust) queda como línea de investigación de Fase 4, nunca como dependencia de una fase anterior.

### 2.2 Librerías y crates concretos

| Capa | Elección | Notas |
|---|---|---|
| Backend nativo | Tauri 2.x | proceso Rust, IPC vía comandos |
| Motor matemático | crate Rust propio (`atomic-math`) | compilable a WASM (`wasm-bindgen` + `wasm-pack`) y nativo a la vez |
| Persistencia de usuario | `rusqlite` (SQLite embebido) | progreso, marcadores, escenas guardadas — vive en el backend nativo |
| Datos de referencia | JSON o RON estáticos, empaquetados como assets | tabla periódica, líneas espectrales, modelos históricos — NO en SQLite, son de solo lectura |
| Render | Three.js (`WebGLRenderer`) + GLSL | ver §2.1 |
| Frontend | TypeScript estricto + Vite | sin `any` salvo justificación explícita en comentario |
| Tests del motor matemático | `cargo test`, valores de referencia analíticos | ver §4.4 |
| Tests de frontend | Vitest (unit), Playwright opcional en fase posterior | |

## 3. Arquitectura de cómputo: los tres motores

Tu principio de "nunca mezclar matemáticas con renderizado" se traduce, en la práctica de Tauri, en **tres lugares de cómputo distintos**, no dos — y la diferencia importa para el rendimiento:

```
┌─────────────────────┐   IPC (ocasional)   ┌──────────────────────┐   buffer directo    ┌─────────────────────┐
│   Rust nativo        │ ------------------> │  Motor matemático     │ -------------------> │  Render              │
│   (proceso Tauri)    │                      │  (Rust → WASM,        │   sin copia,          │  (Three.js + GLSL,   │
│                       │ <------------------  │   en el webview)      │   cada fotograma       │   WebGL2)             │
│  · SQLite (rusqlite)  │                      │  · ψ(r,θ,φ)            │                       │  · BufferGeometry     │
│  · export imagen/vídeo│                      │  · |ψ|² (densidad)     │                       │  · shaders GLSL       │
│  · precómputo pesado  │                      │  · sampling / rechazo  │                       │  · raymarching        │
│    (opcional, wgpu)   │                      │  · marching cubes      │                       │  · postprocesado      │
└─────────────────────┘                      └──────────────────────┘                       └─────────────────────┘
```

**Por qué esta separación y no "Rust hace la física, JS hace el render":** el IPC de Tauri entre el proceso nativo y el webview tiene latencia. Si el usuario arrastra un slider de `n`, `l`, `m` esperando 60-144 fps de respuesta, ese hot path no puede cruzar el proceso nativo en cada fotograma. Por eso el motor matemático compila a **WASM y corre dentro del webview**, junto al renderer — cero IPC en el camino caliente. El proceso Rust nativo se reserva para lo que de verdad no necesita ser instantáneo: persistencia, exportación, y (si en el futuro hace falta) precómputo pesado vía `wgpu` nativo, que sí tiene acceso a Vulkan sin pasar por las limitaciones del webview.

El "Core" del diagrama original del autor pasa a ser, en la práctica: **un crate Rust puro, sin dependencias de Tauri ni de Three.js, compilable tanto a WASM como nativo.** Eso es lo que permite testearlo con `cargo test` normal y corriente y, en el futuro, reutilizarlo fuera de la UI (un CLI de exportación, por ejemplo) sin tocar una línea.

### 3.1 Superficie de API orientativa del motor matemático

Esto es un boceto de la forma de la API, no una implementación verificada — el agente debe implementar y testear cada función contra valores analíticos conocidos (ver §4.4).

```rust
// crates/atomic-math/src/lib.rs

pub struct QuantumNumbers { pub n: u32, pub l: u32, pub m: i32 }

pub enum OrbitalMode {
    /// Autoestado (n,l,m) puro — para m≠0 es complejo y |ψ|² es axialmente simétrico (forma de anillo, no de mancuerna)
    PureEigenstate,
    /// Combinación real (px, py, dxy, ...) — la que se usa en hibridación y química
    RealChemist(RealOrbitalKind),
}

/// Densidad de probabilidad |ψ|² en un punto. `z_eff` permite hidrogenoides (H, He+, Li2+...)
/// y, para átomos multielectrónicos, la aproximación de carga nuclear efectiva (reglas de Slater) —
/// declarar siempre esta aproximación en el sistema educativo cuando z_eff != Z real.
pub fn probability_density(qn: QuantumNumbers, mode: OrbitalMode, z_eff: f64, r: f64, theta: f64, phi: f64) -> f64;

/// N puntos muestreados por rechazo según |ψ|² — para el modo "nube de puntos"
pub fn sample_points(qn: QuantumNumbers, mode: OrbitalMode, z_eff: f64, n_points: usize, seed: u64) -> Vec<[f32; 3]>;

/// Malla de isosuperficie (marching cubes) para un umbral de densidad dado
pub fn isosurface(qn: QuantumNumbers, mode: OrbitalMode, z_eff: f64, iso_threshold: f64, grid_resolution: u32) -> Mesh;

/// Longitud de onda exacta (fórmula de Rydberg) — solo válido para sistemas hidrogenoides de un electrón
pub fn transition_wavelength_nm(z: u32, n_initial: u32, n_final: u32) -> f64;
```

## 4. Precisión científica: resolver antes de programar

Estos puntos son la diferencia entre "otro visor de orbitales" y una herramienta que un docente recomienda sin matizar. Cada uno tiene una resolución concreta, no es solo una advertencia:

1. **Autoestados puros vs. orbitales reales.** Para m≠0 el autoestado hidrogenoide es complejo; su densidad |ψ|² es axialmente simétrica (forma de anillo alrededor del eje z), NO la mancuerna clásica de px/py. Esas mancuernas son combinaciones reales de m=+1 y m=-1. Implementación: el `OrbitalMode` de §3.1 — modo físico (autoestados, incluida la forma de anillo) vs. modo químico (combinaciones reales). Módulo 2 debe exponer ambos con un selector claro; Módulos 10 y 11 (híbridos, moléculas) usan siempre modo químico, porque es lo que realmente se combina en hibridación.
2. **El spin no altera la forma espacial del orbital.** Es un grado de libertad aparte. El control de spin no debe deformar ni rotar la nube — resérvalo visualmente para el módulo de Pauli / emparejamiento de electrones.
3. **Átomos multielectrónicos no tienen solución cerrada.** Para todo lo que no sea hidrógeno o iones hidrogenoides (He⁺, Li²⁺...), usar formas hidrogenoides con carga nuclear efectiva (reglas de Slater — simples, bien establecidas) y declarar la aproximación en el sistema educativo. No simular Hartree-Fock/DFT real.
4. **Excepciones a la regla de Aufbau.** La regla n+l falla en más de veinte elementos (Cr → [Ar]3d⁵4s¹, Cu → [Ar]3d¹⁰4s¹, y varios más en los bloques d y f). No derivar las 118 configuraciones algorítmicamente: usar la NIST Atomic Spectra Database (nist.gov/pml/atomic-spectra-database) como tabla de verdad para configuraciones de estado fundamental. La animación de Aufbau es el mecanismo pedagógico para explicar el orden general, no la fuente de los datos mostrados en la tabla periódica.
5. **Radio atómico y electronegatividad: elegir y citar una escala.** Existen varias (Pauling vs. Allen; radio covalente vs. Van der Waals). Decidirlo en Fase 2, antes de rellenar 118 filas de datos, y mostrar la fuente/escala en la propia UI (p. ej. "radio covalente, Cordero et al. 2008" o la fuente que se elija).
6. **Abundancia: especificar cuál.** Cortical/crustal vs. cósmica dan números muy distintos — etiquetar cuál se muestra, o mostrar ambas.
7. **Moléculas (Módulo 11): geometría VSEPR cualitativa, no química cuántica ab initio.** Ángulos e híbridos correctos según VSEPR es riguroso para divulgación y computacionalmente trivial. Un motor de química cuántica real (bases, SCF) es un proyecto aparte y no entra en el alcance de este producto. Mejora opcional de Fase 4: isosuperficies reales precalculadas (cube files de fuentes públicas) para 2-3 moléculas estrella, etiquetadas explícitamente como "cálculo real" frente al modelo cualitativo por defecto.
8. **Espectros exactos solo para sistemas hidrogenoides.** Balmer/Lyman/Paschen vía fórmula de Rydberg son exactos para H, He⁺, Li²⁺... Si en el futuro se amplía a átomos multielectrónicos, sus líneas no se derivan — se consultan (de nuevo, NIST ASD).
9. **Imágenes reales de elementos: licencia verificada.** Usar solo fuentes de dominio público o CC (Wikimedia Commons es la más práctica) y mantener un archivo de atribuciones en el repositorio.

## 5. Niveles de calidad (accesibilidad de hardware)

Implementar **desde la Fase 1**, no como añadido posterior — es lo que evita que el proyecto solo sea útil en gama alta:

| Nivel | Partículas (nube) | Resolución isosuperficie | Postprocesado | AA temporal | Hardware orientativo |
|---|---|---|---|---|---|
| Low | ~20.000 | 32³ | No | No | integrada / portátil de aula |
| Medium | ~150.000 | 64³ | Bloom básico | No | GPU dedicada de gama media, 4-6 GB |
| High | ~500.000 | 96³ | Completo | Sí | GPU de gama alta, 8-12 GB |
| Ultra | 1M+ | 128³+ | Completo + HDR | Sí | GPU tope de gama, 16 GB+ |

Detectar automáticamente un nivel de partida razonable al primer arranque (p. ej. por VRAM reportada), con override manual siempre visible.

## 6. Estructura de proyecto

```
atomic-explorer/
├── src-tauri/                  # Backend nativo Rust (Tauri)
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/            # Comandos IPC expuestos al frontend
│   │   ├── db/                  # rusqlite: progreso, marcadores, escenas guardadas
│   │   ├── export/              # exportación de imagen/vídeo
│   │   └── precompute/          # (opcional, fase 2+) cómputo nativo pesado vía wgpu
│   └── Cargo.toml
│
├── crates/
│   └── atomic-math/             # Motor matemático puro — ver §3 y §3.1
│       ├── src/
│       │   ├── wavefunctions.rs
│       │   ├── spherical_harmonics.rs
│       │   ├── slater.rs        # carga nuclear efectiva, ver §4.3
│       │   ├── sampling.rs
│       │   ├── isosurface.rs    # marching cubes
│       │   └── lib.rs
│       ├── tests/               # valores de referencia — ver §4.4 más abajo (dentro de convenciones)
│       └── Cargo.toml
│
├── src/                          # Frontend TypeScript
│   ├── core/                      # bindings al WASM de atomic-math
│   ├── render/                     # Three.js: escenas, materiales, shaders GLSL
│   │   └── shaders/
│   ├── ui/                          # paneles, timeline, inspector
│   ├── education/                    # sistema educativo: contenido + motor de presentación
│   ├── modules/                       # un subdirectorio por módulo (explorer, orbitals, periodic-table...)
│   ├── state/                          # estado: elemento actual, parámetros, animación
│   └── main.ts
│
├── assets/
│   ├── data/                     # JSON/RON: tabla periódica, líneas espectrales, modelos históricos
│   ├── images/                    # imágenes de elementos + ATTRIBUTIONS.md (ver §4.9)
│   └── content/                    # textos educativos, es.json primero, estructura i18n-ready
│
└── e2e/                            # opcional, fases posteriores
```

## 7. Convenciones de código y calidad

- **Rust:** `clippy` y `rustfmt` obligatorios en CI. Sin `unwrap()` en código de producción salvo justificación explícita en comentario. Toda función pública de `atomic-math` necesita al menos un test.
- **TypeScript:** ESLint + Prettier, `strict: true`, sin `any` salvo justificación.
- **Tests de referencia del motor matemático (bloqueante antes de dar por cerrada cualquier tarea de física):**
  - Normalización: ∫|ψ|²dV ≈ 1 para una muestra de (n,l,m).
  - Comparación directa con la fórma analítica conocida de ψ₁₀₀ (1s) en varios puntos.
  - Degeneración: verificar que cada `l` tiene exactamente 2l+1 valores de `m`, y que cada `n` tiene n² orbitales en total.
- **Commits:** conventional commits sugerido.
- **Cada tarea entregada debe incluir:** qué hace, cómo probarlo, y capturas si toca render.

## 8. El sistema educativo como workstream propio

Escribir la explicación pedagógica correcta para cada combinación de parámetros, en los 12 módulos, es un trabajo de redacción/diseño instruccional considerable — comparable en esfuerzo a la propia programación, y no se resuelve escribiendo código. Trátese como una lista de tareas separada desde la Fase 1, con la arquitectura de contenido (§1.4, §6 `assets/content/`) lista lo antes posible para que ese trabajo pueda avanzar en paralelo sin bloquear al desarrollo.

## 9. Hoja de ruta

### Fase 0 — Spike técnico (nueva; hacer antes de la Fase 1 original)

**Objetivo:** de-riesgar las incógnitas más caras con una rebanada vertical mínima, antes de construir el andamiaje completo.

Tareas:
- Proyecto Tauri 2 mínimo que abre una ventana con un canvas Three.js.
- Crate `atomic-math` con la función de onda de 1s y 2pz, compilado a WASM e importado desde el frontend.
- Render del orbital 1s como nube de puntos (muestreo por rechazo, ~50k puntos) — medir fps.
- Probar en al menos dos entornos Linux distintos al de desarrollo (X11 y Wayland; GPU Nvidia propietaria y una GPU Mesa/open-source si es posible) — WebKitGTK tiene fama de comportarse de forma distinta entre distros.
- Empaquetar un AppImage mínimo (`tauri build --bundles appimage`) y verificar que arranca en una máquina distinta a la de desarrollo.

**Criterio de aceptación:** ventana nativa funcional, 1s renderizado a >30fps en hardware modesto, AppImage que arranca en una segunda máquina/distro. Documentar en README los pasos de build.

### Fase 1 — MVP (desglosada en sub-tareas verificables)

- **1a.** Motor matemático completo para hidrógeno: todas las combinaciones (n,l,m) para n=1 a 4, con los tests de referencia de §7.
- **1b.** Modos de visualización: nube de puntos, isosuperficie (marching cubes) y volumen (raymarching GLSL) — estos tres primero; mesh/wireframe/corte transversal/mapa de calor se añaden después reutilizando la misma base de datos de densidad.
- **1c.** Controles UI para n/l/m/spin + selector "autoestado puro" vs. "orbital real" (§4.1).
- **1d.** Sistema educativo: arquitectura de contenido como datos (§8) + explicaciones de n, l, m, spin.
- **1e.** Explorador de elementos: núcleo + nube electrónica para los 118 elementos (con aproximación hidrogenoide + Z efectiva para todo lo que no sea H, §4.3).
- **1f.** Niveles de calidad (§5) implementados desde el principio.

### Fase 2 — Física y química

- Configuración electrónica con datos reales de NIST ASD (excepciones incluidas), no derivación algorítmica ciega (§4.4).
- Animaciones de Aufbau, Hund y exclusión de Pauli.
- Transiciones electrónicas y emisión de fotones (fórmula de Rydberg, exacta para hidrogenoides, §4.8).
- Espectros: series de Balmer, Lyman, Paschen.
- Tabla periódica interactiva con escala de radio/electronegatividad citada explícitamente (§4.5) y vuelo de cámara al seleccionar elemento.
- Comparador de dos elementos (pantalla dividida).

### Fase 3 — Enlaces y moléculas

- Orbitales híbridos (sp, sp², sp³) como combinaciones de los orbitales reales ya implementados en 1c.
- Modelo geométrico VSEPR para H₂, H₂O, CO₂, NH₃, CH₄ (§4.7) — ángulos y lóbulos híbridos correctos, sin resolver ecuaciones multielectrónicas.
- Comparador de estructuras moleculares.
- (Opcional, mejora futura) isosuperficies reales precalculadas para 2-3 moléculas, etiquetadas como tal frente al modelo cualitativo.

### Fase 4 — Plataforma educativa

- Lecciones guiadas (secuencias de escenas + texto, sobre la arquitectura de contenido ya construida en 1d).
- Cuestionarios interactivos.
- Exportación de imagen/vídeo (desde el backend nativo Rust).
- Modo presentación para docentes.
- Sistema de marcadores/escenas guardadas (SQLite vía `rusqlite`).
- Línea temporal histórica del modelo atómico (Dalton → Thomson → Rutherford → Bohr → Schrödinger), cada uno visualizado y comparable con el anterior.
- Línea de investigación: WebGPU/TSL como render path alternativo (§2.1), solo si en ese momento WebKitGTK lo soporta de forma estable.

## 10. Empaquetado para Linux

- Formatos nativos del bundler de Tauri: **AppImage, .deb, .rpm**. Flatpak/Snap requieren manifiesto aparte (evaluar en fase posterior, no bloqueante para el MVP).
- Compilar en la base más antigua que se quiera soportar y que tenga WebKitGTK 4.1 disponible (Ubuntu 22.04 / Debian 12 son líneas base razonables) para evitar errores de versión de glibc en tiempo de ejecución.
- Matriz de pruebas recomendada: X11 + Wayland, al menos GNOME y KDE, GPU Nvidia propietaria + GPU AMD/Intel (Mesa) — WebKitGTK ha tenido históricamente comportamiento inconsistente entre estas combinaciones.

## 11. Primer entregable esperado del agente

**Fase 0 completa** según los criterios de aceptación de §9, con:
- Instrucciones de build/ejecución en un README.
- El AppImage generado, probado en al menos una segunda máquina.
- Medición de fps del orbital 1s documentada, junto con la GPU/distro donde se probó.

No avanzar a la Fase 1 hasta que esto esté verificado — es la parte más barata de corregir ahora y la más cara de descubrir tarde.