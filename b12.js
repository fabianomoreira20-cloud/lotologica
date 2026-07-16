// ==========================================
// PORTA DA B12 — LOTOLÓGICA
// ==========================================
// Este é o ÚNICO ponto de contato do LotoLógica com a Central B12.
//
// REGRA DE OURO (decisão do dono):
//   - A B12 é a dona do ACESSO, da COBRANÇA e da NOTA FISCAL.
//   - O LotoLógica é um FILHO: ele NÃO cobra, NÃO integra banco,
//     NÃO controla acesso e NÃO emite nota. Ele só PERGUNTA e RECEBE.
//
// Por isso tudo que é dinheiro/acesso mora AQUI e em mais lugar nenhum.
// Quando a Central B12 publicar os endpoints reais, muda-se SÓ este
// arquivo — o resto do app não precisa ser tocado.
// ==========================================

// Identificador deste produto na B12 (o DrControl será 'drcontrol').
const PRODUTO = 'lotologica';

// Endereço da Central. Fica null até a B12 publicar os endpoints.
// TODO(B12): preencher quando a central expuser a API.
const B12_API = null; // ex.: 'https://central.b12tech.com.br/api'

const B12 = {
    produto: PRODUTO,

    // Diz se a integração real com a Central já existe.
    ligada() {
        return !!B12_API;
    },

    // ------------------------------------------------------------
    // PERGUNTA: "este usuário tem acesso ao lotologica?"
    // Contrato esperado da B12 (a ser confirmado no desenho dela):
    //   GET {B12_API}/acesso?produto=lotologica
    //   Header: Authorization: Bearer <token do Supabase Auth>
    //   Resposta: { temAcesso: bool, tipo: 'cortesia'|'vitalicio'|'pago', ate: ISO|null }
    // ------------------------------------------------------------
    async temAcesso(sessao) {
        if (!sessao) return { temAcesso: false, tipo: null, ate: null, motivo: 'sem-login' };

        if (!B12.ligada()) {
            // PROVISÓRIO — enquanto a Central não tem o endpoint de acesso.
            // Regra temporária: quem está logado entra. NÃO é controle de
            // acesso de verdade: é um andaime até a B12 responder.
            return {
                temAcesso: true,
                tipo: 'provisorio',
                ate: null,
                motivo: 'b12-ainda-nao-publicou-endpoint'
            };
        }

        try {
            const r = await fetch(`${B12_API}/acesso?produto=${encodeURIComponent(PRODUTO)}`, {
                headers: { 'Authorization': `Bearer ${sessao.access_token}` }
            });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return await r.json();
        } catch (e) {
            // Na dúvida, NÃO libera. Acesso é dinheiro.
            return { temAcesso: false, tipo: null, ate: null, motivo: 'falha-consulta' };
        }
    },

    // ------------------------------------------------------------
    // PEDIDO: "gera a cobrança Pix deste produto pra este usuário"
    // O LotoLógica NUNCA fala com o Banco Inter. Quem fala é a B12.
    // Contrato esperado:
    //   POST {B12_API}/cobranca  { produto: 'lotologica' }
    //   Header: Authorization: Bearer <token do Supabase Auth>
    //   Resposta: { qrcode: <img base64>, copiaECola: string, txid: string, valor: number }
    // ------------------------------------------------------------
    async gerarPix(sessao) {
        if (!B12.ligada()) {
            return {
                ok: false,
                indisponivel: true,
                mensagem: 'A cobrança ainda será ligada na Central B12.'
            };
        }
        try {
            const r = await fetch(`${B12_API}/cobranca`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${sessao.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ produto: PRODUTO })
            });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const dados = await r.json();
            return { ok: true, ...dados };
        } catch (e) {
            return { ok: false, mensagem: 'Não foi possível gerar o Pix agora. Tente novamente.' };
        }
    },

    // ------------------------------------------------------------
    // Confere se o Pix já caiu (a B12 é quem sabe — ela recebe o
    // aviso do Inter e libera o acesso).
    // ------------------------------------------------------------
    async conferirPagamento(sessao, txid) {
        if (!B12.ligada()) return { pago: false, indisponivel: true };
        try {
            const r = await fetch(`${B12_API}/cobranca/${encodeURIComponent(txid)}`, {
                headers: { 'Authorization': `Bearer ${sessao.access_token}` }
            });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return await r.json();
        } catch (e) {
            return { pago: false };
        }
    }
};
