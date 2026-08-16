// Clock.js
//
// Produces a "fixed timestep" for physics, decoupled from however fast the
// browser happens to call requestAnimationFrame.
//
// Why this matters: rendering fires at a variable rate (60hz, 120hz, or
// erratically if the tab is busy), but a physics simulation gives different
// (and sometimes unstable) results if you feed it a different-sized step
// every time. The standard fix is an "accumulator": track real elapsed time,
// and drain it in fixed-size chunks, running the physics step once per
// chunk. If a frame took 3 chunks worth of time, physics steps 3 times that
// frame. If a frame was fast and didn't accumulate a full chunk yet, physics
// doesn't step at all that frame.
export class Clock {
    constructor(fixedStep = 1 / 60) {
        this.fixedStep = fixedStep;
        this.accumulator = 0;
        this.lastTime = performance.now();
    }

    // Call once per rendered frame. Returns an array of fixed-size steps
    // (in seconds) that should be simulated this frame — usually contains
    // exactly one entry, sometimes zero or several.
    tick() {
        const now = performance.now();
        let delta = (now - this.lastTime) / 1000; // ms -> seconds
        this.lastTime = now;

        // If the tab was backgrounded or the debugger paused execution,
        // `delta` could be huge (seconds). Without this clamp, the
        // accumulator would try to "catch up" by running hundreds of
        // physics steps in one frame, freezing the page — known as the
        // "spiral of death". Capping delta just makes time appear to slow
        // down/skip during that pause instead, which is a fine tradeoff.
        delta = Math.min(delta, 0.1);

        this.accumulator += delta;

        const steps = [];
        while (this.accumulator >= this.fixedStep) {
            steps.push(this.fixedStep);
            this.accumulator -= this.fixedStep;
        }
        return steps;
    }
}
