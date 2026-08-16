// mage.js
//
// A "mob definition" is just plain data — no behavior, no methods. It
// describes everything MobFactory needs to spawn a mage: which model file to
// load and what physics collider shape approximates its body. Adding a new
// mob type later (a goblin, a skeleton, etc.) means adding another file like
// this one and registering it with MobRegistry — not writing a new class.
export const mageDefinition = {
    id: 'mage',

    // Served from /public, so Vite exposes it at the site root — this path
    // is what gets fetched by GLTFLoader, not a filesystem path.
    modelPath: '/mage.glb',

    // A capsule (a cylinder with rounded caps) is the standard approximate
    // collider shape for humanoid characters — cheaper to simulate than the
    // full character mesh and forgiving of the character's exact pose.
    collider: {
        shape: 'capsule',
        halfHeight: 0.5, // half the height of the capsule's straight cylindrical section
        radius: 0.4,
    },
};
