import { GitHubService } from '../services/github.js';
import { LLMProvider } from '../services/llmProvider.js';
import { saveMemory } from './persistentMemory.js';
import { chunkedBuildIndex } from './chunkedIndexer.js';
import { initTaskQueue, getPendingTasks, getDoneTasks,
         markTaskDone, markTaskFailed, markTaskTodo, markTaskReviewPassed, findTask } from './taskQueue.js';

import { setupRun } from './orchestration/runSetup.js';
import { runCycles } from './orchestration/cycleExecutor.js';
import { runPostActions } from './orchestration/postRunActions.js';
import { ClarificationQueue } from './orchestration/clarificationQueue.js';
import { createPlan } from './planning/plannerFactory.js';

export class SelfImprover {
    constructor({ repo, branch, githubToken, provider, model, thinkingMode,
                  reasoningEffort, netlifySiteName,
                  onLog, onTaskUpdate, onRunComplete, onClarificationNeeded,
                  preferences, onTokenUpdate, onPhaseChange, onFileChange }) {
        this.repo = repo;
        this.originalBranch = branch;
        this.branch = branch;
        this.githubToken = githubToken;
        this.provider = provider;
        this.model = model;
        this.thinkingMode = thinkingMode;
        this.reasoningEffort = reasoningEffort;
        this.netlifySiteName = netlifySiteName || '';
        this.onLog = onLog || (() => {});
        this.onTaskUpdate = onTaskUpdate || (() => {});
        this.onRunComplete = onRunComplete || (() => {});
        this.onClarificationNeeded = onClarificationNeeded || (() => {}); // Now properly wired
        this.preferences = preferences || null;
        this.onTokenUpdate = onTokenUpdate || (() => {});
        this.onPhaseChange = onPhaseChange || (() => {});
        this.onFileChange = onFileChange || (() => {});

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

        try {
            // Setup with timeout protection
            const { enrichedGoal } = await this._withTimeout(
                setupRun(this, goal, depth),
                30000,
                'Setup timed out'
            );
            this.currentGoal = enrichedGoal;

            // ── Clarification (top-level only) ──
            if (depth === 0) {
                await this._handleClarification(enrichedGoal);
            }

            this.onLog(`🚀 Goal: ${this.currentGoal}${depth > 0 ? ` (sub‑goal, depth ${depth})` : ''}`);
            this.onPhaseChange?.('planning', 'Planning...');

            // Plan with timeout protection
            const planResult = await this._withTimeout(
                createPlan(this, this.currentGoal),
                45000,
                'Planning timed out'
            );
            
            if (!planResult?.tasks?.length) {
                this.onLog('❌ No tasks generated');
                if (depth === 0) this.conversationMemory?.addFailedAttempt('No tasks generated');
                return { success: false };
            }

            this.conversationMemory?.setPhase('executing');
            this.conversationMemory?.setLastAction('Execution started');
            this.onPhaseChange?.('executing', 'Executing...');

            // Execute sub‑goals sequentially, then normal tasks
            const tasks = this.taskQueue.tasks;
            const normalTasks = [];

            for (const task of tasks) {
                if (this.pauseRequested) break;

                if (task.subGoal) {
                    await this._executeSubGoal(task, goal, depth);
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

            // Execute/review cycles with error recovery
            let cycleResult;
            try {
                cycleResult = await this._withTimeout(
                    runCycles(this, depth),
                    120000, // 2 min for full cycle
                    'Execution cycle timed out'
                );
            } catch (err) {
                this.onLog(`⚠️ Cycle error: ${err.message}. Attempting partial completion...`);
                cycleResult = { allPassed: false, cycles: 0 };
            }

            // Post‑run actions
            let result = await runPostActions(this, goal, depth, cycleResult.allPassed);

            // If regressions added new tasks, re‑run
            if (!result.success && this.taskQueue.tasks.some(t => t.status === 'TODO')) {
                try {
                    const { allPassed: secondPass } = await runCycles(this, depth);
                    result = await runPostActions(this, goal, depth, secondPass);
                } catch (err) {
                    this.onLog(`⚠️ Second pass failed: ${err.message}`);
                }
            }

            // Fallback success check
            if (!result.success) {
                const allDone = this.taskQueue.tasks.every(t => t.status === 'DONE' && !t.subGoal);
                if (allDone) {
                    result.success = true;
                    result.committedFiles = gatherCommittedFiles(this.taskQueue.tasks);
                }
            }

            // File change notifications
            if (result.committedFiles?.length) {
                for (const file of result.committedFiles) {
                    this.onFileChange?.(file, 'committed', null);
                }
            }

            if (depth === 0) {
                if (!result.success) {
                    this.conversationMemory?.addFailedAttempt('Run failed for goal: ' + goal);
                }
            }

            this.onPhaseChange?.(result.success ? 'done' : 'failed',
                                 result.success ? 'Run completed' : 'Run failed');

            return result;
            
        } catch (err) {
            this.onLog(`❌ Fatal error in runGoal: ${err.message}`);
            this.onPhaseChange?.('failed', `Error: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    async _handleClarification(enrichedGoal) {
        if (!this.clarificationQueue) {
            this.clarificationQueue = new ClarificationQueue(
                this.conversationMemory,
                (questions) => {
                    // Notify UI to display questions
                    this.onClarificationNeeded(questions);
                }
            );
        }

        if (this.clarificationQueue.isPending()) {
            const restoredPromise = this.clarificationQueue.restoreFromMemory();
            if (restoredPromise) {
                const answers = await restoredPromise;
                if (answers) {
                    this.currentGoal = `${enrichedGoal}\n\nClarifications from user:\n${answers}`;
                    this.onLog('💬 Clarification answers loaded from memory');
                }
            }
        } else {
            try {
                const { questions } = await this._withTimeout(
                    generateClarificationQuestions(this, enrichedGoal),
                    15000,
                    'Clarification generation timed out'
                );
                
                if (questions && questions.length) {
                    this.onPhaseChange?.('clarifying', 'Awaiting answers...');
                    // Questions are now shown via onClarificationNeeded callback
                    const userResponse = await this.clarificationQueue.request(questions, 300000);
                    if (userResponse && userResponse.trim()) {
                        this.currentGoal = `${enrichedGoal}\n\nClarifications from user:\n${userResponse.trim()}`;
                        this.onLog('✅ Clarification received – continuing');
                    } else {
                        this.onLog('⏰ No clarification received – continuing with original goal');
                    }
                }
            } catch (err) {
                this.onLog(`⚠️ Clarification error: ${err.message}. Continuing without clarification.`);
            }
        }
    }

    async _executeSubGoal(task, parentGoal, depth) {
        this.onLog(`\n🔽 Starting sub‑goal: "${task.subGoal}"`);
        const child = new SelfImprover({
            repo: this.repo, branch: this.branch, githubToken: this.githubToken,
            provider: this.provider, model: this.model,
            thinkingMode: this.thinkingMode, reasoningEffort: this.reasoningEffort,
            netlifySiteName: this.netlifySiteName,
            onLog: (msg) => this.onLog(`  [sub] ${msg}`),
            onTaskUpdate: () => {},
            onRunComplete: () => {},
            onClarificationNeeded: undefined,
            preferences: this.preferences,
        });
        child.parentGoal = parentGoal;
        child.parentWorkingMemory = this.workingMemory;
        child.fileTree = this.fileTree;
        child.discoveryCache = this.discoveryCache;
        child.changeBranch = this.changeBranch;
        child.branch = this.branch;
        child.conversationMemory = this.conversationMemory;

        try {
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
        } catch (err) {
            markTaskFailed(this, task.id);
            this.onLog(`❌ Sub‑goal crashed: ${err.message}`);
        }
        this.onTaskUpdate();
    }

    /**
     * Wrapper to add timeout protection to any async operation
     */
    async _withTimeout(promise, ms, errorMessage) {
        const timeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error(errorMessage)), ms)
        );
        return Promise.race([promise, timeout]);
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

// ─── Helpers ───

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

async function generateClarificationQuestions(ctx, goal) {
    const prompt = `You are helping an autonomous coding agent understand a user request before it starts making code changes.
The user's goal is: "${goal}"
Repository: ${ctx.repo}, branch: ${ctx.branch}
Generate 2–4 short, specific clarifying questions that would help the agent avoid mistakes. The user doesn't know how to code.
Focus on: scope (which files/components), edge cases, constraints, and success criteria.
Return ONLY a JSON array of question strings, no preamble.
Example: ["Which component should be changed?", "Should existing tests be preserved?"]`;

    try {
        const reply = await LLMProvider.chatCompletion({
            provider: ctx.provider,
            model: ctx.model,
            messages: [],
            systemPrompt: 'You generate clarifying questions. Output only JSON arrays.',
            userContent: prompt,
            thinkingMode: false,
            timeoutMs: 15000
        });
        const questions = JSON.parse(reply.content.replace(/```json|```/g, '').trim());
        return { questions };
    } catch (e) {
        ctx.onLog(`⚠️ Could not generate clarifying questions: ${e.message}`);
        return { questions: [] };
    }
}
