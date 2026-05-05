import formidable from 'formidable';
import fs from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';

export const config = { 
  api: { 
    bodyParser: false,
    responseLimit: false,
    maxDuration: 300
  } 
};

const WHISPER_LIMIT = 24 * 1024 * 1024; // 24MB por segurança

async function transcreverBlob(filepath, filename, mimetype) {
  const formData = new FormData();
  formData.append('file', fs.createReadStream(filepath), {
    filename: filename || 'audio.m4a',
    contentType: mimetype || 'audio/mp4',
  });
  formData.append('model', 'whisper-1');
  formData.append('language', 'pt');
  formData.append('response_format', 'text');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      ...formData.getHeaders(),
    },
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error('Whisper: ' + errText);
  }

  return await response.text();
}

async function transcreverArquivoGrande(filepath, filename, mimetype, fileSize) {
  // Divide em partes de 24MB e transcreve cada uma
  const partes = Math.ceil(fileSize / WHISPER_LIMIT);
  const transcricoes = [];
  const stream = fs.readFileSync(filepath);
  
  for (let i = 0; i < partes; i++) {
    const inicio = i * WHISPER_LIMIT;
    const fim = Math.min(inicio + WHISPER_LIMIT, fileSize);
    const parte = stream.slice(inicio, fim);
    
    // Salva parte temporária
    const tmpPath = `/tmp/parte_${i}_${Date.now()}.m4a`;
    fs.writeFileSync(tmpPath, parte);
    
    try {
      const texto = await transcreverBlob(tmpPath, `parte_${i}.m4a`, mimetype);
      transcricoes.push(texto);
    } finally {
      fs.unlinkSync(tmpPath);
    }
  }
  
  return transcricoes.join(' ');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const form = formidable({ 
      maxFileSize: 500 * 1024 * 1024, // 500MB — sem limite prático
      maxFiles: 10,
      multiples: true
    });
    
    const [, files] = await form.parse(req);
    
    // Aceita múltiplos arquivos (campo "audio" pode ser array)
    const audioFiles = Array.isArray(files.audio) ? files.audio : [files.audio].filter(Boolean);
    
    if (!audioFiles.length) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const transcricoes = [];

    for (const file of audioFiles) {
      let texto;
      if (file.size > WHISPER_LIMIT) {
        // Arquivo grande — divide e transcreve em partes
        texto = await transcreverArquivoGrande(
          file.filepath, 
          file.originalFilename, 
          file.mimetype,
          file.size
        );
      } else {
        texto = await transcreverBlob(file.filepath, file.originalFilename, file.mimetype);
      }
      transcricoes.push(texto);
    }

    // Junta todas as transcrições
    const transcricaoFinal = transcricoes.join('\n\n');
    return res.status(200).json({ transcricao: transcricaoFinal });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
