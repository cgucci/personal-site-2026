// vite.config.js
//
// @dimforge/rapier3d ships its physics engine as WebAssembly, loaded via a
// direct `import * as wasm from "./x.wasm"` (the WASM/ESM integration —
// see node_modules/@dimforge/rapier3d/rapier_wasm3d.js). Vite's dev-server
// dependency pre-bundler (esbuild) doesn't understand that import and
// mangles it, which surfaces as a wasm-bindgen runtime error the first time
// physics code actually runs (e.g. "getObject(...).now is not a function").
// Excluding the package from pre-bundling makes Vite's dev server serve it
// as-is instead, which is the documented fix. `vite build` isn't affected —
// this only matters for `vite dev`.
export default {
    optimizeDeps: {
        exclude: ['@dimforge/rapier3d'],
    },
};
