/**
 * parallelExec – Executes the task queue in parallel (up to maxConcurrency).
 * Each task is handled by executeTaskAgentic, which is already small‑scoped
 * and fast. Conflicts are avoided by skipping tasks that touch files already
 * being modified by another concurrent task.
 */
import { executeTaskAgentic } from './execution/agenticExecutor.js';
import { markTaskDone, markTaskFailed } from './taskQueue.js';

export async function executeAllParallel(ctx, maxConcurrency = 3) {
    const pending = ctx.taskQueue.tasks.filter(t => t.status === 'TODO');
    if (!pending.length) return;

    const lockedFiles = new Set();
    const running = new Set();

    const worker = async (task) => {
        const files = task.files || [];
        if (files.some(f => lockedFiles.has(f))) {
            ctx.onLog(`🔒 Skipping ${task.title} (files locked)`);
            return;
        }
        files.forEach(f => lockedFiles.add(f));

        ctx.onLog(`🔨 Task: ${task.title}`);
        const result = await executeTaskAgentic(ctx, task);
        if (result) {
            markTaskDone(ctx, task.id);
            ctx.onLog(`✅ ${task.title} completed`);
        } else {
            markTaskFailed(ctx, task.id);
            ctx.onLog(`❌ ${task.title} failed`);
        }
        ctx.onTaskUpdate();

        files.forEach(f => lockedFiles.delete(f));
    };

    for (const task of pending) {
        const p = worker(task).finally(() => running.delete(p));
        running.add(p);
        if (running.size >= maxConcurrency) {
            await Promise.race(running);
        }
    }
    await Promise.all(running);
}
