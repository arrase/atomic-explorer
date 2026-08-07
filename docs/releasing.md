# Releasing Guide

This guide is intended for maintainers of the Atomic Explorer project. It details the process for publishing new versions of the application.

## Overview

The release process is fully automated using GitHub Actions. The workflow defined in `.github/workflows/release.yml` handles compiling the necessary components, building the application packages, and publishing the release on GitHub.

When a new tag is pushed to the repository, the workflow triggers and performs the following steps:
1. Compiles the WebAssembly (WASM) math engine.
2. Builds the Tauri application packages (AppImage, `.deb`, `.rpm`).
3. Creates a new GitHub Release and attaches all the generated installers.

## How to Publish a New Release

To trigger the automated release workflow, you simply need to create and push a new Git tag that corresponds to the new version number. Follow these steps:

1. **Create a new Git tag.** It is recommended to use semantic versioning (e.g., `v0.1.0`).

   ```bash
   git tag v0.1.0
   ```

2. **Push the tag to the remote repository.**

   ```bash
   git push origin v0.1.0
   ```

Once the tag is pushed, navigate to the **Actions** tab on the GitHub repository to monitor the progress of the release workflow. Upon successful completion, the new release, along with all installers, will be available on the repository's **Releases** page.
