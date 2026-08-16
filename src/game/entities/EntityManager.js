// EntityManager.js
//
// Owns the set of all live Entities (see Entity.js) and is responsible for
// two things: (1) adding/removing their visuals to/from the Three.js scene,
// and (2) ticking them every frame so their visuals stay in sync with
// physics. Nothing about specific mob types lives here — this class only
// deals in the generic Entity shape, so it works the same whether there's
// one mob in the scene or a hundred.
export class EntityManager {
    constructor(scene) {
        this.scene = scene;
        // A Set (not an array) because entities are added/removed
        // individually and never need index-based access — Set gives us
        // cheap add/delete and iteration.
        this.entities = new Set();
    }

    add(entity) {
        this.entities.add(entity);
        // The Entity itself doesn't touch the scene graph — EntityManager
        // does, since "is this thing currently visible in the world" is a
        // scene-management concern, not something each entity needs to know
        // about itself.
        this.scene.add(entity.object3D);
        return entity;
    }

    remove(entity) {
        this.entities.delete(entity);
        this.scene.remove(entity.object3D);
    }

    // Called once per rendered frame, after Physics.step() has advanced the
    // simulation, and before Renderer.render() draws the frame. This is the
    // "physics -> visuals" half of the sync described in Entity.js.
    update() {
        for (const entity of this.entities) {
            entity.syncFromPhysics();
        }
    }
}
