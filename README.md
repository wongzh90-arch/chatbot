# chatbot
Self-improving

## Roadmap

### Phase 0 – Foundation
- ✅ **0A**: App refactor (React, JSX)
- ✅ **0B**: UI refactor + file tree (React, CSS)
- ✅ **0C**: Conversation memory backbone (context, localStorage)
- ✅ **0D**: Pause button wiring (event handling)

### Phase 1 – Autonomous Tooling
- ✅ **1A**: Static module manifest + `/manifest-build` (JSON, build script)
- ✅ **1B**: Smart context builder (parse imports, tree-shake)
- ✅ **1C**: In-memory task queue (replaces GitHub Issues, state management)
- ✅ **1D**: Multi-file atomic commits via Git Trees API (Git, REST)
- ✅ **1E**: Self-updating manifest via `updateEntries` (JS, manifest sync)

### Phase 2 – Quality Gates
- ✅ **2A**: Railway execution backend – lint/syntax check before commit (Node.js, ESLint)
  - Auth token injected server-side via Netlify edge proxy (never exposed to browser)
  - Quality gate blocks commits on ESLint errors; warns on warnings
- ✅ **2B**: Netlify preview smoke test – polls deploy preview after PR creation
  - Site name configurable in UI header; smoke test wired into `runGoal`
- ❌ **2C**: Error log ingestion – stack trace parsing (JS, regex/parser)

### Phase 3 – Self-Improvement
- ✅ **3A**: Goal verifier agent – LLM clarification questions before run + strict PASS/ISSUES reviewer
- ❌ **3B**: Regression detection (unit/E2E test comparison)
- ❌ **3C**: Token budget manager (cost-aware planning)

**Current build position: Phase 2B complete** – ready to begin Phase 2C / 3B.

## Architecture

```
Browser (Netlify)
  └── SimpleChat.js          UI + clarification state machine
  └── SelfImprover.js        Clarify → Plan → Execute → Review loop
  └── executorApi.js         Calls /.netlify/functions/executor-proxy/*

Netlify Edge Functions
  └── executor-proxy.js      Injects RAILWAY_AUTH_TOKEN server-side
  └── deepseek-proxy.js      DeepSeek API proxy
  └── openrouter-proxy.js    OpenRouter API proxy

Railway (Node.js)
  └── server.js              /lint, /syntax, /health endpoints (ESLint)
```

## Environment Variables

### Netlify
| Variable | Description |
|---|---|
| `RAILWAY_API_URL` | Your Railway service URL, e.g. `https://chatbot-production-72a9.up.railway.app` |
| `RAILWAY_AUTH_TOKEN` | Shared secret matching Railway's `RAILWAY_AUTH_TOKEN` |
| `DEEPSEEK_API_KEY` | DeepSeek API key |
| `OPENROUTER_API_KEY` | OpenRouter API key |

### Railway
| Variable | Description |
|---|---|
| `RAILWAY_AUTH_TOKEN` | Must match the Netlify env var above |
| `PORT` | Auto-set by Railway |
