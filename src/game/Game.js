// Game.js
//
// The top-level orchestrator. Everything else in src/game/ is a small,
// single-purpose piece (rendering, physics, asset loading, mob spawning...);
// Game.js is the only file that wires them all together and drives the
// per-frame loop. Nothing below has mob-specific logic hardcoded into it —
// the mage is just the first entry registered with MobRegistry.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';

import { Renderer } from './core/Renderer.js';
import { Physics } from './core/Physics.js';
import { Clock } from './core/Clock.js';
import { AssetManager } from './assets/AssetManager.js';
import { EntityManager } from './entities/EntityManager.js';
import { MobRegistry } from './mobs/MobRegistry.js';
import { MobFactory } from './mobs/MobFactory.js';
import { mageDefinition } from './mobs/definitions/mage.js';
import { InputManager } from './core/InputManager.js';
import { Player } from './player/Player.js';

export class Game {
    async start() {
        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        // Pulled back and up slightly so we're looking at the origin, where
        // the mage spawns, from a natural angle.
        this.camera.position.set(10, 10, 10);
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
        this.inputManager = new InputManager();

        this.assetManager = new AssetManager();
        this.entityManager = new EntityManager(this.scene);

        this.createFloor();

        this.mobRegistry = new MobRegistry();
        this.mobRegistry.register(mageDefinition);

        this.mobFactory = new MobFactory({
            assetManager: this.assetManager,
            physics: this.physics,
        });

        // Spawn the mage a little above the floor so it visibly drops onto
        // it under gravity, instead of starting already overlapping it.
        const mage = await this.mobFactory.spawn(
            this.mobRegistry.get('mage'), 
            {x: 0, y: 3, z: 0});
        this.entityManager.add(mage);

        // Spawn the player standing on the floor next to the mage. Unlike
        // the mage's y=3 drop, this is a kinematic body (see Player.js) —
        // it isn't affected by gravity, so it starts exactly where it's
        // placed rather than falling into position.
        this.player = await Player.create({
            physics: this.physics,
            assetManager: this.assetManager,
            inputManager: this.inputManager,
            position: { x: 2, y: 2, z: 0 },
        });
        this.entityManager.add(this.player);

        // setAnimationLoop is Three.js's version of requestAnimationFrame —
        // it re-invokes our callback every frame and automatically pauses
        // when e.g. entering an XR session. Using it instead of our own
        // rAF loop means we don't have to manage the loop's lifecycle by
        // hand.
        this.renderer.instance.setAnimationLoop(() => this.tick());
    }

    // Temp Floor Function

    createFloor() {
        const size = 50;

        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(size, size, 0.1),
            new THREE.MeshStandardMaterial({ color: 0x4a7c3c }),
        );
        // PlaneGeometry is authored flat on the XY plane, facing +Z — rotate
        // it to lie flat on XZ, facing +Y (up), to act as a floor.
        mesh.rotation.x = -Math.PI / 2;
        this.scene.add(mesh);

        // fixed(): this body never moves, unaffected by gravity/forces —
        // the floor should stay put no matter what hits it.
        const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed();
        const rigidBody = this.physics.createRigidBody(rigidBodyDesc);

        // A thin box rather than an actual zero-thickness plane — cuboid
        // colliders are the well-supported, predictable case in Rapier.
        // Half-extents, so (size/2, 0.1, size/2) gives a 50x50 slab 0.2
        // units thick, top surface sitting at y=0 to match the visual mesh.
        const colliderDesc = RAPIER.ColliderDesc.cuboid(size / 2, 0.1, size / 2)
            .setTranslation(0, -0.1, 0);
        this.physics.createCollider(colliderDesc, rigidBody);
    }

    // The per-frame loop. Order matters here:
    //   1. Advance physics by however many fixed steps have accumulated.
    //   2. Copy the new physics positions onto the visible meshes.
    //   3. Draw the frame.
    tick() {
        const steps = this.clock.tick();
        for (const dt of steps) {
            this.player.update(dt);
            this.physics.step();
        }
        this.entityManager.update();
        this.renderer.render(this.scene, this.camera);
    }
}
