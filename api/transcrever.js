import formidable from 'formidable';
import fs from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';

export const config = { 
  api: { 
    bodyParser: false,
    maxDuration: 300
  } 
};

const GROQ_LIMITE = 24 * 1024 * 1024;

async function transcreverArquivo(filepath, filename, mimetype, groqKey, openaiKey) {
  const fileSize = fs.statSync(filepath).size;
  
  if (fileSize <= GROQ_LIMITE) {
    return await chamarWhisper(filepath, filename, mimetype, groqKey, openaiKey);
  }
  
  // Arquivo grande — usa ffmpeg via CLI se disponível, senão retorna erro orientativo
  throw new Error(`Arquivo muito grande (${(fileSize/1024/1024).toFixed(0)}MB). Use arquivos menores que 24MB ou grave em qualidade baixa.`);
}

async function chamarWhisper(filepath, filename, mimetype, groqKey, openaiKey) {
  // Tenta Groq primeiro
  if (groqKey) {
    try {
      const fd = new FormData();
      fd.append('file', fs.createReadStream(filepath), {
        filename: filename || 'audio.m4a',
        contentType: mimetype || 'audio/mp4',
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
      const err = await res.text();
      console.error('Groq erro:', err);
    } catch(e) {
      console.error('Groq falhou:', e.message);
    }
  }

  // Fallback: OpenAI
  if (openaiKey) {
    const fd = new FormData();
    fd.append('file', fs.createReadStream(filepath), {
      filename: filename || 'audio.m4a',
      contentType: mimetype || 'audio/mp4',
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
    const form = formidable({ 
      maxFileSize: 500 * 1024 * 1024,
      maxFiles: 10,
      multiples: true
    });
    
    const [, files] = await form.parse(req);
    const audioFiles = Array.isArray(files.audio) ? files.audio : [files.audio].filter(Boolean);
    
    if (!audioFiles.length) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const transcricoes = [];
    for (const file of audioFiles) {
      const texto = await transcreverArquivo(
        file.filepath,
        file.originalFilename,
        file.mimetype,
        groqKey,
        openaiKey
      );
      transcricoes.push(texto);
    }

    return res.status(200).json({ transcricao: transcricoes.join('\n\n') });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
