const express = require('express');
const { ESLint } = require('eslint');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '100kb' }));

// Shared secret – set RAILWAY_AUTH_TOKEN in Railway environment
const AUTH_TOKEN = process.env.RAILWAY_AUTH_TOKEN;
if (!AUTH_TOKEN) console.warn('⚠️ RAILWAY_AUTH_TOKEN not set');

function auth(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!AUTH_TOKEN || token === AUTH_TOKEN) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// Quick syntax check using Node's built‑in parser
app.post('/syntax', auth, (req, res) => {
  const { files } = req.body;
  if (!files || typeof files !== 'object') {
    return res.status(400).json({ error: 'Missing files object' });
  }
  const errors = [];
  for (const [path, content] of Object.entries(files)) {
    try {
      new Function(content); // syntax check only
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

// Lint check with ESLint (reasonable rules)
app.post('/lint', auth, async (req, res) => {
  const { files } = req.body;
  if (!files || typeof files !== 'object') {
    return res.status(400).json({ error: 'Missing files object' });
  }

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
});

app.get('/health', (req, res) => res.json({ ok: true, version: '1.0.0' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Executor API running on port ${PORT}`));
