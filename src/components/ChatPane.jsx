// js/components/ChatPane.jsx
// Message types handled:
//   { role: 'user' | 'assistant' }   — normal chat
//   { role: 'file', path, content, sha, proposed? }  — inline file viewer/editor
//   { role: 'diff', path, diffLines, commitSha }      — inline diff card

window.ChatPane = ({
  messages, inputPrompt, setInputPrompt,
  uploadedContext, setUploadedContext,
  isLoading, onSend, onFileUpload,
  showCmdHints, onCmdHintClick,
  chatScrollRef, inputRef,
  streamingMessage,
  isRunActive,
  onPause,
  onCommitFile,   // (path, content, sha, message?) => Promise<{ newSha }|null>
}) => {
  const { useState, useRef, useEffect } = React;
  const [intentSuggestion, setIntentSuggestion] = useState(null);
  const [pauseRequested,   setPauseRequested]   = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (!inputPrompt || inputPrompt.startsWith('/')) { setIntentSuggestion(null); return; }
    const s = window.IntentDetector && window.IntentDetector.suggest(inputPrompt);
    setIntentSuggestion(s || null);
  }, [inputPrompt]);

  useEffect(() => { if (!isRunActive) setPauseRequested(false); }, [isRunActive]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 144) + 'px';
  }, [inputPrompt]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
  };

  const handlePause = () => {
    setPauseRequested(true);
    if (onPause) onPause();
  };

  const acceptIntent = () => {
    if (!intentSuggestion) return;
    onSend(intentSuggestion.args
      ? `${intentSuggestion.cmd} ${intentSuggestion.args}`
      : intentSuggestion.cmd);
    setIntentSuggestion(null);
  };

  const allMessages = [...messages];
  if (streamingMessage) {
    allMessages.push({ role: 'assistant', content: streamingMessage, isStreaming: true });
  }

  return React.createElement('div', {
    className: 'flex flex-1 flex-col h-full min-h-0 overflow-hidden bg-zinc-950'
  },

    // ── Header bar ────────────────────────────────────────────
    React.createElement('div', {
      className: 'px-4 py-2.5 border-b border-zinc-800 bg-zinc-950 shrink-0 flex items-center gap-2'
    },
      React.createElement('div', {
        className: `w-2 h-2 rounded-full shrink-0 ${isLoading ? 'bg-amber-400 animate-pulse' : 'bg-green-500'}`
      }),
      React.createElement('span', {
        className: 'font-mono font-bold text-xs uppercase text-zinc-500 tracking-widest'
      }, isLoading ? 'Processing…' : 'Terminal'),
      React.createElement('span', { className: 'text-zinc-700 text-xs ml-auto font-mono' },
        `${messages.filter(m => m.role === 'user').length} turns`
      )
    ),

    // ── Message stream ────────────────────────────────────────
    React.createElement('div', {
      ref: chatScrollRef,
      className: 'flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar'
    },
      allMessages.map((m, i) =>
        m.role === 'file'
          ? React.createElement(FileCard, {
              key: i, message: m,
              onCommit: onCommitFile,
            })
          : m.role === 'diff'
          ? React.createElement(DiffCard, { key: i, message: m })
          : React.createElement(MessageBubble, { key: i, message: m })
      ),

      // Typing indicator
      isLoading && !streamingMessage && React.createElement('div', {
        className: 'flex items-center gap-2 pl-1'
      },
        React.createElement('div', {
          className: 'w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-[9px]'
        }, '🤖'),
        React.createElement('div', {
          className: 'bg-zinc-900 border border-zinc-800 rounded-2xl rounded-tl-sm px-4 py-2.5 flex gap-1 items-center'
        },
          [0, 1, 2].map(j => React.createElement('div', {
            key: j,
            className: 'w-1.5 h-1.5 rounded-full bg-zinc-500',
            style: { animation: 'bounce 1s infinite', animationDelay: `${j * 0.15}s` }
          }))
        )
      )
    ),

    // ── Input area ────────────────────────────────────────────
    React.createElement('div', {
      className: 'border-t border-zinc-800 bg-zinc-950/95 backdrop-blur shrink-0'
    },

      // Command hints
      showCmdHints && React.createElement('div', {
        className: 'border-b border-zinc-800 bg-zinc-900/80 max-h-44 overflow-y-auto custom-scrollbar'
      },
        window.COMMANDS
          .filter(c => c.cmd.startsWith(inputPrompt.split(' ')[0].toLowerCase()))
          .map((c, i) => React.createElement('div', {
            key: i,
            onClick: () => onCmdHintClick(c.cmd),
            className: 'px-4 py-2 hover:bg-zinc-800 cursor-pointer flex items-center gap-3 text-xs border-b border-zinc-800/40 last:border-0'
          },
            React.createElement('span', {
              className: 'font-mono text-amber-400 font-bold w-28 shrink-0'
            }, c.cmd),
            React.createElement('span', { className: 'text-zinc-500' }, c.desc)
          ))
      ),

      // Intent suggestion
      intentSuggestion && React.createElement('div', {
        className: 'mx-3 mt-2 flex items-center gap-2 bg-amber-500/8 border border-amber-500/20 rounded-xl px-3 py-2 text-xs'
      },
        React.createElement('span', { className: 'text-amber-400 shrink-0' }, '⚡'),
        React.createElement('span', { className: 'text-zinc-400 flex-1 truncate' },
          'Run ',
          React.createElement('code', { className: 'text-amber-400 font-mono' },
            intentSuggestion.args
              ? `${intentSuggestion.cmd} ${intentSuggestion.args.substring(0, 35)}…`
              : intentSuggestion.cmd
          ),
          '?'
        ),
        React.createElement('button', {
          onClick: acceptIntent,
          className: 'px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded-lg font-bold transition'
        }, 'Run'),
        React.createElement('button', {
          onClick: () => setIntentSuggestion(null),
          className: 'text-zinc-600 hover:text-zinc-400'
        }, '×')
      ),

      // File attachment preview
      uploadedContext && React.createElement('div', {
        className: 'mx-3 mt-2 flex items-center gap-2 bg-zinc-900 px-3 py-2 rounded-xl border border-zinc-700 text-xs'
      },
        React.createElement('span', null, uploadedContext.type === 'image' ? '🖼️' : '📄'),
        React.createElement('span', { className: 'text-zinc-300 truncate flex-1' }, uploadedContext.name),
        React.createElement('button', {
          onClick: () => setUploadedContext(null),
          className: 'text-zinc-600 hover:text-red-400 text-base leading-none'
        }, '×')
      ),

      // Textarea row
      React.createElement('div', { className: 'p-3 flex gap-2 items-end' },

        // File upload
        React.createElement('label', {
          className: 'cursor-pointer p-2 hover:bg-zinc-800 rounded-xl text-zinc-600 hover:text-amber-400 transition shrink-0 mb-0.5'
        },
          React.createElement('svg', {
            width: '16', height: '16', viewBox: '0 0 24 24',
            fill: 'none', stroke: 'currentColor', strokeWidth: '2'
          },
            React.createElement('path', {
              d: 'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48'
            })
          ),
          React.createElement('input', { type: 'file', onChange: onFileUpload, className: 'hidden' })
        ),

        // Textarea
        React.createElement('textarea', {
          ref: el => { textareaRef.current = el; if (inputRef) inputRef.current = el; },
          placeholder: 'Type / for commands, or ask anything… (Shift+Enter for newline)',
          value: inputPrompt,
          rows: 1,
          onChange: e => setInputPrompt(e.target.value),
          onKeyDown: handleKeyDown,
          className: 'flex-1 bg-zinc-900 border border-zinc-800 focus:border-amber-500/40 rounded-xl outline-none px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 font-mono resize-none leading-6 transition custom-scrollbar overflow-hidden'
        }),

        // Pause button (run active only)
        isRunActive && React.createElement('button', {
          onClick: handlePause,
          disabled: pauseRequested,
          title: pauseRequested ? 'Stopping after current task…' : 'Pause after current task',
          className: `px-3 py-2.5 rounded-xl font-bold text-xs transition shrink-0 mb-0.5 border ${
            pauseRequested
              ? 'bg-zinc-800 border-zinc-700 text-zinc-500 cursor-not-allowed'
              : 'bg-amber-500/10 border-amber-500/25 text-amber-400 hover:bg-amber-500/20'
          }`
        },
          pauseRequested
            ? React.createElement('span', { className: 'flex items-center gap-1.5' },
                React.createElement('span', {
                  className: 'w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse'
                }),
                'Stopping'
              )
            : '⏸ Pause'
        ),

        // Send
        React.createElement('button', {
          onClick: () => onSend(),
          disabled: isLoading || !inputPrompt.trim(),
          className: 'px-4 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-950 font-bold rounded-xl transition shrink-0 text-sm mb-0.5'
        }, isLoading ? '…' : '↑')
      )
    )
  );
};

