window.IntentDetector = (() => {

  const intentPatterns = [
    // Search
    {
      patterns: [
        /^(?:search(?:\s+(?:the\s+)?web)?\s+(?:for\s+)?|look\s+up\s+|find\s+info(?:rmation)?\s+(?:on|about)\s+|google\s+)(.+)/i,
        /^(?:what(?:'s|\s+is)\s+(?:the\s+)?(?:latest|current|best)\s+.+)/i,
        /^(?:how\s+(?:do|does|to)\s+.+\?)$/i,
      ],
      handler: (match, fullText) => {
        const queryMatch = fullText.match(
          /(?:search(?:\s+(?:the\s+)?web)?\s+(?:for\s+)?|look\s+up\s+|find\s+info(?:rmation)?\s+(?:on|about)\s+|google\s+)(.+)/i
        );
        if (queryMatch) return { cmd: '/search', args: queryMatch[1].trim(), confidence: 0.9 };
        return { cmd: '/search', args: fullText, confidence: 0.6 };
      }
    },
    // Fetch / refresh
    {
      patterns: [
        /^(?:refresh|reload|update|sync)\s+(?:the\s+)?(?:file\s+tree|files?|repo|repository)/i,
        /^(?:fetch|get)\s+(?:the\s+)?(?:file\s+tree|files?|repo|repository)/i,
      ],
      handler: () => ({ cmd: '/fetch', args: '', confidence: 0.9 })
    },
    // Commit
    {
      patterns: [
        /^(?:commit|save|push)\s+(?:this\s+)?(?:file|change|code|update)?/i,
        /^(?:commit\s+with\s+message\s+["']?(.+)["']?)/i,
      ],
      handler: (match, fullText) => {
        const msgMatch = fullText.match(/(?:with\s+message\s+["']?|message[:\s]+["']?)(.+?)["']?$/i);
        return { cmd: '/commit', args: msgMatch ? msgMatch[1] : '', confidence: 0.85 };
      }
    },
    // Branch
    {
      patterns: [
        /^create\s+(?:a\s+)?(?:new\s+)?branch\s+(?:called\s+|named\s+)?["']?(\S+)["']?/i,
        /^new\s+branch\s+["']?(\S+)["']?/i,
      ],
      handler: (match, fullText) => {
        const nameMatch = fullText.match(/branch\s+(?:called\s+|named\s+)?["']?(\S+)["']?/i);
        return { cmd: '/branch', args: nameMatch ? nameMatch[1] : '', confidence: 0.9 };
      }
    },
    // Switch branch
    {
      patterns: [
        /^switch\s+(?:to\s+)?(?:branch\s+)?["']?(\S+)["']?/i,
        /^checkout\s+(?:branch\s+)?["']?(\S+)["']?/i,
      ],
      handler: (match, fullText) => {
        const nameMatch = fullText.match(/(?:switch\s+(?:to\s+)?(?:branch\s+)?|checkout\s+(?:branch\s+)?)["']?(\S+)["']?/i);
        return { cmd: '/switch', args: nameMatch ? nameMatch[1] : '', confidence: 0.88 };
      }
    },
    // PR
    {
      patterns: [
        /^(?:open|create|make)\s+(?:a\s+)?(?:pull\s+request|pr)/i,
      ],
      handler: (match, fullText) => {
        const titleMatch = fullText.match(/(?:titled?\s+|called\s+|named\s+)["']?(.+?)["']?(?:\s+into\s+|$)/i);
        return { cmd: '/pr', args: titleMatch ? titleMatch[1] : 'Update', confidence: 0.85 };
      }
    },
    // Plan
    {
      patterns: [
        /^(?:plan|design|architect|outline)\s+(?:how\s+to\s+|a\s+(?:way\s+to\s+)?)?(.+)/i,
        /^create\s+a\s+plan\s+(?:for\s+|to\s+)(.+)/i,
      ],
      handler: (match, fullText) => {
        const goalMatch = fullText.match(/(?:plan|design|architect|outline)\s+(?:how\s+to\s+|a\s+(?:way\s+to\s+)?)?(.+)/i)
          || fullText.match(/create\s+a\s+plan\s+(?:for\s+|to\s+)(.+)/i);
        return { cmd: '/plan', args: goalMatch ? goalMatch[1] : fullText, confidence: 0.8 };
      }
    },
    // Tasks
    {
      patterns: [
        /^(?:show|list|view)\s+(?:all\s+)?tasks/i,
        /^what(?:'s|\s+are)\s+(?:the\s+)?(?:current\s+)?tasks/i,
      ],
      handler: () => ({ cmd: '/tasks', args: '', confidence: 0.9 })
    },
    // Execute
    {
      patterns: [
        /^(?:execute|run|do)\s+(?:the\s+)?(?:next\s+)?task/i,
        /^(?:proceed|continue|go)\s+(?:with\s+)?(?:the\s+)?(?:next\s+)?task/i,
      ],
      handler: () => ({ cmd: '/execute', args: '', confidence: 0.85 })
    },
    // Learn (project memory)
    {
      patterns: [
        /^(?:remember|learn|note)\s+(?:that\s+)?(.+)/i,
        /^add\s+(?:a\s+)?(?:rule|memory)\s*:?\s*(.+)/i,
      ],
      handler: (match, fullText) => {
        const ruleMatch = fullText.match(/(?:remember|learn|note)\s+(?:that\s+)?(.+)/i)
          || fullText.match(/add\s+(?:a\s+)?(?:rule|memory)\s*:?\s*(.+)/i);
        return { cmd: '/learn', args: ruleMatch ? ruleMatch[1] : fullText, confidence: 0.88 };
      }
    },
    // Remember (personal preference)
    {
      patterns: [
        /^(?:remember that|remember)\s+(.+)/i,
      ],
      handler: (match, fullText) => {
        const pref = fullText.replace(/^(?:remember that|remember)\s+/i, '').trim();
        return { cmd: '/remember', args: pref, confidence: 0.9 };
      }
    },
    // Clear
    {
      patterns: [
        /^(?:clear|wipe|reset)\s+(?:the\s+)?chat/i,
        /^(?:start\s+(?:a\s+)?)?(?:fresh|new)\s+(?:chat|conversation)/i,
      ],
      handler: () => ({ cmd: '/clear', args: '', confidence: 0.9 })
    },
  ];

  function detect(text) {
    const trimmed = text.trim();
    if (trimmed.startsWith('/')) return null;

    for (const intent of intentPatterns) {
      for (const pattern of intent.patterns) {
        const match = trimmed.match(pattern);
        if (match) {
          return intent.handler(match, trimmed);
        }
      }
    }
    return null;
  }

  function suggest(text) {
    const result = detect(text);
    if (result && result.confidence >= 0.8) return result;
    return null;
  }

  return { detect, suggest };
})();
