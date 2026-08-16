// AssetManager.js
//
// Loads and caches GLTF/GLB 3D models. This is the "glb loader" the mage
// model needs — GLTFLoader is Three.js's built-in loader for the .glb/.gltf
// format (the standard format exported by Blender and most 3D tools).
//
// Why a cache: GLTFLoader.load() does an async network fetch + parse every
// time you call it. If five goblins all used the same goblin.glb, we do NOT
// want to fetch/parse that file five times — we load it once and let callers
// clone the result per spawn (cloning an already-parsed Object3D is cheap;
// re-downloading and re-parsing a file is not).
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class AssetManager {
    constructor() {
        this.loader = new GLTFLoader();

        // Maps a model path (e.g. "/mage.glb") -> a Promise that resolves to
        // the loaded GLTF data. Storing the *promise* (not just the eventual
        // result) means if two things ask for the same model before it's
        // finished loading, they both await the same in-flight request
        // instead of triggering a second load.
        this.modelCache = new Map();
    }

    // Returns a Promise resolving to the parsed GLTF object, which looks like
    // { scene, animations, cameras, ... } — `scene` is the Object3D hierarchy
    // (meshes, bones, etc.) that we actually add to our Three.js scene.
    loadModel(path) {
        if (this.modelCache.has(path)) {
            return this.modelCache.get(path);
        }

        const promise = new Promise((resolve, reject) => {
            this.loader.load(
                path,
                (gltf) => resolve(gltf),
                undefined, // onProgress callback — unused here
                (error) => reject(error),
            );
        });

        this.modelCache.set(path, promise);
        return promise;
    }
}
