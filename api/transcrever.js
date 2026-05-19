import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '25mb',
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY não configurada' });

    const form = formidable({ maxFileSize: 25 * 1024 * 1024 });
    const [, files] = await form.parse(req);

    const file = files.file?.[0];
    if (!file) return res.status(400).json({ error: 'Nenhum arquivo recebido' });

    const fileBuffer = fs.readFileSync(file.filepath);
    const fileName = file.originalFilename || 'audio.m4a';
    const mimeType = file.mimetype || 'audio/mp4';

    const fd = new FormData();
    fd.append('file', new Blob([fileBuffer], { type: mimeType }), fileName);
    fd.append('model', 'whisper-large-v3');
    fd.append('language', 'pt');
    fd.append('response_format', 'text');

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey },
      body: fd,
    });

    const text = await response.text();
    try { fs.unlinkSync(file.filepath); } catch(e) {}

    if (!response.ok) return res.status(response.status).json({ error: text });
    return res.status(200).json({ transcricao: text });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
