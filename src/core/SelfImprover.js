import { GitHubService } from '../services/github.js';
import { LLMProvider } from '../services/llmProvider.js';
import { ExecutorAPI } from '../services/executorApi.js';
import { ContextBuilder } from '../utils/contextBuilder.js';
import { processAgentSkills } from '../utils/agentSkills.js';
import { ManifestBuilder } from '../utils/manifestBuilder.js';

export class SelfImprover {
    constructor({ repo, branch, githubToken, provider, model, thinkingMode, reasoningEffort,
                  onLog, onTaskUpdate, onRunComplete }) {
        this.repo = repo;
        this.branch = branch;
        this.githubToken = githubToken;
        this.provider = provider;
        this.model = model;
        this.thinkingMode = thinkingMode;
        this.reasoningEffort = reasoningEffort;
        this.onLog = onLog || console.log;
        this.onTaskUpdate = onTaskUpdate || (() => {});
        this.onRunComplete = onRunComplete || (() => {});

        this.manifest = null;
        this.fileTree = null;
        this.pauseRequested = false;
        this.taskQueue = null;
        this.currentGoal = null; // stored for the reviewer
    }

    async healthCheck() {
        if (!GitHubService) return 'missing GitHubService';
        if (!LLMProvider) return 'missing LLMProvider';
        return 'ok';
    }

    /**
     * Ensure a manifest exists – loads from repo or builds from source.
     */
    async _ensureManifest() {
        if (this.manifest) return;

        // 1. Try loading from repo
        try {
            const { content } = await GitHubService.loadFileContent(
                this.repo, this.branch, 'manifest.json', this.githubToken
            );
            this.manifest = JSON.parse(content);
            this.onLog('✅ Manifest loaded from repo');
            return;
        } catch {
            this.onLog('⚠️ No manifest.json – building from source...');
        }

        // 2. Build from all JS/JSX files in the tree
        if (!this.fileTree) await this.fetchFileTree();

        const jsPaths = this.fileTree
            .filter(f => /\.(js|jsx)$/.test(f.path))
            .map(f => f.path);

        const fileContents = [];
        for (const p of jsPaths) {
            try {
                const { content } = await GitHubService.loadFileContent(
                    this.repo, this.branch, p, this.githubToken
                );
                fileContents.push({ path: p, content });
            } catch {
                // skip files we can't load (e.g., binary, missing)
            }
        }

        this.manifest = ManifestBuilder.buildFromFiles(fileContents);
        this.onLog('✅ Manifest built from source');
    }

    async loadManifest() {
        await this._ensureManifest();
    }

    async fetchFileTree() {
        this.fileTree = await GitHubService.fetchFileTree(this.repo, this.branch, this.githubToken);
        this.onLog(`📁 Fetched ${this.fileTree.length} files`);
        return this.fileTree;
    }

