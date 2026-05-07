================================================
// js/components/ChatPane.jsx
// Updated: added theme prop and conditional styling
window.ChatPane = ({
  theme,
  messages, inputPrompt, setInputPrompt,
  uploadedContext, setUploadedContext,
  isLoading, onSend, onFileUpload,
  showCmdHints, onCmdHintClick,
  chatScrollRef, inputRef,
  streamingMessage,
  conversationId,
}) => {
  // ── Missing definitions added ──────────────────────────────
  const textareaRef = React.useRef(null);
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };
  // ────────────────────────────────────────────────────────────
  // Theme-aware classes
  const chatBg = theme === 'dark' ? 'bg-zinc-950 border-zinc-900' : 'bg-white border-gray-200';
  const headerBg = theme === 'dark' ? 'bg-zinc-950 border-zinc-900' : 'bg-gray-50 border-gray-200';
  const inputBg = theme === 'dark' ? 'bg-zinc-950 border-zinc-900' : 'bg-white border-gray-200';
  const inputContainerBg = theme === 'dark' ? 'bg-zinc-950/95' : 'bg-white/95'; // <-- NEW, for backdrop
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
    // Messages area
    React.createElement('div', {
      ref: chatScrollRef,
      className: 'flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 custom-scrollbar'
    },
      allMessages.map((m, i) => React.createElement(MessageBubble, { key: i, message: m, theme })),
    ),
    // Input area
    React.createElement('div', { className: `border-t ${inputBg} ${inputContainerBg} backdrop-blur flex-shrink-0` },  // <-- CHANGED: no more hardcoded bg-zinc-950/95
      // Command hints — filtered & narrowing as user types
      showCmdHints && (() => {
        const typed = inputPrompt.split(' ')[0];
        const filtered = window.COMMANDS.filter(c =>
          typed === '/' || c.cmd.startsWith(typed)
        );
        if (!filtered.length) return null;
        return React.createElement('div', { className: 'px-3 pt-1 flex flex-col gap-0.5 max-h-48 overflow-y-auto custom-scrollbar' },
          filtered.map(cmd =>
            React.createElement('button', {
              key: cmd.cmd,
              onClick: () => onCmdHintClick(cmd.cmd),
              className: 'text-left text-[11px] px-2 py-1 rounded bg-zinc-800/80 hover:bg-zinc-700 transition flex gap-2 items-baseline'
            },
              React.createElement('span', { className: 'text-amber-400 font-mono shrink-0' }, cmd.cmd),
              React.createElement('span', { className: 'text-zinc-500 truncate' }, cmd.desc)
            )
          )
        );
      })(),
      // Intent suggestion
      React.createElement('div', { className: 'px-3 pt-1' },
        (() => {
          const intent = window.IntentDetector ? window.IntentDetector.detect(inputPrompt) : null;
          if (intent && intent.confidence >= 0.8) {
            return React.createElement('div', { className: `text-[10px] ${theme === 'dark' ? 'text-amber-300' : 'text-amber-600'}` },
              `🔮 Intent: ${intent.cmd} ${intent.args || ''}`
            );
          }
          return null;
        })()
      ),
      // File attachment preview
      uploadedContext && React.createElement('div', { className: 'px-3 py-1' },
        React.createElement('div', { className: `flex items-center gap-2 text-xs ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-gray-100 border-gray-200'} px-3 py-2 rounded-lg border` },
          React.createElement('span', { className: 'text-zinc-400' }, '📎'),
          React.createElement('span', { className: 'truncate' }, uploadedContext.name || 'Attached file'),
          React.createElement('button', {
            onClick: () => setUploadedContext(null),
            className: 'ml-auto text-zinc-500 hover:text-red-400 text-lg leading-none'
          }, '×')
        )
      ),
      // Textarea row
      React.createElement('div', { className: 'p-3 flex gap-2 items-end' },
        React.createElement('label', {
          className: 'cursor-pointer p-2 hover:bg-zinc-800 rounded-xl text-zinc-500 hover:text-amber-400 transition shrink-0 mb-0.5'
        },
          React.createElement('input', { type: 'file', className: 'hidden', onChange: onFileUpload }),
          React.createElement('svg', { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" },
            React.createElement('path', { d: "M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.19 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" })
          )
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
        React.createElement('button', {
          onClick: () => onSend(),
          disabled: isLoading || !inputPrompt.trim(),
          className: 'px-4 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-950 font-bold rounded-xl transition shrink-0 text-sm mb-0.5'
        }, isLoading ? '...' : '↑')
      )
    )
  );
};
// MessageBubble component (unchanged, used above)
function MessageBubble({ message: m, theme }) {
  const isUser = m.role === 'user';
  const msgBgUser = theme === 'dark' ? 'bg-amber-600/12 border-amber-500/20 text-zinc-200' : 'bg-amber-50 border-amber-200 text-gray-800';
  const msgBgAgent = theme === 'dark' ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-gray-100 border-gray-200 text-gray-800';
  return React.createElement('div', { className: `flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}` },
    React.createElement('div', { className: `${isUser ? 'text-right' : 'text-left'} text-[10px] uppercase tracking-widest ${isUser ? 'text-amber-500' : 'text-zinc-500'} px-1` },
      isUser ? 'You' : 'Agent'
    ),
    React.createElement('div', {
      className: `max-w-[92%] sm:max-w-[88%] rounded-2xl px-4 py-3 text-[13px] sm:text-sm leading-relaxed shadow-sm ${isUser ? `${msgBgUser} rounded-tr-sm` : `${msgBgAgent} rounded-tl-sm`}`
    },
      m.content ? window.safeMarkdownToReact(m.content) : ''
    )
  );
}
