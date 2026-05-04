export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { prompt } = req.body;

    // Se a transcricao for muito longa, resume primeiro
    const transcricaoMatch = prompt.match(/TRANSCRICAO:\n([\s\S]+)$/);
    const transcricao = transcricaoMatch ? transcricaoMatch[1] : '';
    const promptBase = transcricaoMatch ? prompt.replace(transcricaoMatch[0], '') : prompt;

    let transcricaoFinal = transcricao;

    // Se transcricao > 15000 chars (~2h de reuniao), resume antes
    if (transcricao.length > 15000) {
      const resumoRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 4000,
          system: 'Voce e um assistente que resume transcricoes de reunioes. Mantenha TODOS os dados importantes: numeros, percentuais, nomes, decisoes, tarefas e prazos. Seja objetivo mas completo.',
          messages: [{ role: 'user', content: `Resuma esta transcricao mantendo todos os pontos importantes:\n\n${transcricao}` }],
        }),
      });
      const resumoData = await resumoRes.json();
      transcricaoFinal = resumoData.content?.[0]?.text || transcricao;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 8000,
        system: `Voce e um assistente especializado em gerar atas profissionais para a RL Construcoes.
Gere a ata usando EXATAMENTE este formato de texto, sem desvios:

TEMA_GERAL:
[resumo em 2-3 frases]

PONTO::[titulo do topico]
- item 1
- item 2

PONTO::[proximo topico]
- item 1

DECISAO::decisao tomada 1
DECISAO::decisao tomada 2

PASSO::[Responsavel]||[descricao da acao]||[prazo ou vazio]
PASSO::[Responsavel]||[descricao]||[prazo]

OBS::observacao relevante

COMPROMISSO::compromisso para proxima reuniao 1
COMPROMISSO::compromisso 2

Use apenas este formato. Sem markdown. Sem JSON. Apenas texto estruturado.`,
        messages: [{ role: 'user', content: promptBase + 'TRANSCRICAO:\n' + transcricaoFinal }],
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'Erro na API' });

    const texto = data.content?.[0]?.text || '';

    // Parse do formato estruturado
    const ata = {
      tema_geral: '',
      pontos_discutidos: [],
      decisoes_tomadas: [],
      proximos_passos: [],
      observacoes: [],
      compromissos_proxima_reuniao: []
    };

    const lines = texto.split('\n');
    let currentSection = null;
    let currentPonto = null;
    let temaLines = [];
    let capturandoTema = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed === 'TEMA_GERAL:') {
        capturandoTema = true;
        currentSection = 'tema';
        continue;
      }

      if (trimmed.startsWith('PONTO::')) {
        capturandoTema = false;
        if (currentPonto) ata.pontos_discutidos.push(currentPonto);
        currentPonto = { titulo: trimmed.replace('PONTO::', ''), itens: [] };
        currentSection = 'ponto';
        continue;
      }

      if (trimmed.startsWith('DECISAO::')) {
        capturandoTema = false;
        if (currentPonto) { ata.pontos_discutidos.push(currentPonto); currentPonto = null; }
        ata.decisoes_tomadas.push(trimmed.replace('DECISAO::', ''));
        currentSection = 'decisao';
        continue;
      }

      if (trimmed.startsWith('PASSO::')) {
        capturandoTema = false;
        if (currentPonto) { ata.pontos_discutidos.push(currentPonto); currentPonto = null; }
        const parts = trimmed.replace('PASSO::', '').split('||');
        ata.proximos_passos.push({
          responsavel: parts[0]?.trim() || '-',
          acao: parts[1]?.trim() || '-',
          prazo: parts[2]?.trim() || '-'
        });
        currentSection = 'passo';
        continue;
      }

      if (trimmed.startsWith('OBS::')) {
        capturandoTema = false;
        if (currentPonto) { ata.pontos_discutidos.push(currentPonto); currentPonto = null; }
        ata.observacoes.push(trimmed.replace('OBS::', ''));
        currentSection = 'obs';
        continue;
      }

      if (trimmed.startsWith('COMPROMISSO::')) {
        capturandoTema = false;
        if (currentPonto) { ata.pontos_discutidos.push(currentPonto); currentPonto = null; }
        ata.compromissos_proxima_reuniao.push(trimmed.replace('COMPROMISSO::', ''));
        currentSection = 'compromisso';
        continue;
      }

      // Conteudo das secoes
      if (capturandoTema) {
        temaLines.push(trimmed);
      } else if (currentSection === 'ponto' && currentPonto) {
        const item = trimmed.replace(/^[-•*]\s*/, '');
        if (item) currentPonto.itens.push(item);
      }
    }

    if (currentPonto) ata.pontos_discutidos.push(currentPonto);
    ata.tema_geral = temaLines.join(' ');

    return res.status(200).json({ ata });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
