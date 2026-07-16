// ==========================================
// AUTENTICAÇÃO — LOTOLÓGICA
// ==========================================
// Login pelo Supabase Auth (mesmo projeto da B12/DrControl → o auth.users
// é compartilhado, que é onde o "login único" nasce).
//
// IMPORTANTE: aqui NÃO existe controle de acesso nem cobrança.
// Quem manda nisso é a B12, e o loto só fala com ela pelo b12.js.
// ==========================================

const SUPABASE_URL = 'https://htspjesdpkqvosrcjzyj.supabase.co';
// Chave PUBLICÁVEL (pública por natureza — pode ficar no código do navegador).
// A chave secreta (sb_secret_...) NUNCA entra aqui.
const SUPABASE_KEY = 'sb_publishable_n6X8aIIQApLrwlazqszEAg_Z_Yvrfr4';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ------------------------------------------
// Tradução de erros — o cliente NUNCA vê inglês
// ------------------------------------------
function traduzErroAuth(erro) {
    const m = ((erro && (erro.message || erro)) || '').toString().toLowerCase();

    if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
    if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar. Dá uma olhada na sua caixa de entrada.';
    if (m.includes('user already registered') || m.includes('already been registered')) return 'Este e-mail já tem cadastro. Tente entrar.';
    if (m.includes('password should be at least')) return 'A senha precisa ter pelo menos 6 caracteres.';
    if (m.includes('unable to validate email') || m.includes('invalid email')) return 'E-mail inválido. Confira se digitou certo.';
    if (m.includes('for security purposes') || m.includes('rate limit') || m.includes('too many requests')) return 'Muitas tentativas seguidas. Espere alguns segundos e tente de novo.';
    if (m.includes('user not found')) return 'Não encontramos uma conta com esse e-mail.';
    if (m.includes('network') || m.includes('failed to fetch')) return 'Sem conexão com a internet. Verifique e tente de novo.';
    if (m.includes('same password')) return 'A nova senha precisa ser diferente da atual.';

    // Nunca devolve o texto cru em inglês.
    return 'Não foi possível concluir agora. Tente novamente em instantes.';
}

// ------------------------------------------
// Sessão
// ------------------------------------------
async function pegarSessao() {
    try {
        const { data } = await sb.auth.getSession();
        return data.session || null;
    } catch (e) {
        return null;
    }
}

async function sair() {
    try { await sb.auth.signOut(); } catch (e) {}
    location.replace('login.html');
}

// ------------------------------------------
// Guarda das páginas protegidas.
// 1) Sem login  → manda pro login
// 2) Sem acesso → manda pra tela de assinatura
// Quem decide o acesso é a B12 (via b12.js), nunca este arquivo.
// ------------------------------------------
async function protegerPagina() {
    const sessao = await pegarSessao();
    if (!sessao) { location.replace('login.html'); return null; }

    const acesso = await B12.temAcesso(sessao);
    if (!acesso || !acesso.temAcesso) { location.replace('assinatura.html'); return null; }

    return { sessao, acesso };
}
