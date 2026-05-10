/**
 * promptBuilder – Builds the LLM prompt for the agentic executor.
 * Uses ContextBuilder for smart file selection and injects conversation memory.
 */
import { ContextBuilder } from '../../utils/contextBuilder.js';

export function buildExecutionPrompt(memory, fullContents, manifest, memSummary = '') {
    const targetPaths = Object.keys(fullContents);
    const targetContents = targetPaths.map(p => ({ path: p, content: fullContents[p] }));

    let contextString = '';
    if (manifest && ContextBuilder.buildContext) {
        const relatedFiles = ContextBuilder.identifyRequiredFiles({
            targetFiles: targetPaths,
            manifest,
            maxFiles: 8
        }).filter(p => !targetPaths.includes(p));

        const relatedContents = [];
        for (const path of relatedFiles) {
            if (memory.files[path]) {
                relatedContents.push({ path, content: memory.files[path].summary || '' });
            }
        }
        const ctxResult = ContextBuilder.buildContext({
            targetContents,
            relatedContents,
            manifest,
            tokenBudget: 15000
        });
        contextString = ctxResult.contextString;
    } else {
        contextString = targetContents.map(f =>
            `--- FULL FILE: ${f.path} ---\n${f.content}\n`
        ).join('\n');
    }

    return `${memSummary ? `Context from previous runs:\n${memSummary}\n\n` : ''}You are implementing a code change.
Goal: ${memory.goal}

${contextString}

Observations:
${memory.notes.map(n => `- ${n}`).join('\n')}

To make changes, use Aider‑style SEARCH/REPLACE blocks exactly as shown below:

path/to/file.ext
<<<<<<< SEARCH
exact lines to find
=======
replacement lines
>>>>>>> REPLACE

Rules:
- The SEARCH section must EXACTLY match existing lines including whitespace.
- Include enough context lines (3‑5) so the match is unique.
- You may include multiple SEARCH/REPLACE blocks for different files.
- Do NOT output the entire file – only the SEARCH/REPLACE blocks.
- Prefer small, minimal edits.

If you absolutely cannot express the change as SEARCH/REPLACE, you may use the legacy whole‑file block:
<skill name="update_editor" file="path">... complete file ...</skill>

You may also REQUEST more files: "READ: path/to/file".
Or search the web: "SEARCH: your query".
Or fetch a URL: "FETCH: https://...".
If done, say "DONE".`;
}
