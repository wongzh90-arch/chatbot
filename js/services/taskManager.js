window.TaskManager = (() => {
    function headers(token) {
        return {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        };
    }

    async function createMilestone(repo, title, description, token) {
        const res = await fetch(`https://api.github.com/repos/${repo}/milestones`, {
            method: 'POST',
            headers: headers(token),
            body: JSON.stringify({ title, description, state: 'open' })
        });
        if (!res.ok) {
            if (res.status === 422) {
                const existing = await fetch(
                    `https://api.github.com/repos/${repo}/milestones?state=open&per_page=100`,
                    { headers: headers(token) }
                );
                const list = await existing.json();
                const found = list.find(m => m.title === title);
                if (found) return found;
            }
            throw new Error((await res.json()).message);
        }
        return await res.json();
    }

    async function getOpenMilestones(repo, token) {
        const res = await fetch(`https://api.github.com/repos/${repo}/milestones?state=open`, { headers: headers(token) });
        if (!res.ok) return [];
        return await res.json();
    }

    async function closeMilestone(repo, number, token) {
        await fetch(`https://api.github.com/repos/${repo}/milestones/${number}`, {
            method: 'PATCH',
            headers: headers(token),
            body: JSON.stringify({ state: 'closed' })
        });
    }

    const LABELS = {
        TODO:        { name: 'task:todo',        color: '3f3f46', description: 'Not yet started' },
        IN_PROGRESS: { name: 'task:in_progress', color: 'ea580c', description: 'Currently working on' },
        DONE:        { name: 'task:done',        color: '16a34a', description: 'Completed' },
        REVIEW:      { name: 'task:review',      color: 'ca8a04', description: 'Needs review' },
        BLOCKED:     { name: 'task:blocked',     color: 'dc2626', description: 'Blocked by another task' },
        BUG:         { name: 'task:bug',         color: '7c3aed', description: 'Bug found during review' },
    };

    async function ensureLabels(repo, token) {
        for (const [key, label] of Object.entries(LABELS)) {
            try {
                await fetch(`https://api.github.com/repos/${repo}/labels`, {
                    method: 'POST',
                    headers: headers(token),
                    body: JSON.stringify(label)
                });
                // 422 = label already exists, ignore
            } catch { }
        }
    }

    async function createTask(repo, title, body, milestoneNumber, token, blockingIssueNumbers = []) {
        const blockingText = blockingIssueNumbers.length
            ? `\n\n**Blocks:** ${blockingIssueNumbers.map(n => `#${n}`).join(', ')}`
            : '';
        const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
            method: 'POST',
            headers: headers(token),
            body: JSON.stringify({
                title,
                body: body + blockingText,
                milestone: milestoneNumber,
                labels: ['task:todo']
            })
        });
        if (!res.ok) throw new Error((await res.json()).message);
        return await res.json();
    }

    async function getTasksByMilestone(repo, milestoneNumber, token) {
        const res = await fetch(
            `https://api.github.com/repos/${repo}/issues?milestone=${milestoneNumber}&state=all&per_page=100`,
            { headers: headers(token) }
        );
        if (!res.ok) return [];
        const issues = await res.json();
        return issues.filter(i => !i.pull_request);
    }

    async function updateTaskStatus(repo, issueNumber, statusLabel, token) {
        // Fetch current labels
        const current = await fetch(
            `https://api.github.com/repos/${repo}/issues/${issueNumber}`,
            { headers: headers(token) }
        );
        if (!current.ok) return;
        const issue = await current.json();

        // Keep non‑task labels, replace the task: label with the new one
        const newLabel = LABELS[statusLabel]?.name || statusLabel;
        const labelsToSet = issue.labels
            .filter(l => !l.name.startsWith('task:'))
            .map(l => l.name)
            .concat(newLabel);

        // Atomic PUT – replaces all labels in one call, no race condition
        const res = await fetch(
            `https://api.github.com/repos/${repo}/issues/${issueNumber}/labels`,
            {
                method: 'PUT',
                headers: headers(token),
                body: JSON.stringify({ labels: labelsToSet })
            }
        );
        if (!res.ok) {
            console.error('Failed to update task status', await res.text());
        }
    }

    async function addComment(repo, issueNumber, body, token) {
        const res = await fetch(
            `https://api.github.com/repos/${repo}/issues/${issueNumber}/comments`,
            {
                method: 'POST',
                headers: headers(token),
                body: JSON.stringify({ body })
            }
        );
        if (!res.ok) throw new Error((await res.json()).message);
        return await res.json();
    }

    function parseBlockingIssues(body) {
        const match = body.match(/\*\*Blocks:\*\*\s*(.*)/);
        if (!match) return [];
        return [...match[1].matchAll(/#(\d+)/g)].map(m => parseInt(m[1]));
    }

    function isUnblocked(task, allTasks) {
        const blockers = parseBlockingIssues(task.body || '');
        if (blockers.length === 0) return true;
        return blockers.every(blockerNum => {
            const blockerTask = allTasks.find(t => t.number === blockerNum);
            return blockerTask && blockerTask.labels.some(l => l.name === LABELS.DONE.name);
        });
    }

    return {
        LABELS,
        createMilestone,
        getOpenMilestones,
        closeMilestone,
        ensureLabels,
        createTask,
        getTasksByMilestone,
        updateTaskStatus,
        addComment,
        parseBlockingIssues,
        isUnblocked,
    };
})();
