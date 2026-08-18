// Player.js
//
// The player-controlled character. Input proposes a move and Rapier's
// character controller resolves it against the explorable world's colliders.
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
import { AnimationController } from '../animation/AnimationController.js';

const MOVE_SPEED = 4.5; // meters per second, top speed once fully accelerated

// How quickly actual velocity blends toward its target. This is a response
// speed rather than a per-frame blend factor; the exponential factor in
// update() keeps the feel consistent at different fixed-step rates.
const VELOCITY_SMOOTHING = 20;

// Below this speed, treat the player as "stopped" for animation/facing
// purposes — without a cutoff, floating-point residue from the
// deceleration ramp would technically keep `isMoving` true forever,
// flickering the idle animation in and out instead of settling into it.
const STOP_SPEED = 0.1;

const MODEL_PATH = '/knight.glb';

// knight.glb itself has no animations baked in — it's just meshes + a
// skeleton. These are KayKit's separate, character-agnostic animation
// packs: their clips target bone names (hips, spine, upperarm.l, ...)
// rather than this-specific-file node names, so they play correctly on
// ANY character sharing the same "Rig_Medium" skeleton, knight included.
// See AnimationController.js for how binding-by-name makes that work.
const ANIMATION_PATH = '/animations/Rig_Medium_General.glb';
const MOVEMENT_ANIMATION_PATH = '/animations/Rig_Medium_MovementBasic.glb';

// The gap Rapier's character controller keeps between the character and
// whatever it's touching. Without this, floating-point rounding can let
// the character wedge itself infinitesimally into geometry it's resting
// against, which then reads as a "collision" every subsequent frame.
// 0.01 is the value Rapier's own docs use as their example.
const CONTROLLER_OFFSET = 0.01;

// Which local axis knight.glb's model faces by default, before any
// rotation is applied — glTF's convention is that an asset's front faces
// +Z. rotateToFaceMovement() below rotates FROM this axis TO whichever
// direction the player is currently moving, so this is the one constant
// to flip (to (0, 0, -1)) if the knight turns out to walk backwards.
const MODEL_FORWARD = new THREE.Vector3(0, 0, 1);

// How quickly the character turns to face its new movement direction, in
// "response speed" units rather than a flat 0-1 blend factor — see the
// comment in rotateToFaceMovement() for why. Higher = snappier turning.
const TURN_SPEED = 15;

export class Player {
    // Loading the model is async, so Player is built via a factory instead
    // of a plain constructor.
    static async create({ physics, assetManager, inputManager, position = { x: 0, y: 0, z: 0 } }) {
        // All three loads are independent, so there's no reason to await
        // them one at a time — AssetManager caches each by path anyway,
        // so another instance sharing this rig would not re-fetch them.
        const [gltf, generalAnim, movementAnim] = await Promise.all([
            assetManager.loadModel(MODEL_PATH),
            assetManager.loadModel(ANIMATION_PATH),
            assetManager.loadModel(MOVEMENT_ANIMATION_PATH),
        ]);

        // SkeletonUtils.clone() gives this player its own bones and skin.
        const object3D = cloneSkinnedScene(gltf.scene);

        // Pick out just the specific clips Player cares about, by name,
        // out of each pack's full clip list — THREE.AnimationClip.findByName
        // is three.js's own helper for exactly this lookup.
        const clips = {
            idle: THREE.AnimationClip.findByName(generalAnim.animations, 'Idle_A'),
            run: THREE.AnimationClip.findByName(movementAnim.animations, 'Running_A'),
        };

        return new Player({ physics, inputManager, position, object3D, clips });
    }

    constructor({ physics, inputManager, position = { x: 0, y: 0, z: 0 }, object3D, clips }) {
        this.physics = physics;
        this.inputManager = inputManager;

        object3D.position.set(position.x, position.y, position.z);

        this.animationController = new AnimationController(object3D, clips);
        this.animationController.play('idle');
        // Force that first pose to actually apply now (dt=0 just evaluates
        // frame 0 of the clip without advancing time), rather than leaving
        // the model in its raw T-pose bind pose until the first update()
        // call one physics step from now.
        this.animationController.update(0);

        // This body is moved by code but still collides with world geometry.
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

        // Actual current horizontal speed (meters/second, XZ plane) —
        // separate from input. update() blends this toward whatever the
        // held keys currently want, at a limited rate, instead of
        // snapping straight to it. See the file header for why this was
        // the actual bug, not a nice-to-have: without it, this used to go
        // instantly from 0 to MOVE_SPEED in whichever of 8 raw directions
        // WASD produced, which reads as rigid and weightless rather than
        // something with any mass behind it.
        this.velocity = new THREE.Vector3();
    }

