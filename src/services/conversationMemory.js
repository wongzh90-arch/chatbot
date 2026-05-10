/**
 * conversationMemory – Cross‑run memory backbone.
 * Stores structured context per repo+branch in localStorage.
 *
 * Shape:
 *   { goal, phase, decisions: [], lastAction, openQuestions, failedAttempts, lastUpdated }
 */
export class ConversationMemory {
    /**
     * @param {string} repo   - e.g., "owner/repo"
     * @param {string} branch - e.g., "main"
     */
    constructor(repo, branch) {
        this.key = `cm_${repo}_${branch}`;
        this._ensure();
    }

    _ensure() {
        if (!this._load()) {
            this._save({
                goal: '',
                phase: 'idle',
                decisions: [],
                lastAction: '',
                openQuestions: [],
                failedAttempts: [],
                lastUpdated: null
            });
        }
    }

    _load() {
        try {
            const raw = localStorage.getItem(this.key);
            if (raw) return JSON.parse(raw);
        } catch (e) { /* ignore */ }
        return null;
    }

    _save(data) {
        data.lastUpdated = new Date().toISOString();
        localStorage.setItem(this.key, JSON.stringify(data));
    }

    /** Update goal and reset phase */
    startRun(goal) {
        const mem = this._load();
        mem.goal = goal;
        mem.phase = 'planning';
        mem.lastAction = 'run_started';
        this._save(mem);
    }

    /** Record a decision made */
    addDecision(decision) {
        const mem = this._load();
        mem.decisions.push(decision);
        if (mem.decisions.length > 20) mem.decisions = mem.decisions.slice(-20);
        this._save(mem);
    }

    /** Record a failed attempt */
    addFailedAttempt(description) {
        const mem = this._load();
        mem.failedAttempts.push(description);
        if (mem.failedAttempts.length > 10) mem.failedAttempts = mem.failedAttempts.slice(-10);
        this._save(mem);
    }

    setPhase(phase) {
        const mem = this._load();
        mem.phase = phase;
        this._save(mem);
    }

    setLastAction(action) {
        const mem = this._load();
        mem.lastAction = action;
        this._save(mem);
    }

    addOpenQuestion(question) {
        const mem = this._load();
        mem.openQuestions.push(question);
        this._save(mem);
    }

    clearOpenQuestions() {
        const mem = this._load();
        mem.openQuestions = [];
        this._save(mem);
    }

    /** Build a compact summary string for injection into system prompts */
    toSummaryString() {
        const mem = this._load();
        let s = '';
        if (mem.goal) s += `Current goal: ${mem.goal}\n`;
        if (mem.phase) s += `Phase: ${mem.phase}\n`;
        if (mem.lastAction) s += `Last action: ${mem.lastAction}\n`;
        if (mem.decisions.length) s += `Recent decisions:\n${mem.decisions.map(d => `- ${d}`).join('\n')}\n`;
        if (mem.failedAttempts.length) s += `Failed attempts:\n${mem.failedAttempts.map(d => `- ${d}`).join('\n')}\n`;
        if (mem.openQuestions.length) s += `Open questions:\n${mem.openQuestions.map(d => `- ${d}`).join('\n')}\n`;
        return s.trim();
    }
}
