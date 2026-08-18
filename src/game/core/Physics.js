// Physics.js
//
// Thin wrapper around a RAPIER.World. Rapier is a separate physics simulation
// running in WASM — it knows nothing about Three.js, meshes, or the scene
// graph. It only knows about rigid bodies (things with mass/position/velocity)
// and colliders (the shapes used for collision detection attached to those
// bodies). Every frame we step the world, then Game copies transforms onto
// their matching Three.js objects.
import RAPIER from '@dimforge/rapier3d';

export class Physics {
    constructor(fixedStep = 1 / 60) {
        // Gravity is a world-level constant vector applied to every dynamic
        // rigid body each step. -9.81 on Y is "down" in normal Three.js
        // world orientation (Y-up).
        this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

        // Rapier's internal step size defaults to 1/60s regardless of how
        // often step() is actually called. We explicitly set it to match the
        // fixed timestep our Clock produces (see core/Clock.js) so "one
        // physics step" always represents the same amount of simulated time.
        this.world.timestep = fixedStep;

    }

    // Advances the simulation by exactly one fixed timestep.
    step() {
        this.world.step();
    }

    // Convenience passthroughs so world code does not need to reach into
    // `physics.world` directly.
    createRigidBody(rigidBodyDesc) {
        return this.world.createRigidBody(rigidBodyDesc);
    }

    createCollider(colliderDesc, rigidBody) {
        return this.world.createCollider(colliderDesc, rigidBody);
    }

    // A KinematicCharacterController is Rapier's purpose-built tool for
    // "something moved by code, not forces, that still needs to slide
    // along walls/floors instead of clipping through them. One controller
    // instance carries no per-character state.
    createCharacterController(offset) {
        return this.world.createCharacterController(offset);
    }

    // Kinematic bodies are deliberately immune to gravity/forces (that's
    // what makes their movement exact) — Rapier's docs are explicit that
    // emulating gravity for one is the caller's job, by adding a downward
    // component to its desired movement every frame. Exposing the world's
    // gravity here means whatever does that doesn't need its own hardcoded
    // copy of `-9.81`.
    get gravity() {
        return this.world.gravity;
    }
}
