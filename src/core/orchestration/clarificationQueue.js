/**
 * clarificationQueue – Replaces window.prompt() with a proper state‑machine.
 *
 * Flow:
 *   1. Orchestrator calls requestClarification(questions)
 *   2. This saves questions to ConversationMemory and returns a Promise
 *   3. The promise resolves when the user sends a message (answers)
 *   4. The UI shows the questions in chat as an assistant message
 *   5. When the user replies, the command handler checks if clarifications
 *      are pending and routes the text as answers instead of a new command
 */
export class ClarificationQueue {
    constructor(conversationMemory, onShowQuestions) {
        this.memory = conversationMemory;
        this.onShowQuestions = onShowQuestions; // callback to add questions to chat
        this._pendingResolve = null;
        this._timeout = null;
    }

    /**
     * Ask clarification questions. Returns a Promise that resolves
     * with the user's answers (string) or empty string if timed out.
     */
    async request(questions, timeoutMs = 300000) { // 5 min default
        // Save to memory so we persist across page reloads
        this.memory?._save({
            ...this.memory._load(),
            clarificationQuestions: questions,
            clarificationTimestamp: Date.now()
        });

        // Show questions in chat
        if (this.onShowQuestions) {
            this.onShowQuestions(questions);
        }

        // Return a promise that the UI resolves when user replies
        return new Promise((resolve) => {
            this._pendingResolve = resolve;

            // Safety timeout (longer than before)
            this._timeout = setTimeout(() => {
                this._pendingResolve = null;
                this.clear();
                resolve('');
            }, timeoutMs);
        });
    }

    /** Call this when the user sends a message while clarification is pending */
    resolve(answers) {
        if (this._pendingResolve) {
            clearTimeout(this._timeout);
            const resolve = this._pendingResolve;
            this._pendingResolve = null;
            this.clear();
            resolve(answers || '');
            return true; // signal that this was handled
        }
        return false;
    }

    /** Check if we're currently waiting for answers */
    isPending() {
        return this._pendingResolve !== null;
    }

    /** Clear saved questions from memory */
    clear() {
        const mem = this.memory?._load() || {};
        delete mem.clarificationQuestions;
        delete mem.clarificationTimestamp;
        this.memory?._save(mem);
    }

    /** Restore pending questions from memory (after page reload) */
    restoreFromMemory() {
        const mem = this.memory?._load() || {};
        if (mem.clarificationQuestions && mem.clarificationTimestamp) {
            // Only restore if less than 10 minutes old
            if (Date.now() - mem.clarificationTimestamp < 600000) {
                return this.request(mem.clarificationQuestions);
            } else {
                this.clear();
            }
        }
        return null;
    }
}
