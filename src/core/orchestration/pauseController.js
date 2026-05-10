/**
 * pauseController – Simple pause flag manager.
 */
export function createPauseController() {
    let pauseRequested = false;
    return {
        requestPause() { pauseRequested = true; },
        checkPause() { return pauseRequested; },
        resetPause() { pauseRequested = false; },
    };
}