    async runGoal(goal) {
        this.currentGoal = goal;                      // ← store for reviewer
        this.pauseRequested = false;
        this.onLog(`🚀 Goal: ${goal}`);

        let result = { success: false };

        try {
            await this._ensureManifest();
            if (!this.fileTree) await this.fetchFileTree();

            const plan = await this._plan(goal);
            if (!plan?.tasks?.length) {
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
                if (review.passed) {
                    allPassed = true;
                    break;
                }
                this.onLog(`⚠️ ${review.issues} issues – retrying`);
            }

            if (this.pauseRequested) {
                result = { success: false, paused: true };
                return result;
            }

            if (allPassed) {
                const prUrl = await this._createPR(goal);
                result = { success: true, prUrl };
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

    async _plan(goal) {
        this.onLog('📝 Planning...');
        const relevant = (this.fileTree || []).slice(0, 8).map(f => f.path);
        const context = ContextBuilder.buildContext({
            targetContents: [],
            relatedContents: [],
            manifest: this.manifest
        });

        const prompt = `Create a plan for: "${goal}"
Repo: ${this.repo}, branch: ${this.branch}
Key files: ${relevant.join(', ')}
${context.contextString}
Return ONLY JSON:
{
  "milestone_title": "short",
  "analysis": "sentence",
  "tasks": [
    {"title": "...", "description": "...", "files": ["path"]}
  ]
}
Max 4 tasks, each ≤2 files.`;

        const reply = await LLMProvider.chatCompletion({
            provider: this.provider,
            model: this.model,
            messages: [],
            systemPrompt: 'You are a senior developer. Output only JSON.',
            userContent: prompt,
            thinkingMode: this.thinkingMode,
            reasoningEffort: this.reasoningEffort
        });

        try {
            const json = JSON.parse(reply.content.replace(/```json|```/g, '').trim());
            this._initTaskQueue(json.tasks);
            return json;
        } catch (e) {
            this.onLog(`Plan parse error: ${e.message}`);
            return null;
        }
    }

    async _executeAll() {
        const tasks = this._getPendingTasks();
        for (const t of tasks) {
            if (this.pauseRequested) break;
            this.onLog(`🔨 Executing: ${t.title}`);
            const ok = await this._executeTask(t);
            if (ok) this._markTaskDone(t.id);
            else this._markTaskFailed(t.id);
            this.onTaskUpdate();
        }
    }

    async _executeTask(task) {
        const files = task.files || [];
        if (!files.length) return false;

        const allPaths = ContextBuilder.identifyRequiredFiles({
            targetFiles: files,
            manifest: this.manifest,
            maxFiles: 5
        });

        const contents = {};
        for (const p of allPaths) {
            try {
                const { content, sha } = await GitHubService.loadFileContent(
                    this.repo, this.branch, p, this.githubToken
                );
                contents[p] = { content, sha };
            } catch {
                contents[p] = { content: '', sha: null };
            }
        }

        const targetContents = files.map(f => ({
            path: f,
            content: contents[f]?.content || ''
        }));
        const related = allPaths
            .filter(p => !files.includes(p))
            .map(p => ({ path: p, content: contents[p]?.content || '' }));

        const context = ContextBuilder.buildContext({
            targetContents,
            relatedContents: related,
            manifest: this.manifest
        });

        const prompt = `Implement task: ${task.title}
Description: ${task.description}
Target files: ${files.join(', ')}
${context.contextString}
Current content:
${Object.entries(contents)
    .map(([p, c]) => `--- ${p} ---\n${c.content}`)
    .join('\n\n')}
Output COMPLETE new content for each file inside
<skill name="update_editor" file="path">...</skill> blocks.`;

        const reply = await LLMProvider.chatCompletion({
            provider: this.provider,
            model: this.model,
            messages: [],
            systemPrompt: 'You are a coding assistant. Output only skill blocks.',
            userContent: prompt,
            thinkingMode: false
        });

        const { actions } = processAgentSkills(reply.content);
        const blocks = actions.updateEditorBlocks;
        if (!blocks.length) return false;

        const fileMap = {};
        for (const b of blocks) {
            const path = b.file || files[0];
            fileMap[path] = {
                content: b.content,
                sha: contents[path]?.sha || null
            };
        }

        // Lint check before commit
        const lintable = {};
        for (const [p, { content }] of Object.entries(fileMap)) {
            if (p.endsWith('.js') || p.endsWith('.jsx')) lintable[p] = content;
        }

        if (Object.keys(lintable).length) {
            const [syntax, lint] = await Promise.all([
                ExecutorAPI.syntax(lintable),
                ExecutorAPI.lint(lintable)
            ]);
            const errors = [
                ...(syntax.errors || []),
                ...(lint.errors || [])
            ].filter(e => e.severity !== 'warning');
            if (errors.length) {
                this.onLog(`❌ Lint errors: ${errors[0].message}`);
                return false;
            }
        }

        try {
            await GitHubService.commitMultipleFiles(
                this.repo,
                this.branch,
                fileMap,
                `Task: ${task.title}`,
                this.githubToken
            );
            return true;
        } catch (e) {
            this.onLog(`Commit failed: ${e.message}`);
            return false;
        }
    }

    // ----------------------------------------------------------------
    // SMART REVIEWER (now uses the stored goal and logs the verdict)
    // ----------------------------------------------------------------
    async _reviewAll() {
        const done = this._getDoneTasks();
        if (!done.length) return { passed: true };
        this.onLog(`🔍 Reviewing ${done.length} tasks`);
        let issues = 0;
        for (const t of done) {
            const passed = await this._reviewTask(t);
            if (passed) {
                this._markTaskReviewPassed(t.id);
            } else {
                issues++;
                this._markTaskTodo(t.id);
            }
        }
        return { passed: issues === 0, issues };
    }

    async _reviewTask(task) {
        const goal = this.currentGoal || 'the user request';
        const files = task.files || [];
        const contents = {};
        for (const p of files) {
            try {
                const { content } = await GitHubService.loadFileContent(
                    this.repo, this.branch, p, this.githubToken
                );
                contents[p] = content;
            } catch {
                contents[p] = '[unavailable]';
            }
        }

        const prompt = `Review the following implementation against the original request.
Goal: "${goal}"
Task: "${task.title}"
Task description: ${task.description}
Implementation:
${Object.entries(contents).map(([p, c]) => `--- ${p} ---\n${c}`).join('\n\n')}
Does this implementation satisfy the goal? Check specifically:
- Have the correct UI elements been changed?
- Does the code do what the task description asked for?
- Are there any obvious errors?
Reply exactly "PASS" if the task is correctly implemented. If not, reply "ISSUES:" followed by a short description of what is wrong.`;

        const reply = await LLMProvider.chatCompletion({
            provider: this.provider,
            model: this.model,
            messages: [],
            systemPrompt: 'You are a helpful code reviewer. Be fair and contextual.',
            userContent: prompt,
            thinkingMode: false
        });

        const verdict = reply.content.trim();
        this.onLog(`Review of "${task.title}": ${verdict}`);

        return verdict.toUpperCase().startsWith('PASS');
    }

    async _createPR(goal) {
        const title = `Self‑improve: ${goal.slice(0, 60)}`;
        const pr = await GitHubService.createPullRequest(
            this.repo,
            this.branch,
            title,
            null,
            this.githubToken
        );
        return pr.html_url;
    }

    // --- Task queue helpers ---
    _initTaskQueue(tasks) {
        this.taskQueue = { tasks: [], nextId: 1 };
        for (const t of tasks) {
            this.taskQueue.tasks.push({
                id: this.taskQueue.nextId++,
                status: 'TODO',
                title: t.title,
                description: t.description,
                files: t.files
            });
        }
    }

    _getPendingTasks() {
        return (this.taskQueue?.tasks || []).filter(t => t.status === 'TODO');
    }

    _getDoneTasks() {
        return (this.taskQueue?.tasks || []).filter(t => t.status === 'DONE');
    }

    _markTaskDone(id) {
        const t = this.taskQueue?.tasks.find(t => t.id === id);
        if (t) t.status = 'DONE';
    }

    _markTaskFailed(id) {
        const t = this.taskQueue?.tasks.find(t => t.id === id);
        if (t) t.status = 'FAILED';
    }

    _markTaskTodo(id) {
        const t = this.taskQueue?.tasks.find(t => t.id === id);
        if (t) t.status = 'TODO';
    }

    _markTaskReviewPassed(id) {
        const t = this.taskQueue?.tasks.find(t => t.id === id);
        if (t) t.status = 'DONE';
    }
}
