/**
 * SelfImprover – Main orchestrator.
 * Delegates to focused modules for setup, execution, and post‑run actions.
 */
import { setupRun } from './orchestration/runSetup.js';
import { runCycles } from './orchestration/cycleExecutor.js';
import { runPostActions } from './orchestration/postRunActions.js';
import { createPauseController } from './orchestration/pauseController.js';
import { ClarificationQueue } from './orchestration/clarificationQueue.js';
import { createPlan } from './planning/plannerFactory.js';
import { runClarification } from './clarification.js';
import {
    initTaskQueue, getPendingTasks, getDoneTasks,
    markTaskDone, markTaskFailed, markTaskTodo, markTaskReviewPassed, findTask
} from './taskQueue.js';
import { chunkedBuildIndex } from './chunkedIndexer.js';
import { GitHubService } from '../services/github.js';
import { saveMemory } from './persistentMemory.js';

export class SelfImprover {
    constructor({ repo, branch, githubToken, provider, model, thinkingMode,
                  reasoningEffort, netlitySiteName,
                  onLog, onTaskUpdate, onRunComplete, onClarificationNeeded,
                  preferences, onTokenUpdate }) {
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
        this.onTokenUpdate = onTokenUpdate || (() => {});

        this.manifest = null;
        this.fileTree = null;
        this.pauseRequested = false;
        this.taskQueue = null;
        this.currentGoal = null;
        this.discoveryCache = [];
        this.workingMemory = null;
        this.parentGoal = null;
        this.parentWorkingMemory = null;
        this.runId = `run-${Date.now()}`;
        this.changeBranch = null;
        this.conversationMemory = null;
        this.clarificationQueue = null;
        this._pendingSRBlocks = null;
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

        // --- Setup ---
        const { enrichedGoal } = await setupRun(this, goal, depth);
        this.currentGoal = enrichedGoal;

        // --- Clarification ---
        if (depth === 0 && !this.clarificationQueue) {
            this.clarificationQueue = new ClarificationQueue(
                this.conversationMemory,
                (questions) => {
                    this.onLog('❓ Please answer these:\n' +
                        questions.map((q, i) => `${i + 1}. ${q}`).join('\n'));
                }
            );
        }

        // Try to restore pending questions (after page reload)
        const restoredPromise = this.clarificationQueue?.restoreFromMemory();
        if (restoredPromise) {
            const answers = await restoredPromise;
            if (answers) {
                goal = `${goal}\n\nClarifications from user:\n${answers}`;
                this.currentGoal = goal;
            }
        } else {
            const clarificationAnswers = await runClarification(this, enrichedGoal);
            if (clarificationAnswers !== enrichedGoal) {
                this.currentGoal = clarificationAnswers;
            }
        }

        this.onLog(`🚀 Goal: ${goal}${depth > 0 ? ` (sub‑goal, depth ${depth})` : ''}`);

        // --- Plan ---
        const planResult = await createPlan(this, this.currentGoal);
        if (!planResult?.tasks?.length) {
            this.onLog('❌ No tasks generated');
            if (depth === 0) this.conversationMemory.addFailedAttempt('No tasks generated');
            return { success: false };
        }

        this.conversationMemory?.setPhase('executing');
        this.conversationMemory?.setLastAction('Execution started');

        // --- Execute sub‑goals sequentially, then normal tasks ---
        const tasks = this.taskQueue.tasks;
        const normalTasks = [];

        for (const task of tasks) {
            if (this.pauseRequested) break;

            if (task.subGoal) {
                this.onLog(`\n🔽 Starting sub‑goal: "${task.subGoal}"`);
                const child = new SelfImprover({
                    repo: this.repo, branch: this.branch, githubToken: this.githubToken,
                    provider: this.provider, model: this.model,
                    thinkingMode: this.thinkingMode, reasoningEffort: this.reasoningEffort,
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
                child.conversationMemory = this.conversationMemory;

                const subResult = await child.runGoal(task.subGoal, depth + 1);
                if (subResult.success) {
                    markTaskDone(this, task.id);
                    task.committedFiles = subResult.committedFiles || [];
                    this.workingMemory.files = { ...this.workingMemory.files, ...child.workingMemory.files };
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

        if (normalTasks.length > 0) {
            const ordered = topologicalSort(normalTasks);
            this.taskQueue.tasks = ordered.concat(
                tasks.filter(t => t.subGoal && (t.status === 'DONE' || t.status === 'FAILED'))
            );
            this.taskQueue.nextId = Math.max(...this.taskQueue.tasks.map(t => t.id), 0) + 1;
        }

        // --- Execute/Review cycles ---
        const { allPassed } = await runCycles(this, depth);

        // --- Post‑run ---
        let result = await runPostActions(this, goal, depth, allPassed);

        // If regressions added new tasks, re‑run cycles
        if (!result.success && this.taskQueue.tasks.some(t => t.status === 'TODO')) {
            const { allPassed: secondPass } = await runCycles(this, depth);
            result = await runPostActions(this, goal, depth, secondPass);
        }

        // Fallback: if postRunActions didn't set success but all tasks done
        if (!result.success) {
            const allDone = this.taskQueue.tasks.every(
                t => t.status === 'DONE' && t.subGoal == null
            );
            if (allDone) {
                result.success = true;
                result.committedFiles = gatherCommittedFiles(this.taskQueue.tasks);
            }
        }

        if (!result.success && depth === 0) {
            this.conversationMemory?.addFailedAttempt('Run failed for goal: ' + goal);
        }

        try { this.onRunComplete(result); } catch {}
        return result;
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

function gatherCommittedFiles(taskList) {
    const all = new Set();
    for (const t of taskList) {
        (t.committedFiles || []).forEach(f => all.add(f));
    }
    return [...all];
}