// ─── Standard Message Bubble ───────────────────────────────────
function MessageBubble({ message: m }) {
  const isUser         = m.role === 'user';
  const isSearchResult = !isUser && m.searchResults && m.searchResults.length > 0;

  return React.createElement('div', {
    className: `flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`
  },
    React.createElement('div', { className: 'flex items-center gap-1.5 px-1' },
      !isUser && React.createElement('div', {
        className: 'w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-[9px]'
      }, '🤖'),
      React.createElement('span', {
        className: 'text-[10px] font-bold uppercase tracking-widest text-zinc-600'
      }, isUser ? 'You' : 'Agent'),
      m.model && React.createElement('span', {
        className: 'text-[9px] font-mono text-amber-500/60 bg-amber-500/10 px-1.5 py-0.5 rounded-full'
      }, m.model.split('/').pop()),
      m.isStreaming && React.createElement('span', {
        className: 'w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse'
      })
    ),
    React.createElement('div', {
      className: `max-w-[92%] sm:max-w-[85%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${
        isUser
          ? 'bg-amber-600/10 border border-amber-500/15 text-zinc-200 rounded-tr-sm'
          : 'bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-tl-sm'
      }`
    },
      isSearchResult
        ? React.createElement(SearchResultsBlock, {
            results: m.searchResults,
            query:   m.searchQuery,
            synthesis: m.synthesis,
          })
        : React.createElement('div', { className: 'whitespace-pre-wrap break-words' },
            window.safeMarkdownToReact(m.content)
          )
    )
  );
}

