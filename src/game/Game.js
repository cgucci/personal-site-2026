// Game.js
//
// The top-level orchestrator for the explorable world. It owns the scene,
// player, physics and render loop; world props can be added directly to the
// Three.js scene as the environment grows.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';

import { Renderer } from './core/Renderer.js';
import { Physics } from './core/Physics.js';
import { Clock } from './core/Clock.js';
import { AssetManager } from './assets/AssetManager.js';
import { InputManager } from './core/InputManager.js';
import { Player } from './player/Player.js';

export class Game {
    async start() {
        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        // Pulled back and up slightly for an overview of the starting area.
        this.camera.position.set(10, 10, 10);
        this.camera.lookAt(0, 0, 0);

        // GLTF models use light-reactive PBR materials, so the world needs
        // at least ambient and directional light to be visible.
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

        this.createFloor();

        // The player is the only runtime entity for now, so it can be added
        // and synchronized directly without a collection manager.
        this.player = await Player.create({
            physics: this.physics,
            assetManager: this.assetManager,
            inputManager: this.inputManager,
            position: { x: 2, y: 2, z: 0 },
        });
        this.scene.add(this.player.object3D);

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

    // World props that use physics can follow this same order: update their
    // gameplay state, step Rapier, then copy the resulting transform to the
    // matching Three.js object before rendering.
    tick() {
        const steps = this.clock.tick();
        for (const dt of steps) {
            this.player.update(dt);
            this.physics.step();
        }
        this.player.syncFromPhysics();
        this.renderer.render(this.scene, this.camera);
    }
}
