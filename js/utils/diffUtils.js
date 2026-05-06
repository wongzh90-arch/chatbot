// js/utils/diffUtils.js
// Simple line-level diff. No external dependencies.
// Returns array of { type: 'add' | 'remove' | 'context', line, lineNum }

window.DiffUtils = (() => {

  // Longest Common Subsequence on lines
  function lcs(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i-1] === b[j-1]
          ? dp[i-1][j-1] + 1
          : Math.max(dp[i-1][j], dp[i][j-1]);
      }
    }
    // Backtrack
    const result = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && a[i-1] === b[j-1]) {
        result.unshift({ type: 'context', line: a[i-1] });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
        result.unshift({ type: 'add', line: b[j-1] });
        j--;
      } else {
        result.unshift({ type: 'remove', line: a[i-1] });
        i--;
      }
    }
    return result;
  }

  /**
   * Compute a unified-style diff between two file contents.
   * Returns only changed lines plus up to `context` lines of surrounding context.
   * @param {string} oldContent
   * @param {string} newContent
   * @param {number} contextLines — how many unchanged lines to show around each change
   * @returns {{ type: 'add'|'remove'|'context'|'separator', line: string, lineNum?: number }[]}
   */
  function computeDiff(oldContent, newContent, contextLines = 3) {
    if (oldContent === newContent) return [];

    const oldLines = (oldContent || '').split('\n');
    const newLines = (newContent || '').split('\n');

    // For large files, cap to avoid freezing the browser
    const MAX_LINES = 300;
    const truncatedOld = oldLines.slice(0, MAX_LINES);
    const truncatedNew = newLines.slice(0, MAX_LINES);

    const raw = lcs(truncatedOld, truncatedNew);

    // Find indices of changed lines
    const changedIdx = new Set();
    raw.forEach((item, i) => {
      if (item.type !== 'context') changedIdx.add(i);
    });

    // Build context windows
    const include = new Set();
    changedIdx.forEach(idx => {
      for (let k = Math.max(0, idx - contextLines); k <= Math.min(raw.length - 1, idx + contextLines); k++) {
        include.add(k);
      }
    });

    if (include.size === 0) return [];

    // Build output with separators between non-contiguous hunks
    const output = [];
    let lastIncluded = -1;
    const sorted = [...include].sort((a, b) => a - b);

    // Track line numbers
    let oldLineNum = 1;
    let newLineNum = 1;

    // Pre-pass to assign line numbers
    const withNums = raw.map(item => {
      const entry = { ...item, oldLineNum, newLineNum };
      if (item.type === 'remove') { oldLineNum++; }
      else if (item.type === 'add') { newLineNum++; }
      else { oldLineNum++; newLineNum++; }
      return entry;
    });

    sorted.forEach(idx => {
      if (lastIncluded !== -1 && idx > lastIncluded + 1) {
        output.push({ type: 'separator', line: '…' });
      }
      output.push(withNums[idx]);
      lastIncluded = idx;
    });

    // Truncation notice
    if (oldLines.length > MAX_LINES || newLines.length > MAX_LINES) {
      output.push({ type: 'separator', line: `… (file truncated at ${MAX_LINES} lines for display)` });
    }

    return output;
  }

  /**
   * Quick summary: how many lines added / removed
   */
  function diffSummary(diffLines) {
    const added   = diffLines.filter(l => l.type === 'add').length;
    const removed = diffLines.filter(l => l.type === 'remove').length;
    return { added, removed };
  }

  return { computeDiff, diffSummary };
})();
