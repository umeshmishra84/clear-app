export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'No text provided' });
  }

  const systemPrompt = `You help someone sort a messy morning brain-dump into three categories. Respond with ONLY valid JSON, no other text, in this exact shape:

{
  "doNow": ["short item 1", "short item 2"],
  "quick": ["short item 1"],
  "weight": ["short item 1"],
  "firstThing": "the single most important thing to do first, or empty string if only emotional items exist"
}

Rules:
- "doNow": tasks with a real deadline or high stakes today
- "quick": small tasks, no urgency, easy to clear in a few minutes
- "weight": emotional or relational things that are not tasks to check off — acknowledge them, don't turn them into to-dos
- Keep each item short, one clear sentence, in the person's own words where possible
- "firstThing" should be whichever doNow or quick item, if cleared first, would most reduce the person's mental load
- Never give advice, never add commentary, never wrap the JSON in markdown code fences`;

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
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: text }],
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
