export function processAgentSkills(aiReply) {
    const updateEditorBlocks = [];
    const readFiles = [];
    let modified = aiReply;

    const updateRegex = /<skill\s+name=["']update_editor["'](?:\s+file=["']([^"']+)["'])?\s*>([\s\S]*?)<\/skill>/gi;
    let match;
    while ((match = updateRegex.exec(aiReply)) !== null) {
        updateEditorBlocks.push({ file: match[1] || null, content: match[2].trim() });
        const note = match[1] ? `\n\n*(Proposed change to \`${match[1]}\`)*\n\n` : `\n\n*(Code block removed)*\n\n`;
        modified = modified.replace(match[0], note);
    }

    const readRegex = /<skill\s+name=["']read_file["']\s+path=["']([^"']+)["']\s*\/?>/gi;
    while ((match = readRegex.exec(aiReply)) !== null) {
        readFiles.push(match[1]);
        modified = modified.replace(match[0], `\n\n*(Requested file \`${match[1]}\`)*\n\n`);
    }

    return { modifiedReply: modified, actions: { updateEditorBlocks, readFiles } };
}
