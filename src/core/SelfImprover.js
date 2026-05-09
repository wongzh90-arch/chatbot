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
        // Populated by _discoverFiles — ranked [{path, content, score, hits:[]}]
        this.discoveryCache = [];
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
    // FILE DISCOVERY
    // Before planning: extract keywords from the goal, scan all
    // JS/HTML/CSS/TOML file contents for those keywords, rank by hits.
    // Result stored in this.discoveryCache for planner + executor.
    // ----------------------------------------------------------------
    async _discoverFiles(goal) {
        this.onLog('🔍 Discovering relevant files...');

        // Step 1 — extract search keywords from the goal via LLM
        let keywords = [];
        try {
            const kwReply = await LLMProvider.chatCompletion({
                provider: this.provider,
                model: this.model,
                messages: [],
                systemPrompt: 'You extract search keywords. Output only a JSON array of strings.',
                userContent: `Extract 5–10 specific search keywords from this coding goal that would help find the relevant files.
Include: CSS property names, variable names, function names, HTML tags, string literals, and file-type hints.
Goal: "${goal}"
Return ONLY a JSON array, e.g. ["font-family", "Roboto", "body {", "fontFamily", "index.html"]`,
                thinkingMode: false
            });
            keywords = JSON.parse(kwReply.content.replace(/```json|```/g, '').trim());
        } catch (e) {
            this.onLog(`⚠️ Keyword extraction failed: ${e.message} — using goal words`);
            // Fallback: split goal into words of 4+ chars as rough keywords
            keywords = goal.match(/\b\w{4,}\b/g) || [];
        }

        this.onLog(`🔑 Keywords: ${keywords.join(', ')}`);

        // Step 2 — identify scannable files (JS, JSX, HTML, CSS, TOML, JSON config)
        const SCAN_EXTS = /\.(js|jsx|html|css|toml|json)$/;
        const SKIP_PATHS = /node_modules|\.min\.|package-lock|yarn\.lock/;
        const candidates = (this.fileTree || [])
            .filter(f => SCAN_EXTS.test(f.path) && !SKIP_PATHS.test(f.path));

        // Step 3 — fetch and score each file
        const scored = [];
        for (const f of candidates) {
            let content = '';
            try {
                const loaded = await GitHubService.loadFileContent(
                    this.repo, this.branch, f.path, this.githubToken
                );
                content = loaded.content;
            } catch { continue; }

            const lower = content.toLowerCase();
            const hits = keywords.filter(kw => lower.includes(kw.toLowerCase()));
            if (hits.length === 0) continue;

            scored.push({ path: f.path, content, score: hits.length, hits });
        }

        // Step 4 — sort by score descending, keep top 8
        scored.sort((a, b) => b.score - a.score);
        this.discoveryCache = scored.slice(0, 8);

        const summary = this.discoveryCache
            .map(f => `${f.path} (${f.score} hit${f.score > 1 ? 's' : ''}: ${f.hits.slice(0, 3).join(', ')})`)
            .join('\n   ');

        this.onLog(`📂 Relevant files found:\n   ${summary || 'none — will fall back to manifest'}`);
        return this.discoveryCache;
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

            // 2. File discovery — scan actual content before planning
            await this._discoverFiles(enrichedGoal);

            // 3. Plan
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

        // Use discovered files (with real content) if available,
        // otherwise fall back to the first 8 filenames from the tree
        const discoveredContext = this.discoveryCache.length
            ? this.discoveryCache
                .map(f => `### ${f.path} (matched: ${f.hits.join(', ')})\n${f.content.slice(0, 3000)}`)
                .join('\n\n')
            : (this.fileTree || []).slice(0, 8).map(f => f.path).join(', ');

        const usingDiscovery = this.discoveryCache.length > 0;

        const prompt = `Create a plan for: "${goal}"
Repo: ${this.repo}, branch: ${this.branch}

${usingDiscovery
    ? `The following files were scanned and found relevant to the goal (content shown):\n\n${discoveredContext}`
    : `Key files (names only — no content scan available):\n${discoveredContext}`
}

Based on the actual file contents above, determine exactly which files need to change and what must change in each.
Return ONLY JSON:
{
  "milestone_title": "short title",
  "analysis": "one sentence explaining which files need to change and why",
  "tasks": [
    {
      "title": "short task title",
      "description": "specific description of what to change, including property names, values, or code patterns",
      "files": ["exact/path/to/file"]
    }
  ]
}
Max 4 tasks. Each task must name the exact file path from the scanned list above.`;

        const reply = await LLMProvider.chatCompletion({
            provider: this.provider,
            model: this.model,
            messages: [],
            systemPrompt: 'You are a senior developer. Output only JSON. File paths must be exact — copy them from the context.',
            userContent: prompt,
            thinkingMode: this.thinkingMode,
            reasoningEffort: this.reasoningEffort
        });

        try {
            const json = JSON.parse(reply.content.replace(/```json|```/g, '').trim());
            this._initTaskQueue(json.tasks);
            this.onLog(`📋 Plan: ${json.milestone_title}\n💡 ${json.analysis}\n🗂 ${json.tasks.length} task(s): ${json.tasks.map(t => `${t.title} → [${(t.files || []).join(', ')}]`).join(' | ')}`);
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

        // Seed context paths: start with planned files, then add any discovery
        // hits not already in the list (ranked by score), then manifest imports.
        // This ensures the executor always has real file content to work from.
        const discoveryPaths = this.discoveryCache
            .filter(f => !files.includes(f.path))
            .slice(0, 3)
            .map(f => f.path);

        const manifestPaths = ContextBuilder.identifyRequiredFiles({
            targetFiles: files, manifest: this.manifest, maxFiles: 5
        }).filter(p => !files.includes(p) && !discoveryPaths.includes(p));

        // Final ordered list: planned targets first, then discovery hits, then manifest
        const allPaths = [...new Set([...files, ...discoveryPaths, ...manifestPaths])].slice(0, 8);

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
