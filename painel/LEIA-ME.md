# Configurar o painel — passo a passo

O código já está pronto e você já fez upload do site pro GitHub (`andersonaelio/doceria-index.html`,
branch `main`). Falta só ligar a chave que deixa a função serverless escrever nesse repositório.

## 1. Gerar o token do GitHub

1. Acesse **github.com/settings/tokens** (logado como `andersonaelio`).
2. **Generate new token → Generate new token (classic)**.
3. Nome: `painel-doceria-dalpizzol` (só pra identificar depois).
4. Expiração: escolha (recomendo 1 ano, e marcar lembrete pra renovar).
5. Escopo: marque só **`repo`** (acesso de leitura/escrita nos repositórios). Não precisa marcar mais nada.
6. Gerar e **copiar o token na hora** — o GitHub só mostra uma vez.

## 2. Colocar as variáveis de ambiente na Vercel

No projeto `doceria-index-html` na Vercel → **Settings → Environment Variables**, adicionar:

| Nome              | Valor                                  |
|-------------------|-----------------------------------------|
| `GITHUB_TOKEN`    | o token que você copiou no passo 1      |
| `GITHUB_OWNER`    | `andersonaelio`                         |
| `GITHUB_REPO`     | `doceria-index.html`                    |
| `GITHUB_BRANCH`   | `main`                                  |
| `PAINEL_CODIGO`   | `12345` (ou o código de 5 dígitos que a cliente quiser) |

Depois de adicionar, faça um **redeploy** do projeto (Vercel → Deployments → ⋯ → Redeploy) pra essas
variáveis passarem a valer — a Vercel não aplica env vars novas em builds já existentes.

## 3. Testar

1. Acesse `doceria-index-html.vercel.app/painel` (ou o domínio final quando trocar).
2. Digite o código de 5 dígitos.
3. Escolha 3 doces e clique em "Salvar promoção".
4. Espere ~1 minuto e recarregue o site — a seção "Promoção da semana" deve aparecer entre o hero e a vitrine.
5. Teste também trocar uma foto — escolha um doce, envie uma imagem, salve, espere e recarregue o site.

## Trocar o código de 5 dígitos depois

Só editar a variável `PAINEL_CODIGO` na Vercel e fazer redeploy. Não precisa mexer em nenhum código.

## Liberar mais de 3 doces na promoção (upgrade pro plano pago)

Duas mudanças, ambas no arquivo `api/painel.js`, feitas por você (Anderson) e commitadas no GitHub:
- Trocar a constante `LIMITE_PROMOCAO` pro número novo.
- Trocar a mesma constante `LIMITE` no início do `painel/index.html`.
O grid de CSS (`.promo-grid`) já é `repeat(3,1fr)` — se for além de 3 promoções simultâneas, ajustar
esse CSS também (ex: `repeat(auto-fill,minmax(220px,1fr))`).

## Limitações que valem saber

- **Delay de propagação**: depois de salvar, o site demora ~30-60s pra atualizar (é o tempo do
  GitHub disparar o redeploy na Vercel). O painel já avisa isso na tela.
- **Trava de força bruta é leve**: bloqueia por 3 minutos depois de 5 códigos errados seguidos, mas
  o contador vive na memória da função — reinicia sozinho de vez em quando (comportamento normal de
  função serverless). Suficiente pro caso de uso, não é nível banco/fintech.
- **Foto precisa de navegador com suporte a WebP no `<canvas>`** (todo Android/Chrome recente e
  iPhone com iOS 16+ têm isso). Se a cliente usar um aparelho muito antigo, o painel avisa que não
  conseguiu processar a imagem.
