// ==========================================
// MOTOR DE INTELIGÊNCIA - LOTOLÓGICA PRO
// Reescrito para operar 100% com DADOS REAIS da Caixa.
// ==========================================
//
// TRANSPARÊNCIA (leia): loteria é sorteio justo. Nenhuma conta muda a
// probabilidade de acertar. O que este motor faz de real e útil:
//  1) Usa o histórico oficial verdadeiro (não números inventados).
//  2) Gera jogos com o MESMO PERFIL estatístico dos sorteios que saem
//     (soma, pares/ímpares, distribuição) calibrado sobre dados reais.
//  3) No modo Exploração, foge de padrões populares (datas, sequências)
//     para, EM CASO DE PRÊMIO, dividir com menos gente.
// ==========================================

const API = 'https://loteriascaixa-api.herokuapp.com/api';

const configJogos = {
    lfacil:     { api: 'lotofacil',     nome: 'L-FÁCIL',     cor: '#9333ea', minBolas: 15, maxBolas: 20, baseSorteio: 15, sorteados: 15, precoBase: 3.50, limiteTabela: 25 },
    msena:      { api: 'megasena',      nome: 'M-SENA',      cor: '#16a34a', minBolas: 6,  maxBolas: 20, baseSorteio: 6,  sorteados: 6,  precoBase: 5.00, limiteTabela: 60 },
    quina:      { api: 'quina',         nome: 'QUINA',       cor: '#0284c7', minBolas: 5,  maxBolas: 15, baseSorteio: 5,  sorteados: 5,  precoBase: 2.50, limiteTabela: 80 },
    lmania:     { api: 'lotomania',     nome: 'L-MANIA',     cor: '#ea580c', minBolas: 50, maxBolas: 50, baseSorteio: 50, sorteados: 20, precoBase: 3.00, limiteTabela: 100 },
    dsorte:     { api: 'diadesorte',    nome: 'D-DA-SORTE',  cor: '#ea580c', minBolas: 7,  maxBolas: 15, baseSorteio: 7,  sorteados: 7,  precoBase: 2.50, limiteTabela: 31 },
    tmania:     { api: 'timemania',     nome: 'T-MANIA',     cor: '#334155', minBolas: 10, maxBolas: 10, baseSorteio: 10, sorteados: 7,  precoBase: 3.50, limiteTabela: 80 },
    milionaria: { api: 'maismilionaria',nome: '+MILIONÁRIA', cor: '#1e293b', minBolas: 6,  maxBolas: 12, baseSorteio: 6,  sorteados: 6,  precoBase: 6.00, limiteTabela: 50 }
};

const dezenasMolduraLotofacil = ['01','02','03','04','05','06','10','11','15','16','20','21','22','23','24','25'];
const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
let janelaAtual = 250; // quantos concursos recentes entram na análise (o usuário pode trocar)

// Faixas de premiação por jogo (nº de acertos que paga) — usado na conferência histórica
const PREMIOS = {
    lfacil: [11, 12, 13, 14, 15],
    msena: [4, 5, 6],
    quina: [2, 3, 4, 5],
    lmania: [0, 15, 16, 17, 18, 19, 20],
    dsorte: [4, 5, 6, 7],
    tmania: [3, 4, 5, 6, 7],
    milionaria: [2, 3, 4, 5, 6]
};

let jogoSelecionado = 'lfacil';
let config = configJogos['lfacil'];

// Estado da análise (preenchido com dados reais)
const STATE = {
    historico: [],
    universo: [],
    freq: {},
    atraso: {},
    calibracao: null,
    extras: null,
    ultimo: [],
    maxFreq: 1,
    maxAtraso: 1,
    pronto: false
};

let cacheApostaMestra = [];
let cacheConfigMestra = "";

// ------------------------------------------
// 1. INICIALIZAÇÃO
// ------------------------------------------
window.onload = () => {
    const urlParams = new URLSearchParams(window.location.search);
    jogoSelecionado = urlParams.get('jogo');
    if (!configJogos[jogoSelecionado]) jogoSelecionado = 'lfacil';

    config = configJogos[jogoSelecionado];
    document.documentElement.style.setProperty('--theme-color', config.cor);
    document.getElementById('titulo-header').innerText = `Meu Trevo ${config.nome}`;

    inicializarSeletores();
    carregarDados();
};

function inicializarSeletores() {
    const seletorMestra = document.getElementById('seletor-dezenas-mestra');
    const seletorAlt = document.getElementById('seletor-dezenas-alt');
    if (!seletorMestra || !seletorAlt) return;

    seletorMestra.innerHTML = '';
    seletorAlt.innerHTML = '';
    for (let i = config.minBolas; i <= config.maxBolas; i++) {
        seletorMestra.appendChild(new Option(i, i));
        seletorAlt.appendChild(new Option(i, i));
    }
    if (config.minBolas === config.maxBolas) {
        seletorMestra.disabled = true; seletorMestra.style.opacity = '0.5';
        seletorAlt.disabled = true; seletorAlt.style.opacity = '0.5';
    }
}

// ------------------------------------------
// 2. CONEXÃO / DADOS REAIS (com cache local)
// ------------------------------------------
function setStatus(cor, texto) {
    const dot = document.getElementById('status-dot');
    const txt = document.getElementById('status-text');
    if (dot) dot.className = 'pulse-dot ' + (cor === 'verde' ? 'dot-green' : 'dot-orange');
    if (txt) txt.innerHTML = texto;
}

async function fetchJSON(url, timeoutMs) {
    const resposta = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(timeoutMs || 12000)
    });
    if (!resposta.ok) throw new Error('HTTP ' + resposta.status);
    return await resposta.json();
}

