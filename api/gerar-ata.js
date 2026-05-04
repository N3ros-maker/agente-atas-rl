export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { prompt } = req.body;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        system: 'Você é um assistente especializado em gerar atas profissionais. Responda APENAS com JSON válido, sem markdown, sem texto adicional, sem blocos de código.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'Erro na API' });

    let texto = data.content?.[0]?.text || '{}';
    // Remove qualquer markdown que possa ter escapado
    texto = texto.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    
    // Tenta parsear o JSON
    let ataJson;
    try {
      ataJson = JSON.parse(texto);
    } catch(e) {
      return res.status(500).json({ error: 'Erro ao processar resposta da IA: ' + e.message, raw: texto });
    }

    return res.status(200).json({ ata: ataJson });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
