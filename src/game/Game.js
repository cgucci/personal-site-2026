// Game.js
//
// The top-level orchestrator. Everything else in src/game/ is a small,
// single-purpose piece (rendering, physics, asset loading, mob spawning...);
// Game.js is the only file that wires them all together and drives the
// per-frame loop. Nothing below has mob-specific logic hardcoded into it —
// the mage is just the first entry registered with MobRegistry.
import * as THREE from 'three';

import { Renderer } from './core/Renderer.js';
import { Physics } from './core/Physics.js';
import { Clock } from './core/Clock.js';
import { AssetManager } from './assets/AssetManager.js';
import { EntityManager } from './entities/EntityManager.js';
import { MobRegistry } from './mobs/MobRegistry.js';
import { MobFactory } from './mobs/MobFactory.js';
import { mageDefinition } from './mobs/definitions/mage.js';

export class Game {
    async start() {
        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        // Pulled back and up slightly so we're looking at the origin, where
        // the mage spawns, from a natural angle.
        this.camera.position.set(0, 2, 6);
        this.camera.lookAt(0, 0, 0);

        // GLTF models default to PBR materials (MeshStandardMaterial), which
        // are lightless by design — without any light in the scene the mage
        // would render as pure black. This isn't scene decoration, it's the
        // minimum needed for the model to be visible at all.
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const sun = new THREE.DirectionalLight(0xffffff, 1.2);
        sun.position.set(3, 5, 2);
        this.scene.add(sun);

        this.renderer = new Renderer();
        // Renderer needs to know the active camera so it can fix up its
        // aspect ratio when the window resizes (see Renderer.handleResize).
        this.renderer.camera = this.camera;

        // Physics and Clock share the same fixed timestep (1/60s by
        // default) so "one physics step" always represents exactly the
        // amount of time Rapier itself thinks passed. See core/Clock.js and
        // core/Physics.js for why this needs to be explicit.
        this.physics = new Physics();
        this.clock = new Clock();

        this.assetManager = new AssetManager();
        this.entityManager = new EntityManager(this.scene);

        this.mobRegistry = new MobRegistry();
        this.mobRegistry.register(mageDefinition);

        this.mobFactory = new MobFactory({
            assetManager: this.assetManager,
            physics: this.physics,
        });

        // Spawn the mage at the world origin. There's no ground collider
        // anywhere in this scene, so it will simply fall under gravity —
        // that's expected for now.
        const mage = await this.mobFactory.spawn(this.mobRegistry.get('mage'), {
            x: 0,
            y: 0,
            z: 0,
        });
        this.entityManager.add(mage);

        // setAnimationLoop is Three.js's version of requestAnimationFrame —
        // it re-invokes our callback every frame and automatically pauses
        // when e.g. entering an XR session. Using it instead of our own
        // rAF loop means we don't have to manage the loop's lifecycle by
        // hand.
        this.renderer.instance.setAnimationLoop(() => this.tick());
    }

    // The per-frame loop. Order matters here:
    //   1. Advance physics by however many fixed steps have accumulated.
    //   2. Copy the new physics positions onto the visible meshes.
    //   3. Draw the frame.
    tick() {
        const steps = this.clock.tick();
        for (const _dt of steps) {
            this.physics.step();
        }
        this.entityManager.update();
        this.renderer.render(this.scene, this.camera);
    }
}