// --- IndexedDB minimalista (guarda o histórico grande sem estourar cota) ---
const DB = {
    _p: null,
    abrir() {
        if (DB._p) return DB._p;
        DB._p = new Promise((res) => {
            try {
                const r = indexedDB.open('lotologica', 1);
                r.onupgradeneeded = (e) => { e.target.result.createObjectStore('hist'); };
                r.onsuccess = (e) => res(e.target.result);
                r.onerror = () => res(null);
            } catch (e) { res(null); }
        });
        return DB._p;
    },
    async get(key) {
        const db = await DB.abrir(); if (!db) return null;
        return new Promise((res) => {
            try {
                const req = db.transaction('hist', 'readonly').objectStore('hist').get(key);
                req.onsuccess = () => res(req.result || null);
                req.onerror = () => res(null);
            } catch (e) { res(null); }
        });
    },
    async set(key, val) {
        const db = await DB.abrir(); if (!db) return;
        return new Promise((res) => {
            try {
                const req = db.transaction('hist', 'readwrite').objectStore('hist').put(val, key);
                req.onsuccess = () => res();
                req.onerror = () => res();
            } catch (e) { res(); }
        });
    }
};

async function carregarDados() {
    setStatus('laranja', 'Carregando resultados oficiais…');
    const chave = config.api;
    let cache = await DB.get(chave);      // { concurso, historico }
    let latest = null;
    try { latest = await fetchJSON(`${API}/${config.api}/latest`, 12000); } catch (e) {}

    let historico = null;

    if (latest && typeof latest.concurso === 'number') {
        atualizarBanner(latest);

        if (cache && cache.concurso === latest.concurso) {
            historico = cache.historico;                                   // já está atualizado
        } else if (cache && latest.concurso > cache.concurso && (latest.concurso - cache.concurso) <= 30) {
            // só busca os concursos novos e prepende
            setStatus('laranja', 'Atualizando com os últimos resultados…');
            const novos = [];
            for (let n = latest.concurso; n > cache.concurso; n--) {
                try { novos.push(await fetchJSON(`${API}/${config.api}/${n}`, 12000)); } catch (e) {}
            }
            historico = [...novos, ...cache.historico];
            await DB.set(chave, { concurso: historico[0].concurso, historico });
        } else {
            // primeira vez (ou defasagem grande): baixa o histórico completo
            setStatus('laranja', 'Baixando histórico oficial (só na 1ª vez)…');
            try {
                const full = await fetchJSON(`${API}/${config.api}`, 60000);
                historico = full.slice().sort((a, b) => b.concurso - a.concurso);
                await DB.set(chave, { concurso: historico[0].concurso, historico });
            } catch (e) {
                historico = [latest]; // pelo menos o último, pra não travar
            }
        }
        setStatus('verde', `Base real • concurso ${latest.concurso} de ${latest.data}`);
    } else if (cache) {
        historico = cache.historico;
        atualizarBanner(historico[0]);
        setStatus('laranja', 'Sem internet — usando dados salvos (podem estar desatualizados)');
    } else {
        setStatus('laranja', 'Sem conexão com os resultados oficiais. Confira a internet e recarregue a página.');
        return;
    }

    STATE.historico = historico;
    prepararEstatisticas(historico);
    STATE.pronto = true;

    if (document.getElementById('painel-mestra')) document.getElementById('painel-mestra').style.display = 'flex';
    atualizarPreco('mestra');
    atualizarPreco('alt');
}

function atualizarBanner(obj) {
    if (!obj) return;
    const premio = obj.valorEstimadoProximoConcurso || obj.valorAcumuladoProximoConcurso || 0;
    const banner = document.getElementById('banner-premio');
    if (premio > 0 && banner) {
        document.getElementById('valor-acumulado-display').innerText =
            premio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        banner.style.display = 'block';
        if (obj.acumulou) document.getElementById('texto-banner-acumulou').innerHTML = '⚠️ PRÊMIO ACUMULADO';
    }
}

// ------------------------------------------
// 3. ESTATÍSTICA REAL
// ------------------------------------------
function universoDezenas(cfg) {
    const arr = [];
    if (cfg.api === 'lotomania') { for (let i = 0; i <= 99; i++) arr.push(String(i).padStart(2, '0')); }
    else { for (let i = 1; i <= cfg.limiteTabela; i++) arr.push(String(i).padStart(2, '0')); }
    return arr;
}

function prepararEstatisticas(historico) {
    const universo = universoDezenas(config);
    const tamJanela = Math.min(janelaAtual, historico.length);
    const janela = historico.slice(0, tamJanela);
    janela.forEach(c => { c._dz = (c.dezenas || []).map(x => String(x).padStart(2, '0')); });

    // Frequência (quantas vezes saiu na janela)
    const freq = {}; universo.forEach(d => freq[d] = 0);
    janela.forEach(c => c._dz.forEach(d => { if (freq[d] !== undefined) freq[d]++; }));

    // Atraso (há quantos concursos não sai; 0 = saiu no último)
    const atraso = {}; universo.forEach(d => atraso[d] = janela.length);
    const achou = {};
    for (let i = 0; i < janela.length; i++) {
        janela[i]._dz.forEach(d => { if (achou[d] === undefined) { achou[d] = true; atraso[d] = i; } });
    }

    STATE.universo = universo;
    STATE.freq = freq;
    STATE.atraso = atraso;
    STATE.maxFreq = Math.max(1, ...Object.values(freq));
    STATE.maxAtraso = Math.max(1, ...Object.values(atraso));
    STATE.calibracao = calibrar(janela);
    STATE.extras = calcExtras(janela);
    STATE.ultimo = janela.length ? janela[0]._dz : [];

    renderPainelSorteio();
    renderPainelAnalise();
}

