// src/core/taskQueue.js

export function initTaskQueue(ctx, tasks) {
    ctx.taskQueue = { tasks: [], nextId: 1 };
    for (const t of tasks) {
        ctx.taskQueue.tasks.push({
            id: ctx.taskQueue.nextId++,
            status: 'TODO',
            title: t.title,
            description: t.description,
            files: t.files || [],
            subGoal: t.subGoal || null,
            dependsOn: t.dependsOn || [],
            committedFiles: null
        });
    }
}

export function getPendingTasks(ctx) {
    return (ctx.taskQueue?.tasks || []).filter(t => t.status === 'TODO');
}

export function getDoneTasks(ctx) {
    return (ctx.taskQueue?.tasks || []).filter(t => t.status === 'DONE');
}

export function markTaskDone(ctx, id) {
    const t = findTask(ctx, id);
    if (t) t.status = 'DONE';
}

export function markTaskFailed(ctx, id) {
    const t = findTask(ctx, id);
    if (t) t.status = 'FAILED';
}

export function markTaskTodo(ctx, id) {
    const t = findTask(ctx, id);
    if (t) t.status = 'TODO';
}

export function markTaskReviewPassed(ctx, id) {
    const t = findTask(ctx, id);
    if (t) t.status = 'DONE';
}

export function findTask(ctx, id) {
    return ctx.taskQueue?.tasks.find(t => t.id === id);
}
