# LotoLógica PRO

Gerador de apostas das loterias Caixa com análise estatística sobre o histórico oficial real.

## O que é
App estático (HTML + JS puro, sem backend) que:
- puxa os resultados oficiais da Caixa (via API pública, com cache local em IndexedDB);
- analisa frequência, atraso e distribuição das dezenas nos últimos concursos;
- gera apostas com o perfil estatístico dos sorteios reais e mostra a probabilidade e a conferência histórica de cada jogo.

## Arquivos
- `index.html` — menu dos 7 jogos
- `matriz.html` — tela do gerador
- `motor.js` — motor de análise e geração

## Deploy (Vercel)
Site 100% estático — não precisa de build. Basta a Vercel servir a pasta.
1. Subir esta pasta para um repositório no GitHub.
2. Na Vercel: **Add New → Project → Import** o repositório.
3. Framework Preset: **Other** (sem build). Output: a própria raiz.
4. Apontar o domínio/subdomínio desejado.

## Fases do produto
1. **No ar (estático)** — este repositório.
2. **Venda** — login (Supabase) + trava de assinatura.
3. **Controle** — gestão de clientes pela Central B12.
