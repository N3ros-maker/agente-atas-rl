import formidable from 'formidable';
import fs from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';
import { put, del } from '@vercel/blob';

export const config = { 
  api: { 
    bodyParser: false,
    maxDuration: 300
  } 
};

async function transcreverUrl(blobUrl, filename, groqKey, openaiKey) {
  // Baixa o arquivo do Blob
  const response = await fetch(blobUrl);
  const buffer = await response.buffer();
  
  // Salva temporariamente
  const tmpPath = `/tmp/${Date.now()}_${filename}`;
  fs.writeFileSync(tmpPath, buffer);

  try {
    // Tenta Groq primeiro
    if (groqKey) {
      try {
        const fd = new FormData();
        fd.append('file', fs.createReadStream(tmpPath), {
          filename,
          contentType: 'audio/mp4',
        });
        fd.append('model', 'whisper-large-v3');
        fd.append('language', 'pt');
        fd.append('response_format', 'text');

        const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${groqKey}`, ...fd.getHeaders() },
          body: fd,
        });

        if (res.ok) return await res.text();
        const errText = await res.text();
        console.error('Groq erro:', errText);
      } catch(e) {
        console.error('Groq falhou:', e.message);
      }
    }

    // Fallback OpenAI
    if (openaiKey) {
      const fd = new FormData();
      fd.append('file', fs.createReadStream(tmpPath), {
        filename,
        contentType: 'audio/mp4',
      });
      fd.append('model', 'whisper-1');
      fd.append('language', 'pt');
      fd.append('response_format', 'text');

      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}`, ...fd.getHeaders() },
        body: fd,
      });

      if (res.ok) return await res.text();
      const err = await res.text();
      throw new Error('OpenAI: ' + err);
    }

    throw new Error('Nenhuma chave de transcrição configurada');
  } finally {
    fs.unlinkSync(tmpPath);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  try {
    const { blobUrl, filename } = req.body;
    if (!blobUrl) return res.status(400).json({ error: 'blobUrl não fornecido' });

    const transcricao = await transcreverUrl(blobUrl, filename || 'audio.m4a', groqKey, openaiKey);
    
    // Remove o arquivo do Blob após transcrever
    try { await del(blobUrl); } catch(e) { console.warn('Não conseguiu deletar blob:', e.message); }

    return res.status(200).json({ transcricao });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
