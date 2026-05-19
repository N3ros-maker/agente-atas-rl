export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY não configurada' });

    // Lê o body como buffer
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    // Extrai boundary do Content-Type
    const contentType = req.headers['content-type'] || '';

    // Repassa direto para o Whisper
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': contentType,
      },
      body: buffer,
    });

    const text = await response.text();
    if (!response.ok) return res.status(response.status).json({ error: text });
    return res.status(200).json({ transcricao: text });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
