// js/services/taskQueue.js
// Phase 1C — In‑memory task queue replacing GitHub Issues for plan/execute/review.
// Keeps all operational state local; GitHub used only for file commits and final PR creation.

window.TaskQueue = (() => {
  const STATUS = {
    TODO: 'TODO',
    IN_PROGRESS: 'IN_PROGRESS',
    DONE: 'DONE',
    REVIEW: 'REVIEW',
    FAILED: 'FAILED',
    BLOCKED: 'BLOCKED',
  };

  let tasks = [];
  let nextId = 1;
  let milestone = null; // { title, description }

  function getState() {
    return {
      tasks: tasks.map(t => ({ ...t })),
      milestone: milestone ? { ...milestone } : null,
      total: tasks.length,
      done: tasks.filter(t => t.status === STATUS.DONE).length,
    };
  }

  function createMilestone(title, description) {
    milestone = { title, description };
  }

  function getMilestone() {
    return milestone ? { ...milestone } : null;
  }

  function addTask(title, description, files, dependsOn = []) {
    const task = {
      id: nextId++,
      title,
      description,
      files: files || [],
      status: STATUS.TODO,
      dependsOn,
      retries: 0,
      maxRetries: 2,
      result: null,
      error: null,
      createdAt: new Date().toISOString(),
    };
    tasks.push(task);
    return task;
  }

  function updateTaskStatus(taskId, newStatus, error = null) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return false;
    task.status = newStatus;
    if (error) task.error = error;
    if (newStatus === STATUS.DONE) {
      task.result = task.result || {};
    }
    if (newStatus === STATUS.FAILED) {
      task.retries = (task.retries || 0) + 1;
      if (task.retries >= task.maxRetries) {
        // mark permanently failed
        task.status = STATUS.FAILED;
      } else {
        // reset to TODO for retry
        task.status = STATUS.TODO;
      }
    }
    return true;
  }

  function isUnblocked(task) {
    if (!task.dependsOn || task.dependsOn.length === 0) return true;
    return task.dependsOn.every(depId => {
      const depTask = tasks.find(t => t.id === depId);
      return depTask && depTask.status === STATUS.DONE;
    });
  }

  function getAllTasks() {
    return tasks.map(t => ({ ...t }));
  }

  function resetQueue() {
    tasks = [];
    nextId = 1;
    milestone = null;
  }

  function addComment(commentText) {
    // no-op in local queue – maybe we'll add a log later
    // but we need to keep interface for executor
  }

  return {
    STATUS,
    getState,
    createMilestone,
    getMilestone,
    addTask,
    updateTaskStatus,
    isUnblocked,
    getAllTasks,
    resetQueue,
    addComment,
  };
})();
