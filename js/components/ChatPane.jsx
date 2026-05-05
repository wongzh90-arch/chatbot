window.ChatPane = ({
  messages, inputPrompt, setInputPrompt,
  uploadedContext, setUploadedContext,
  isLoading, onSend, onFileUpload,
  showCmdHints, onCmdHintClick,
  chatScrollRef, inputRef,
  streamingMessage,
}) => {
  const { useState, useRef, useEffect } = React;
  const [intentSuggestion, setIntentSuggestion] = useState(null);
  const [rows, setRows] = useState(1);
  const textareaRef = useRef(null);

  // Intent detection while typing
  useEffect(() => {
    if (!inputPrompt || inputPrompt.startsWith('/')) {
      setIntentSuggestion(null);
      return;
    }
    const suggestion = window.IntentDetector && window.IntentDetector.suggest(inputPrompt);
    setIntentSuggestion(suggestion || null);
  }, [inputPrompt]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newRows = Math.min(Math.max(Math.ceil(textareaRef.current.scrollHeight / 24), 1), 6);
      setRows(newRows);
      textareaRef.current.style.height = '';
    }
  }, [inputPrompt]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const acceptIntent = () => {
    if (!intentSuggestion) return;
    const full = intentSuggestion.args
      ? `${intentSuggestion.cmd} ${intentSuggestion.args}`
      : intentSuggestion.cmd;
    onSend(full);
    setIntentSuggestion(null);
  };

  const allMessages = [...messages];
  if (streamingMessage) {
    allMessages.push({ role: 'assistant', content: streamingMessage, isStreaming: true });
  }

  return React.createElement('div', {
    className: 'flex w-full lg:w-[420px] xl:w-[480px] flex-col bg-zinc-950 shrink-0 relative border-l border-zinc-900'
  },

    // Header
    React.createElement('div', {
      className: 'p-3 border-b border-zinc-900 bg-zinc-950 z-10 shrink-0 flex items-center gap-2'
    },
      React.createElement('div', {
        className: `w-2 h-2 rounded-full ${isLoading ? 'bg-amber-400 animate-pulse' : 'bg-green-500'}`
      }),
      React.createElement('span', { className: 'font-mono font-bold text-xs uppercase text-zinc-400 tracking-widest' },
        isLoading ? 'Processing…' : 'Terminal'
      )
    ),

    // Messages
    React.createElement('div', {
      ref: chatScrollRef,
      className: 'flex-1 overflow-y-auto p-4 space-y-4 pb-36 custom-scrollbar'
    },
      allMessages.map((m, i) =>
        React.createElement(MessageBubble, { key: i, message: m })
      ),
      isLoading && !streamingMessage && React.createElement('div', { className: 'flex items-start gap-2' },
        React.createElement('div', { className: 'w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-[10px] shrink-0' }, '🤖'),
        React.createElement('div', { className: 'bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3' },
          React.createElement('div', { className: 'flex gap-1 items-center h-4' },
            [0, 1, 2].map(j => React.createElement('div', {
              key: j,
              className: 'w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce',
              style: { animationDelay: `${j * 0.15}s` }
            }))
          )
        )
      )
    ),

    // Input area
    React.createElement('div', {
      className: 'absolute bottom-0 left-0 right-0 bg-zinc-950 border-t border-zinc-900'
    },

      // Command hints dropdown
      showCmdHints && React.createElement('div', {
        className: 'border-b border-zinc-800 bg-zinc-900/95 backdrop-blur max-h-48 overflow-y-auto'
      },
        window.COMMANDS
          .filter(c => c.cmd.startsWith(inputPrompt.split(' ')[0].toLowerCase()))
          .map((c, i) => React.createElement('div', {
            key: i,
            onClick: () => onCmdHintClick(c.cmd),
            className: 'px-4 py-2.5 hover:bg-zinc-800 cursor-pointer flex items-center gap-3 text-xs'
          },
            React.createElement('span', { className: 'font-mono text-amber-400 font-bold w-24 shrink-0' }, c.cmd),
            React.createElement('span', { className: 'text-zinc-400' }, c.desc)
          ))
      ),

      // Intent suggestion banner
      intentSuggestion && React.createElement('div', {
        className: 'mx-3 mt-2 flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-xs'
      },
        React.createElement('span', { className: 'text-amber-400' }, '⚡'),
        React.createElement('span', { className: 'text-zinc-400 flex-1' },
          'Run ',
          React.createElement('code', { className: 'text-amber-400 font-mono' },
            intentSuggestion.args
              ? `${intentSuggestion.cmd} ${intentSuggestion.args.substring(0, 40)}${intentSuggestion.args.length > 40 ? '…' : ''}`
              : intentSuggestion.cmd
          ),
          '?'
        ),
        React.createElement('button', {
          onClick: acceptIntent,
          className: 'px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded font-bold transition'
        }, 'Run'),
        React.createElement('button', {
          onClick: () => setIntentSuggestion(null),
          className: 'text-zinc-600 hover:text-zinc-400'
        }, '×')
      ),

      // Attachment preview
      uploadedContext && React.createElement('div', {
        className: 'mx-3 mt-2 flex items-center justify-between bg-zinc-900 px-3 py-2 rounded-lg border border-zinc-700 text-xs'
      },
        React.createElement('div', { className: 'flex items-center gap-2' },
          React.createElement('span', null, uploadedContext.type === 'image' ? '🖼️' : '📄'),
          React.createElement('span', { className: 'text-zinc-300 truncate max-w-[240px]' }, uploadedContext.name)
        ),
        React.createElement('button', {
          onClick: () => setUploadedContext(null),
          className: 'text-zinc-600 hover:text-red-400 ml-2 text-base leading-none'
        }, '×')
      ),

      // Textarea + buttons
      React.createElement('div', { className: 'p-3 flex gap-2 items-end' },
        React.createElement('label', {
          className: 'cursor-pointer p-2 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-amber-400 transition shrink-0'
        },
          React.createElement('svg', { width: '18', height: '18', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2' },
            React.createElement('path', { d: 'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48' })
          ),
          React.createElement('input', { type: 'file', onChange: onFileUpload, className: 'hidden' })
        ),
        React.createElement('div', { className: 'flex-1 bg-zinc-900 border border-zinc-800 rounded-xl focus-within:border-amber-500/50 transition overflow-hidden' },
          React.createElement('textarea', {
            ref: el => { textareaRef.current = el; if (inputRef) inputRef.current = el; },
            placeholder: 'Type / for commands, describe intent, or ask AI…',
            value: inputPrompt,
            rows,
            onChange: e => setInputPrompt(e.target.value),
            onKeyDown: handleKeyDown,
            className: 'w-full bg-transparent text-sm text-zinc-100 outline-none px-4 py-3 placeholder-zinc-600 font-mono resize-none leading-6 custom-scrollbar'
          })
        ),
        React.createElement('button', {
          onClick: () => onSend(),
          disabled: isLoading || !inputPrompt.trim(),
          className: 'px-4 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-950 font-bold rounded-xl transition shrink-0 text-sm'
        }, isLoading ? '…' : '↑')
      )
    )
  );
};

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message: m }) {
  const isUser = m.role === 'user';

  // Detect if this is a web search result block
  const isSearchResult = !isUser && m.searchResults && m.searchResults.length > 0;

  return React.createElement('div', {
    className: `flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`
  },
    // Role label
    React.createElement('div', { className: 'flex items-center gap-2 px-1' },
      !isUser && React.createElement('div', {
        className: 'w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-[9px]'
      }, '🤖'),
      React.createElement('span', { className: 'text-[10px] font-bold uppercase tracking-widest text-zinc-600' },
        isUser ? 'You' : 'Agent'
      ),
      m.model && React.createElement('span', {
        className: 'text-[9px] font-mono text-amber-500/70 bg-amber-500/10 px-1.5 py-0.5 rounded-full'
      }, m.model.split('/').pop()),
      m.isStreaming && React.createElement('span', {
        className: 'w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse'
      })
    ),

    // Bubble
    React.createElement('div', {
      className: `max-w-[92%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed shadow-sm ${
        isUser
          ? 'bg-amber-600/15 border border-amber-500/20 text-zinc-200 rounded-tr-sm'
          : 'bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-tl-sm'
      }`
    },
      // Rich search results
      isSearchResult
        ? React.createElement(SearchResultsCard, { results: m.searchResults, query: m.searchQuery })
        : React.createElement('div', { className: 'whitespace-pre-wrap break-words' },
            window.safeMarkdownToReact(m.content)
          )
    )
  );
}

