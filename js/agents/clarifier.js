window.Clarifier = (() => {
  /**
   * Generate clarifying questions based on goal and repo context.
   * Returns an array of questions (strings).
   */
  async function askQuestions(goal, repo, branch, fileTree, manifest, projectMemory) {
    // Build a brief repo description (list of key files)
    const keyFiles = (fileTree || [])
      .filter(f => f.path.startsWith('js/') && (f.path.endsWith('.js') || f.path.endsWith('.jsx')))
      .slice(0, 5)
      .map(f => f.path)
      .join(', ');

    const prompt = `You are a software project planner. The user wants to: "${goal}".

Repository: ${repo} (branch: ${branch})
Key files: ${keyFiles || 'unknown'}
${projectMemory?.length ? `Project memory: ${projectMemory.slice(0,3).join('; ')}` : ''}

Generate 2-3 short, specific clarifying questions that would help you create a better task plan. Focus on:
- What exactly needs to change (which files, components, APIs)
- Any constraints (performance, compatibility, style)
- Missing context not obvious from the repo

Return ONLY a JSON array of strings, e.g. ["Question 1?", "Question 2?"]`;

    const reply = await window.LLMProvider.chatCompletion({
      provider: window.useProviderState?.().provider || 'deepseek',
      model: window.useProviderState?.().selectedModel || 'deepseek-v4-flash',
      messages: [],
      systemPrompt: 'You are a technical planner. Output only valid JSON array of strings.',
      userContent: prompt,
      thinkingMode: false
    });

    try {
      const json = JSON.parse(reply.content);
      if (Array.isArray(json)) return json.slice(0, 3);
    } catch {}
    return []; // no questions needed
  }

  /**
   * Given user's answer text and the original goal, extract structured answers.
   * Returns an object with answers indexed by question index (or just the text).
   */
  async function extractAnswers(goal, questions, userAnswer) {
    const prompt = `Original goal: "${goal}"
Questions asked:
${questions.map((q, i) => `${i+1}. ${q}`).join('\n')}

User's answer: "${userAnswer}"

Extract the answers as a JSON object mapping question index (1-based) to the relevant part of the answer.
Example: {"1": "the main branch", "2": "no performance constraints"}
Return ONLY the JSON object. If a question is not answered, set its value to null.`;

    const reply = await window.LLMProvider.chatCompletion({
      provider: window.useProviderState?.().provider || 'deepseek',
      model: window.useProviderState?.().selectedModel || 'deepseek-v4-flash',
      messages: [],
      systemPrompt: 'You extract answers from user text. Output valid JSON.',
      userContent: prompt,
      thinkingMode: false
    });
    try {
      return JSON.parse(reply.content);
    } catch {
      return {};
    }
  }

  return { askQuestions, extractAnswers };
})();
