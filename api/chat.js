// Vercel Serverless Proxy — OpenRouter API
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured on Vercel' });
  try {
    const { messages, model } = req.body;
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': req.headers.referer || 'https://ludokids-benin.vercel.app',
        'X-Title': 'LudoKids Benin',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: model || 'google/gemini-2.5-flash', max_tokens: 600, messages })
    });
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Proxy error', details: err.message });
  }
}
