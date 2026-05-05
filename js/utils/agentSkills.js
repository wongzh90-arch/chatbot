window.processAgentSkills = function(aiReply) {
    if (typeof aiReply !== 'string') {
        return { modifiedReply: String(aiReply || ''), actions: { updateEditorContent: null, readFiles: [] } };
    }

    let updated = aiReply;
    let updateEditorContent = null;
    const readFiles = [];

    const updateMatch = aiReply.match(/<skill name="update_editor">([\s\S]*?)<\/skill>/i);
    if (updateMatch) {
        updateEditorContent = updateMatch[1].trim();
        updated = updated.replace(/<skill name="update_editor">[\s\S]*?<\/skill>/gi, '\n\n*(🛠️ Code applied to editor)*\n\n');
    }

    const readRegex = /<skill name="read_file" path="([^"]+)"\s*\/?>/g;
    let m;
    while ((m = readRegex.exec(aiReply)) !== null) {
        readFiles.push(m[1]);
        updated = updated.replace(m[0], `\n\n*(🛠️ Needs file \`${m[1]}\` – click in workspace to load)*\n\n`);
    }

    return { modifiedReply: updated, actions: { updateEditorContent, readFiles } };
};