// ─── Rich Search Results Card ─────────────────────────────────────────────────

function SearchResultsCard({ results, query }) {
  const [expanded, setExpanded] = React.useState(null);

  return React.createElement('div', { className: 'space-y-3' },
    React.createElement('div', { className: 'flex items-center gap-2 mb-3' },
      React.createElement('span', { className: 'text-amber-400' }, '🔍'),
      React.createElement('span', { className: 'font-bold text-zinc-300 text-sm' }, `Results for "${query}"`),
      React.createElement('span', { className: 'text-xs text-zinc-600 ml-auto' }, `${results.length} results`)
    ),
    results.map((r, i) =>
      React.createElement('div', {
        key: i,
        className: 'bg-zinc-800/60 border border-zinc-700/60 rounded-xl overflow-hidden hover:border-zinc-600 transition cursor-pointer',
        onClick: () => setExpanded(expanded === i ? null : i)
      },
        React.createElement('div', { className: 'p-3' },
          React.createElement('div', { className: 'flex items-start gap-2' },
            React.createElement('div', {
              className: 'w-5 h-5 rounded bg-zinc-700 flex items-center justify-center text-[10px] shrink-0 mt-0.5'
            }, i + 1),
            React.createElement('div', { className: 'flex-1 min-w-0' },
              React.createElement('a', {
                href: r.url,
                target: '_blank',
                rel: 'noopener noreferrer',
                onClick: e => e.stopPropagation(),
                className: 'font-semibold text-zinc-200 text-sm hover:text-amber-400 transition line-clamp-2 block'
              }, r.title),
              React.createElement('div', { className: 'flex items-center gap-1.5 mt-1' },
                React.createElement('span', { className: 'text-[10px] text-zinc-500 font-mono truncate' },
                  window.WebSearchService.extractDomain(r.url)
                ),
                r.datePublished && React.createElement('span', { className: 'text-[10px] text-zinc-600' },
                  '· ' + new Date(r.datePublished).toLocaleDateString()
                )
              )
            ),
            React.createElement('span', { className: 'text-zinc-600 text-xs shrink-0' }, expanded === i ? '▲' : '▼')
          ),
          expanded === i && r.snippet && React.createElement('div', {
            className: 'mt-3 pt-3 border-t border-zinc-700/50 text-xs text-zinc-400 leading-relaxed'
          }, r.snippet)
        )
      )
    )
  );
}
