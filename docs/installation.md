# Installation Guide

Welcome to the installation guide for Atomic Explorer. This document outlines the hardware requirements and provides instructions for installing the application on various Linux distributions.

## Hardware Requirements

To ensure optimal performance, your system should meet the following minimum hardware and software requirements:

- **Operating System**: GNU/Linux (X11 or Wayland supported)
- **CPU**: Multi-core processor
- **RAM**: 4GB to 8GB
- **GPU**: A graphics card with WebGL support

## Installation Methods

Atomic Explorer is distributed in several formats to support a wide range of Linux distributions. Choose the method that best suits your system.

### AppImage (Universal Linux)

The AppImage format is a universal package that runs on most Linux distributions without requiring installation or root privileges.

1. Download the latest AppImage from the releases page.
2. Make the downloaded file executable. Open your terminal and run:

   ```bash
   chmod +x AtomicExplorer-*.AppImage
   ```

3. Run the application:

   ```bash
   ./AtomicExplorer-*.AppImage
   ```

### Debian Package (.deb)

For Debian-based distributions like Ubuntu, Linux Mint, and Debian itself, you can install the `.deb` package.

1. Download the latest `.deb` package from the releases page.
2. Install it using `apt` via the terminal:

   ```bash
   sudo apt install ./atomic-explorer_*.deb
   ```

### RPM Package (.rpm)

For RPM-based distributions such as Fedora, CentOS, and openSUSE, use the `.rpm` package.

1. Download the latest `.rpm` package from the releases page.
2. Install it using `dnf` via the terminal:

   ```bash
   sudo dnf install ./atomic-explorer-*.rpm
   ```

---
Once installed, you can launch Atomic Explorer from your desktop environment's application menu.
