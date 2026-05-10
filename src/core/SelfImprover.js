/**
 * SelfImprover – Main orchestrator for self‑improvement runs.
 *
 *   - Hierarchical task decomposition: complex goals become sub‑goals.
 *   - Persistent memory across retries (top‑level only, scoped by run ID).
 *   - Sub‑goals inherit parent memory but do NOT persist separately.
 *   - Dependency ordering is enforced before normal task execution.
 *   - LLM calls are ≤20 s, staying within the confirmed Netlify 40‑s header timeout.
 *
 *   Phase 0C + 2C wiring now included:
 *     - ConversationMemory for cross‑run context
 *     - ErrorIngestion for stack trace injection
 *     - Original file contents stored for reviewer
 */
import { GitHubService } from '../services/github.js';
import { LLMProvider } from '../services/llmProvider.js';
import { PreferencesService } from '../services/PreferencesService.js';
import { runClarification } from './clarification.js';
import { ensureManifest } from './manifestManager.js';
import { chunkedBuildIndex } from './chunkedIndexer.js';
import { agenticPlan } from './agenticPlanner.js';
import { coordinatedPlan } from './coordinatedPlanner.js';
import { hierarchicalPlan } from './hierarchicalPlanner.js';
import { executeAllParallel } from './parallelExec.js';
import { reviewAll } from './reviewer.js';
import { createPR } from './prCreator.js';
import { WorkingMemory } from './WorkingMemory.js';
import { saveMemory, loadMemory, saveRunSummary } from './persistentMemory.js';
import {
    initTaskQueue, getPendingTasks, getDoneTasks,
    markTaskDone, markTaskFailed, markTaskTodo, markTaskReviewPassed, findTask
} from './taskQueue.js';
import { SmokeTest } from '../services/smokeTest.js';
import { ConversationMemory } from '../services/conversationMemory.js';   // new
import { ErrorIngestion } from '../services/errorIngestion.js';           // new

export class SelfImprover {
    constructor({ repo, branch, githubToken, provider, model, thinkingMode,
                  reasoningEffort, netlitySiteName,
                  onLog, onTaskUpdate, onRunComplete, onClarificationNeeded,
                  preferences }) {
        this.repo = repo;
        this.originalBranch = branch;
        this.branch = branch;
        this.githubToken = githubToken;
        this.provider = provider;
        this.model = model;
        this.thinkingMode = thinkingMode;
        this.reasoningEffort = reasoningEffort;
        this.netlitySiteName = netlitySiteName || '';
        this.onLog = onLog || (() => {});
        this.onTaskUpdate = onTaskUpdate || (() => {});
        this.onRunComplete = onRunComplete || (() => {});
        this.onClarificationNeeded = onClarificationNeeded || null;
        this.preferences = preferences || null;

        this.manifest = null;
        this.fileTree = null;
        this.pauseRequested = false;
        this.taskQueue = null;
        this.currentGoal = null;
        this.discoveryCache = [];
        this.workingMemory = new WorkingMemory();
        this.parentGoal = null;
        this.parentWorkingMemory = null;
        this.runId = `run-${Date.now()}`;
        this.changeBranch = null;

        // New services – created only for top‑level runs
        this.conversationMemory = null;
    }

    async fetchFileTree() {
        this.fileTree = await GitHubService.fetchFileTree(this.repo, this.branch, this.githubToken);
        this.onLog(`📁 Fetched ${this.fileTree.length} files`);
        return this.fileTree;
    }

    async buildKeywordIndex() {
        return chunkedBuildIndex(this);
    }

    async _discoverFiles(goal) {
        let index = null;
        try {
            const { content } = await GitHubService.loadFileContent(
                this.repo, this.branch, 'keywords.json', this.githubToken
            );
            index = JSON.parse(content);
        } catch {}

        const goalWords = goal.toLowerCase().match(/\b\w{3,}\b/g) || [];
        let scored = [];
        const seen = new Set();

        if (index?.files) {
            for (const [filePath, data] of Object.entries(index.files)) {
                const keywords = Array.isArray(data) ? data : (data.keywords || []);
                const hits = keywords.filter(kw =>
                    goalWords.some(w => kw.toLowerCase().includes(w) || w.includes(kw.toLowerCase()))
                );
                if (hits.length) {
                    scored.push({ path: filePath, score: hits.length, summary: data.summary || '', hits });
                    seen.add(filePath);
                }
            }
        }

        // Add files explicitly mentioned in the goal (by filename or path)
        const fileTree = this.fileTree || [];
        for (const file of fileTree) {
            const fileName = file.path.split('/').pop();
            if (!seen.has(file.path) &&
                (goal.toLowerCase().includes(file.path.toLowerCase()) ||
                 goal.toLowerCase().includes(fileName.toLowerCase()))) {
                let summary = '';
                try {
                    const { content } = await GitHubService.loadFileContent(
                        this.repo, this.branch, file.path, this.githubToken
                    );
                    summary = content.slice(0, 200).replace(/\n/g, ' ');
                } catch {}
                scored.push({ path: file.path, score: 100, summary, hits: ['explicit mention'] });
                seen.add(file.path);
            }
        }

        // Fallback filename scan
        if (!index) {
            const scanExts = /\.(js|jsx|html|css|toml|json)$/;
            const skipPaths = /node_modules|\.min\.|package-lock|yarn\.lock/;
            for (const file of fileTree) {
                if (seen.has(file.path)) continue;
                if (scanExts.test(file.path) && !skipPaths.test(file.path)) {
                    const hits = goalWords.filter(w => file.path.includes(w));
                    if (hits.length) {
                        scored.push({ path: file.path, score: hits.length, summary: '', hits });
                        seen.add(file.path);
                    }
                }
            }
        }

        scored.sort((a, b) => b.score - a.score);
        this.discoveryCache = scored.slice(0, 20);
        this.onLog(`📂 Discovered ${this.discoveryCache.length} relevant files`);
    }

