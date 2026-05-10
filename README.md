# chatbot
# Self‑Recursive Bot

A self‑improving agentic coding tool — a web app that can read and write its own source code via the GitHub API, plan tasks, execute them with an LLM, review the results, and open PRs. The goal is to get as close to **Claude Code** as possible without the cost.

The bot runs as a single‑page React application on Netlify, using serverless Edge Functions to proxy all LLM and API calls. There is no build step — React, Zustand, and other libraries are loaded from CDN.

---

## Current State (Phase 1E + UX upgrades)

- ✅ **Planning** – Hierarchical, coordinated, and agentic planners that understand the full codebase using a keyword index and a dependency manifest.
- ✅ **Execution** – Read‑before‑write loop with Aider‑style `SEARCH/REPLACE` blocks (no whole‑file hallucinations) and pre‑commit quality gate (syntax + lint via Railway).
- ✅ **Review** – Before/after comparison with line‑level issue reporting.
- ✅ **Goal verification** – Compares the final diff against the original goal.
- ✅ **Regression detection** – Checks that changed files don’t break their dependents (via manifest `importedBy`).
- ✅ **Self‑updating manifest** – `manifest.json` is re‑parsed and committed atomically with every code change.
- ✅ **Smoke test** – Polls the Netlify deploy preview after opening a PR.
- ✅ **Inline run card** – A live status panel shows progress, logs, tasks, and file changes without flooding the chat.
- ✅ **Conversation memory** – Cross‑run context stored per repo/branch in `localStorage`.
- ✅ **Error ingestion** – Pasted stack traces are parsed and injected into the planner.
- ✅ **Token budget bar** – Visual indicator of remaining context window.
- ✅ **Clarification queue** – The bot asks clarifying questions and waits for a response (replaces `window.prompt`).
- ✅ **Web search & fetch** – The executor can invoke `SEARCH:` and `FETCH:` actions mid‑run.

---

## Tech Stack

| Layer          | Technology |
| -------------- | ---------- |
| Frontend       | React 18 (CDN), Zustand (state), vanilla CSS |
| Hosting        | Netlify (static + Edge Functions) |
| LLM            | DeepSeek (primary), OpenRouter (fallback) |
| GitHub API     | Git Trees API (multi‑file atomic commits) |
| Executor (lint)| Railway Express server (`executor-api/`) |
| Auth           | Password gate (SHA-256 hash in `index.html`) |

---

## Getting Started

1. **Clone & deploy to Netlify**  
   Connect the repo, set the build command to `node netlify/inject-preview-bypass.js` (no build step required).

2. **Set environment variables in Netlify**  

   | Variable             | Purpose |
   | -------------------- | ------- |
   | `GITHUB_PAT`         | GitHub API authentication |
   | `DEEPSEEK_API_KEY`   | DeepSeek LLM |
   | `OPENROUTER_API_KEY` | OpenRouter fallback |
   | `RAILWAY_API_URL`    | Railway executor base URL |
   | `RAILWAY_AUTH_TOKEN` | Shared secret for Railway executor |
   | `FIRECRAWL_API_KEY`  | Web search (Firecrawl) |
   | `LANGSEARCH_API_KEY` | Web search (LangSearch) |

3. **Deploy the Railway executor** (optional, for live linting)  
   The Express server in `executor-api/` should be deployed to Railway and the environment variables above set.

4. **Open the app**  
   The login gate (PBKDF2 hash in `index.html`) will prompt for a password. Once past the gate, fill in the repository fields (`owner/repo`, branch, GitHub PAT) and start a self‑improve run.

---

## Usage

All interaction happens through slash commands in the chat input:

| Command                     | Description |
| --------------------------- | ----------- |
| `/self-improve "goal"`      | Start a self‑improvement loop. Append a stack trace after the goal to prioritise those files. |
| `/index`                    | Rebuild the keyword index (`keywords.json`). Run this after major code changes. |
| `/pause`                    | Gracefully pause a running self‑improve (completes current task). |
| `/context`                  | Show the current conversation memory (decisions, failed attempts, etc.). |
| `/clear`                    | Clear the chat. |
| `/help`                     | List available commands. |

**Error log paste:** Expand the “Paste error log” area below the input to provide stack traces that will be injected into the next run.

---

## How It Works

