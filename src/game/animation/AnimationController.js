// AnimationController.js
//
// Plays named animation clips on a character, crossfading between them
// instead of hard-cutting — switching from idle to running should blend,
// not pop between two static poses.
//
// This wraps THREE.AnimationMixer, which is three.js's own machinery for
// this exact job (advancing clip time, blending multiple simultaneous
// actions by weight) — nothing here reimplements what the mixer already
// does, it just gives Player (and eventually any other animated
// character) a small "play this named state" API instead of juggling
// AnimationAction objects directly.
import * as THREE from 'three';

const CROSSFADE_DURATION = 0.2; // seconds

export class AnimationController {
    // `root` is the Object3D the clips' bone tracks get bound onto (see
    // Player.js for why this works even though the clips were authored
    // against a DIFFERENT file's skeleton — AnimationMixer binds tracks by
    // bone NAME within `root`, not by original identity, so any model
    // sharing the same bone names can play the same clips).
    //
    // `clips` is a plain { name: THREE.AnimationClip } map, not the raw
    // array a GLTF gives you — Player.js picks out just the specific named
    // clips it wants ahead of time, so this class only ever deals with
    // "idle"/"run"-style labels, never clip-file bookkeeping.
    constructor(root, clips) {
        this.mixer = new THREE.AnimationMixer(root);
        this.actions = {};
        for (const [name, clip] of Object.entries(clips)) {
            this.actions[name] = this.mixer.clipAction(clip);
        }
        this.currentAction = null;
    }

    // Switches to the named action. Calling this again with the
    // already-active name is a no-op — without that check, holding a
    // movement key would restart the crossfade every single frame instead
    // of just... continuing to run.
    play(name) {
        const nextAction = this.actions[name];
        if (!nextAction || nextAction === this.currentAction) return;

        // The standard three.js crossfade idiom: both actions play
        // simultaneously for CROSSFADE_DURATION, with the outgoing one
        // fading its weight to 0 and the incoming one fading up to 1, so
        // the mixer blends them instead of either popping in fully formed.
        if (this.currentAction) {
            this.currentAction.fadeOut(CROSSFADE_DURATION);
        }
        nextAction.reset().setEffectiveWeight(1).fadeIn(CROSSFADE_DURATION).play();

        this.currentAction = nextAction;
    }

    update(dt) {
        this.mixer.update(dt);
    }
}
