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
            committedFiles: null    // filled after execution
        });
    }
}
