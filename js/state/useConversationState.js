// js/state/useConversationState.js
window.useConversationState = function useConversationState() {
  const { useState, useEffect, useRef } = React;

  const [conversations, setConversations] = useState(() => {
    const saved = localStorage.getItem('LOCAL_CONVERSATIONS');
    return saved ? JSON.parse(saved) : [{ id: '1', title: 'Default', createdAt: Date.now() }];
  });
  const [activeConversationId, setActiveConversationId] = useState(
    () => localStorage.getItem('LOCAL_ACTIVE_CONV') || '1'
  );
  const [messages, setMessages] = useState(() => {
    const key = `LOCAL_MSGS_${localStorage.getItem('LOCAL_ACTIVE_CONV') || '1'}`;
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : [{ role: 'assistant', content: 'Agent ready. Type `/help` for commands.' }];
  });
  const [streamingMessage, setStreamingMessage] = useState('');
  const [streamingReasoning, setStreamingReasoning] = useState(null);
  const [uploadedContext, setUploadedContext] = useState(null);
  const [isRunActive, setIsRunActive] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [pendingPlan, setPendingPlan] = useState(null);
  const [autoResearch, setAutoResearch] = useState(false); // <-- NEW
  const chatScrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('LOCAL_CONVERSATIONS', JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    localStorage.setItem('LOCAL_ACTIVE_CONV', activeConversationId);
    const saved = localStorage.getItem(`LOCAL_MSGS_${activeConversationId}`);
    setMessages(saved ? JSON.parse(saved) : [{ role: 'assistant', content: 'New chat. Type `/help` for commands.' }]);
    setPendingPlan(null);
  }, [activeConversationId]);

  useEffect(() => {
    localStorage.setItem(`LOCAL_MSGS_${activeConversationId}`, JSON.stringify(messages));
  }, [messages, activeConversationId]);

  const scrollToBottom = () => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

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
    autoResearch,           // <-- EXPORT
    setAutoResearch,        // <-- EXPORT
    chatScrollRef,
    inputRef,
    scrollToBottom,
  };
};
