/**
 * WorkingMemory – Accumulates all information gathered during an agentic run.
 * Each read file gets a short summary (first 500 chars stored). Notes capture
 * observations. The toPromptContext() method builds a tiny context string for
 * the LLM, keeping each prompt well under the timeout threshold.
 */
export class WorkingMemory {
    constructor() {
        this.goal = '';
        this.files = {};          // { path: { summary, fullContent?, readAt } }
        this.keywords = new Set();
        this.notes = [];          // free‑form strings
        this.plan = null;         // final plan JSON (if planner wrote it)
    }

    /**
     * Store a file's content and an auto‑generated summary.
     * @param {string} path
     * @param {string} content - full file content
     * @param {string} [summary] - optional summary; if omitted, uses first 500 chars
     */
    addFile(path, content, summary = null) {
        this.files[path] = {
            summary: summary || content.slice(0, 500).replace(/\n/g, ' '),
            fullContent: content.length < 3000 ? content : null,  // keep full only if short
            readAt: Date.now()
        };
    }

    getFileSummary(path) {
        return this.files[path]?.summary || '';
    }

    addNote(note) { this.notes.push(note); }

    /**
     * Build a compact text block for the LLM prompt (original style).
     */
    toPromptContext() {
        let ctx = `Goal: ${this.goal}\n`;
        const fileEntries = Object.entries(this.files);
        if (fileEntries.length) {
            ctx += 'Files read:\n';
            for (const [path, data] of fileEntries) {
                ctx += `- ${path}: ${data.summary}\n`;
            }
        }
        if (this.notes.length) {
            ctx += 'Observations:\n' + this.notes.map(n => `- ${n}`).join('\n') + '\n';
        }
        return ctx;
    }

    /**
     * Returns a list of paths that have been read (for ContextBuilder).
     */
    getReadPaths() {
        return Object.keys(this.files);
    }
}
