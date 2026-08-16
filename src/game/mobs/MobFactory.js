// MobFactory.js
//
// Turns a mob definition (plain data, see mobs/definitions/mage.js) into a
// live Entity in the world: loads/clones the visual model via AssetManager,
// creates a matching Rapier rigid body + collider via Physics, and wraps
// both in an Entity (see entities/Entity.js). This is the ONLY place that
// knows how to go from "id + position" to "a spawned thing" — Game.js just
// calls spawn() and doesn't need to know any of these steps itself.
import RAPIER from '@dimforge/rapier3d';
import { clone as cloneSkinnedScene } from 'three/addons/utils/SkeletonUtils.js';
import { Entity } from '../entities/Entity.js';

export class MobFactory {
    constructor({ assetManager, physics }) {
        this.assetManager = assetManager;
        this.physics = physics;
    }

    async spawn(definition, position = { x: 0, y: 0, z: 0 }) {
        // Loading is cached by AssetManager, so spawning many mobs of the
        // same definition only downloads/parses the .glb once.
        const gltf = await this.assetManager.loadModel(definition.modelPath);

        // Every spawned mob needs its OWN Object3D — if we added gltf.scene
        // directly, a second mage would just move the first mage's model
        // instead of creating a new one.
        //
        // We use SkeletonUtils' clone() rather than the plain Object3D.clone()
        // because the mage model is a skinned/rigged mesh (a body deformed by
        // an internal bone hierarchy). Object3D.clone(true) deep-clones the
        // bones themselves, but SkinnedMesh.copy() (which it calls under the
        // hood) just copies a REFERENCE to the original Skeleton rather than
        // rebuilding it against the new bones — so the cloned mesh keeps
        // deforming against the ORIGINAL model's bones, which live in
        // `gltf.scene` and never get added to our rendered THREE.Scene (so
        // their world matrices never update). The visible symptom was the
        // skinned body rendering as if collapsing/frozen in place while
        // non-skinned parts (the hat) moved normally — this clone() helper
        // deep-clones the skeleton too and rewires the mesh to point at the
        // new bones, so skinning follows this clone's own transform.
        const object3D = cloneSkinnedScene(gltf.scene);
        object3D.position.set(position.x, position.y, position.z);

        // --- physics side ---
        // `dynamic()` means this body is fully simulated (affected by
        // gravity and forces), as opposed to `fixed()` (never moves) or a
        // `kinematicX()` body (moved by code, not physics) — see the
        // architecture note in Game.js about why a mob might use either.
        const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(position.x, position.y, position.z);
        const rigidBody = this.physics.createRigidBody(rigidBodyDesc);

        const colliderDesc = this.buildColliderDesc(definition.collider);
        const collider = this.physics.createCollider(colliderDesc, rigidBody);

        return new Entity({ object3D, rigidBody, collider });
    }

    // Translates a definition's plain-data collider description into an
    // actual RAPIER.ColliderDesc. Kept separate from spawn() so adding a new
    // supported shape (e.g. "ball", "cuboid") later is a one-line addition
    // here, not a change to spawn()'s flow.
    buildColliderDesc({ shape, ...params }) {
        switch (shape) {
            case 'capsule':
                return RAPIER.ColliderDesc.capsule(params.halfHeight, params.radius);
            default:
                throw new Error(`MobFactory: unsupported collider shape "${shape}"`);
        }
    }
}
