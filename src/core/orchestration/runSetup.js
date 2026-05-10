/**
 * runSetup – Handles everything before the planning phase:
 * conversation memory, error ingestion, preferences, feature branch, working memory.
 */
import { PreferencesService } from '../../services/PreferencesService.js';
import { ConversationMemory } from '../../services/conversationMemory.js';
import { ErrorIngestion } from '../../services/errorIngestion.js';
import { GitHubService } from '../../services/github.js';
import { WorkingMemory } from '../WorkingMemory.js';
import { loadMemory } from '../persistentMemory.js';
import { ensureManifest } from '../manifestManager.js';

export async function setupRun(ctx, goal, depth) {
    // Cross‑run memory
    if (depth === 0) {
        if (!ctx.conversationMemory) {
            ctx.conversationMemory = new ConversationMemory(ctx.repo, ctx.originalBranch);
        }
        ctx.conversationMemory.startRun(goal);
    }

    // Error ingestion
    let enrichedGoal = goal;
    const errorContext = ErrorIngestion.getErrorContext(goal);
    if (errorContext) {
        ctx.onLog('🪵 Detected error stack trace – prioritising mentioned files');
        enrichedGoal = `[ERROR CONTEXT]\n${errorContext}\n\nUser goal:\n${goal}`;
    }

    // Load preferences (top‑level only)
    if (depth === 0 && !ctx.preferences) {
        try {
            ctx.preferences = await PreferencesService.load(ctx.repo, ctx.originalBranch, ctx.githubToken);
        } catch { /* stay empty */ }
    }

    // Create feature branch (top‑level only)
    if (depth === 0 && !ctx.changeBranch) {
        ctx.changeBranch = `${ctx.originalBranch}-self-improve-${Date.now()}`;
        try {
            await GitHubService.createBranch(ctx.repo, ctx.changeBranch, ctx.originalBranch, ctx.githubToken);
            ctx.branch = ctx.changeBranch;
            ctx.onLog(`🌿 Working on branch: ${ctx.changeBranch}`);
        } catch (e) {
            ctx.onLog(`⚠️ Could not create branch: ${e.message}. Continuing on ${ctx.branch}.`);
        }
    }

    // Setup working memory
    if (depth === 0) {
        ctx.workingMemory = await loadMemory(ctx, ctx.runId);
    } else {
        ctx.workingMemory = ctx.parentWorkingMemory
            ? cloneWorkingMemory(ctx.parentWorkingMemory)
            : new WorkingMemory();
        ctx.workingMemory.notes.push(`Parent goal: ${ctx.parentGoal || '(none)'}`);
    }
    ctx.workingMemory.goal = enrichedGoal;

    // Manifest and file tree
    await ensureManifest(ctx);
    if (!ctx.fileTree) await ctx.fetchFileTree();
    await ctx._discoverFiles(enrichedGoal);

    ctx.conversationMemory?.setPhase('planning');
    ctx.conversationMemory?.setLastAction('Setup complete');

    return { enrichedGoal };
}

function cloneWorkingMemory(source) {
    const m = new WorkingMemory();
    m.goal = source.goal;
    m.files = { ...source.files };
    m.notes = [...source.notes];
    return m;
}
