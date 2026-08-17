// InputManager.js
//
// Tracks which keys are currently held down, so other code (the player,
// eventually) can just ask "is this key down right now?" once per frame
// instead of each wiring up its own keydown/keyup listeners and juggling
// its own state.
export class InputManager {
    constructor() {
        this.keysDown = new Set();

        // event.code identifies a physical key position (e.g. "KeyW",
        // "Space") rather than the character it produces, so movement
        // controls like WASD stay in the same physical spot regardless of
        // keyboard layout — unlike event.key, which would give you "z"
        // instead of "w" on an AZERTY keyboard.
        window.addEventListener('keydown', (event) => this.keysDown.add(event.code));
        window.addEventListener('keyup', (event) => this.keysDown.delete(event.code));
    }

    // e.g. isDown('KeyW'), isDown('Space')
    isDown(code) {
        return this.keysDown.has(code);
    }
}
