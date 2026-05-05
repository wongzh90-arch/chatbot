window.sanityCheck = async function(filePath, newContent, provider, model) {
  const prompt = `You are a strict code reviewer. This file will be committed to a live web app.
File: ${filePath}
Content:
\`\`\`
${newContent.slice(0, 2000)}
\`\`\`
Check for:
1. Syntax errors (JS, HTML, CSS)
2. Dangerous patterns: removing password gate, adding eval(), infinite loops
3. Breaking changes: removing a critical function or component
Answer only "PASS" or "FAIL: <reason>".`;

  const result = await window.LLMProvider.chatCompletion({
    provider, model,
    messages: [],
    systemPrompt: "You are a code safety checker.",
    userContent: prompt,
    thinkingMode: false,
  });
  return result.content.trim();
};
