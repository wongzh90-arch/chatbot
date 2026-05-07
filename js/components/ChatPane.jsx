// js/components/ChatPane.jsx
// Updated: added theme prop and conditional styling

window.ChatPane = ({
  theme,          // NEW
  messages, inputPrompt, setInputPrompt,
  uploadedContext, setUploadedContext,
  isLoading, onSend, onFileUpload,
  showCmdHints, onCmdHintClick,
  chatScrollRef, inputRef,
  streamingMessage,
  conversationId,    // already in props
}) => {
  // … keep the same state and effect code …

  // Theme-aware classes
  const chatBg = theme === 'dark' ? 'bg-zinc-950 border-zinc-900' : 'bg-white border-gray-200';
  const headerBg = theme === 'dark' ? 'bg-zinc-950 border-zinc-900' : 'bg-gray-50 border-gray-200';
  const inputBg = theme === 'dark' ? 'bg-zinc-950 border-zinc-900' : 'bg-white border-gray-200';
  const textareaBg = theme === 'dark' ? 'bg-zinc-900 border-zinc-800 focus:border-amber-500/50' : 'bg-gray-100 border-gray-300 focus:border-amber-500';
  const textareaText = theme === 'dark' ? 'text-zinc-100 placeholder-zinc-600' : 'text-gray-800 placeholder-gray-400';
  const msgBgUser = theme === 'dark' ? 'bg-amber-600/12 border-amber-500/20 text-zinc-200' : 'bg-amber-50 border-amber-200 text-gray-800';
  const msgBgAgent = theme === 'dark' ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-gray-100 border-gray-200 text-gray-800';

  const allMessages = [...messages];
  if (streamingMessage) {
    allMessages.push({ role: 'assistant', content: streamingMessage, isStreaming: true });
  }

  return React.createElement('div', {
    className: `flex flex-1 flex-col ${chatBg} border-l h-full min-h-0 overflow-hidden`
  },
    // Header
    React.createElement('div', {
      className: `px-4 py-2.5 border-b ${headerBg} shrink-0 flex items-center gap-2`
    },
      React.createElement('div', {
        className: `w-2 h-2 rounded-full shrink-0 ${isLoading ? 'bg-amber-400 animate-pulse' : 'bg-green-500'}`
      }),
      React.createElement('span', {
        className: `font-mono font-bold text-xs uppercase tracking-widest ${theme === 'dark' ? 'text-zinc-500' : 'text-gray-500'}`
      }, isLoading ? 'Processing...' : 'Terminal'),
      React.createElement('span', {
        className: `${theme === 'dark' ? 'text-zinc-700' : 'text-gray-400'} text-xs ml-auto`
      }, `${messages.filter(m => m.role === 'user').length} msg${messages.filter(m => m.role === 'user').length !== 1 ? 's' : ''}`)
    ),

    // Messages area – keep as is, but modify the MessageBubble to use msgBgUser/Agent
    React.createElement('div', {
      ref: chatScrollRef,
      className: 'flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 custom-scrollbar'
    },
      allMessages.map((m, i) => React.createElement(MessageBubble, { key: i, message: m, theme })), // pass theme
      // Typing indicator unchanged
    ),

    // Input area (header and textarea updated)
    React.createElement('div', { className: `border-t ${inputBg} bg-zinc-950/95 backdrop-blur flex-shrink-0` }, // backdrop may need theme
      // … command hints (unchanged) …
      // Intent suggestion (unchanged) …
      // File attachment preview (unchanged) …

      // Textarea row
      React.createElement('div', { className: 'p-3 flex gap-2 items-end' },
        // File upload button
        React.createElement('label', {
          className: `cursor-pointer p-2 hover:bg-zinc-800 rounded-xl text-zinc-500 hover:text-amber-400 transition shrink-0 mb-0.5`
        },
          // SVG unchanged
        ),

        React.createElement('textarea', {
          ref: el => { textareaRef.current = el; if (inputRef) inputRef.current = el; },
          placeholder: 'Type / for commands, describe intent, or ask AI... (Shift+Enter for newline)',
          value: inputPrompt,
          rows: 1,
          onChange: e => setInputPrompt(e.target.value),
          onKeyDown: handleKeyDown,
          className: `flex-1 ${textareaBg} ${textareaText} rounded-xl outline-none px-4 py-2.5 text-sm font-mono resize-none leading-6 transition custom-scrollbar overflow-hidden min-h-[2.75rem]`
        }),

        // Send button
        React.createElement('button', {
          onClick: () => onSend(),
          disabled: isLoading || !inputPrompt.trim(),
          className: 'px-4 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-950 font-bold rounded-xl transition shrink-0 text-sm mb-0.5'
        }, isLoading ? '...' : '↑')
      )
    )
  );
};

// MessageBubble – needs theme as well; I’ll keep it inline but adapt:
function MessageBubble({ message: m, theme }) {
  const isUser = m.role === 'user';
  const msgBgUser = theme === 'dark' ? 'bg-amber-600/12 border-amber-500/20 text-zinc-200' : 'bg-amber-50 border-amber-200 text-gray-800';
  const msgBgAgent = theme === 'dark' ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-gray-100 border-gray-200 text-gray-800';

  return React.createElement('div', { className: `flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}` },
    // Role label row unchanged …
    React.createElement('div', {
      className: `max-w-[92%] sm:max-w-[88%] rounded-2xl px-4 py-3 text-[13px] sm:text-sm leading-relaxed shadow-sm ${
        isUser ? `${msgBgUser} rounded-tr-sm` : `${msgBgAgent} rounded-tl-sm`
      }`
    },
      // Content unchanged …
    )
  );
}