function percentil(arrOrdenado, p) {
    if (!arrOrdenado.length) return 0;
    const idx = Math.min(arrOrdenado.length - 1, Math.max(0, Math.floor(p * (arrOrdenado.length - 1))));
    return arrOrdenado[idx];
}
function faixaCentral(valores, margem) {
    if (!valores.length) return null;
    const ord = valores.slice().sort((a, b) => a - b);
    return [percentil(ord, margem), percentil(ord, 1 - margem)];
}

// Calibra os filtros a partir dos números que REALMENTE saíram
function calibrar(janela) {
    const somas = [], impares = [], molduras = [], repetidas = [];
    for (let i = 0; i < janela.length; i++) {
        const dz = janela[i]._dz;
        somas.push(dz.reduce((a, d) => a + parseInt(d, 10), 0));
        impares.push(dz.filter(d => parseInt(d, 10) % 2 !== 0).length);
        if (config.api === 'lotofacil') {
            molduras.push(dz.filter(d => dezenasMolduraLotofacil.includes(d)).length);
            if (i + 1 < janela.length) {
                const ant = janela[i + 1]._dz;
                repetidas.push(dz.filter(d => ant.includes(d)).length);
            }
        }
    }
    return {
        soma: faixaCentral(somas, 0.10),
        impares: faixaCentral(impares, 0.10),
        moldura: molduras.length ? faixaCentral(molduras, 0.10) : null,
        repetidas: repetidas.length ? faixaCentral(repetidas, 0.10) : null
    };
}

// Frequência real dos elementos extras (mês / time / trevos)
function calcExtras(janela) {
    if (config.api === 'diadesorte') {
        const mapa = {}; janela.forEach(h => { if (h.mesSorte) mapa[h.mesSorte] = (mapa[h.mesSorte] || 0) + 1; });
        return { tipo: 'mes', mapa };
    }
    if (config.api === 'timemania') {
        const mapa = {}; janela.forEach(h => { if (h.timeCoracao) mapa[h.timeCoracao] = (mapa[h.timeCoracao] || 0) + 1; });
        return { tipo: 'time', mapa };
    }
    if (config.api === 'maismilionaria') {
        const mapa = {}; janela.forEach(h => (h.trevos || []).forEach(t => { const k = String(t); mapa[k] = (mapa[k] || 0) + 1; }));
        return { tipo: 'trevos', mapa };
    }
    return null;
}

// ------------------------------------------
// 4. PAINEL DE ANÁLISE (mostra o dado real na tela)
// ------------------------------------------
function renderPainelAnalise() {
    let painel = document.getElementById('painel-analise');
    if (!painel) {
        const status = document.getElementById('status-conexao');
        if (!status) return;
        painel = document.createElement('div');
        painel.id = 'painel-analise';
        painel.style.cssText = 'background:var(--card-bg);border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:15px;box-shadow:var(--shadow);font-size:0.8rem;';
        status.parentNode.insertBefore(painel, status.nextSibling);
    }

    const ordFreq = STATE.universo.slice().sort((a, b) => STATE.freq[b] - STATE.freq[a]).slice(0, 6);
    const ordAtraso = STATE.universo.slice().sort((a, b) => STATE.atraso[b] - STATE.atraso[a]).slice(0, 6);
    const chip = (n, sub) => `<span style="display:inline-flex;flex-direction:column;align-items:center;gap:2px;min-width:34px;"><b style="background:var(--theme-color);color:#fff;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.8rem;">${n}</b><small style="color:#64748b;font-size:0.6rem;">${sub}</small></span>`;

    const usados = Math.min(janelaAtual, STATE.historico.length);

    painel.innerHTML =
        `<div style="color:#94a3b8;font-weight:800;font-size:0.7rem;letter-spacing:0.5px;margin-bottom:12px;">ANÁLISE DOS ${usados} SORTEIOS MAIS RECENTES (DADOS REAIS)</div>
         <div style="margin-bottom:10px;"><div style="color:#f59e0b;font-weight:700;font-size:0.7rem;margin-bottom:6px;">🔥 Mais frequentes</div><div style="display:flex;gap:8px;flex-wrap:wrap;">${ordFreq.map(d => chip(d, STATE.freq[d] + 'x')).join('')}</div></div>
         <div><div style="color:#38bdf8;font-weight:700;font-size:0.7rem;margin-bottom:6px;">❄️ Mais atrasadas</div><div style="display:flex;gap:8px;flex-wrap:wrap;">${ordAtraso.map(d => chip(d, STATE.atraso[d] + ' atrás')).join('')}</div></div>`;
}

// Troca a janela de análise (10 / 50 / 100 / 250 / tudo) e recalcula tudo
function trocarJanela(valor) {
    janelaAtual = (valor === 'tudo') ? STATE.historico.length : parseInt(valor);
    prepararEstatisticas(STATE.historico);
    cacheApostaMestra = []; cacheConfigMestra = '';
    document.getElementById('resultado-mestra').innerHTML = '';
    document.getElementById('resultado-alt').innerHTML = '';
}

