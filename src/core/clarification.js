/**
 * clarification.js – Generates clarifying questions, now driven by preferences.
 */
import { LLMProvider } from '../services/llmProvider.js';

export async function runClarification(ctx, goal) {
  if (!ctx.onClarificationNeeded) return goal;

  ctx.onLog('🤔 Generating clarifying questions...');

  // Load preferences for this step
  const prefs = ctx.preferences?.clarification || {};
  const customPrompt = prefs.customPrompt || '';

  const prompt = `You are helping an autonomous coding agent understand a user request before it starts making code changes.
The user's goal is: "${goal}"
Repository: ${ctx.repo}, branch: ${ctx.branch}
${customPrompt ? `\nAdditional instructions:\n${customPrompt}\n` : ''}

Generate 2–4 short, specific clarifying questions that would help the agent avoid mistakes. The user doesn't know how to code.
Focus on: scope (which files/components), edge cases, constraints, and success criteria.
Return ONLY a JSON array of question strings, no preamble.
Example: ["Which component should be changed?", "Should existing tests be preserved?"]`;

  let questions = [];
  try {
    const reply = await LLMProvider.chatCompletion({
      provider: ctx.provider,
      model: ctx.model,
      messages: [],
      systemPrompt: 'You generate clarifying questions. Output only JSON arrays.',
      userContent: prompt,
      thinkingMode: false,
      timeoutMs: 15000
    });
    questions = JSON.parse(reply.content.replace(/```json|```/g, '').trim());
  } catch (e) {
    ctx.onLog(`⚠️ Could not generate clarifying questions: ${e.message}`);
    return goal;
  }

  if (!questions.length) return goal;

  const userAnswers = await ctx.onClarificationNeeded(questions);
  if (!userAnswers) return goal;

  const enrichedGoal = `${goal}\n\nClarifications from user:\n${userAnswers}`;
  ctx.onLog('✅ Clarification received — enriched goal recorded');
  return enrichedGoal;
}
