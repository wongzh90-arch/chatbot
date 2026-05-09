/**
 * PreferencesService – Loads and saves preferences.json from/to the repo.
 * Used by agents to inject custom instructions into prompts.
 */
import { GitHubService } from './github.js';

const PREFERENCES_PATH = 'preferences.json';

const DEFAULTS = {
  clarification: {
    customPrompt: 'Ask about edge cases and security concerns.'
  },
  planning: {
    rules: ['Keep changes minimal and focused.'],
    decompositionThreshold: 4
  },
  execution: {
    codeStyle: 'Use ES6 modules, no semicolons, single quotes.',
    lintBeforeCommit: true
  },
  review: {
    strictness: 'high',
    checkEdgeCases: true
  }
};

export class PreferencesService {
  /**
   * Load preferences from repo, falling back to defaults.
   * @param {string} repo      - e.g., "owner/repo"
   * @param {string} branch    - e.g., "main"
   * @param {string} token     - GitHub PAT
   * @returns {object}         - preferences object
   */
  static async load(repo, branch, token) {
    if (!repo || !token) return { ...DEFAULTS };
    try {
      const { content } = await GitHubService.loadFileContent(
        repo, branch, PREFERENCES_PATH, token
      );
      const prefs = JSON.parse(content);
      // Merge with defaults so missing keys get filled
      return { ...DEFAULTS, ...prefs };
    } catch {
      return { ...DEFAULTS };
    }
  }

  /**
   * Save preferences to repo (creates/updates file).
   * @param {string} repo
   * @param {string} branch
   * @param {string} token
   * @param {object} preferences
   */
  static async save(repo, branch, token, preferences) {
    if (!repo || !token) throw new Error('Repo and token required');
    const fileMap = {
      [PREFERENCES_PATH]: { content: JSON.stringify(preferences, null, 2), sha: null }
    };
    // Try to get current SHA for update
    try {
      const existing = await GitHubService.loadFileContent(repo, branch, PREFERENCES_PATH, token);
      fileMap[PREFERENCES_PATH].sha = existing.sha;
    } catch { /* file doesn't exist yet */ }
    await GitHubService.commitMultipleFiles(
      repo, branch, fileMap,
      'chore: update bot preferences', token
    );
  }
}
