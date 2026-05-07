import React, { useCallback, useEffect, useState } from 'react';
import { useChat } from '../context/ChatContext';
import { useTaskQueue } from '../utils/taskQueue';
import { useStatusMessage } from '../hooks/useStatusMessage';
import TaskPanel from './TaskPanel';

export default function WorkflowManager({ activeTab, setActiveTab }) {
  const { messages, sendCommand, isPlanning, setIsPlanning } = useChat();
  const { queueTasks } = useTaskQueue();
  const { setStatusMessage } = useStatusMessage();
  const [plan, setPlan] = useState('');

  const handlePlanningComplete = useCallback(async (planText) => {
    setStatusMessage('Planning complete. Generating tasks...');
    setPlan(planText);
    // Parse plan and queue tasks
    const taskPattern = /- \[ \] (.+)/g;
    const tasks = [];
    let match;
    while ((match = taskPattern.exec(planText)) !== null) {
      tasks.push(match[1]);
    }
    if (tasks.length > 0) {
      await queueTasks(tasks);
    }
    setIsPlanning(false);
    setStatusMessage('Planning finished. Tasks ready.');
    // Removed: setActiveTab('tasks'); // User stays on current tab
  }, [setStatusMessage, queueTasks, setIsPlanning]);

  const handleGeneratePlan = useCallback(async (goal) => {
    setStatusMessage('Generating plan...');
    setIsPlanning(true);
    const planText = await sendCommand(`/plan ${goal}`);
    await handlePlanningComplete(planText);
  }, [sendCommand, handlePlanningComplete, setIsPlanning, setStatusMessage]);

  return (
    <div className="workflow-manager">
      {activeTab === 'chat' && (
        <ChatInput onSend={handleGeneratePlan} isPlanning={isPlanning} />
      )}
      {activeTab === 'tasks' && (
        <TaskPanel plan={plan} />
      )}
    </div>
  );
}