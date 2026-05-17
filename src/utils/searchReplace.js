/**
 * searchReplace – Applies SEARCH/REPLACE blocks to file content.
 *
 * Uses a matching cascade:
 *   1. Exact match (must appear exactly once)
 *   2. Whitespace‑flexible match (normalises leading whitespace)
 *   3. Returns detailed errors for the LLM to fix
 *
 * Format (Aider‑style / git conflict):
 *   path/to/file
 *   <<<<<<< SEARCH
 *   exact lines to find
 *   =======
 *   replacement lines
 *   >>>>>>> REPLACE
 */
export class SearchReplace {
    /**
     * Apply a set of SEARCH/REPLACE blocks to the original content of a file.
     * Blocks are applied sequentially – each subsequent block acts on the
     * result of the previous one.
     *
     * @param {string} filePath        - Used only for error messages
     * @param {string} originalContent - The original file content
     * @param {Array<{search: string, replace: string}>} blocks
     * @returns {{ newContent: string, errors: Array<{file: string, message: string}> }}
     */
    static apply(filePath, originalContent, blocks) {
        let current = originalContent;
        const errors = [];

        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            const { search, replace } = block;

            if (!search && search !== '') {
                errors.push({ file: filePath, message: `Block ${i + 1}: missing SEARCH string` });
                continue;
            }

            // Count exact occurrences
            const exactCount = this._countOccurrences(current, search);
            if (exactCount === 1) {
                current = current.replace(search, replace);
                continue;
            }

            // Try whitespace‑flexible match
            const flexResult = this._flexibleMatch(current, search, replace);
            if (flexResult) {
                current = flexResult.replaced;
                continue;
            }

            // Failure – provide detailed diagnostics
            const context = this._findBestContext(current, search, 3);
            errors.push({
                file: filePath,
                message:
                    `Block ${i + 1}: SEARCH not found (exact: ${exactCount}, whitespace‑flexible: 0). ` +
                    `Nearby lines in file:\n${context || '(none)'}`
            });
        }

        return { newContent: current, errors };
    }

    // ── private helpers ──

    static _countOccurrences(text, search) {
        if (!search) return 0;
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'g');
        const matches = text.match(regex);
        return matches ? matches.length : 0;
    }

    /**
     * Normalise leading whitespace of each line to a single space,
     * then attempt to match. Only succeeds if the normalised search
     * appears exactly once in the normalised text.
     */
    static _flexibleMatch(text, search, replace) {
        const normalise = (s) => s.split('\n').map(l => l.replace(/^\s+/, ' ')).join('\n');
        const normText = normalise(text);
        const normSearch = normalise(search);

        const idx = normText.indexOf(normSearch);
        if (idx === -1) return null;
        if (normText.indexOf(normSearch, idx + 1) !== -1) return null;

        let origIdx = 0;
        let normIdx = 0;
        while (normIdx < idx && origIdx < text.length) {
            if (text[origIdx] === '\n') {
                normIdx++;
            } else if (text[origIdx] !== ' ' && text[origIdx] !== '\t') {
                normIdx++;
            }
            origIdx++;
        }
        let endIdx = origIdx;
        let searchNormIdx = 0;
        while (searchNormIdx < normSearch.length && endIdx < text.length) {
            if (text[endIdx] === '\n') {
                searchNormIdx++;
            } else if (text[endIdx] !== ' ' && text[endIdx] !== '\t') {
                searchNormIdx++;
            }
            endIdx++;
        }

        const before = text.slice(0, origIdx);
        const after = text.slice(endIdx);
        return { replaced: before + replace + after };
    }

    /**
     * Find the lines in `text` that are most similar to `search`.
     * Returns a truncated string (first 3 best lines) for error messages.
     */
    static _findBestContext(text, search, maxLines = 3) {
        const textLines = text.split('\n');
        const searchLines = search.split('\n');
        let bestScore = Infinity;
        let bestStart = 0;

        // Simple sliding window
        for (let i = 0; i <= textLines.length - searchLines.length; i++) {
            let score = 0;
            for (let j = 0; j < searchLines.length; j++) {
                const tLine = textLines[i + j] || '';
                const sLine = searchLines[j] || '';
                score += this._levenshtein(tLine, sLine);
            }
            if (score < bestScore) {
                bestScore = score;
                bestStart = i;
            }
        }
        return textLines.slice(bestStart, bestStart + maxLines).join('\n');
    }

    static _levenshtein(a, b) {
        const m = a.length, n = b.length;
        const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
        for (let j = 0; j <= n; j++) dp[0][j] = j;
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                dp[i][j] = a[i - 1] === b[j - 1]
                    ? dp[i - 1][j - 1]
                    : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
            }
        }
        return dp[m][n];
    }
}
