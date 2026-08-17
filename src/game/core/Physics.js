// Physics.js
//
// Thin wrapper around a RAPIER.World. Rapier is a separate physics simulation
// running in WASM — it knows nothing about Three.js, meshes, or the scene
// graph. It only knows about rigid bodies (things with mass/position/velocity)
// and colliders (the shapes used for collision detection attached to those
// bodies). Every frame we call world.step() to advance the simulation, then
// (elsewhere, in EntityManager) copy the resulting positions onto the
// matching Three.js Object3Ds so what you see on screen matches the physics.
import RAPIER from '@dimforge/rapier3d';

export class Physics {
    constructor(fixedStep = 1 / 60) {
        // Gravity is a world-level constant vector applied to every dynamic
        // rigid body each step. -9.81 on Y is "down" in normal Three.js
        // world orientation (Y-up). This is the ONLY thing pulling the mage
        // toward the void — there's no ground for it to land on.
        this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

        // Rapier's internal step size defaults to 1/60s regardless of how
        // often step() is actually called. We explicitly set it to match the
        // fixed timestep our Clock produces (see core/Clock.js) so "one
        // physics step" always represents the same amount of simulated time.
        this.world.timestep = fixedStep;

        // EventQueue collects collision start/stop events (and contact force
        // events) generated during a step, so we can react to them without
        // Rapier calling arbitrary callbacks mid-simulation. `true` here
        // means "auto-drain": the queue clears itself at the start of each
        // step, so we don't have to remember to call .clear() ourselves.
        this.eventQueue = new RAPIER.EventQueue(true);
    }

    // Advances the simulation by exactly one fixed timestep.
    step() {
        this.world.step(this.eventQueue);

        // Nothing in this scene can currently collide with anything else
        // (there's only one mob and no floor), so this drain is a no-op for
        // now. It's wired up here because every future mob/action feature
        // ("arrow hit mob", "mob touched player") will react to events
        // pulled out of this same queue rather than bolting collision
        // logic directly onto rigid bodies.
        this.eventQueue.drainCollisionEvents((handle1, handle2, started) => {
            // (intentionally empty — see comment above)
        });
    }

    // Convenience passthroughs so callers (like MobFactory) don't need to
    // reach into `physics.world` directly.
    createRigidBody(rigidBodyDesc) {
        return this.world.createRigidBody(rigidBodyDesc);
    }

    createCollider(colliderDesc, rigidBody) {
        return this.world.createCollider(colliderDesc, rigidBody);
    }

    // A KinematicCharacterController is Rapier's purpose-built tool for
    // "something moved by code, not forces, that still needs to slide
    // along walls/floors instead of clipping through them" — the player,
    // and eventually any AI-driven mob (see Player.js for the full
    // reasoning, and https://rapier.rs/docs/user_guides/javascript/character_controller/
    // for Rapier's own docs). One controller instance carries no
    // per-collider state, so the same instance can drive many characters —
    // callers don't each need their own.
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
