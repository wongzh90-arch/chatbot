/**
 * agentSkills – Parses AI replies to extract structured actions.
 * Now supports both legacy <skill name="update_editor"> blocks and
 * the Aider‑style SEARCH/REPLACE format for safe, minimal edits.
 */
export function processAgentSkills(aiReply) {
    const updateEditorBlocks = [];
    const searchReplaceBlocks = [];
    const readFiles = [];
    let modified = aiReply;

    // ── Legacy update_editor blocks ──
    const updateRegex = /<skill\s+name=["']update_editor["'](?:\s+file=["']([^"']+)["'])?\s*>([\s\S]*?)<\/skill>/gi;
    let match;
    while ((match = updateRegex.exec(aiReply)) !== null) {
        updateEditorBlocks.push({ file: match[1] || null, content: match[2].trim() });
        const note = match[1]
            ? `\n\n*(Proposed change to \`${match[1]}\`)*\n\n`
            : `\n\n*(Code block removed)*\n\n`;
        modified = modified.replace(match[0], note);
    }

    // ── Aider‑style SEARCH/REPLACE blocks (git conflict format) ──
    const srRegex = /(?:^|\n)(\S+)\s*\n<<<<<<< SEARCH\s*\n([\s\S]*?)\n=======\s*\n([\s\S]*?)\n>>>>>>> REPLACE/g;
    while ((match = srRegex.exec(aiReply)) !== null) {
        const filePath = match[1].trim();
        const search = match[2];
        const replace = match[3];
        searchReplaceBlocks.push({ file: filePath, search, replace });
        const note = `\n\n*(Search/replace in \`${filePath}\`)*\n\n`;
        modified = modified.replace(match[0], note);
    }

    // ── Read file requests (unchanged) ──
    const readRegex = /<skill\s+name=["']read_file["']\s+path=["']([^"']+)["']\s*\/?>/gi;
    while ((match = readRegex.exec(aiReply)) !== null) {
        readFiles.push(match[1]);
        modified = modified.replace(match[0], `\n\n*(Requested file \`${match[1]}\`)*\n\n`);
    }

    return {
        modifiedReply: modified,
        actions: {
            updateEditorBlocks,
            searchReplaceBlocks,      // new
            readFiles
        }
    };
}
