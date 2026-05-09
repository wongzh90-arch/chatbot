import { GitHubService } from '../services/github.js';
import { LLMProvider } from '../services/llmProvider.js';
import { ExecutorAPI } from '../services/executorApi.js';
import { ContextBuilder } from '../utils/contextBuilder.js';
import { processAgentSkills } from '../utils/agentSkills.js';
import { ManifestBuilder } from '../utils/manifestBuilder.js';
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
        // Called with (questions: string[]) → must return Promise<string> (user's answers)
        this.onClarificationNeeded = onClarificationNeeded || null;

        this.manifest = null;
        this.fileTree = null;
        this.pauseRequested = false;
        this.taskQueue = null;
        this.currentGoal = null;
    }

    async healthCheck() {
        if (!GitHubService) return 'missing GitHubService';
        if (!LLMProvider) return 'missing LLMProvider';
        return 'ok';
    }

    // ----------------------------------------------------------------
    // CLARIFICATION FLOW
    // Ask the LLM to generate clarifying questions, surface them to the
    // user via onClarificationNeeded, then fold the answers into the goal.
    // ----------------------------------------------------------------
    async _runClarification(goal) {
        if (!this.onClarificationNeeded) return goal;

        this.onLog('🤔 Generating clarifying questions...');

        const prompt = `You are helping an autonomous coding agent understand a user request before it starts making code changes.
The user's goal is: "${goal}"
Repository: ${this.repo}, branch: ${this.branch}

Generate 2–4 short, specific clarifying questions that would help the agent avoid mistakes.
Focus on: scope (which files/components), edge cases, constraints, and success criteria.
Return ONLY a JSON array of question strings, no preamble.
Example: ["Which component should be changed?", "Should existing tests be preserved?"]`;

        let questions = [];
        try {
            const reply = await LLMProvider.chatCompletion({
                provider: this.provider,
                model: this.model,
                messages: [],
                systemPrompt: 'You generate clarifying questions. Output only JSON arrays.',
                userContent: prompt,
                thinkingMode: false
            });
            questions = JSON.parse(reply.content.replace(/```json|```/g, '').trim());
        } catch (e) {
            this.onLog(`⚠️ Could not generate clarifying questions: ${e.message}`);
            return goal;
        }

        if (!questions.length) return goal;

        // Surface questions to user and wait for their answers
        const userAnswers = await this.onClarificationNeeded(questions);
        if (!userAnswers) return goal;

        // Fold answers back into the goal string
        const enrichedGoal = `${goal}\n\nClarifications from user:\n${userAnswers}`;
        this.onLog(`✅ Clarification received — enriched goal recorded`);
        return enrichedGoal;
    }

    // ----------------------------------------------------------------
    // MANIFEST
    // ----------------------------------------------------------------
    async _ensureManifest() {
        if (this.manifest) return;
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
            } catch { /* skip */ }
        }

        this.manifest = ManifestBuilder.buildFromFiles(fileContents);
        this.onLog('✅ Manifest built from source');
    }

    async loadManifest() { await this._ensureManifest(); }

    async fetchFileTree() {
        this.fileTree = await GitHubService.fetchFileTree(this.repo, this.branch, this.githubToken);
        this.onLog(`📁 Fetched ${this.fileTree.length} files`);
        return this.fileTree;
    }

    // ----------------------------------------------------------------
    // MAIN RUN LOOP
    // ----------------------------------------------------------------
    async runGoal(goal) {
        this.pauseRequested = false;
        let result = { success: false };

        try {
            // 1. Clarification
            const enrichedGoal = await this._runClarification(goal);
            this.currentGoal = enrichedGoal;
            this.onLog(`🚀 Goal: ${goal}`);

            await this._ensureManifest();
            if (!this.fileTree) await this.fetchFileTree();

            // 2. Plan
            const plan = await this._plan(enrichedGoal);
            if (!plan?.tasks?.length) {
                this.onLog('❌ No tasks generated');
                return result;
            }

            // 3. Execute → Review loop (max 3 cycles)
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

                // 4. Phase 2B — smoke test the deploy preview
                if (this.netlitySiteName) {
                    this.onLog('🌐 Waiting for Netlify deploy preview...');
                    try {
                        // Extract PR number from URL: .../pull/123
                        const prNumber = parseInt(prUrl.split('/pull/')[1], 10);
                        const smoke = await SmokeTest.testDeployPreview(
                            this.repo, this.branch, this.githubToken, prNumber,
                            this.netlitySiteName
                        );
                        if (smoke.success) {
                            this.onLog(`✅ Smoke test passed: ${smoke.url}`);
                        } else {
                            this.onLog(`⚠️ Smoke test failed: ${smoke.error}`);
                        }
                    } catch (e) {
                        this.onLog(`⚠️ Smoke test error: ${e.message}`);
                    }
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

    // ----------------------------------------------------------------
    // PLAN
    // ----------------------------------------------------------------
    async _plan(goal) {
        this.onLog('📝 Planning...');
        const relevant = (this.fileTree || []).slice(0, 8).map(f => f.path);
        const context = ContextBuilder.buildContext({
            targetContents: [], relatedContents: [], manifest: this.manifest
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
            // Log the plan summary so the user can see what the bot intends
            this.onLog(`📋 Plan: ${json.milestone_title}\n💡 ${json.analysis}\n🗂 ${json.tasks.length} task(s): ${json.tasks.map(t => t.title).join(' → ')}`);
            return json;
        } catch (e) {
            this.onLog(`Plan parse error: ${e.message}`);
            return null;
        }
    }

    // ----------------------------------------------------------------
    // EXECUTE
    // ----------------------------------------------------------------
    async _executeAll() {
        const tasks = this._getPendingTasks();
        for (const t of tasks) {
            if (this.pauseRequested) break;
            this.onLog(`🔨 Executing: ${t.title}\n   📌 ${t.description}\n   🎯 Planned files: ${(t.files || []).join(', ') || 'none'}`);
            const result = await this._executeTask(t);
            if (result) {
                // result is the committed fileMap — store it on the task for the reviewer
                t.committedFiles = Object.keys(result);
                this._markTaskDone(t.id);
            } else {
                this._markTaskFailed(t.id);
            }
            this.onTaskUpdate();
        }
    }

    async _executeTask(task) {
        const files = task.files || [];
        if (!files.length) return null;

        const allPaths = ContextBuilder.identifyRequiredFiles({
            targetFiles: files, manifest: this.manifest, maxFiles: 5
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

        const targetContents = files.map(f => ({ path: f, content: contents[f]?.content || '' }));
        const related = allPaths
            .filter(p => !files.includes(p))
            .map(p => ({ path: p, content: contents[p]?.content || '' }));

        const context = ContextBuilder.buildContext({
            targetContents, relatedContents: related, manifest: this.manifest
        });

        const prompt = `Implement task: ${task.title}
Description: ${task.description}
Target files: ${files.join(', ')}
${context.contextString}
Current content:
${Object.entries(contents).map(([p, c]) => `--- ${p} ---\n${c.content}`).join('\n\n')}
Output COMPLETE new content for each file inside
<skill name="update_editor" file="path">...</skill> blocks.
IMPORTANT: Output raw file content only. Do NOT wrap in markdown code fences (\`\`\`).`;

        const reply = await LLMProvider.chatCompletion({
            provider: this.provider,
            model: this.model,
            messages: [],
            systemPrompt: 'You are a coding assistant. Output only skill blocks with raw file content — never markdown fences.',
            userContent: prompt,
            thinkingMode: false
        });

        const { actions } = processAgentSkills(reply.content);
        const blocks = actions.updateEditorBlocks;
        if (!blocks.length) return null;

        const fileMap = {};
        for (const b of blocks) {
            const path = b.file || files[0];
            // Strip any accidental markdown fences the LLM added
            const cleanContent = b.content
                .replace(/^```[\w]*\n?/, '')
                .replace(/\n?```$/, '')
                .trim();
            fileMap[path] = { content: cleanContent, sha: contents[path]?.sha || null };
        }

        // ---- Phase 2A: Lint + syntax check before commit ----
        const lintable = {};
        for (const [p, { content }] of Object.entries(fileMap)) {
            if (p.endsWith('.js') || p.endsWith('.jsx')) lintable[p] = content;
        }

        if (Object.keys(lintable).length) {
            const [syntax, lint] = await Promise.all([
                ExecutorAPI.syntax(lintable),
                ExecutorAPI.lint(lintable)
            ]);

            if (syntax._unreachable) {
                this.onLog('⚠️ Executor unreachable — skipping lint gate');
            } else {
                const errors = [
                    ...(syntax.errors || []),
                    ...(lint.errors || [])
                ].filter(e => e.severity === 'error');

                if (errors.length) {
                    this.onLog(`❌ Quality gate failed: ${errors[0].message} (${errors[0].file}:${errors[0].line})`);
                    return null;
                }
                this.onLog('✅ Quality gate passed');
            }
        }

        try {
            await GitHubService.commitMultipleFiles(
                this.repo, this.branch, fileMap,
                `Task: ${task.title}`, this.githubToken
            );
            const writtenFiles = Object.keys(fileMap);
            this.onLog(`📝 Task touched ${writtenFiles.length} file(s): ${writtenFiles.join(', ')}`);
            // Return the fileMap so the caller can store committedFiles on the task
            return fileMap;
        } catch (e) {
            this.onLog(`Commit failed: ${e.message}`);
            return null;
        }
    }

    // ----------------------------------------------------------------
    // REVIEW — strict PASS / ISSUES: format enforced
    // ----------------------------------------------------------------
    async _reviewAll() {
        const done = this._getDoneTasks();
        if (!done.length) return { passed: true };
        this.onLog(`🔍 Reviewing ${done.length} task(s)`);
        let issues = 0;
        for (const t of done) {
            const passed = await this._reviewTask(t);
            if (passed) this._markTaskReviewPassed(t.id);
            else { issues++; this._markTaskTodo(t.id); }
        }
        return { passed: issues === 0, issues };
    }

    async _reviewTask(task) {
        const goal = this.currentGoal || 'the user request';
        // Use committedFiles (what was actually written) if available, fall back to planned files
        const files = task.committedFiles || task.files || [];
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

        const prompt = `You are a strict code reviewer. Review the implementation below.

Original goal: "${goal}"
Task title: "${task.title}"
Task description: "${task.description}"
Files actually written: ${files.join(', ')}

Implementation (read from repo after commit):
${Object.entries(contents).map(([p, c]) => `--- ${p} ---\n${c}`).join('\n\n')}

Review checklist:
- Does the file content match what the task description asked for?
- Are the correct properties/values changed in the correct files?
- Is there any mismatch between what was planned and what was actually written?

Rules:
- Your FIRST word must be exactly "PASS" or "ISSUES"
- If the task is correctly implemented: PASS
- If there are problems: ISSUES: <specific description of what is wrong and in which file>
- Do not write anything before PASS or ISSUES`;

        const reply = await LLMProvider.chatCompletion({
            provider: this.provider,
            model: this.model,
            messages: [],
            systemPrompt: 'You are a strict code reviewer. Your first word must be PASS or ISSUES. No exceptions.',
            userContent: prompt,
            thinkingMode: false
        });

        const verdict = reply.content.trim();
        const firstWord = verdict.split(/[\s:]/)[0].toUpperCase();
        this.onLog(`🔎 Review "${task.title}" [${files.join(', ')}]: ${verdict.slice(0, 150)}`);
        return firstWord === 'PASS';
    }

    // ----------------------------------------------------------------
    // PR
    // ----------------------------------------------------------------
    async _createPR(goal) {
        const title = `Self‑improve: ${goal.slice(0, 60)}`;
        const pr = await GitHubService.createPullRequest(
            this.repo, this.branch, title, null, this.githubToken
        );
        return pr.html_url;
    }

    // ----------------------------------------------------------------
    // Task queue helpers
    // ----------------------------------------------------------------
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

    _getPendingTasks()       { return (this.taskQueue?.tasks || []).filter(t => t.status === 'TODO'); }
    _getDoneTasks()          { return (this.taskQueue?.tasks || []).filter(t => t.status === 'DONE'); }
    _markTaskDone(id)        { const t = this._findTask(id); if (t) t.status = 'DONE'; }
    _markTaskFailed(id)      { const t = this._findTask(id); if (t) t.status = 'FAILED'; }
    _markTaskTodo(id)        { const t = this._findTask(id); if (t) t.status = 'TODO'; }
    _markTaskReviewPassed(id){ const t = this._findTask(id); if (t) t.status = 'DONE'; }
    _findTask(id)            { return this.taskQueue?.tasks.find(t => t.id === id); }
}