    async runGoal(goal, depth = 0) {
        this.pauseRequested = false;
        const MAX_DEPTH = 3;
        if (depth > MAX_DEPTH) {
            this.onLog('⚠️ Max recursion depth reached');
            return { success: false };
        }

        // ---------- Cross‑run memory (top‑level only) ----------
        if (depth === 0) {
            if (!this.conversationMemory) {
                this.conversationMemory = new ConversationMemory(this.repo, this.originalBranch);
            }
            this.conversationMemory.startRun(goal);
        }

        // ---------- Error ingestion (parse stack traces) ----------
        let enrichedGoal = goal;
        const errorContext = ErrorIngestion.getErrorContext(goal);
        if (errorContext) {
            this.onLog('🪵 Detected error stack trace – prioritising mentioned files');
            enrichedGoal = `[ERROR CONTEXT]\n${errorContext}\n\nUser goal:\n${goal}`;
        }

        // ---------- Load preferences (top‑level only) ----------
        if (depth === 0 && !this.preferences) {
            try {
                this.preferences = await PreferencesService.load(this.repo, this.originalBranch, this.githubToken);
            } catch { /* stay empty */ }
        }

        // ---------- Create feature branch (top‑level only) ----------
        if (depth === 0 && !this.changeBranch) {
            this.changeBranch = `${this.originalBranch}-self-improve-${Date.now()}`;
            try {
                await GitHubService.createBranch(this.repo, this.changeBranch, this.originalBranch, this.githubToken);
                this.branch = this.changeBranch;
                this.onLog(`🌿 Working on branch: ${this.changeBranch}`);
            } catch (e) {
                this.onLog(`⚠️ Could not create branch: ${e.message}. Continuing on ${this.branch}.`);
            }
        }

        let result = { success: false, committedFiles: [] };

        try {
            // ---------- Setup working memory ----------
            if (depth === 0) {
                this.workingMemory = await loadMemory(this, this.runId);
            } else {
                this.workingMemory = this.parentWorkingMemory
                    ? cloneWorkingMemory(this.parentWorkingMemory)
                    : new WorkingMemory();
                this.workingMemory.notes.push(`Parent goal: ${this.parentGoal || '(none)'}`);
            }
            this.workingMemory.goal = enrichedGoal;

            // 1. Clarification (uses original goal string without error context)
            const clarifiedGoal = await runClarification(this, enrichedGoal);
            this.currentGoal = clarifiedGoal;
            this.onLog(`🚀 Goal: ${goal}${depth > 0 ? ` (sub‑goal, depth ${depth})` : ''}`);

            // 2. File tree & manifest
            await ensureManifest(this);
            if (!this.fileTree) await this.fetchFileTree();
            await this._discoverFiles(clarifiedGoal);

            // 3. Plan (hierarchical)
            const normalPlanner = this.discoveryCache.length > 10 ? coordinatedPlan : agenticPlan;
            const planResult = await hierarchicalPlan(this, clarifiedGoal, normalPlanner);
            if (!planResult?.tasks?.length) {
                this.onLog('❌ No tasks generated');
                if (depth === 0) this.conversationMemory.addFailedAttempt('No tasks generated');
                return result;
            }

            // 4. Execute tasks – sub‑goals first, then normal tasks
            const tasks = this.taskQueue.tasks;
            const normalTasks = [];

            for (const task of tasks) {
                if (this.pauseRequested) break;

                if (task.subGoal) {
                    // ---- SUB‑GOAL (recursive) ----
                    this.onLog(`\n🔽 Starting sub‑goal: "${task.subGoal}"`);
                    const child = new SelfImprover({
                        repo: this.repo,
                        branch: this.branch,
                        githubToken: this.githubToken,
                        provider: this.provider,
                        model: this.model,
                        thinkingMode: this.thinkingMode,
                        reasoningEffort: this.reasoningEffort,
                        netlitySiteName: this.netlitySiteName,
                        onLog: (msg) => this.onLog(`  [sub] ${msg}`),
                        onTaskUpdate: () => {},
                        onRunComplete: () => {},
                        onClarificationNeeded: this.onClarificationNeeded,
                        preferences: this.preferences
                    });
                    child.parentGoal = goal;
                    child.parentWorkingMemory = this.workingMemory;
                    child.fileTree = this.fileTree;
                    child.discoveryCache = this.discoveryCache;
                    child.changeBranch = this.changeBranch;
                    child.branch = this.branch;
                    // Inherit conversation memory (read‑only for sub‑agents)
                    child.conversationMemory = this.conversationMemory;

                    const subResult = await child.runGoal(task.subGoal, depth + 1);

                    if (subResult.success) {
                        markTaskDone(this, task.id);
                        task.committedFiles = subResult.committedFiles || [];
                        this.workingMemory.files = {
                            ...this.workingMemory.files,
                            ...child.workingMemory.files
                        };
                        this.workingMemory.notes.push(`Sub‑goal "${task.title}" done`);
                        this.onLog(`✅ Sub‑goal completed: ${task.title}`);
                    } else {
                        markTaskFailed(this, task.id);
                        this.onLog(`❌ Sub‑goal failed: ${task.title}`);
                    }
                    this.onTaskUpdate();
                } else {
                    normalTasks.push(task);
                }
            }

            // 5. Execute normal tasks
            if (normalTasks.length > 0) {
                const orderedNormalTasks = topologicalSort(normalTasks);
                this.taskQueue.tasks = orderedNormalTasks.concat(
                    tasks.filter(t => t.subGoal && (t.status === 'DONE' || t.status === 'FAILED'))
                );
                this.taskQueue.nextId = Math.max(...this.taskQueue.tasks.map(t => t.id), 0) + 1;
            }

            // 6. Review loop (now uses before/after comparison)
            let cycles = 0;
            const MAX_CYCLES = 3;
            let allPassed = false;

            while (cycles < MAX_CYCLES && !this.pauseRequested) {
                cycles++;
                this.onLog(`🔄 Cycle ${cycles}/${MAX_CYCLES}`);

                if (depth === 0 && cycles > 1) {
                    this.workingMemory = await loadMemory(this, this.runId);
                }

                await executeAllParallel(this, 3);

                if (depth === 0) {
                    await saveMemory(this, this.workingMemory, this.runId);
                }

                const review = await reviewAll(this);
                if (review.passed) {
                    allPassed = true;
                    break;
                }
                this.onLog(`⚠️ ${review.issues} issue(s) found – retrying`);
            }

            // 7. PR & summary (top‑level only)
            const allDone = this.taskQueue.tasks.every(t => t.status === 'DONE');

            if (allDone && depth === 0) {
                const prUrl = await createPR(this, goal);
                result.success = true;
                result.prUrl = prUrl;
                result.committedFiles = gatherCommittedFiles(this.taskQueue.tasks);
                this.onLog(`✅ PR: ${prUrl}`);

                await saveRunSummary(this, goal, true, prUrl);

                // Record success in conversation memory
                this.conversationMemory.addDecision('Completed: ' + goal);
                this.conversationMemory.setPhase('done');

                if (this.netlitySiteName) {
                    this.onLog('🌐 Waiting for Netlify deploy preview...');
                    try {
                        const prNumber = parseInt(prUrl.split('/pull/')[1], 10);
                        const smoke = await SmokeTest.testDeployPreview(
                            this.repo, this.branch, this.githubToken, prNumber,
                            this.netlitySiteName
                        );
                        this.onLog(smoke.success ? `✅ Smoke test passed: ${smoke.url}` : `⚠️ Smoke test failed: ${smoke.error}`);
                    } catch (e) { this.onLog(`⚠️ Smoke test error: ${e.message}`); }
                }
            } else if (allDone) {
                result.success = true;
                result.committedFiles = gatherCommittedFiles(this.taskQueue.tasks);
            }

            // Record failure if top‑level run didn't succeed
            if (!result.success && depth === 0) {
                this.conversationMemory.addFailedAttempt('Run failed for goal: ' + goal);
            }

            return result;

        } catch (err) {
            this.onLog(`❌ Run error: ${err.message}`);
            if (depth === 0) {
                await saveMemory(this, this.workingMemory, this.runId);
                this.conversationMemory.addFailedAttempt('Exception: ' + err.message);
            }
            return result;
        } finally {
            this.onRunComplete(result);
        }
    }

    pause() { this.pauseRequested = true; }

    _initTaskQueue(tasks) { initTaskQueue(this, tasks); }
    _getPendingTasks() { return getPendingTasks(this); }
    _getDoneTasks() { return getDoneTasks(this); }
    _markTaskDone(id) { markTaskDone(this, id); }
    _markTaskFailed(id) { markTaskFailed(this, id); }
    _markTaskTodo(id) { markTaskTodo(this, id); }
    _markTaskReviewPassed(id) { markTaskReviewPassed(this, id); }
    _findTask(id) { return findTask(this, id); }
}

function cloneWorkingMemory(source) {
    const m = new WorkingMemory();
    m.goal = source.goal;
    m.files = { ...source.files };
    m.notes = [...source.notes];
    return m;
}

function gatherCommittedFiles(taskList) {
    const all = new Set();
    for (const t of taskList) {
        (t.committedFiles || []).forEach(f => all.add(f));
    }
    return [...all];
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
