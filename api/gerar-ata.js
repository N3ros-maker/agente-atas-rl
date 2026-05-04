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
        max_tokens: 4000,
        system: 'Voce e um assistente especializado em gerar atas profissionais. Responda APENAS com JSON valido e completo, sem markdown, sem texto adicional. O JSON deve estar sempre completo e bem formado, nunca cortado.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'Erro na API' });

    let texto = data.content?.[0]?.text || '{}';
    texto = texto.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    let ataJson;
    try {
      ataJson = JSON.parse(texto);
    } catch(e) {
      ataJson = {
        tema_geral: "Erro ao processar. Tente com uma transcricao menor ou divida em partes.",
        pontos_discutidos: [],
        decisoes_tomadas: [],
        proximos_passos: [],
        observacoes: ["Erro de processamento: " + e.message],
        compromissos_proxima_reuniao: []
      };
    }

    return res.status(200).json({ ata: ataJson });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
