# UI Component Lab

This isolated Vite entry renders the real `src/components/ui/` Vue components
under the production `tokens.css`. It does not connect
to Electron preload, player, queue, library, or filesystem state.

From the repository root:

```powershell
npm exec -- vite --config prototypes/ui-component-lab/vite.config.js
```

Build before capture:

```powershell
npm exec -- vite build --config prototypes/ui-component-lab/vite.config.js
```

The default `.build/` directory is ignored. Build verification may instead use
Vite's `--outDir` option to target a temporary directory.

After a successful build, run the bounded Electron capture and interaction check:

```powershell
node prototypes/capture.cjs ui-component-lab
```

The capture verifies native field label／description contracts, tab-keyboard
behavior, and 200% zoom reflow. It writes seven review fixtures under
`screenshots/`: dark／light default and invalid controls plus dark loading with
reduced motion, disabled, and feedback states.

The shared launcher owns a temporary profile and its exact Electron child tree.
It clears inherited Node-mode startup before launching Electron. Captures update
the checked-in reference images; review those changes separately from source
verification. See the [prototype index](../README.md) for the historical workspace.
