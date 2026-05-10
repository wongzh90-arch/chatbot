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

            // Try whitespace‑flexible match (normalise leading whitespace)
            const flexResult = this._flexibleMatch(current, search);
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
     * then attempt to match.  Only succeeds if the normalised search
     * appears exactly once in the normalised text.
     */
    static _flexibleMatch(text, search) {
        const normText = this._normaliseLeadingWhitespace(text);
        const normSearch = this._normaliseLeadingWhitespace(search);

        const idx = normText.indexOf(normSearch);
        if (idx === -1 || normText.indexOf(normSearch, idx + 1) !== -1) {
            return null; // not found or multiple matches
        }

        // Map the match back to the original text boundaries
        // Build a mapping from normalised positions to original positions
        const map = this._buildPositionMap(text);
        const origStart = this._mapPosition(map, idx);
        const origEnd = this._mapPosition(map, idx + normSearch.length);

        // We don't know the exact whitespace, but we can replace the
        // exact substring using original text slice.
        const before = text.slice(0, origStart);
        const after = text.slice(origEnd);
        // Original substring that matched
        const originalSlice = text.slice(origStart, origEnd);

        // The new content simply replaces that slice with `replace`
        // BUT we must keep the user's intended whitespace from the replace block.
        // `replace` might have its own whitespace – we just insert it as‑is.
        // This is safe because the replace block already contains the desired indentation.
        return { replaced: before + block.replace + after };
    }

    static _normaliseLeadingWhitespace(str) {
        return str.replace(/^[ \t]+/gm, ' ');   // collapse leading space/tab to one space
    }

    static _buildPositionMap(text) {
        // Map: for each normalised character position, original position
        const map = [];
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (ch === ' ' || ch === '\t') {
                // Normalise: treat as one space, but only if it's leading on a line
                // For simplicity, map every original position to normalised index
                // We'll build normalised string character by character.
            }
        }
        // Simpler: build mapping array where map[normalisedIdx] = originalIdx
        const origToNorm = new Array(text.length);
        let normIdx = 0;
        const lines = text.split('\n');
        for (let line of lines) {
            const leading = line.match(/^[ \t]*/)[0];
            const rest = line.slice(leading.length);
            // Normalise leading whitespace to a single space
            const normLine = (leading.length > 0 ? ' ' : '') + rest;
            // Map characters
            let origCol = 0;
            for (let nCol = 0; nCol < normLine.length; nCol++) {
                // Advance original index
                while (origCol < line.length && line[origCol] !== normLine[nCol]) {
                    origCol++;
                }
                origToNorm[normIdx + nCol] = origCol + lineStartOrig;
            }
            normIdx += normLine.length;
        }
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
