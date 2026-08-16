// MobRegistry.js
//
// A lookup table from mob id -> mob definition. A "mob definition" (see
// mobs/definitions/mage.js) is plain data describing a mob type: what model
// to load, what collider shape to give it, etc. The registry exists so that
// the rest of the game can spawn a mob by id ("mage") without needing to
// import that mob's definition file directly — new mob types get added by
// registering a new definition, not by writing new spawn code.
export class MobRegistry {
    constructor() {
        this.definitions = new Map();
    }

    register(definition) {
        this.definitions.set(definition.id, definition);
    }

    get(id) {
        const definition = this.definitions.get(id);
        if (!definition) {
            throw new Error(`MobRegistry: no mob registered with id "${id}"`);
        }
        return definition;
    }
}
