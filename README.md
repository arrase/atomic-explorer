# Atomic Explorer

![Atomic Explorer](./screenshots/00_what.png)

**Atomic Explorer** es una aplicación de escritorio para Linux diseñada para la divulgación científica. Permite a estudiantes, profesores y entusiastas de la ciencia explorar visualmente la estructura atómica en diferentes niveles de complejidad. ¡Es el equivalente a un planetario, pero para el mundo cuántico!

## ¿Qué hace la aplicación?

El mundo cuántico puede ser abstracto y difícil de imaginar. Atomic Explorer resuelve esto ofreciendo un entorno 3D interactivo donde puedes:

1. **Visualizar Orbitales Atómicos en 3D:** Observa la forma real de los orbitales atómicos (s, p, d, f) en los que residen los electrones. Podrás ver densidades de probabilidad y superficies tridimensionales usando renderizado avanzado.
2. **Explorar la Tabla Periódica Interactiva:** Navega por los 118 elementos, filtra por categorías (como metales alcalinos o gases nobles) y descubre sus propiedades periódicas, como la electronegatividad o el radio atómico.
3. **Aprender Geometría Molecular (VSEPR):** Entiende cómo se unen los átomos para formar moléculas como el agua o el metano, visualizando cómo los pares de electrones se repelen para formar estructuras lineales, tetraédricas, etc.

---

## Capturas de Pantalla

### Visualizador de Orbitales Cuánticos
![Orbitales](./screenshots/01_orbitals.png)
*Exploración 3D de funciones de onda y orbitales atómicos.*

### Tabla Periódica Completa
![Tabla Periódica](./screenshots/02_table.png)
*Acceso a toda la información de los elementos y sus configuraciones.*

### Geometría y Moléculas
![Moléculas](./screenshots/03_molecules.png)
*Visualización de hibridación y modelos de repulsión de pares de electrones (VSEPR).*

---

## Requisitos de Hardware

La aplicación realiza cálculos matemáticos complejos y renderizado 3D en tiempo real (WebGL), por lo que se recomienda el siguiente hardware para un rendimiento óptimo:

- **Sistema Operativo:** GNU/Linux (Ubuntu 22.04+, Debian 12+, Fedora, u otras distribuciones modernas). Soporte nativo para X11 y Wayland.
- **Procesador (CPU):** Procesador moderno multi-núcleo (Intel Core i3 / AMD Ryzen 3 o superior).
- **Memoria (RAM):** 4 GB de RAM (se recomiendan 8 GB para una experiencia fluida).
- **Tarjeta Gráfica (GPU):** Acelerador gráfico con soporte para WebGL. Tarjetas integradas modernas (Intel HD, AMD Vega) o dedicadas (NVIDIA, AMD) son compatibles.

---

## Cómo Instalar y Probar la Aplicación

Puedes descargar directamente los paquetes precompilados en la pestaña **Releases** de este repositorio de GitHub.

### Opción 1: Usando AppImage (Recomendado, ejecutable universal)
El formato AppImage funciona en casi cualquier distribución Linux sin instalar nada en el sistema.

1. Entra en la sección de **Releases** de este repositorio y descarga el archivo `.AppImage` correspondiente a la versión más reciente (ejemplo: `atomic-explorer_0.1.0_amd64.AppImage`).
2. Dale permisos de ejecución. Puedes hacerlo desde las propiedades del archivo en tu gestor de archivos (clic derecho -> *Propiedades* -> *Permisos* -> *Permitir ejecutar como programa*), o desde la terminal:
   ```bash
   chmod +x atomic-explorer_0.1.0_amd64.AppImage
   ```
3. Haz doble clic en el archivo descargado para iniciar la aplicación.

### Opción 2: Paquete Debian (.deb)
Para distribuciones como Ubuntu, Debian, Linux Mint, Pop!_OS, Zorin OS, etc.

1. Descarga el paquete `.deb` desde la sección de **Releases** (ejemplo: `atomic-explorer_0.1.0_amd64.deb`).
2. Haz doble clic en el archivo para instalarlo con el Centro de Software de tu sistema, o ejecuta en la terminal:
   ```bash
   sudo apt install ./atomic-explorer_0.1.0_amd64.deb
   ```
3. Abre "Atomic Explorer" desde el menú de aplicaciones del sistema.

### Opción 3: Paquete RPM (.rpm)
Para distribuciones como Fedora, openSUSE, RHEL, Rocky Linux, CentOS, etc.

1. Descarga el paquete `.rpm` desde la sección de **Releases** (ejemplo: `atomic-explorer-0.1.0-1.x86_64.rpm`).
2. Instálalo desde la terminal ejecutando:
   ```bash
   sudo dnf install ./atomic-explorer-0.1.0-1.x86_64.rpm
   ```
3. Inicia la aplicación desde el menú del sistema.

---

## Publicación de Nuevas Versiones (Para Mantenedores)

Este repositorio cuenta con una **GitHub Action** automatizada para generar y subir los instaladores (`AppImage`, `.deb`, `.rpm`) a GitHub Releases automáticamente al crear una nueva versión.

Para publicar una nueva Release:

1. Crea y sube una etiqueta (*tag*) con la versión (por ejemplo `v0.1.0`):
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
2. La acción `.github/workflows/release.yml` compilará automáticamente el motor matemático WASM, construirá los paquetes Tauri y publicará la release en GitHub con todos los instaladores adjuntos.