1. **User provides a goal** (and optionally a pasted error log).
2. **Clarification** – The LLM generates clarifying questions; the bot waits for a response.
3. **Discovery** – Keyword index + explicit goal mentions are used to find up to 20 relevant files.
4. **Planning** – One of three planners (agentic, coordinated, hierarchical) creates a task list, possibly decomposing complex goals into sub‑goals.
5. **Execution** – Each task is executed in a read‑before‑write loop. The LLM proposes edits using `SEARCH/REPLACE` blocks (or legacy whole‑file blocks). Before commit, syntax and lint checks are run on Railway; failed checks are fed back to the LLM for correction.
6. **Review** – After each commit, the original and committed files are compared side‑by‑side, and the LLM gives a `PASS` or `ISSUES` verdict (with line numbers). Tasks that fail are retried up to 3 cycles.
7. **Post‑run** – The manifest is updated, regressions are detected, and a goal verifier checks that the cumulative diff achieves the original intent. If everything passes, a PR is opened and the Netlify deploy preview is smoke‑tested.

The entire loop is visible in the **RunCard** — a collapsible status panel that updates in real time.

---

## Project Structure
/
├── index.html ← entry point, login gate, script load order
├── netlify.toml ← Netlify config (edge functions, headers)
├── preferences.json ← user‑editable agent preferences
├── keywords.json ← keyword index for file discovery
├── manifest.json ← dependency graph (auto‑updated)
│
├── executor-api/ ← Railway executor (lint + syntax)
│ ├── package.json
│ └── server.js
│
├── netlify/
│ ├── inject-preview-bypass.js ← disables login gate on deploy previews
│ └── edge-functions/
│ ├── deepseek-proxy.js
│ ├── openrouter-proxy.js
│ ├── firecrawl-proxy.js
│ ├── langsearch-proxy.js
│ ├── executor-proxy.js
│ └── github-token-proxy.js
│
└── src/
├── main.js ← React app entry, service wiring
├── components/
│ ├── SimpleChat.js ← top‑level chat UI, command routing
│ └── SimpleChat/
│ ├── Header.js
│ ├── ChatPane.js
│ ├── RunCard.js ← live run status panel
│ ├── MessageList.js
│ ├── TaskList.js
│ ├── InputBar.js
│ └── Toaster.js
├── core/
│ ├── SelfImprover.js ← thin orchestrator
│ ├── execution/ ← agentic executor & helpers
│ │ ├── agenticExecutor.js
│ │ ├── promptBuilder.js
│ │ ├── searchReplaceHandler.js
│ │ ├── qualityGate.js
│ │ └── commitVerifier.js
│ ├── planning/ ← planners
│ │ ├── plannerFactory.js
│ │ ├── agenticPlanner.js
│ │ ├── coordinatedPlanner.js
│ │ └── hierarchicalPlanner.js
│ ├── orchestration/ ← run lifecycle
│ │ ├── runSetup.js
│ │ ├── cycleExecutor.js
│ │ ├── postRunActions.js
│ │ ├── pauseController.js
│ │ └── clarificationQueue.js
│ ├── WorkingMemory.js
│ ├── persistentMemory.js
│ ├── taskQueue.js
│ ├── reviewer.js
│ ├── prCreator.js
│ ├── fileDiscovery.js
│ ├── chunkedIndexer.js
│ ├── keywordIndexer.js
│ ├── manifestManager.js
│ └── parallelExec.js
├── services/
│ ├── github.js ← Git Trees API, PR creation
│ ├── llmProvider.js ← unified LLM interface
│ ├── executorApi.js ← Railway executor client
│ ├── smokeTest.js ← deploy preview polling
│ ├── conversationMemory.js ← cross‑run context
│ ├── errorIngestion.js ← stack trace parser
│ ├── PreferencesService.js ← loads/saves preferences.json
│ └── ... (other services)
├── stores/
│ ├── providerStore.js ← model/provider state (Zustand)
│ └── workspaceStore.js ← repo/branch/token state (Zustand)
└── utils/
├── agentSkills.js ← parses SEARCH/REPLACE and legacy blocks
├── searchReplace.js ← applies SEARCH/REPLACE with fuzzy matching
├── contextBuilder.js ← manifest‑aware context assembly
├── manifestBuilder.js ← static dependency parser
├── stripComments.js
└── sandboxTest.js


---

## Roadmap (remaining)

- **Error ingestion UI** – Proper async wait for user to paste error log (replacing the current 30s timeout).
- **Fully async clarification** – User sends answers as a chat message (not `window.prompt`).
- **Auto‑merge** – Option to auto‑merge PRs when all gates pass.
- **Expanded smoke test** – Test actual API endpoints in the deploy preview.
- **Regression healing** – Automatically fix detected regressions.
- **Token budget auto‑compressor** – Summarise old memory when context window is tight.
- **Skills marketplace** – Import skills from GitHub repositories.

---

## Contributing

This bot is designed to improve itself. To contribute manually:

1. Fork the repo.
2. Make changes on a branch.
3. Run `/index` after any structural changes.
4. Test with `/self-improve "simple goal"` before opening a PR.

Or let the bot do it: just run `/self-improve "describe your change"` and review the resulting PR.

---

## License

MIT

