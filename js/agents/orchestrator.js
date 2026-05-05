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

        try {
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
        } catch (err) {
            state.phase = 'idle';
            addToast(`Plan phase crashed: ${err.message}`, 'error');
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `❌ Unexpected error during planning: ${err.message}`
            }]);
            return { error: true, message: err.message };
        }
    }

    async function runExecutePhase({
        repo, branch, githubToken,
        provider, model, thinkingMode, reasoningEffort,
        projectMemory, userMemory, systemPromptOverride,
        addToast, setMessages,
        setActiveFileContent, setActiveFilePath, setActiveTab
    }) {
        if (state.phase === 'done') {
            return { done: true };
        }

        state.phase = 'executing';

        try {
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

            state.lastExecutedTask = result;

            if (state.mode === 'autopilot') {
                addToast('🤖 Autopilot: continuing to next task...', 'info');
                await new Promise(r => setTimeout(r, 1000));
                return await runExecutePhase({
                    repo, branch, githubToken,
                    provider, model, thinkingMode, reasoningEffort,
                    projectMemory, userMemory, systemPromptOverride,
                    addToast, setMessages,
                    setActiveFileContent: null, setActiveFilePath: null, setActiveTab: null
                });
            }

            return { needsApproval: true, lastTask: result };
        } catch (err) {
            state.phase = 'idle';
            addToast(`Execution phase crashed: ${err.message}`, 'error');
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `❌ Unexpected error during execution: ${err.message}`
            }]);
            return { error: true, message: err.message };
        }
    }

    async function runReviewPhase({
        repo, branch, githubToken,
        provider, model, thinkingMode, reasoningEffort,
        fileTree, addToast, setMessages,
        projectMemory, userMemory, systemPromptOverride
    }) {
        if (state.phase === 'done') {
            return { done: true };
        }

        state.phase = 'reviewing';

        try {
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
        } catch (err) {
            state.phase = 'idle';
            addToast(`Review phase crashed: ${err.message}`, 'error');
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `❌ Unexpected error during review: ${err.message}`
            }]);
            return { error: true, message: err.message };
        }
    }

    return {
        getState, setMode, resetState,
        runPlanPhase, runExecutePhase, runReviewPhase,
    };
})();
