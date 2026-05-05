window.Orchestrator = (() => {
    let state = {
        mode: 'manual',
        phase: 'idle',
        milestone: null,
        milestoneClosed: false,
        tasks: [],
        goal: null,
        lastExecutedTask: null,
    };

    function getState() { return { ...state }; }
    function setMode(mode) { state.mode = mode; }
    function resetState() {
        state = {
            mode: state.mode,
            phase: 'idle',
            milestone: null,
            milestoneClosed: false,
            tasks: [],
            goal: null,
            lastExecutedTask: null,
        };
    }

    async function runPlanPhase({
        goal, repo, branch, githubToken,
        provider, model, thinkingMode, reasoningEffort,
        fileTree, addToast, setMessages,
        projectMemory, userMemory, systemPromptOverride
    }) {
        state.phase = 'planning';
        state.goal = goal;
        state.milestoneClosed = false;

        setMessages(prev => [...prev,
            { role: 'user', content: `/plan ${goal}` },
            { role: 'assistant', content: `🔍 Analyzing **${repo}** and creating a task plan for: "${goal}"...` }
        ]);

        const result = await window.PlannerAgent.analyzeAndPlan({
            goal, repo, branch, githubToken,
            provider, model, thinkingMode, reasoningEffort,
            fileTree, addToast,
            projectMemory, userMemory, systemPromptOverride
        });

        if (result.error) {
            state.phase = 'idle';
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `❌ Planning failed: ${result.message || result.error}`
            }]);
            return { error: true, message: result.message || result.error };
        }

        state.milestone = result.milestone;
        state.tasks = result.tasks;

        const planSummary = `📋 **Milestone:** ${result.milestone.title}\n\n${result.analysis || ''}\n\n**Tasks:**\n${result.tasks.map((t, i) => `${i+1}. ${t.title} [#${t.issueNumber}](${t.html_url})`).join('\n')}`;

        setMessages(prev => [...prev, { role: 'assistant', content: planSummary }]);

        if (state.mode === 'autopilot') {
            addToast('🤖 Autopilot: proceeding to execution...', 'info');
            return await runExecutePhase({
                repo, branch, githubToken,
                provider, model, thinkingMode, reasoningEffort,
                projectMemory, userMemory, systemPromptOverride,
                addToast, setMessages,
                setActiveFileContent: null, setActiveFilePath: null, setActiveTab: null
            });
        }

        state.phase = 'awaiting_approval';
        return { needsApproval: true };
    }

    async function runExecutePhase({
        repo, branch, githubToken,
        provider, model, thinkingMode, reasoningEffort,
        projectMemory, userMemory, systemPromptOverride,
        addToast, setMessages,
        setActiveFileContent, setActiveFilePath, setActiveTab
    }) {
        // Guard: don't execute if already done
        if (state.phase === 'done') {
            return { done: true };
        }

        state.phase = 'executing';

        const allTasks = await window.TaskManager.getTasksByMilestone(
            repo, state.milestone.number, githubToken
        );
        state.tasks = allTasks;

        const result = await window.ExecutorAgent.executeNextTask({
            tasks: allTasks,
            repo, branch, githubToken,
            provider, model, thinkingMode, reasoningEffort,
            projectMemory, userMemory, systemPromptOverride,
            addToast,
            setActiveFileContent, setActiveFilePath, setActiveTab
        });

        if (!result) {
            // No more TODO tasks — move to review
            addToast('All tasks done. Moving to review...', 'info');
            return await runReviewPhase({
                repo, branch, githubToken,
                provider, model, thinkingMode, reasoningEffort,
                fileTree: [], addToast, setMessages,
                projectMemory, userMemory, systemPromptOverride
            });
        }

        setMessages(prev => [...prev, {
            role: 'assistant',
            content: `🔨 Executed **${result.title}** [#${result.issueNumber || result.number}]`
        }]);

        // NOTE: task is already marked DONE inside executor — no duplicate call here
        state.lastExecutedTask = result;

        if (state.mode === 'autopilot') {
            addToast('🤖 Autopilot: continuing to next task...', 'info');
            return await runExecutePhase({
                repo, branch, githubToken,
                provider, model, thinkingMode, reasoningEffort,
                projectMemory, userMemory, systemPromptOverride,
                addToast, setMessages,
                setActiveFileContent: null, setActiveFilePath: null, setActiveTab: null
            });
        }

        return { needsApproval: true, lastTask: result };
    }

    async function runReviewPhase({
        repo, branch, githubToken,
        provider, model, thinkingMode, reasoningEffort,
        fileTree, addToast, setMessages,
        projectMemory, userMemory, systemPromptOverride
    }) {
        // Guard: don't review if already done
        if (state.phase === 'done') {
            return { done: true };
        }

        state.phase = 'reviewing';

        const allTasks = await window.TaskManager.getTasksByMilestone(
            repo, state.milestone.number, githubToken
        );

        setMessages(prev => [...prev, {
            role: 'assistant',
            content: '🔍 Starting review of all completed tasks...'
        }]);

        const result = await window.ReviewerAgent.reviewCompletedTasks({
            tasks: allTasks,
            repo, branch, githubToken,
            provider, model, thinkingMode, reasoningEffort,
            fileTree, addToast,
            projectMemory, userMemory, systemPromptOverride
        });

        if (result.issuesFound === 0) {
            state.phase = 'done';
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: '✅ **All tasks reviewed and passed!** Ready to merge.'
            }]);

            // Guard: only close milestone once
            if (state.milestone && !state.milestoneClosed) {
                state.milestoneClosed = true;
                await window.TaskManager.closeMilestone(repo, state.milestone.number, githubToken);
                addToast('🎉 Milestone complete!', 'success');
            }

            return { done: true };
        }

        state.phase = 'executing';
        setMessages(prev => [...prev, {
            role: 'assistant',
            content: `⚠️ **${result.issuesFound} task(s) need fixes.** Re-executing...`
        }]);
        addToast('Returning to execution for fixes...', 'info');

        if (state.mode === 'autopilot') {
            return await runExecutePhase({
                repo, branch, githubToken,
                provider, model, thinkingMode, reasoningEffort,
                projectMemory, userMemory, systemPromptOverride,
                addToast, setMessages,
                setActiveFileContent: null, setActiveFilePath: null, setActiveTab: null
            });
        }

        return { needsApproval: true, issuesFound: result.issuesFound };
    }

    return {
        getState, setMode, resetState,
        runPlanPhase, runExecutePhase, runReviewPhase,
    };
})();
