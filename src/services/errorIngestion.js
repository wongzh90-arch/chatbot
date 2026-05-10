/**
 * errorIngestion – Parses error stack traces and converts them into
 * structured file references that the planner can inject.
 */
export class ErrorIngestion {
    /**
     * Extract file paths and line numbers from a stack trace string.
     * @param {string} rawError - pasted error text
     * @returns {Array<{ file: string, line?: number }>}
     */
    static parseStackTrace(rawError) {
        const lines = rawError.split('\n');
        const refs = [];
        // Typical JS stack trace format:
        //   at functionName (file.js:line:col)
        //   at file.js:line:col
        const regex = /(?:at\s+(?:new\s+)?(?:\S+)\s+\()?([^()]+):(\d+)(?::\d+)?\)?$/;
        for (const line of lines) {
            const match = line.trim().match(regex);
            if (match) {
                refs.push({
                    file: match[1].trim(),
                    line: parseInt(match[2], 10)
                });
            }
        }
        return refs;
    }

    /**
     * Convert parsed references into a planner‑friendly context string.
     * @param {Array} refs - output from parseStackTrace
     * @returns {string}
     */
    static buildErrorContext(refs) {
        if (!refs.length) return '';
        const uniqueFiles = [...new Set(refs.map(r => r.file))];
        let ctx = 'The following files appear in the error stack trace (priority):\n';
        for (const file of uniqueFiles) {
            const lines = refs.filter(r => r.file === file).map(r => r.line);
            ctx += `- ${file}` + (lines.length ? ` (lines: ${lines.join(',')})` : '') + '\n';
        }
        return ctx;
    }

    /**
     * Combine parsing + context building in one step.
     */
    static getErrorContext(rawError) {
        const refs = ErrorIngestion.parseStackTrace(rawError);
        return ErrorIngestion.buildErrorContext(refs);
    }
}
