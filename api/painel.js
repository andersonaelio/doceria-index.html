// api/painel.js
// Função serverless (Vercel, runtime Node). Recebe ações do painel (/painel) e
// grava no repositório via GitHub Contents API — sem banco de dados.
//
// Variáveis de ambiente necessárias na Vercel (Settings → Environment Variables):
//   GITHUB_TOKEN   — Personal Access Token (classic) com escopo "repo", gerado pela própria
//                     Anderson/cliente em github.com/settings/tokens. NUNCA commitar no código.
//   GITHUB_OWNER   — "andersonaelio"
//   GITHUB_REPO    — "doceria-index.html"
//   GITHUB_BRANCH  — "main"
//   PAINEL_CODIGO  — código de 5 dígitos, ex: "12345" (trocar quando quiser, sem precisar mexer em código)
//
// IDs válidos dos doces (têm que bater com os "id" do array DOCES em index.html):
const IDS_VALIDOS = [
  'cookies', 'bombom-taca', 'bolo-vulcao', 'bento-cake', 'bombons-flor',
  'pao-de-mel', 'torta-frutas', 'torta-coco', 'caixa-presente', 'lata-coracao',
];
const LIMITE_PROMOCAO = 3; // grátis: 3 slots. Plano pago: mudar este número (e o CSS aguenta mais).

// Trava simples de força bruta: contador em memória por instância da função.
// Não é perfeito (memória zera a cada cold start / não é compartilhada entre instâncias),
// mas some com o cenário mais comum (alguém tentando repetidamente na mesma sessão quente),
// e cada tentativa errada já leva um atraso artificial abaixo — sem precisar de banco de dados.
let tentativasFalhas = 0;
let bloqueadoAte = 0;

function aguardar(ms) { return new Promise(res => setTimeout(res, ms)); }

async function githubFetch(path, options = {}) {
  const { GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN } = process.env;
  const url = 'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/' + path;
  const resp = await fetch(url, {
    ...options,
    headers: {
      'Authorization': 'Bearer ' + GITHUB_TOKEN,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  return resp;
}

// Busca o sha atual do arquivo (necessário pro GitHub aceitar uma atualização, não criação)
async function shaAtual(path) {
  const resp = await githubFetch(path + '?ref=' + (process.env.GITHUB_BRANCH || 'main'));
  if (!resp.ok) return null;
  const json = await resp.json();
  return json.sha || null;
}

async function commitar(path, conteudoBase64, mensagem) {
  const sha = await shaAtual(path);
  const resp = await githubFetch(path, {
    method: 'PUT',
    body: JSON.stringify({
      message: mensagem,
      content: conteudoBase64,
      branch: process.env.GITHUB_BRANCH || 'main',
      ...(sha ? { sha } : {}),
    }),
  });
  if (!resp.ok) {
    const erro = await resp.text();
    throw new Error('GitHub recusou o commit em ' + path + ': ' + erro);
  }
  return resp.json();
}

async function atualizarVersao() {
  const conteudo = JSON.stringify({ v: Date.now() });
  const base64 = Buffer.from(conteudo, 'utf-8').toString('base64');
  await commitar('dados/versao.json', base64, 'painel: atualizar versão de cache');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, erro: 'método não permitido' });
    return;
  }

  // ── trava de tentativas ──
  if (Date.now() < bloqueadoAte) {
    const restamSeg = Math.ceil((bloqueadoAte - Date.now()) / 1000);
    res.status(429).json({ ok: false, erro: 'muitas tentativas erradas, aguarde ' + restamSeg + 's' });
    return;
  }

  const { codigo, acao } = req.body || {};
  const codigoValido = process.env.PAINEL_CODIGO;

  if (!codigoValido) {
    res.status(500).json({ ok: false, erro: 'painel não configurado (falta PAINEL_CODIGO nas variáveis de ambiente)' });
    return;
  }

  if (String(codigo) !== String(codigoValido)) {
    tentativasFalhas++;
    await aguardar(600 * tentativasFalhas); // atraso crescente a cada erro
    if (tentativasFalhas >= 5) {
      bloqueadoAte = Date.now() + 3 * 60 * 1000; // 3 minutos de bloqueio
      tentativasFalhas = 0;
    }
    res.status(401).json({ ok: false, erro: 'código incorreto' });
    return;
  }
  tentativasFalhas = 0; // acertou, zera o contador

  try {
    if (acao === 'validar-codigo') {
      // só chega aqui se o código já bateu acima — não precisa tocar no GitHub
      res.status(200).json({ ok: true });
      return;
    }

    if (acao === 'salvar-precos') {
      const precos = req.body.precos;
      if (!precos || typeof precos !== 'object') {
        res.status(400).json({ ok: false, erro: 'preços ausentes' });
        return;
      }
      const limpo = {};
      for (const id of Object.keys(precos)) {
        if (!IDS_VALIDOS.includes(id)) continue; // ignora silenciosamente ids desconhecidos
        const { de, por } = precos[id] || {};
        const deN = Number(de), porN = Number(por);
        if (!Number.isFinite(deN) || !Number.isFinite(porN) || deN < 0 || porN < 0) {
          res.status(400).json({ ok: false, erro: 'preço inválido em ' + id });
          return;
        }
        limpo[id] = { de: deN, por: porN };
      }
      const conteudo = JSON.stringify(limpo, null, 2);
      const base64 = Buffer.from(conteudo, 'utf-8').toString('base64');
      await commitar('dados/precos.json', base64, 'painel: atualizar preços');
      await atualizarVersao();
      res.status(200).json({ ok: true });
      return;
    }

    if (acao === 'salvar-promocao') {
      const ids = Array.isArray(req.body.ids) ? req.body.ids.slice(0, LIMITE_PROMOCAO) : [];
      const invalidos = ids.filter(id => !IDS_VALIDOS.includes(id));
      if (invalidos.length) {
        res.status(400).json({ ok: false, erro: 'id(s) inválido(s): ' + invalidos.join(', ') });
        return;
      }
      const conteudo = JSON.stringify({ semana: ids }, null, 2);
      const base64 = Buffer.from(conteudo, 'utf-8').toString('base64');
      await commitar('dados/promocoes.json', base64, 'painel: atualizar promoção da semana');
      await atualizarVersao();
      res.status(200).json({ ok: true });
      return;
    }

    if (acao === 'trocar-foto') {
      const { doceId, imagemBase64 } = req.body;
      if (!IDS_VALIDOS.includes(doceId)) {
        res.status(400).json({ ok: false, erro: 'doce inválido' });
        return;
      }
      if (!imagemBase64 || typeof imagemBase64 !== 'string') {
        res.status(400).json({ ok: false, erro: 'imagem ausente' });
        return;
      }
      // limite de tamanho — o navegador já redimensiona antes de enviar, isso é só um teto de segurança
      const tamanhoAprox = imagemBase64.length * 0.75;
      if (tamanhoAprox > 2 * 1024 * 1024) {
        res.status(400).json({ ok: false, erro: 'imagem muito grande (máx. ~2MB após compressão)' });
        return;
      }
      await commitar('assets/' + doceId + '.webp', imagemBase64, 'painel: trocar foto de ' + doceId);
      await atualizarVersao();
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ ok: false, erro: 'ação desconhecida' });
  } catch (e) {
    res.status(500).json({ ok: false, erro: e.message });
  }
}
