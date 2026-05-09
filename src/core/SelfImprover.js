import { GitHubService } from '../services/github.js';
import { LLMProvider } from '../services/llmProvider.js';
import { runClarification } from './clarification.js';
import { ensureManifest } from './manifestManager.js';
import { buildKeywordIndex } from './keywordIndexer.js';
import { discoverFiles } from './fileDiscovery.js';
import { plan } from './planner.js';
import { executeAll } from './executor.js';
import { reviewAll } from './reviewer.js';
import { createPR } from './prCreator.js';
import { initTaskQueue, getPendingTasks, getDoneTasks, markTaskDone, markTaskFailed, markTaskTodo, markTaskReviewPassed, findTask } from './taskQueue.js';
import { SmokeTest } from '../services/smokeTest.js';

export class SelfImprover {
    constructor({ repo, branch, githubToken, provider, model, thinkingMode, reasoningEffort,
                  netlitySiteName,
                  onLog, onTaskUpdate, onRunComplete, onClarificationNeeded }) {
        this.repo = repo;
        this.branch = branch;
        this.githubToken = githubToken;
        this.provider = provider;
        this.model = model;
        this.thinkingMode = thinkingMode;
        this.reasoningEffort = reasoningEffort;
        this.netlitySiteName = netlitySiteName || '';
        this.onLog = onLog || console.log;
        this.onTaskUpdate = onTaskUpdate || (() => {});
        this.onRunComplete = onRunComplete || (() => {});
        this.onClarificationNeeded = onClarificationNeeded || null;

        this.manifest = null;
        this.fileTree = null;
        this.pauseRequested = false;
        this.taskQueue = null;
        this.currentGoal = null;
        this.discoveryCache = [];
    }

    async healthCheck() {
        if (!GitHubService) return 'missing GitHubService';
        if (!LLMProvider) return 'missing LLMProvider';
        return 'ok';
    }

    // Delegates
    async _runClarification(goal) { return runClarification(this, goal); }
    async _ensureManifest() { return ensureManifest(this); }
    async loadManifest() { return this._ensureManifest(); }
    async fetchFileTree() {
        this.fileTree = await GitHubService.fetchFileTree(this.repo, this.branch, this.githubToken);
        this.onLog(`📁 Fetched ${this.fileTree.length} files`);
        return this.fileTree;
    }
    async buildKeywordIndex() { return buildKeywordIndex(this); }
    async _discoverFiles(goal) { this.discoveryCache = await discoverFiles(this, goal); return this.discoveryCache; }
    async _plan(goal) { return plan(this, goal); }
    async _executeAll() { return executeAll(this); }
    async _executeTask(task) { return executeAll._executeTask(this, task); } // helper used by executeAll
    async _reviewAll() { return reviewAll(this); }
    async _createPR(goal) { return createPR(this, goal); }

    // Main loop
    async runGoal(goal) {
        this.pauseRequested = false;
        let result = { success: false };

        try {
            const enrichedGoal = await this._runClarification(goal);
            this.currentGoal = enrichedGoal;
            this.onLog(`🚀 Goal: ${goal}`);

            await this._ensureManifest();
            if (!this.fileTree) await this.fetchFileTree();
            await this._discoverFiles(enrichedGoal);

            const planResult = await this._plan(enrichedGoal);
            if (!planResult?.tasks?.length) {
                this.onLog('❌ No tasks generated');
                return result;
            }

            let cycles = 0;
            const MAX_CYCLES = 3;
            let allPassed = false;

            while (cycles < MAX_CYCLES && !this.pauseRequested) {
                cycles++;
                this.onLog(`🔄 Cycle ${cycles}/${MAX_CYCLES}`);
                await this._executeAll();
                const review = await this._reviewAll();
                if (review.passed) { allPassed = true; break; }
                this.onLog(`⚠️ ${review.issues} issue(s) found – retrying`);
            }

            if (this.pauseRequested) return { success: false, paused: true };

            if (allPassed) {
                const prUrl = await this._createPR(goal);
                result = { success: true, prUrl };

                if (this.netlitySiteName) {
                    this.onLog('🌐 Waiting for Netlify deploy preview...');
                    try {
                        const prNumber = parseInt(prUrl.split('/pull/')[1], 10);
                        const smoke = await SmokeTest.testDeployPreview(
                            this.repo, this.branch, this.githubToken, prNumber,
                            this.netlitySiteName
                        );
                        if (smoke.success) this.onLog(`✅ Smoke test passed: ${smoke.url}`);
                        else this.onLog(`⚠️ Smoke test failed: ${smoke.error}`);
                    } catch (e) { this.onLog(`⚠️ Smoke test error: ${e.message}`); }
                }
            }

            return result;
        } catch (err) {
            this.onLog(`❌ Run error: ${err.message}`);
            return result;
        } finally {
            this.onRunComplete(result);
        }
    }

    pause() { this.pauseRequested = true; }

    // Task queue methods exposed for UI
    _initTaskQueue(tasks) { initTaskQueue(this, tasks); }
    _getPendingTasks() { return getPendingTasks(this); }
    _getDoneTasks() { return getDoneTasks(this); }
    _markTaskDone(id) { markTaskDone(this, id); }
    _markTaskFailed(id) { markTaskFailed(this, id); }
    _markTaskTodo(id) { markTaskTodo(this, id); }
    _markTaskReviewPassed(id) { markTaskReviewPassed(this, id); }
    _findTask(id) { return findTask(this, id); }
}
