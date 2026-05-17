/**
 * cycleExecutor – Runs the execute-and-review loop for self-improvement tasks.
 * Handles up to 3 cycles of execution and review, with persistent memory save/load.
 */
import { executeTaskAgentic } from '../execution/agenticExecutor.js';
import { reviewAll } from '../reviewer.js';
import { saveMemory, loadMemory } from '../persistentMemory.js';
import { executeAllParallel } from '../parallelExec.js';

export async function runCycles(ctx, depth) {
    const MAX_CYCLES = 3;
    let cycle = 0;
    let allPassed = false;

    while (cycle < MAX_CYCLES) {
        if (ctx.pauseRequested) break;

        ctx.onPhaseChange?.('executing', `Executing (cycle ${cycle + 1}/${MAX_CYCLES})...`);
        
        // Execute pending tasks
        const pending = ctx._getPendingTasks();
        if (!pending.length) {
            ctx.onLog('✅ All tasks executed');
            break;
        }

        // Save memory before execution
        await saveMemory(ctx, ctx.workingMemory, ctx.runId);

        // Execute tasks (parallel for normal tasks, sequential for sub-goals)
        await executeAllParallel(ctx, 3);

        // Review completed tasks
        ctx.onPhaseChange?.('reviewing', `Reviewing (cycle ${cycle + 1}/${MAX_CYCLES})...`);
        const reviewResult = await reviewAll(ctx);
        
        if (reviewResult.passed) {
            allPassed = true;
            ctx.onLog('✅ Review passed');
            break;
        }

        ctx.onLog(`⚠️ Review found ${reviewResult.issues} issue(s), retrying...`);
        
        // Reload memory for next cycle
        ctx.workingMemory = await loadMemory(ctx, ctx.runId);
        
        cycle++;
    }

    if (cycle >= MAX_CYCLES && !allPassed) {
        ctx.onLog('❌ Max review cycles reached');
    }

    return { allPassed, cycles: cycle + 1 };
}