// ------------------------------------------
// 5. GERAÇÃO (Fisher-Yates + peso real + filtros calibrados)
// ------------------------------------------
function embaralhar(arr) { // Fisher-Yates justo
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function pesoDaDezena(dz, modo) {
    const fN = STATE.freq[dz] / STATE.maxFreq;
    const aN = STATE.atraso[dz] / STATE.maxAtraso;
    if (modo === 'exploracao') return 1 + 0.25 * aN;      // quase uniforme = cobertura ampla
    return 1 + 0.8 * fN + 0.6 * aN;                        // mestra = equilíbrio frequente/atrasada
}

// Amostragem ponderada SEM reposição
function amostrarPonderado(itens, pesos, k) {
    const it = itens.slice(), w = pesos.slice(), out = [];
    k = Math.min(k, it.length);
    for (let n = 0; n < k; n++) {
        let total = 0; for (let i = 0; i < w.length; i++) total += w[i];
        let r = Math.random() * total, idx = 0;
        while (idx < w.length - 1 && r > w[idx]) { r -= w[idx]; idx++; }
        out.push(it[idx]);
        it.splice(idx, 1); w.splice(idx, 1);
    }
    return out;
}

function temSequenciaLonga(nums, len) {
    const s = nums.slice().sort((a, b) => a - b);
    let run = 1;
    for (let i = 1; i < s.length; i++) {
        if (s[i] === s[i - 1] + 1) { run++; if (run >= len) return true; } else run = 1;
    }
    return false;
}

// Filtros calibrados pelos dados reais. nivel 0 = rígido; aumenta = relaxa.
function passaFiltros(cand, q, modo, nivel) {
    const cal = STATE.calibracao;
    if (!cal) return true;
    const nums = cand.map(d => parseInt(d, 10));
    const soma = nums.reduce((a, b) => a + b, 0);
    const impares = nums.filter(n => n % 2 !== 0).length;
    const base = config.sorteados;
    const escala = q / base;
    const folga = nivel;

    if (cal.soma) {
        const lo = cal.soma[0] * escala * (1 - 0.05 * folga) - folga * 3;
        const hi = cal.soma[1] * escala * (1 + 0.05 * folga) + folga * 3;
        if (soma < lo || soma > hi) return false;
    }
    if (cal.impares) {
        const centro = ((cal.impares[0] + cal.impares[1]) / 2) * escala;
        const raio = ((cal.impares[1] - cal.impares[0]) / 2) * escala + 1 + folga;
        if (impares < Math.floor(centro - raio) || impares > Math.ceil(centro + raio)) return false;
    }
    // Específicos da Lotofácil (apenas no jogo base de 15)
    if (config.api === 'lotofacil' && q === base && nivel < 2) {
        if (cal.moldura) {
            const m = cand.filter(d => dezenasMolduraLotofacil.includes(d)).length;
            if (m < cal.moldura[0] - folga || m > cal.moldura[1] + folga) return false;
        }
        if (cal.repetidas && STATE.ultimo.length) {
            const r = cand.filter(d => STATE.ultimo.includes(d)).length;
            if (r < cal.repetidas[0] - folga || r > cal.repetidas[1] + folga) return false;
        }
    }
    // Lotomania: metades equilibradas
    if (config.api === 'lotomania' && nivel < 2) {
        const baixa = nums.filter(n => n <= 49).length;
        if (baixa < 20 || baixa > 30) return false;
    }
    // Anti-rateio / bom senso
    if (nivel < 2) {
        if (temSequenciaLonga(nums, 5)) return false;
        if (modo === 'exploracao' && config.limiteTabela > 31) {
            if (nums.filter(n => n > 31).length < 1) return false; // não ser só "datas"
        }
    }
    return true;
}

function sortearExtra() {
    const ex = STATE.extras;
    if (!ex) return [];
    if (ex.tipo === 'mes') {
        const m = escolhaPonderadaChave(ex.mapa) || MESES[Math.floor(Math.random() * 12)];
        return [m];
    }
    if (ex.tipo === 'time') {
        const t = escolhaPonderadaChave(ex.mapa);
        return t ? [t] : [];
    }
    if (ex.tipo === 'trevos') {
        const chaves = ['1', '2', '3', '4', '5', '6'];
        const pesos = chaves.map(k => 1 + (ex.mapa[k] || 0));
        return amostrarPonderado(chaves, pesos, 2).map(Number).sort((a, b) => a - b).map(n => 'T' + n);
    }
    return [];
}

function escolhaPonderadaChave(mapa) {
    const chaves = Object.keys(mapa || {});
    if (!chaves.length) return null;
    const pesos = chaves.map(k => mapa[k]);
    let total = pesos.reduce((a, b) => a + b, 0), r = Math.random() * total, i = 0;
    while (i < pesos.length - 1 && r > pesos[i]) { r -= pesos[i]; i++; }
    return chaves[i];
}

// Gera N bilhetes. Retorna array de { nums:[...], extras:[...] }
function gerarBilhetes(q, qtdBilhetes, modo) {
    const uni = STATE.universo;
    const vistos = new Set();
    const bilhetes = [];
    const MAX = 4000;

    // Modo Mestra: garante um NÚCLEO das dezenas mais frequentes dentro do jogo
    // (coerência com o painel — o cliente vê os "quentes" aparecerem na aposta).
    const rankFreq = uni.slice().sort((a, b) => STATE.freq[b] - STATE.freq[a]);
    const poolSeed = rankFreq.slice(0, Math.min(8, q));           // topo da frequência
    const nSeed = (modo === 'mestra') ? Math.min(6, Math.max(3, Math.floor(q / 3))) : 0;

    function montarCandidato() {
        if (nSeed > 0) {
            const seed = embaralhar(poolSeed).slice(0, nSeed);      // alguns dos mais frequentes
            const resto = uni.filter(d => !seed.includes(d));
            const pesosResto = resto.map(d => pesoDaDezena(d, modo));
            const complemento = amostrarPonderado(resto, pesosResto, q - nSeed);
            return [...seed, ...complemento].sort((a, b) => parseInt(a) - parseInt(b));
        }
        const pesos = uni.map(d => pesoDaDezena(d, modo));
        return amostrarPonderado(uni, pesos, q).sort((a, b) => parseInt(a) - parseInt(b));
    }

    for (let nivel = 0; nivel < 4 && bilhetes.length < qtdBilhetes; nivel++) {
        let tent = 0;
        while (bilhetes.length < qtdBilhetes && tent < MAX) {
            tent++;
            const cand = montarCandidato();
            const chave = cand.join(',');
            if (vistos.has(chave)) continue;
            if (nivel < 3 && !passaFiltros(cand, q, modo, nivel)) continue;
            vistos.add(chave);
            bilhetes.push({ nums: cand, extras: sortearExtra() });
        }
    }
    return bilhetes;
}

// ------------------------------------------
// 6. AÇÕES DA TELA
// ------------------------------------------
function abrirPainelExploracao() {
    document.getElementById('painel-exploracao').style.display = 'flex';
    document.getElementById('btn-abrir-exploracao').style.display = 'none';
}

function gerarApostaMestra() {
    processarGeracao(true, 'seletor-dezenas-mestra', 'seletor-bilhetes-mestra', 'resultado-mestra');
    document.getElementById('btn-abrir-exploracao').style.display = 'block';
}

function gerarApostasAlternativas() {
    processarGeracao(false, 'seletor-dezenas-alt', 'seletor-bilhetes-alt', 'resultado-alt');
}

function processarGeracao(isMestra, idDez, idBil, idContainer) {
    if (!STATE.pronto) return; // dados ainda não chegaram

    const seletorDez = document.getElementById(idDez);
    const seletorBil = document.getElementById(idBil);
    if (!seletorDez || !seletorBil) return;

    const qtdDezenas = parseInt(seletorDez.value);
    const qtdBilhetes = parseInt(seletorBil.value);
    const modo = isMestra ? 'mestra' : 'exploracao';
    const configAtual = `${jogoSelecionado}-${modo}-${qtdDezenas}-${qtdBilhetes}-${STATE.ultimo[0] || 'x'}`;

    if (isMestra && cacheConfigMestra === configAtual && cacheApostaMestra.length > 0) {
        renderizarBolasNaTela(cacheApostaMestra, idContainer);
        return;
    }

    const bilhetes = gerarBilhetes(qtdDezenas, qtdBilhetes, modo);

    if (isMestra) {
        cacheApostaMestra = bilhetes;
        cacheConfigMestra = configAtual;
    }
    renderizarBolasNaTela(bilhetes, idContainer);
}

// ------------------------------------------
// 7. RENDERIZAÇÃO E CUSTOS
// ------------------------------------------
function renderizarBolasNaTela(listaBilhetes, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    listaBilhetes.forEach((bilhete, index) => {
        const box = document.createElement('div'); box.className = 'bilhete-box';
        const titulo = document.createElement('h4'); titulo.innerText = `BILHETE ${index + 1}`;
        box.appendChild(titulo);

        const grid = document.createElement('div'); grid.className = 'bolas-grid';
        const todos = [...bilhete.nums, ...bilhete.extras];
        todos.forEach(num => {
            const span = document.createElement('span'); span.className = 'bola'; span.innerText = num;
            if (config.api === 'lotomania') { span.style.width = '30px'; span.style.height = '30px'; span.style.fontSize = '0.8rem'; }
            if (num.length > 2) { // mês / time (pílula)
                span.style.width = 'auto'; span.style.padding = '0 12px'; span.style.borderRadius = '8px';
                span.style.fontSize = '0.75rem'; span.style.fontWeight = '800';
            } else if (num[0] === 'T') { // trevo
                span.style.background = '#fbbf24'; span.style.color = '#0f172a';
            }
            grid.appendChild(span);
        });
        box.appendChild(grid);

        // Conferência histórica: como esse jogo teria se saído nos sorteios reais
        const conf = conferenciaHistorica(bilhete.nums);
        if (conf) box.appendChild(conf);

        container.appendChild(box);
    });

    // Barra de ações: levar os jogos embora (o app não guarda nada)
    if (listaBilhetes.length) container.appendChild(barraDeAcoes(listaBilhetes));
}

// ------------------------------------------
// LEVAR OS JOGOS EMBORA
// O sistema NÃO armazena apostas. Quem guarda é o apostador —
// por isso ele leva em PDF (arquivo) ou no WhatsApp (texto).
// ------------------------------------------
function barraDeAcoes(lista) {
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:10px;margin-top:4px;';

    const estilo = 'flex:1;border:none;padding:13px 10px;border-radius:10px;font-weight:800;font-size:0.85rem;cursor:pointer;color:#fff;box-shadow:0 4px 10px rgba(0,0,0,0.3);';

    const btnPdf = document.createElement('button');
    btnPdf.innerHTML = '📄 BAIXAR PDF';
    btnPdf.style.cssText = estilo + 'background:#475569;';
    btnPdf.onclick = () => baixarPDF(lista);

    const btnZap = document.createElement('button');
    btnZap.innerHTML = '💬 WHATSAPP';
    btnZap.style.cssText = estilo + 'background:#25D366;';
    btnZap.onclick = () => enviarWhatsApp(lista);

    bar.appendChild(btnPdf);
    bar.appendChild(btnZap);
    return bar;
}

// Texto limpo dos bilhetes (serve pro WhatsApp e pro PDF)
function linhasDosBilhetes(lista) {
    return lista.map((b, i) => {
        const dezenas = b.nums.join(' - ');
        const extras = b.extras && b.extras.length ? '\n   + ' + b.extras.join('  ') : '';
        return `BILHETE ${i + 1}\n   ${dezenas}${extras}`;
    });
}

// ------------------------------------------
// PRÓXIMO SORTEIO E PRAZO DE APOSTA
// A data vem do calendário OFICIAL da Caixa (campo dataProximoConcurso),
// então feriado, fim de semana e mudança de dia já vêm resolvidos —
// não chumbamos calendário nenhum aqui.
//
// REGRA DE PRAZO (mudança da Caixa anunciada em julho/2026):
//   - Sorteios que caem no DOMINGO (os que migraram do sábado, agora às 11h):
//     as apostas encerram às 22h do SÁBADO, a véspera.
//   - Demais dias (segunda a sexta): sem mudança, apostas até as 19h do
//     próprio dia do sorteio.
// Horários de Brasília.
// ------------------------------------------
const SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

function prazoDeAposta(dataSorteio) {
    if (dataSorteio.getDay() === 0) {
        // Sorteio de domingo 11h → aposta até 22h de sábado
        const vespera = new Date(dataSorteio);
        vespera.setDate(vespera.getDate() - 1);
        vespera.setHours(22, 0, 0, 0);
        return { limite: vespera, texto: 'até as 22h de sábado', sorteio: 'domingo às 11h' };
    }
    const d = new Date(dataSorteio);
    d.setHours(19, 0, 0, 0);
    return { limite: d, texto: 'até as 19h do dia do sorteio', sorteio: null };
}

function infoProximoSorteio() {
    const c = STATE.historico.length ? STATE.historico[0] : null;
    if (!c || !c.dataProximoConcurso) return null;

    const partes = String(c.dataProximoConcurso).split('/');
    if (partes.length !== 3) return null;
    const dia = parseInt(partes[0], 10), mes = parseInt(partes[1], 10), ano = parseInt(partes[2], 10);

    const dataSorteio = new Date(ano, mes - 1, dia);
    const prazo = prazoDeAposta(dataSorteio);
    const agora = new Date();

    return {
        concurso: c.proximoConcurso,
        data: c.dataProximoConcurso,
        diaSemana: SEMANA[dataSorteio.getDay()],
        prazoTexto: prazo.texto,
        horaSorteio: prazo.sorteio,
        encerrado: agora > prazo.limite,
        horasRestantes: Math.max(0, Math.round((prazo.limite - agora) / 3600000))
    };
}

function renderPainelSorteio() {
    const s = infoProximoSorteio();
    if (!s) return;

    let el = document.getElementById('painel-sorteio');
    if (!el) {
        const status = document.getElementById('status-conexao');
        if (!status) return;
        el = document.createElement('div');
        el.id = 'painel-sorteio';
        status.parentNode.insertBefore(el, status.nextSibling);
    }

    const quando = s.horaSorteio
        ? `${s.diaSemana.charAt(0).toUpperCase() + s.diaSemana.slice(1)}, ${s.data} <b>às 11h</b>`
        : `${s.diaSemana.charAt(0).toUpperCase() + s.diaSemana.slice(1)}, ${s.data}`;

    if (s.encerrado) {
        // Passou do prazo: não dá mais pra apostar neste concurso.
        el.style.cssText = 'background:rgba(245,158,11,0.10);border:1px solid rgba(245,158,11,0.35);border-radius:12px;padding:14px;font-size:0.8rem;color:#fcd34d;line-height:1.55;';
        el.innerHTML = `⏰ <b>Apostas encerradas para o concurso ${s.concurso}</b> (${s.diaSemana}, ${s.data}).<br>
            O prazo era <b>${s.prazoTexto}</b>. Os jogos gerados agora valem para o <b>próximo concurso</b>.`;
    } else {
        el.style.cssText = 'background:var(--card-bg);border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:14px;font-size:0.82rem;color:#cbd5e1;line-height:1.55;box-shadow:var(--shadow);';
        const aviso = s.horasRestantes <= 6
            ? ` <b style="color:#fcd34d;">Faltam ~${s.horasRestantes}h!</b>`
            : '';
        el.innerHTML = `🎯 <b style="color:#e2e8f0;">Próximo sorteio: concurso ${s.concurso}</b><br>
            ${quando} — apostas <b>${s.prazoTexto}</b>.${aviso}`;
    }
}

function cabecalhoInfo() {
    const c = STATE.historico.length ? STATE.historico[0] : null;
    const proximo = c && c.proximoConcurso ? c.proximoConcurso : (c ? c.concurso + 1 : '');
    const usados = Math.min(janelaAtual, STATE.historico.length);
    const s = infoProximoSorteio();
    return {
        jogo: config.nome,
        proximo: proximo,
        // Data oficial do próximo sorteio + se o prazo daquele concurso já passou
        dataSorteio: s ? s.data : null,
        diaSemana: s ? s.diaSemana : null,
        prazoTexto: s ? s.prazoTexto : null,
        horaSorteio: s ? s.horaSorteio : null,
        prazoEncerrado: s ? s.encerrado : false,
        // Deixa claro que a análise é de MUITOS concursos — o número do último
        // sorteio é só o selo de "dados atualizados até aqui".
        base: c ? `${usados} concursos analisados (atualizado até o ${c.concurso}, de ${c.data})` : ''
    };
}

function enviarWhatsApp(lista) {
    const info = cabecalhoInfo();
    const partes = [];
    partes.push(`*Meu Trevo — ${info.jogo}*`);
    if (info.prazoEncerrado) {
        partes.push(`⏰ _Apostas do concurso ${info.proximo} já encerraram. Estes jogos valem para o próximo sorteio._`);
    } else if (info.proximo && info.dataSorteio) {
        const hora = info.horaSorteio ? ' às 11h' : '';
        partes.push(`Concurso ${info.proximo} — sorteio ${info.diaSemana}, ${info.dataSorteio}${hora}`);
        partes.push(`Apostas ${info.prazoTexto}`);
    } else if (info.proximo) {
        partes.push(`Para o concurso ${info.proximo}`);
    }
    partes.push('');
    partes.push(linhasDosBilhetes(lista).join('\n\n'));
    partes.push('');
    partes.push(`_Análise do histórico oficial da Caixa — ${info.base}._`);
    partes.push('meutrevo.com.br');

    const texto = encodeURIComponent(partes.join('\n'));
    // Abre o WhatsApp do próprio usuário; ele escolhe pra quem manda.
    window.open('https://wa.me/?text=' + texto, '_blank');
}

function baixarPDF(lista) {
    const info = cabecalhoInfo();

    // Se a biblioteca não carregou, cai na impressão do navegador (salvar como PDF)
    const lib = window.jspdf && window.jspdf.jsPDF;
    if (!lib) { imprimirComoPDF(lista, info); return; }

    const doc = new lib({ unit: 'mm', format: 'a4' });
    const M = 18;
    let y = M;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
    doc.text('Meu Trevo', M, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor(120);
    doc.text(config.nome, M + 42, y);
    y += 8;

    doc.setFontSize(10); doc.setTextColor(90);
    if (info.prazoEncerrado) {
        doc.setTextColor(180, 120, 0);
        doc.text('Apostas do concurso ' + info.proximo + ' encerraram - valem para o proximo sorteio', M, y);
        doc.setTextColor(90); y += 5;
    } else if (info.proximo && info.dataSorteio) {
        const hora = info.horaSorteio ? ' as 11h' : '';
        doc.text('Concurso ' + info.proximo + ' - sorteio ' + info.diaSemana + ', ' + info.dataSorteio + hora, M, y); y += 5;
        doc.text('Apostas ' + (info.prazoTexto || ''), M, y); y += 5;
    } else if (info.proximo) {
        doc.text('Para o concurso ' + info.proximo, M, y); y += 5;
    }
    doc.setFontSize(9);
    doc.text(info.base, M, y); y += 4;
    doc.setDrawColor(200); doc.line(M, y, 210 - M, y); y += 7;

    // Layout compacto: cabem 10 bilhetes numa folha só.
    // Dezenas numa linha só (quebra apenas em jogos grandes, tipo Lotomania).
    const porLinha = (lista[0] && lista[0].nums.length > 16) ? 10 : 20;

    lista.forEach((b, i) => {
        if (y > 262) { doc.addPage(); y = M; }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(110);
        doc.text('BILHETE ' + (i + 1), M, y); y += 5;

        doc.setFont('courier', 'bold'); doc.setFontSize(12); doc.setTextColor(0);
        const grupos = [];
        for (let k = 0; k < b.nums.length; k += porLinha) grupos.push(b.nums.slice(k, k + porLinha).join('  '));
        grupos.forEach(g => { doc.text(g, M + 2, y); y += 6; });

        if (b.extras && b.extras.length) {
            doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(120);
            doc.text('+ ' + b.extras.join('   '), M + 2, y); y += 6;
        }
        y += 2.5;
    });

    y += 4;
    doc.setDrawColor(220); doc.line(M, y, 210 - M, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(130);
    const aviso = doc.splitTextToSize(
        'Jogos montados a partir do histórico oficial real da Caixa. A análise organiza as escolhas com base em dados, mas não altera a probabilidade do sorteio nem garante premiação. Jogue com responsabilidade. — meutrevo.com.br',
        210 - M * 2);
    doc.text(aviso, M, y);

    doc.save('lotologica-' + config.api + '.pdf');
}

// Plano B: abre uma janela pronta pra imprimir/salvar em PDF
function imprimirComoPDF(lista, info) {
    const html = `<html><head><meta charset="utf-8"><title>Meu Trevo — ${info.jogo}</title>
      <style>body{font-family:Arial,sans-serif;padding:30px;color:#111}
      h1{margin:0}h2{font-size:14px;color:#555;margin:4px 0 20px}
      .b{margin-bottom:18px}.t{font-weight:bold;font-size:13px}
      .n{font-family:monospace;font-size:20px;letter-spacing:2px;margin-top:4px}
      .av{margin-top:24px;font-size:11px;color:#666;border-top:1px solid #ccc;padding-top:10px}</style>
      </head><body>
      <h1>Meu Trevo — ${info.jogo}</h1>
      <h2>${info.proximo ? 'Para o concurso ' + info.proximo + ' • ' : ''}Base: ${info.base}</h2>
      ${lista.map((b, i) => `<div class="b"><div class="t">BILHETE ${i + 1}</div><div class="n">${b.nums.join('  ')}${b.extras && b.extras.length ? '  + ' + b.extras.join(' ') : ''}</div></div>`).join('')}
      <div class="av">Jogos montados a partir do histórico oficial real da Caixa. A análise não altera a probabilidade do sorteio nem garante premiação. Jogue com responsabilidade. — meutrevo.com.br</div>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { alert('Permita janelas pop-up para baixar o PDF.'); return; }
    w.document.write(html); w.document.close(); w.focus(); w.print();
}

// Percorre TODO o histórico real e conta quantas vezes esse bilhete teria premiado
function conferenciaHistorica(numsBilhete) {
    const tiers = PREMIOS[jogoSelecionado];
    if (!tiers || !STATE.historico.length) return null;

    const setB = new Set(numsBilhete.filter(n => n.length <= 2 && n[0] !== 'T'));
    const cont = {}; tiers.forEach(t => cont[t] = 0);

    const hist = STATE.historico;
    for (let i = 0; i < hist.length; i++) {
        const dz = hist[i]._dz || (hist[i].dezenas || []).map(x => String(x).padStart(2, '0'));
        let acertos = 0;
        for (let k = 0; k < dz.length; k++) if (setB.has(dz[k])) acertos++;
        if (cont[acertos] !== undefined) cont[acertos]++;
    }

    // monta o texto só com as faixas que têm ocorrência (da maior pra menor)
    const partes = tiers.slice().sort((a, b) => b - a)
        .filter(t => cont[t] > 0)
        .map(t => `<b style="color:#e2e8f0;">${t}</b> pts: ${cont[t]}x`);

    const div = document.createElement('div');
    div.style.cssText = 'margin-top:14px;padding-top:12px;border-top:1px dashed rgba(255,255,255,0.12);font-size:0.72rem;color:#94a3b8;line-height:1.6;text-align:left;';
    if (partes.length === 0) {
        div.innerHTML = `📊 <b style="color:#94a3b8;">Conferência real (${hist.length} concursos):</b> este jogo nunca teria batido uma faixa premiada.`;
    } else {
        div.innerHTML = `📊 <b style="color:#94a3b8;">Se valesse nos ${hist.length} sorteios reais já realizados:</b><br>${partes.join(' &nbsp;·&nbsp; ')}`;
    }
    return div;
}

function atualizarPreco(painel) {
    const idDez = painel === 'mestra' ? 'seletor-dezenas-mestra' : 'seletor-dezenas-alt';
    const idBil = painel === 'mestra' ? 'seletor-bilhetes-mestra' : 'seletor-bilhetes-alt';
    const idDisp = painel === 'mestra' ? 'valor-display-mestra' : 'valor-display-alt';
    const idResult = painel === 'mestra' ? 'resultado-mestra' : 'resultado-alt';

    const selDez = document.getElementById(idDez);
    const selBil = document.getElementById(idBil);
    const disp = document.getElementById(idDisp);
    if (!selDez || !selBil || !disp) return;

    const qtdDezenas = parseInt(selDez.value);
    const qtdBilhetes = parseInt(selBil.value);
    const precoTotal = calcularCombinacao(qtdDezenas, config.baseSorteio) * config.precoBase * qtdBilhetes;
    disp.innerText = precoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    mostrarProbabilidade(painel, qtdDezenas);
    document.getElementById(idResult).innerHTML = '';
    if (painel === 'mestra') {
        document.getElementById('btn-abrir-exploracao').style.display = 'none';
        document.getElementById('painel-exploracao').style.display = 'none';
        document.getElementById('resultado-alt').innerHTML = '';
    }
}

// Combinação à prova de estouro (não usa fatorial gigante)
function calcularCombinacao(n, p) {
    if (p < 0 || p > n) return 0;
    p = Math.min(p, n - p);
    let r = 1;
    for (let i = 1; i <= p; i++) r = r * (n - p + i) / i;
    return Math.round(r);
}

// Probabilidade REAL de cravar o prêmio máximo (mesma matemática da Caixa).
// Você marca q dezenas; S são sorteadas de um universo de N.
// P = C(q,S) / C(N,S)  — e, na +Milionária, ainda divide pelos trevos.
function probabilidadeTopo(q) {
    const N = config.limiteTabela;   // universo de dezenas
    const S = config.sorteados;      // quantas são sorteadas
    if (q < S) return null;
    let p = calcularCombinacao(q, S) / calcularCombinacao(N, S);
    if (config.api === 'maismilionaria') p = p / calcularCombinacao(6, 2); // 2 trevos entre 6
    return p;
}

function mostrarProbabilidade(painel, q) {
    const idDisp = painel === 'mestra' ? 'valor-display-mestra' : 'valor-display-alt';
    const disp = document.getElementById(idDisp);
    if (!disp) return;
    const bloco = disp.parentNode; // .valor-aposta
    let linha = bloco.querySelector('.prob-real');
    if (!linha) {
        linha = document.createElement('p');
        linha.className = 'prob-real';
        linha.style.cssText = 'margin-top:8px;font-size:0.72rem;color:#94a3b8;font-weight:600;text-transform:none;letter-spacing:0;';
        bloco.appendChild(linha);
    }
    const p = probabilidadeTopo(q);
    if (!p || !isFinite(p) || p <= 0) { linha.innerHTML = ''; return; }
    const umEm = Math.round(1 / p).toLocaleString('pt-BR');

    // Média esperada de acertos: sorteadas × suas dezenas ÷ universo.
    // Mostrar isso evita a frustração de achar que o sistema "errou"
    // quando na verdade o resultado veio na média.
    const media = (config.sorteados * q / config.limiteTabela);
    const linhaMedia = `<br>📊 Acertos esperados por bilhete: <b style="color:#e2e8f0;">~${media.toFixed(1)}</b> <span style="color:#64748b;">(é a média normal, não é falha)</span>`;

    linha.innerHTML = `🎯 Chance do prêmio máximo com <b>${q} dezenas</b>: <b style="color:#e2e8f0;">1 em ${umEm}</b>` + linhaMedia;
}
