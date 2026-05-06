// js/utils/agentSkills.js
// Parses agent skill blocks from LLM replies.
//
// Supported skill tags:
//   <skill name="update_editor" file="path/to/file">CONTENT</skill>
//   <skill name="read_file" path="..."/>
//
// Returns:
//   modifiedReply     — reply text with skill tags replaced by human-readable notes
//   actions:
//     updateEditorContent  — content of the FIRST update_editor block (legacy compat)
//     updateEditorFile     — file path of the FIRST update_editor block
//     updateEditorBlocks   — ALL update_editor blocks: [{ file, content }, ...]
//     readFiles            — array of paths requested via read_file

window.processAgentSkills = function processAgentSkills(aiReply) {
  if (typeof aiReply !== 'string') {
    return {
      modifiedReply: String(aiReply || ''),
      actions: {
        updateEditorContent: null,
        updateEditorFile:    null,
        updateEditorBlocks:  [],
        readFiles:           [],
      }
    };
  }

  let updated = aiReply;
  const updateEditorBlocks = [];
  const readFiles = [];

  // ── Extract all update_editor blocks ─────────────────────────
  // Matches: <skill name="update_editor" file="path">CONTENT</skill>
  // file attribute is required for the new interface.
  // Also handles legacy form without file attribute for backwards compat.
  const updateRegex = /<skill\s+name=["']update_editor["'](?:\s+file=["']([^"']+)["'])?\s*>([\s\S]*?)<\/skill>/gi;
  let match;

  while ((match = updateRegex.exec(aiReply)) !== null) {
    const filePath = match[1] || null;
    const content  = match[2].trim();

    updateEditorBlocks.push({ file: filePath, content });

    // Replace tag with inline note
    const note = filePath
      ? `\n\n*(🛠️ Proposed change to \`${filePath}\` — review the file card below)*\n\n`
      : `\n\n*(🛠️ Code applied to editor)*\n\n`;
    updated = updated.replace(match[0], note);
  }

  // ── Extract read_file requests ────────────────────────────────
  const readRegex = /<skill\s+name=["']read_file["']\s+path=["']([^"']+)["']\s*\/?>/gi;
  while ((match = readRegex.exec(aiReply)) !== null) {
    readFiles.push(match[1]);
    updated = updated.replace(
      match[0],
      `\n\n*(📂 Requesting file \`${match[1]}\` — click in the file tree to load it)*\n\n`
    );
  }

  // ── Derive legacy single-block fields ────────────────────────
  const first = updateEditorBlocks[0] || null;

  return {
    modifiedReply: updated,
    actions: {
      // Legacy fields — used by existing executor.js (still functional)
      updateEditorContent: first ? first.content : null,
      updateEditorFile:    first ? first.file    : null,
      // New field — used by useCommandHandler to push file cards
      updateEditorBlocks,
      readFiles,
    }
  };
};
