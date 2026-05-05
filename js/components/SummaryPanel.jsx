const { useState, useEffect } = React;

window.SummaryPanel = ({ conversationId, messages, onRegenerate }) => {
  const [summary, setSummary] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false); // hidden by default

  // Load summary when conversation changes
  useEffect(() => {
    const saved = window.SummaryService.getSummary(conversationId);
    if (saved) setSummary(saved);
    else setSummary('');
  }, [conversationId]);

  const handleRegenerate = async () => {
    setIsLoading(true);
    const newSummary = await window.SummaryService.generateSummary(messages);
    if (newSummary) {
      setSummary(newSummary);
      localStorage.setItem(`chat_summary_${conversationId}`, newSummary);
      // Also update the last turn marker
      localStorage.setItem(`chat_summary_${conversationId}_last_turn`, messages.length);
    }
    setIsLoading(false);
    if (onRegenerate) onRegenerate();
  };

  if (!isOpen) {
    return React.createElement('button', {
      onClick: () => setIsOpen(true),
      className: 'fixed bottom-20 right-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-full p-2 shadow-lg z-30 transition',
      title: 'Show conversation summary'
    }, '📝');
  }

  return React.createElement('div', {
    className: 'fixed bottom-4 right-4 w-80 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-30 flex flex-col max-h-96'
  },
    // Header
    React.createElement('div', {
      className: 'flex justify-between items-center p-3 border-b border-zinc-800 bg-zinc-950 rounded-t-xl'
    },
      React.createElement('span', { className: 'font-bold text-xs uppercase text-amber-500' }, '📋 Conversation Summary'),
      React.createElement('button', {
        onClick: () => setIsOpen(false),
        className: 'text-zinc-500 hover:text-zinc-300 text-sm'
      }, '×')
    ),
    // Content
    React.createElement('div', { className: 'p-3 overflow-y-auto text-sm text-zinc-300 space-y-2 custom-scrollbar' },
      isLoading
        ? React.createElement('div', { className: 'flex gap-1 justify-center py-4' },
            React.createElement('div', { className: 'w-2 h-2 bg-zinc-500 rounded-full animate-bounce' }),
            React.createElement('div', { className: 'w-2 h-2 bg-zinc-500 rounded-full animate-bounce', style: { animationDelay: '0.15s' } }),
            React.createElement('div', { className: 'w-2 h-2 bg-zinc-500 rounded-full animate-bounce', style: { animationDelay: '0.3s' } })
          )
        : (summary
            ? React.createElement('div', { className: 'whitespace-pre-wrap' }, window.safeMarkdownToReact(summary))
            : React.createElement('p', { className: 'text-zinc-500 italic' }, 'No summary yet. Start a conversation or click refresh.')
          )
    ),
    // Footer
    React.createElement('div', { className: 'p-2 border-t border-zinc-800 flex justify-end gap-2' },
      React.createElement('button', {
        onClick: handleRegenerate,
        disabled: isLoading,
        className: 'text-xs px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition'
      }, '⟳ Refresh')
    )
  );
};
