/**
 * persistentMemory – Saves/loads working memory to/from the repo.
 * Scoped by a `runId` so that concurrent or nested runs don't overwrite each other.
 *
 *   - saveMemory(ctx, memory, runId = 'current')
 *   - loadMemory(ctx, runId = 'current')
 *   - saveRunSummary(ctx, goal, success, prUrl)
 */
import { GitHubService } from '../services/github.js';
import { WorkingMemory } from './WorkingMemory.js';

const MEMORY_DIR = '.self-improve';
const RUN_SUMMARY_DIR = '.self-improve';

/**
 * Serialise a WorkingMemory to a plain object (summaries only, no full content).
 */
export function serialiseMemory(memory) {
    if (!memory) return null;
    return {
        goal: memory.goal,
        files: Object.fromEntries(
            Object.entries(memory.files).map(([path, data]) => [
                path,
                { summary: data.summary, readAt: data.readAt }
            ])
        ),
        notes: memory.notes,
        plan: memory.plan
    };
}

/**
 * Deserialise saved JSON back into a WorkingMemory instance.
 */
export function deserialiseMemory(saved) {
    if (!saved) return new WorkingMemory();
    const m = new WorkingMemory();
    m.goal = saved.goal || '';
    if (saved.files) {
        for (const [path, data] of Object.entries(saved.files)) {
            m.files[path] = {
                summary: data.summary,
                fullContent: null,   // will be refetched if needed
                readAt: data.readAt
            };
        }
    }
    m.notes = saved.notes || [];
    m.plan = saved.plan || null;
    return m;
}

/**
 * Build the memory file path for a given run ID.
 */
function memoryPath(runId) {
    return `${MEMORY_DIR}/memory-${runId || 'current'}.json`;
}

/**
 * Save the working memory to the repo.
 * @param {Object} ctx – SelfImprover context
 * @param {WorkingMemory} memory
 * @param {string} [runId] – unique run identifier (default 'current')
 */
export async function saveMemory(ctx, memory, runId = 'current') {
    if (!memory || !ctx.repo || !ctx.githubToken) return;

    const payload = serialiseMemory(memory);
    const path = memoryPath(runId);
    const fileMap = {
        [path]: { content: JSON.stringify(payload, null, 2), sha: null }
    };

    try {
        const existing = await GitHubService.loadFileContent(
            ctx.repo, ctx.branch, path, ctx.githubToken
        );
        fileMap[path].sha = existing.sha;
    } catch { /* doesn't exist yet */ }

    try {
        await GitHubService.commitMultipleFiles(
            ctx.repo, ctx.branch, fileMap,
            `chore: save agent memory (${runId})`, ctx.githubToken
        );
    } catch (e) {
        ctx.onLog(`⚠️ Could not save memory: ${e.message}`);
    }
}

/**
 * Load the working memory from the repo.
 * @param {Object} ctx
 * @param {string} [runId] – unique run identifier (default 'current')
 * @returns {WorkingMemory}
 */
export async function loadMemory(ctx, runId = 'current') {
    try {
        const { content } = await GitHubService.loadFileContent(
            ctx.repo, ctx.branch, memoryPath(runId), ctx.githubToken
        );
        const saved = JSON.parse(content);
        ctx.onLog(`📂 Loaded persistent memory (${runId})`);
        return deserialiseMemory(saved);
    } catch {
        return new WorkingMemory();
    }
}

/**
 * Save a run summary after a completed self‑improvement.
 */
export async function saveRunSummary(ctx, goal, success, prUrl) {
    if (!ctx.repo || !ctx.githubToken) return;

    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const fileName = `${RUN_SUMMARY_DIR}/run-${timestamp}.json`;

    const summary = {
        timestamp,
        goal,
        success,
        prUrl: prUrl || null,
        repo: ctx.repo,
        branch: ctx.branch,
        model: ctx.model
    };

    const fileMap = {
        [fileName]: { content: JSON.stringify(summary, null, 2), sha: null }
    };

    try {
        await GitHubService.commitMultipleFiles(
            ctx.repo, ctx.branch, fileMap,
            `chore: run summary – ${goal.slice(0, 60)}`, ctx.githubToken
        );
    } catch (e) {
        ctx.onLog(`⚠️ Could not save run summary: ${e.message}`);
    }
}
