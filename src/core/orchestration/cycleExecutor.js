/**
 * cycleExecutor – Runs the execute‑and‑review loop (max 3 cycles).
 */
import { executeAllParallel } from '../parallelExec.js';
import { reviewAll } from '../reviewer.js';
import { saveMemory, saveCheckpoint, loadMemory } from '../persistentMemory.js';
import { topologicalSort } from '../taskQueueUtils.js';

export async function runCycles(ctx, depth) {
    let cycles = 0;
    const MAX_CYCLES = 3;
    let allPassed = false;

    while (cycles < MAX_CYCLES && !ctx.pauseRequested) {
        cycles++;
        ctx.onLog(`🔄 Cycle ${cycles}/${MAX_CYCLES}`);

        if (depth === 0 && cycles > 1) {
            ctx.workingMemory = await loadMemory(ctx, ctx.runId);
        }

        await executeAllParallel(ctx, 3);

        if (depth === 0) {
            await saveMemory(ctx, ctx.workingMemory, ctx.runId);
            await saveCheckpoint(ctx);
        }

        const review = await reviewAll(ctx);
        if (review.passed) {
            allPassed = true;
            break;
        }
        ctx.onLog(`⚠️ ${review.issues} issue(s) found – retrying`);
    }

    return { allPassed, cycles };
}

function topologicalSort(tasks) {
    const byId = {};
    tasks.forEach(t => { byId[t.id] = t; });
    const sorted = [];
    const visited = new Set();
    const tempMark = new Set();

    function visit(task) {
        if (visited.has(task.id)) return;
        if (tempMark.has(task.id)) return;
        tempMark.add(task.id);
        (task.dependsOn || []).forEach(depId => {
            const dep = byId[depId];
            if (dep) visit(dep);
        });
        tempMark.delete(task.id);
        visited.add(task.id);
        sorted.push(task);
    }

    tasks.forEach(t => visit(t));
    return sorted;
}
