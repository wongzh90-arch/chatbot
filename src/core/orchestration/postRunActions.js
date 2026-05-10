/**
 * postRunActions – Everything after review passes:
 * manifest update, regression detection, goal verification, PR, smoke test.
 */
import { GitHubService } from '../../services/github.js';
import { ManifestUpdater } from '../manifestUpdater.js';
import { detectRegressions } from '../regressionDetector.js';
import { verifyGoal } from '../goalVerifier.js';
import { createPR } from '../prCreator.js';
import { saveRunSummary } from '../persistentMemory.js';
import { SmokeTest } from '../../services/smokeTest.js';

export async function runPostActions(ctx, goal, depth, allPassed) {
    let result = { success: false, committedFiles: [], prUrl: null };

    if (!allPassed) {
        ctx.conversationMemory?.addFailedAttempt('Review did not pass');
        return result;
    }

    // Self‑update manifest
    const changedPaths = gatherCommittedFiles(ctx.taskQueue.tasks);
    if (changedPaths.length && ctx.manifest) {
        const changedContents = {};
        for (const p of changedPaths) {
            try {
                const { content } = await GitHubService.loadFileContent(ctx.repo, ctx.branch, p, ctx.githubToken);
                changedContents[p] = content;
            } catch {}
        }
        if (Object.keys(changedContents).length) {
            ctx.manifest = ManifestUpdater.update(ctx.manifest, changedContents);
            const manifestMap = {
                'manifest.json': { content: JSON.stringify(ctx.manifest, null, 2), sha: null }
            };
            try {
                const existing = await GitHubService.loadFileContent(ctx.repo, ctx.branch, 'manifest.json', ctx.githubToken);
                manifestMap['manifest.json'].sha = existing.sha;
            } catch {}
            await GitHubService.commitMultipleFiles(ctx.repo, ctx.branch, manifestMap,
                'chore: update manifest after self‑improve', ctx.githubToken);
            ctx.onLog('📋 Manifest updated');
        }
    }

    // Regression detection
    if (changedPaths.length && ctx.manifest) {
        const regressions = await detectRegressions(ctx, changedPaths);
        if (regressions.length) {
            for (const reg of regressions) {
                ctx.taskQueue.tasks.push({
                    id: ctx.taskQueue.nextId++,
                    status: 'TODO',
                    title: `Fix regression in ${reg.file}`,
                    description: reg.detail,
                    files: [reg.file],
                    subGoal: null,
                    dependsOn: [],
                    committedFiles: null
                });
            }
            return result; // caller should re‑enter cycle loop
        }
    }

    // Goal verification
    const verification = await verifyGoal(ctx, goal);
    if (!verification.achieved) {
        ctx.onLog(`🎯 Goal NOT achieved: ${verification.reason}`);
        ctx.conversationMemory?.addFailedAttempt(`Goal verification failed: ${verification.reason}`);
        return result;
    }

    // PR (top‑level only)
    if (depth === 0) {
        const prUrl = await createPR(ctx, goal);
        result.success = true;
        result.prUrl = prUrl;
        result.committedFiles = gatherCommittedFiles(ctx.taskQueue.tasks);
        ctx.onLog(`✅ PR: ${prUrl}`);

        ctx.conversationMemory?.addDecision('Completed: ' + goal);
        ctx.conversationMemory?.setPhase('done');
        ctx.conversationMemory?.setLastAction('PR created');

        await saveRunSummary(ctx, goal, true, prUrl);

        if (ctx.netlitySiteName) {
            ctx.onLog('🌐 Waiting for Netlify deploy preview...');
            try {
                const prNumber = parseInt(prUrl.split('/pull/')[1], 10);
                const smoke = await SmokeTest.testDeployPreview(
                    ctx.repo, ctx.branch, ctx.githubToken, prNumber, ctx.netlitySiteName
                );
                ctx.onLog(smoke.success ? `✅ Smoke test passed: ${smoke.url}` : `⚠️ Smoke test failed: ${smoke.error}`);
            } catch (e) { ctx.onLog(`⚠️ Smoke test error: ${e.message}`); }
        }
    } else {
        result.success = true;
        result.committedFiles = gatherCommittedFiles(ctx.taskQueue.tasks);
    }

    return result;
}

function gatherCommittedFiles(taskList) {
    const all = new Set();
    for (const t of taskList) {
        (t.committedFiles || []).forEach(f => all.add(f));
    }
    return [...all];
}
