// Player.js
//
// The player-controlled character. A mob's Entity is driven one way —
// physics decides its position, and Entity.syncFromPhysics() copies that
// onto the visible mesh (see entities/Entity.js). The player is driven the
// OTHER way: input decides where it wants to go, and physics only gets a
// say in whether that's actually possible (sliding along a wall instead of
// clipping through it, being blocked by the floor instead of sinking in).
//
// That "propose a move, let physics correct it" job is exactly what
// Rapier's KinematicCharacterController exists for — see
// https://rapier.rs/docs/user_guides/javascript/character_controller/. A
// kinematic rigid body on its own (which is all this used to be) is
// immune to gravity/forces by design, so this class is also responsible
// for faking gravity by hand: accumulate a falling speed every frame, feed
// it into the desired movement alongside WASD input, and let the
// controller report back both the corrected movement AND whether that
// movement ended on solid ground.
//
// Player deliberately does NOT extend Entity. It wraps one instead, so it
// still gets syncFromPhysics()'s position/rotation copying for free, without
// inheriting from a class built around the opposite control direction — and
// because Player is going to accumulate a lot of its own state (abilities,
// eventually a camera) that has nothing to do with what Entity is for.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import { clone as cloneSkinnedScene } from 'three/addons/utils/SkeletonUtils.js';
import { Entity } from '../entities/Entity.js';

const MOVE_SPEED = 10; // meters per second
const MODEL_PATH = '/knight.glb';

// The gap Rapier's character controller keeps between the character and
// whatever it's touching. Without this, floating-point rounding can let
// the character wedge itself infinitesimally into geometry it's resting
// against, which then reads as a "collision" every subsequent frame.
// 0.01 is the value Rapier's own docs use as their example.
const CONTROLLER_OFFSET = 0.01;

export class Player {
    // Loading the model is async, so Player is built via this factory
    // instead of a plain constructor — same reason MobFactory.spawn() is
    // async (see MobFactory.js).
    static async create({ physics, assetManager, inputManager, position = { x: 0, y: 0, z: 0 } }) {
        const gltf = await assetManager.loadModel(MODEL_PATH);

        // SkeletonUtils.clone() rather than Object3D.clone() for the same
        // reason MobFactory clones the mage: knight.glb is a skinned mesh,
        // and only this helper rebuilds the skeleton against the clone's
        // own bones instead of leaving it pointing at gltf.scene's — see
        // the detailed comment in MobFactory.js for the failure mode that
        // avoids.
        const object3D = cloneSkinnedScene(gltf.scene);

        return new Player({ physics, inputManager, position, object3D });
    }

    constructor({ physics, inputManager, position = { x: 0, y: 0, z: 0 }, object3D }) {
        this.physics = physics;
        this.inputManager = inputManager;

        object3D.position.set(position.x, position.y, position.z);

        // kinematicPositionBased: this body is moved by CODE (see update()
        // below), not by gravity/forces — the opposite of the mage's
        // dynamic() body in MobFactory.js. It still participates in physics,
        // so moving it into e.g. a wall gets resolved as a collision rather
        // than passing straight through.
        const rigidBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(position.x, position.y, position.z);
        const rigidBody = physics.createRigidBody(rigidBodyDesc);

        const colliderDesc = RAPIER.ColliderDesc.capsule(0.5, 0.4);
        const collider = physics.createCollider(colliderDesc, rigidBody);

        this.entity = new Entity({ object3D, rigidBody, collider });

        // A controller instance holds no per-character state (Rapier's
        // docs note the same instance could drive many characters at
        // once) — this one's owned by Player purely for convenience, not
        // because the player needs its own.
        this.characterController = physics.createCharacterController(CONTROLLER_OFFSET);

        // Rapier never applies gravity to a kinematic body — see the file
        // header. This is our own hand-rolled substitute: how fast the
        // player is currently falling, in meters/second. Grows more
        // negative every frame we're airborne, reset the instant we learn
        // (from the PREVIOUS frame's move) that we're standing on
        // something.
        this.verticalVelocity = 0;
        this.grounded = false;
    }

    // Duck-typed to match what EntityManager expects from anything it's
    // given (see EntityManager.js) — Player isn't an Entity, but it needs to
    // look like one to be added to the scene and ticked the same way.
    get object3D() {
        return this.entity.object3D;
    }

    syncFromPhysics() {
        this.entity.syncFromPhysics();
    }

    // Called once per fixed physics step, BEFORE Physics.step() runs, so
    // this step's input is what collisions get resolved against. This is
    // deliberately separate from EntityManager.update(), which only runs
    // AFTER the physics step (see EntityManager.js) — the reverse of what
    // moving a kinematic body needs.
    update(dt) {
        const horizontal = new THREE.Vector3();
        if (this.inputManager.isDown('KeyW')) horizontal.z -= 1;
        if (this.inputManager.isDown('KeyS')) horizontal.z += 1;
        if (this.inputManager.isDown('KeyA')) horizontal.x -= 1;
        if (this.inputManager.isDown('KeyD')) horizontal.x += 1;

        if (horizontal.lengthSq() > 0) {
            horizontal.normalize().multiplyScalar(MOVE_SPEED * dt);
        }

        // Reset-then-accumulate: if last frame ended grounded, start this
        // frame's fall speed at 0 rather than whatever (still-negative)
        // value it had built up while pressed against the floor. Then
        // apply this frame's acceleration on top. While actually falling,
        // grounded stays false, so this keeps integrating and the fall
        // accelerates like real gravity; while standing still on flat
        // ground, it resets to 0 and immediately re-accumulates one
        // frame's worth, giving a small constant downward push that the
        // floor blocks every frame — which is what keeps `grounded` true
        // instead of flickering on alternating frames.
        if (this.grounded) {
            this.verticalVelocity = 0;
        }
        this.verticalVelocity += this.physics.gravity.y * dt;

        const desiredTranslation = {
            x: horizontal.x,
            y: this.verticalVelocity * dt,
            z: horizontal.z,
        };

        // computeColliderMovement doesn't move anything by itself — it
        // just calculates, against this collider's CURRENT position, how
        // much of `desiredTranslation` is actually achievable once
        // obstacles are taken into account (e.g. sliding along a wall
        // instead of walking into it). computedMovement() below is that
        // corrected result; computedGrounded() is what feeds next frame's
        // reset-then-accumulate check above.
        this.characterController.computeColliderMovement(this.entity.collider, desiredTranslation);
        const movement = this.characterController.computedMovement();
        this.grounded = this.characterController.computedGrounded();

        const current = this.entity.rigidBody.translation();
        this.entity.rigidBody.setNextKinematicTranslation({
            x: current.x + movement.x,
            y: current.y + movement.y,
            z: current.z + movement.z,
        });
    }
}
