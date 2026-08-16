// Renderer.js
//
// Thin wrapper around THREE.WebGLRenderer. Three.js's renderer is the object
// that actually draws pixels to a <canvas> — it takes a Scene + Camera each
// frame and rasterizes it. This class just owns that renderer instance and
// handles the boring plumbing (pixel ratio, resizing) so Game.js doesn't
// have to.
import * as THREE from 'three';

export class Renderer {
    constructor() {
        // antialias smooths jagged edges on model geometry. It costs a little
        // GPU time but is worth it for a small scene like this.
        this.instance = new THREE.WebGLRenderer({ antialias: true });

        // devicePixelRatio makes the canvas render at native resolution on
        // high-DPI ("retina") screens. We cap it at 2 because on a 3x display
        // rendering at full pixel density is expensive for very little visual
        // gain.
        this.instance.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.instance.setSize(window.innerWidth, window.innerHeight);

        // The renderer creates its own <canvas> element internally
        // (this.instance.domElement) — we just need to attach it to the page.
        document.body.appendChild(this.instance.domElement);

        // Camera is assigned from the outside (Game.js sets `renderer.camera`)
        // after both the renderer and camera exist. We keep a reference here
        // purely so handleResize() can update the camera's aspect ratio when
        // the window changes size — the renderer doesn't otherwise need to
        // know about the camera.
        this.camera = null;

        window.addEventListener('resize', () => this.handleResize());
    }

    handleResize() {
        this.instance.setSize(window.innerWidth, window.innerHeight);

        if (this.camera) {
            // A perspective camera's aspect ratio must match the canvas's
            // aspect ratio or the rendered image looks stretched/squashed.
            this.camera.aspect = window.innerWidth / window.innerHeight;
            // Three.js caches the projection matrix for performance, so any
            // change to camera parameters (aspect, fov, near/far) requires
            // an explicit recompute.
            this.camera.updateProjectionMatrix();
        }
    }

    render(scene, camera) {
        this.instance.render(scene, camera);
    }
}
