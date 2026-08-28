# UI Component Lab

This isolated Vite entry renders the real `src/components/ui/` Vue components
under `tokens-v2.css`. It does not change the production renderer entry or connect
to Electron preload, player, queue, library, or filesystem state.

From the repository root:

```powershell
node node_modules/vite/bin/vite.js --config prototypes/ui-component-lab/vite.config.js
```

Build verification may use Vite's `--outDir` option to target a temporary
directory. The default `.build/` directory is ignored.

After a successful build, run the bounded Electron capture and interaction check:

```powershell
node prototypes/ui-component-lab/capture-app/run.js
```

The capture verifies native field label／description contracts, tab-keyboard
behavior, and 200% zoom reflow. It writes seven review fixtures under
`screenshots/`: dark／light default and invalid controls plus dark loading with
reduced motion, disabled, and feedback states.
