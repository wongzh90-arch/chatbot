// js/state/useConversationState.js
// Owns: conversations list, active conversation, messages, streaming state,
//       uploaded context, run-active flag, pending plan for clarification
window.useConversationState = function useConversationState() {
  const { useState, useEffect, useRef } = React;
  // ── Conversation list ──────────────────────────────────────────
  const [conversations, setConversations] = useState(() => {
    const saved = localStorage.getItem('LOCAL_CONVERSATIONS');
    return saved
      ? JSON.parse(saved)
      : [{ id: '1', title: 'Default', createdAt: Date.now() }];
  });
  const [activeConversationId, setActiveConversationId] = useState(
    () => localStorage.getItem('LOCAL_ACTIVE_CONV') || '1'
  );
  // ── Messages for active conversation ──────────────────────────
  const [messages, setMessages] = useState(() => {
    const key = `LOCAL_MSGS_${localStorage.getItem('LOCAL_ACTIVE_CONV') || '1'}`;
    const saved = localStorage.getItem(key);
    return saved
      ? JSON.parse(saved)
      : [{ role: 'assistant', content: 'Agent ready. Type `/help` for commands or describe your intent naturally.' }];
  });
  // ── Streaming state ───────────────────────────────────────────
  const [streamingMessage,  setStreamingMessage]  = useState('');
  const [streamingReasoning, setStreamingReasoning] = useState(null);
  // ── File upload context ───────────────────────────────────────
  const [uploadedContext, setUploadedContext] = useState(null);
  // ── Run-active flag (controls pause button visibility) ────────
  const [isRunActive, setIsRunActive] = useState(false);
  // ── Status message — shows what the agent is doing right now ──
  const [statusMessage, setStatusMessage] = useState('');
  // ── Pending plan for clarification (Phase 1.5) ────────────────
  const [pendingPlan, setPendingPlan] = useState(null);
  // ── Scroll ref for chat pane ──────────────────────────────────
  const chatScrollRef = useRef(null);
  const inputRef      = useRef(null);
  // ── Persist conversations list ────────────────────────────────
  useEffect(() => {
    localStorage.setItem('LOCAL_CONVERSATIONS', JSON.stringify(conversations));
  }, [conversations]);
  // ── When active conversation changes: load its messages ───────
  useEffect(() => {
    localStorage.setItem('LOCAL_ACTIVE_CONV', activeConversationId);
    const saved = localStorage.getItem(`LOCAL_MSGS_${activeConversationId}`);
    if (saved) {
      setMessages(JSON.parse(saved));
    } else {
      setMessages([{ role: 'assistant', content: 'New chat. Type `/help` for commands.' }]);
    }
    // Clear pending plan when switching conversations
    setPendingPlan(null);
  }, [activeConversationId]);
  // ── Persist messages for active conversation ──────────────────
  useEffect(() => {
    localStorage.setItem(`LOCAL_MSGS_${activeConversationId}`, JSON.stringify(messages));
  }, [messages, activeConversationId]);
  // ── Auto-scroll on new messages / streaming ───────────────────
  const scrollToBottom = () => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);
  // ── Conversation management ───────────────────────────────────
  const createNewConversation = () => {
    const id = Date.now().toString();
    setConversations(prev => [{ id, title: 'New Chat', createdAt: Date.now() }, ...prev]);
    setActiveConversationId(id);
  };
  const deleteConversation = (id) => {
    localStorage.removeItem(`LOCAL_MSGS_${id}`);
    if (window.ConversationMemory) window.ConversationMemory.delete(id);
    setConversations(prev => {
      const rest = prev.filter(c => c.id !== id);
      if (activeConversationId === id) {
        const next = rest[0] || { id: Date.now().toString(), title: 'Default', createdAt: Date.now() };
        setActiveConversationId(next.id);
        if (rest.length === 0) return [next];
      }
      return rest;
    });
  };
  const renameConversation = (id, title) => {
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title } : c));
  };
  return {
    conversations,
    setConversations,
    activeConversationId,
    setActiveConversationId,
    createNewConversation,
    deleteConversation,
    renameConversation,
    messages,
    setMessages,
    streamingMessage,
    setStreamingMessage,
    streamingReasoning,
    setStreamingReasoning,
    uploadedContext,
    setUploadedContext,
    isRunActive,
    setIsRunActive,
    statusMessage,
    setStatusMessage,
    pendingPlan,
    setPendingPlan,
    chatScrollRef,
    inputRef,
    scrollToBottom,
  };
};
