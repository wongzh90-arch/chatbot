/**
 * qualityGate – Runs lint/syntax checks before commit, retries up to 2 times
 * with LLM‑generated fixes.
 */
import { ExecutorAPI } from '../../services/executorApi.js';
import { LLMProvider } from '../../services/llmProvider.js';
import { processAgentSkills } from '../../utils/agentSkills.js';
import { SearchReplace } from '../../utils/searchReplace.js';

export async function qualityGateWithRetry(ctx, memory, fileMap, targetFiles, shaMap, fullContents) {
    for (let attempt = 0; attempt <= 2; attempt++) {
        const lintable = {};
        for (const [path, { content }] of Object.entries(fileMap)) {
            if (/\.(js|jsx|css|scss|less)$/i.test(path)) {
                lintable[path] = content;
            }
        }

        if (Object.keys(lintable).length === 0) return true;

        const [syntax, lint] = await Promise.all([
            ExecutorAPI.syntax(lintable),
            ExecutorAPI.lint(lintable)
        ]);

        // FIX: Ensure syntax errors are treated as errors (they lack a severity field)
        const syntaxErrors = (syntax.errors || []).map(e => ({ ...e, severity: 'error' }));
        const allErrors = [...syntaxErrors, ...(lint.errors || [])];
        const errors = allErrors.filter(e => e.severity === 'error');

        if (errors.length === 0) return true;

        if (attempt < 2) {
            ctx.onLog(`🔧 Lint/syntax errors (attempt ${attempt + 1}): ${errors[0].message}`);
            const fixPrompt = `Your last change produced errors:\n\n${errors.map(e => `${e.file}: line ${e.line} - ${e.message}`).join('\n')}\n\nFix them using a SEARCH/REPLACE block.`;
            const { content } = await LLMProvider.fastCompletion({
                provider: ctx.provider,
                messages: [],
                userContent: fixPrompt,
                timeoutMs: 15000
            });
            const { actions } = processAgentSkills(content);
            const srBlocks = actions.searchReplaceBlocks;
            const upBlocks = actions.updateEditorBlocks;

            if (srBlocks.length) {
                for (const b of srBlocks) {
                    const path = b.file || targetFiles[0];
                    const original = fullContents[path] || '';
                    const result = SearchReplace.apply(path, original, [b]);
                    if (!result.errors.length) {
                        fileMap[path] = {
                            content: result.newContent, // FIXED: Don't strip comments!
                            sha: shaMap[path] || null
                        };
                    }
                }
            } else if (upBlocks.length) {
                for (const b of upBlocks) {
                    const path = b.file || targetFiles[0];
                    fileMap[path] = {
                        content: b.content, // FIXED: Don't strip comments!
                        sha: shaMap[path] || null
                    };
                }
            }
        }
    }
    return false;
}
