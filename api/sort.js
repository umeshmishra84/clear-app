export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, history } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'No text provided' });
  }

  // history = array of { question, answer } from prior follow-up rounds, capped client-side at 2
  const followUpsUsed = Array.isArray(history) ? history.length : 0;
  const followUpsRemaining = Math.max(0, 2 - followUpsUsed);

  const systemPrompt = `You are a calm, perceptive companion helping someone sort out their morning. Someone has typed everything on their mind, in their own words, often messy, sometimes mid-dilemma, sometimes just venting.

Your job is NOT to copy their words into a list. Understand what's actually going on and respond the way a thoughtful, emotionally intelligent friend would — someone who actually read it, not someone doing keyword extraction.

Respond with ONLY valid JSON, no other text, no markdown fences, in this exact shape:

{
  "doNow": ["clear item, written in your own words as a real action to take"],
  "quick": ["clear item, written in your own words"],
  "weight": ["short, warm acknowledgment of something emotional — never a task"],
  "firstThing": "one sentence: the single best thing to start with, and briefly why",
  "note": "1-3 warm, specific sentences responding like a person would. If they're stuck on a decision, actually help them decide and say why. If they're venting, acknowledge it genuinely without being generic. This should feel like real guidance, not a summary of what they already know.",
  "followUpQuestion": "ONE short, genuinely useful clarifying question — or empty string if you have enough to give good guidance already."
}

Hard rules:
- Never copy sentence fragments verbatim into a list. Rewrite everything in clear, natural words, the way a person would say it back to you.
- If someone describes a dilemma ("should I do X or Y", "X but I also need Y"), treat it as ONE item, not separate items for X and Y — and give real guidance on it in "note" or "firstThing", not just a neutral restatement.
- "weight" is only for feelings, never for tasks or decisions.
- Keep it tight — this is a 30-second morning check-in, not an essay.
- You have asked ${followUpsUsed} follow-up question(s) already this session. ${followUpsRemaining > 0 ? `You may ask up to ${followUpsRemaining} more if it would genuinely change your advice.` : 'You have used your follow-up budget — leave "followUpQuestion" empty and give your best guidance with what you have.'}`;

  let userContent = text;
  if (history && history.length > 0) {
    const qa = history.map((h, i) => `Follow-up ${i + 1}\nQ: ${h.question}\nA: ${h.answer}`).join('\n\n');
    userContent = `Original brain-dump:\n${text}\n\n${qa}`;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', errText);
      return res.status(502).json({ error: 'AI service error' });
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text || '{}';

    let parsed;
    try {
      const cleaned = rawText.replace(/```json\n?|```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error('Failed to parse AI response:', rawText);
      return res.status(502).json({ error: 'Could not parse AI response' });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
