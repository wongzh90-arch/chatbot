const express = require('express');
const { ESLint } = require('eslint');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '100kb' }));

const AUTH_TOKEN = process.env.RAILWAY_AUTH_TOKEN;
if (!AUTH_TOKEN) console.warn('⚠️ RAILWAY_AUTH_TOKEN not set');

function auth(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!AUTH_TOKEN) {
    return res.status(500).json({ error: 'Server misconfigured: no AUTH_TOKEN' });
  }
  if (token === AUTH_TOKEN) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// Apply to all endpoints
app.use(auth);

app.post('/syntax', (req, res) => {
  const { files } = req.body;
  if (!files || typeof files !== 'object') {
    return res.status(400).json({ error: 'Missing files object' });
  }
  const errors = [];
  for (const [path, content] of Object.entries(files)) {
    try {
      new Function(content);
    } catch (err) {
      errors.push({
        file: path,
        line: err.lineNumber || 0,
        column: err.columnNumber || 0,
        message: err.message
      });
    }
  }
  res.json({ passed: errors.length === 0, errors });
});

app.post('/lint', async (req, res) => {
  const { files } = req.body;
  if (!files || typeof files !== 'object') {
    return res.status(400).json({ error: 'Missing files object' });
  }

  try {
    const eslint = new ESLint({
      useEslintrc: false,
      overrideConfig: {
        parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
        env: { browser: true, node: true, es2022: true },
        rules: {
          'no-undef': 'error',
          'no-unused-vars': 'warn',
          'no-implied-eval': 'error'
        }
      }
    });

    const errors = [];
    for (const [path, content] of Object.entries(files)) {
      const results = await eslint.lintText(content, { filePath: path });
      for (const result of results) {
        for (const msg of result.messages) {
          errors.push({
            file: result.filePath,
            line: msg.line,
            column: msg.column,
            message: msg.message,
            severity: msg.severity === 2 ? 'error' : 'warning'
          });
        }
      }
    }
    const hasError = errors.some(e => e.severity === 'error');
    res.json({ passed: !hasError, errors });
  } catch (err) {
    console.error('Lint error:', err);
    res.status(500).json({ error: 'Linting failed' });
  }
});

// ---------- Clarification state machine for planning ----------
// In‑memory state: stores the most recent /plan request and its state.
let planState = {
  status: 'initial',         // 'initial' | 'awaiting_clarification' | 'planning'
  originalRequest: null      // the body of the /plan request that started the flow
};

app.post('/plan', (req, res) => {
  const { files, clarification } = req.body;

  // Validate that 'files' is provided (as a simple example requirement)
  if (!files || typeof files !== 'object') {
    return res.status(400).json({ error: 'Missing files object' });
  }

  // If state is 'initial' and no clarification provided → ask for clarification
  if (planState.status === 'initial' && !clarification) {
    planState.status = 'awaiting_clarification';
    planState.originalRequest = req.body;   // store the entire body
    return res.json({
      status: 'awaiting_clarification',
      question: 'Please provide clarification for your plan request. Submit the same request with a "clarification" field.',
      hint: 'Describe what you want the plan to accomplish.'
    });
  }

  // If state is 'awaiting_clarification' and clarification is provided → proceed
  if (planState.status === 'awaiting_clarification' && clarification) {
    // Perform planning logic (here we just echo back the clarification and files)
    const planResult = {
      status: 'planning_complete',
      clarification: clarification,
      files: planState.originalRequest.files,
      summary: `Plan generated based on clarification: "${clarification}"`
    };

    // Reset state for next request
    planState = { status: 'initial', originalRequest: null };

    return res.json(planResult);
  }

  // If state is 'initial' but clarification is provided (unexpected) → treat as direct plan
  if (planState.status === 'initial' && clarification) {
    // Optionally, allow direct planning with clarification
    const planResult = {
      status: 'planning_complete',
      clarification: clarification,
      files: files,
      summary: `Plan generated directly from provided clarification: "${clarification}"`
    };
    return res.json(planResult);
  }

  // If state is 'awaiting_clarification' but no clarification in body → reject
  if (planState.status === 'awaiting_clarification' && !clarification) {
    return res.status(400).json({
      error: 'You are in a clarification state. Please provide the "clarification" field to proceed.',
      question: 'What specific requirements or constraints should the plan include?'
    });
  }

  // Fallback
  res.status(400).json({ error: 'Invalid request for /plan' });
});
// ---------- End of clarification state machine ----------

app.get('/health', (req, res) => res.json({ ok: true, version: '1.0.0' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Executor API running on port ${PORT}`));