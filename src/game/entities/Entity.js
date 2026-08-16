// Entity.js
//
// An Entity is the glue between "a thing you can see" (a Three.js Object3D —
// usually a loaded model) and "a thing that physically exists" (a Rapier
// RigidBody + Collider). Three.js and Rapier are completely separate
// libraries that don't know about each other; Entity is what keeps one
// object's visual position in sync with its physics position.
export class Entity {
    constructor({ object3D, rigidBody, collider = null }) {
        this.object3D = object3D;
        this.rigidBody = rigidBody;
        this.collider = collider;
    }

    // Called once per rendered frame (from EntityManager.update(), after
    // Physics.step() has run) to copy the rigid body's simulated
    // position/rotation onto the visible mesh. This is a ONE-WAY sync:
    // physics drives the visuals here. For a kinematic/player-controlled
    // entity you'd instead write the mesh's intended position INTO the
    // rigid body — but for a mob that's just falling under gravity, this
    // direction is all we need.
    syncFromPhysics() {
        if (!this.rigidBody) return;

        const translation = this.rigidBody.translation(); // { x, y, z }
        const rotation = this.rigidBody.rotation();        // { x, y, z, w } quaternion

        this.object3D.position.set(translation.x, translation.y, translation.z);
        this.object3D.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    }
}