// ─── Inline File Card ──────────────────────────────────────────
// Shown when a file is loaded (click in tree, /open command, or agent read)
function FileCard({ message: m, onCommit }) {
  const { useState } = React;
  const [editing,      setEditing]      = useState(false);
  const [editContent,  setEditContent]  = useState(m.content);
  const [commitMsg,    setCommitMsg]    = useState('');
  const [committing,   setCommitting]   = useState(false);
  const [committed,    setCommitted]    = useState(false);
  const [copied,       setCopied]       = useState(false);

  const fileName = m.path.split('/').pop();
  const ext      = fileName.split('.').pop();

  const handleCopy = () => {
    navigator.clipboard.writeText(editing ? editContent : m.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleCommit = async () => {
    if (!onCommit) return;
    setCommitting(true);
    const result = await onCommit(m.path, editContent, m.sha, commitMsg || null);
    setCommitting(false);
    if (result) {
      setCommitted(true);
      setEditing(false);
    }
  };

  const lines = (editing ? editContent : m.content).split('\n');

  return React.createElement('div', {
    className: 'rounded-xl border border-zinc-700 bg-zinc-900/80 overflow-hidden'
  },
    // Header
    React.createElement('div', {
      className: 'flex items-center gap-2 px-3 py-2 bg-zinc-800/60 border-b border-zinc-700'
    },
      React.createElement('span', { className: 'text-zinc-500 text-xs' },
        m.proposed ? '🤖' : '📄'
      ),
      React.createElement('span', {
        className: 'font-mono text-xs text-zinc-300 flex-1 truncate'
      }, m.path),
      m.proposed && React.createElement('span', {
        className: 'text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold'
      }, 'proposed'),
      committed && React.createElement('span', {
        className: 'text-[10px] bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full font-bold'
      }, '✓ committed'),

      // Actions
      React.createElement('div', { className: 'flex items-center gap-1 ml-2' },
        React.createElement('button', {
          onClick: handleCopy,
          className: 'text-[10px] px-2 py-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 rounded transition'
        }, copied ? '✓ Copied' : 'Copy'),
        !committed && React.createElement('button', {
          onClick: () => { setEditing(e => !e); setEditContent(m.content); },
          className: `text-[10px] px-2 py-1 rounded transition ${
            editing
              ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700'
          }`
        }, editing ? 'Cancel' : 'Edit')
      )
    ),

    // Code body
    React.createElement('div', {
      className: 'overflow-auto custom-scrollbar',
      style: { maxHeight: '320px' }
    },
      editing
        ? React.createElement('textarea', {
            value: editContent,
            onChange: e => setEditContent(e.target.value),
            spellCheck: false,
            className: 'w-full bg-transparent text-zinc-300 font-mono text-[12px] leading-5 p-3 outline-none resize-none',
            style: { minHeight: '200px', height: Math.min(lines.length * 20 + 24, 320) + 'px' }
          })
        : React.createElement('pre', {
            className: 'p-3 text-[12px] font-mono leading-5 text-zinc-300 overflow-x-auto'
          },
            React.createElement('code', null,
              lines.map((line, i) =>
                React.createElement('div', { key: i, className: 'flex gap-3' },
                  React.createElement('span', {
                    className: 'text-zinc-700 select-none w-7 shrink-0 text-right'
                  }, i + 1),
                  React.createElement('span', null, line || ' ')
                )
              )
            )
          )
    ),

    // Commit row (edit mode)
    editing && !committed && React.createElement('div', {
      className: 'flex items-center gap-2 px-3 py-2 border-t border-zinc-700 bg-zinc-800/40'
    },
      React.createElement('input', {
        type: 'text',
        placeholder: 'Commit message (optional)',
        value: commitMsg,
        onChange: e => setCommitMsg(e.target.value),
        className: 'flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300 outline-none focus:border-amber-500/50 font-mono'
      }),
      React.createElement('button', {
        onClick: handleCommit,
        disabled: committing,
        className: 'px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition'
      }, committing ? '…' : '✓ Commit'),
      React.createElement('button', {
        onClick: () => setEditing(false),
        className: 'px-3 py-1.5 text-zinc-500 hover:text-zinc-300 text-xs transition'
      }, 'Discard')
    )
  );
}

// ─── Inline Diff Card ──────────────────────────────────────────
function DiffCard({ message: m }) {
  const { added, removed } = window.DiffUtils
    ? window.DiffUtils.diffSummary(m.diffLines || [])
    : { added: 0, removed: 0 };

  return React.createElement('div', {
    className: 'rounded-xl border border-zinc-700 bg-zinc-900/80 overflow-hidden'
  },
    // Header
    React.createElement('div', {
      className: 'flex items-center gap-2 px-3 py-2 bg-zinc-800/60 border-b border-zinc-700'
    },
      React.createElement('span', { className: 'text-zinc-500 text-xs' }, '📝'),
      React.createElement('span', {
        className: 'font-mono text-xs text-zinc-300 flex-1 truncate'
      }, m.path),
      React.createElement('span', {
        className: 'text-[10px] text-green-400 font-mono'
      }, `+${added}`),
      React.createElement('span', {
        className: 'text-[10px] text-red-400 font-mono ml-1'
      }, `-${removed}`),
      m.committed && React.createElement('span', {
        className: 'text-[10px] bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full font-bold ml-2'
      }, '✓ committed'),
      m.commitSha && React.createElement('a', {
        href:   `https://github.com/${m.repo || ''}/commit/${m.commitSha}`,
        target: '_blank',
        rel:    'noopener noreferrer',
        className: 'text-[10px] text-zinc-600 hover:text-zinc-400 font-mono ml-1 transition'
      }, m.commitSha.slice(0, 7) + ' ↗')
    ),

    // Diff lines
    React.createElement('div', {
      className: 'overflow-auto custom-scrollbar',
      style: { maxHeight: '280px' }
    },
      React.createElement('pre', {
        className: 'text-[12px] font-mono leading-5 p-3'
      },
        (m.diffLines || []).map((line, i) =>
          line.type === 'separator'
            ? React.createElement('div', {
                key: i,
                className: 'text-zinc-600 py-0.5 px-1'
              }, line.line)
            : React.createElement('div', {
                key: i,
                className: `flex gap-3 px-1 rounded ${
                  line.type === 'add'    ? 'bg-green-500/10 text-green-300' :
                  line.type === 'remove' ? 'bg-red-500/10 text-red-300'    :
                  'text-zinc-500'
                }`
              },
                React.createElement('span', {
                  className: 'select-none w-4 shrink-0 text-right opacity-50'
                },
                  line.type === 'add'    ? '+' :
                  line.type === 'remove' ? '−' : ' '
                ),
                React.createElement('span', {
                  className: 'w-7 shrink-0 text-right opacity-30 text-[10px]'
                }, line.newLineNum || line.oldLineNum || ''),
                React.createElement('span', null, line.line)
              )
        )
      )
    )
  );
}

// ─── Search Results Block ──────────────────────────────────────
function SearchResultsBlock({ results, synthesis }) {
  return React.createElement('div', { className: 'space-y-2' },
    synthesis && React.createElement('div', {
      className: 'bg-amber-500/8 border border-amber-500/20 rounded-xl px-3 py-2.5 mb-2'
    },
      React.createElement('div', {
        className: 'text-sm text-zinc-300 leading-relaxed'
      }, window.safeMarkdownToReact(synthesis))
    ),
    React.createElement('div', { className: 'space-y-1.5' },
      results.map((r, i) =>
        React.createElement('a', {
          key: i,
          href: r.url,
          target: '_blank',
          rel: 'noopener noreferrer',
          className: 'flex items-center gap-2 px-2 py-1.5 text-xs bg-zinc-800/30 hover:bg-zinc-700/40 rounded-lg transition'
        },
          React.createElement('span', {
            className: 'text-zinc-600 font-mono text-[10px] shrink-0 w-4'
          }, i + 1),
          React.createElement('span', {
            className: 'text-zinc-300 truncate flex-1'
          }, r.title),
          React.createElement('span', {
            className: 'text-zinc-600 text-[10px] hidden sm:inline'
          }, window.WebSearchService.extractDomain(r.url))
        )
      )
    )
  );
}