    get object3D() {
        return this.entity.object3D;
    }

    syncFromPhysics() {
        this.entity.syncFromPhysics();
    }

    // Called before each fixed physics step so this move is what Rapier
    // resolves against the world's colliders.
    update(dt) {
        const inputDirection = new THREE.Vector3();
        if (this.inputManager.isDown('KeyW') || this.inputManager.isDown('ArrowUp')) inputDirection.z -= 1;
        if (this.inputManager.isDown('KeyS') || this.inputManager.isDown('ArrowDown')) inputDirection.z += 1;
        if (this.inputManager.isDown('KeyA') || this.inputManager.isDown('ArrowLeft')) inputDirection.x -= 1;
        if (this.inputManager.isDown('KeyD') || this.inputManager.isDown('ArrowRight')) inputDirection.x += 1;

        const hasInput = inputDirection.lengthSq() > 0;
        if (hasInput) {
            inputDirection.normalize();
        }

        // The momentum fix: `this.velocity` is state that PERSISTS across
        // frames, and only ever moves toward whatever the input currently
        // wants — it no longer jumps there in one step. Blending the whole
        // velocity vector makes a direction change follow a subtle arc
        // instead of snapping along a straight line between WASD vectors.
        const targetVelocity = inputDirection.clone().multiplyScalar(MOVE_SPEED);
        const lerpFactor = 1 - Math.exp(-VELOCITY_SMOOTHING * dt);
        this.velocity.lerp(targetVelocity, lerpFactor);

        const horizontal = this.velocity.clone().multiplyScalar(dt);

        // Facing and animation are driven by ACTUAL velocity, not raw
        // input — so tapping a direction and releasing it still turns and
        // runs while momentum carries the character forward, rather than
        // snapping back to idle the instant the key lifts even though
        // it's visibly still sliding across the ground.
        const isMoving = this.velocity.lengthSq() > STOP_SPEED * STOP_SPEED;
        if (isMoving) {
            this.rotateToFaceMovement(this.velocity.clone().normalize(), dt);
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

        // Grounded isn't factored in here — there's no jump/fall clip
        // wired up yet, so airborne just keeps whichever of these two
        // was already playing rather than guessing at a third state.
        this.animationController.play(isMoving ? 'run' : 'idle');
        this.animationController.update(dt);
    }

    // Turns the model to face wherever it's currently walking, rather than
    // always facing whatever direction it last spawned in — the same
    // reason a real character turns their body to face where they're
    // headed instead of shuffling around sideways.
    //
    // Rotation goes through the rigid body (setNextKinematicRotation),
    // not object3D directly, for the same reason position does: visuals
    // are driven ONE way, from physics, via Entity.syncFromPhysics() (see
    // entities/Entity.js) — copying position but not rotation would leave
    // this rotation invisible until the next physics step overwrote it
    // anyway, so we may as well let physics be the single source of truth
    // for both.
    rotateToFaceMovement(direction, dt) {
        const target = new THREE.Quaternion().setFromUnitVectors(MODEL_FORWARD, direction);

        // Snapping straight to `target` every step is what looked instant
        // and robotic before. THREE.Quaternion.slerp() already knows how
        // to blend two rotations along the shortest arc (including
        // picking the right "side" of the rotation so it doesn't spin the
        // long way around) — no need to hand-roll that math, just call it
        // with a small step each frame instead of jumping all the way.
        //
        // The blend factor is `1 - e^(-TURN_SPEED * dt)` rather than a
        // flat constant so turning speed doesn't depend on frame rate:
        // a fixed factor like 0.2 would converge in a fixed NUMBER of
        // steps regardless of how much real time each step covers, so
        // the same turn would visibly take longer at a lower physics
        // rate. This formula instead converges at a fixed RATE per
        // second of real time, however many steps that takes.
        const current = this.entity.rigidBody.rotation();
        const rotation = new THREE.Quaternion(current.x, current.y, current.z, current.w);
        rotation.slerp(target, 1 - Math.exp(-TURN_SPEED * dt));

        this.entity.rigidBody.setNextKinematicRotation(rotation);
    }
}
