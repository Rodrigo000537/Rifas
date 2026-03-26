/**
 * ============================================================
 * Rifa Solidária — Associação de Combate ao Câncer de Marília
 * ============================================================
 * Versão: 2.0 — Reescrito para Firebase Firestore
 *
 * Arquitetura:
 *  - Firebase Firestore como banco de dados em tempo real
 *  - Transações atômicas para evitar condição de corrida
 *  - onSnapshot para sincronização em tempo real entre dispositivos
 *  - Números reservados (pendentes) bloqueados para outros usuários
 *  - Autenticação via sessionStorage (sem Firebase Auth)
 *
 * Credenciais Admin: login = "admin" | senha = "admin123"
 * ============================================================
 */

// ============================================================
// CONSTANTES GLOBAIS
// ============================================================
const ADMIN_EMAIL   = 'admin';
const ADMIN_SENHA   = 'admin123';
const TOTAL_NUMEROS = 9048; // Total de números disponíveis (00000 a 09047)

// ============================================================
// ESTADO LOCAL DA SESSÃO
// Estes valores existem apenas na sessão atual do navegador
// ============================================================
let pacoteSelecionado = null;   // Pacote escolhido na tela inicial
let numerosEscolhidos = [];     // Números selecionados pelo usuário na sessão
let metodoPagamento   = null;   // 'pix' ou 'dinheiro'
let tabelaDados       = [];     // Cache local da tabela admin
let unsubscribeAdmin  = null;   // Referência ao listener do admin (para cancelar ao sair)
let unsubscribeConta  = null;   // Referência ao listener da conta do usuário

// ============================================================
// ACESSO AO FIRESTORE
// window.db e window.dbRef são inicializados pelo script inline
// no <head> do index.html. Aguardamos o DOMContentLoaded.
// ============================================================

/** Retorna a referência ao documento principal do Firestore */
function getDbRef() {
  if (!window.dbRef) {
    console.error('❌ Firebase ainda não inicializado.');
    return null;
  }
  return window.dbRef;
}

// ============================================================
// ESTRUTURA VAZIA DO BANCO
// Usada ao inicializar ou limpar os dados
// ============================================================
function estadoVazio() {
  return {
    usuarios        : [],  // Array de objetos de usuário cadastrados
    numerosVendidos : [],  // Números com pagamento CONFIRMADO
    numerosPendentes: [],  // Números RESERVADOS aguardando pagamento
    historico       : []   // Array de todas as transações
  };
}

// ============================================================
// FIRESTORE: LER DADOS
// Leitura única (getDoc) — usada para verificações pontuais
// ============================================================
async function dbLer() {
  try {
    const { getDoc } = await importFirestore();
    const snap = await getDoc(getDbRef());
    if (snap.exists()) {
      const dados = snap.data();
      // Garante retrocompatibilidade: cria array de pendentes se não existir
      if (!dados.numerosPendentes) dados.numerosPendentes = [];
      return dados;
    }
    // Documento não existe ainda: inicializa com estrutura vazia
    return estadoVazio();
  } catch (e) {
    console.error('Erro ao ler Firestore:', e);
    return estadoVazio();
  }
}

// ============================================================
// FIRESTORE: SALVAR DADOS (SOBRESCRITA COMPLETA)
// Usado apenas pelo admin para operações que exigem substituição
// ============================================================
async function dbSalvar(dados) {
  try {
    const { setDoc } = await importFirestore();
    await setDoc(getDbRef(), dados);
  } catch (e) {
    console.error('Erro ao salvar no Firestore:', e);
    throw e; // Propaga o erro para o chamador tratar
  }
}

// ============================================================
// FIRESTORE: TRANSAÇÃO ATÔMICA
// Garante que dois usuários não consigam reservar o mesmo número.
// A transação lê e escreve atomicamente — se outro cliente
// modificar o documento entre a leitura e a escrita, a transação
// será automaticamente reexecutada pelo Firestore.
// ============================================================
async function dbTransacao(numerosDesejados, novaTransacao) {
  try {
    const { runTransaction } = await importFirestore();

    await runTransaction(window.db, async (transaction) => {
      const snap = await transaction.get(getDbRef());
      const dados = snap.exists() ? snap.data() : estadoVazio();

      // Garante que os arrays existam (retrocompatibilidade)
      const vendidos  = dados.numerosVendidos  || [];
      const pendentes = dados.numerosPendentes || [];

      // Verifica se algum número já está ocupado (vendido OU pendente)
      const ocupados = [...vendidos, ...pendentes];
      const conflito = numerosDesejados.find(n => ocupados.includes(n));

      if (conflito) {
        // Lança erro para abortar a transação e informar o usuário
        throw new Error(`NUMERO_OCUPADO:${conflito}`);
      }

      // Reserva os números como pendentes
      const novosPendentes = [...pendentes, ...numerosDesejados];
      const novoHistorico  = [...(dados.historico || []), novaTransacao];

      transaction.set(getDbRef(), {
        ...dados,
        numerosPendentes: novosPendentes,
        historico       : novoHistorico
      });
    });

    return { sucesso: true };
  } catch (e) {
    if (e.message && e.message.startsWith('NUMERO_OCUPADO:')) {
      const num = e.message.split(':')[1];
      return { sucesso: false, numeroConflito: num };
    }
    console.error('Erro na transação do Firestore:', e);
    return { sucesso: false, erro: e.message };
  }
}

// ============================================================
// IMPORTAÇÃO DINÂMICA DO FIRESTORE (SDK modular)
// Necessário porque o SDK é carregado como módulo ES no HTML
// ============================================================
async function importFirestore() {
  // Importa diretamente do CDN (mesmo URL do script inline no HTML)
  const mod = await import('https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js');
  return mod;
}

// ============================================================
// LOADING OVERLAY
// Exibe uma tela de carregamento bloqueante com mensagem
// ============================================================
function mostrarLoading(msg) {
  let el = document.getElementById('loading-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loading-overlay';
    el.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.5);
      backdrop-filter:blur(6px);z-index:9999;
      display:flex;flex-direction:column;align-items:center;
      justify-content:center;gap:1rem;
    `;
    el.innerHTML = `
      <div style="
        width:48px;height:48px;
        border:4px solid rgba(255,255,255,0.2);
        border-top-color:#22c55e;
        border-radius:50%;
        animation:spin 0.8s linear infinite
      "></div>
      <div id="loading-msg" style="
        color:white;
        font-family:'Syne',sans-serif;
        font-weight:700;
        font-size:1rem;
        text-align:center;
        max-width:280px;
        padding:0 1rem;
      "></div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    `;
    document.body.appendChild(el);
  }
  const msgEl = document.getElementById('loading-msg');
  if (msgEl) msgEl.textContent = msg || 'Carregando...';
  el.style.display = 'flex';
}

function esconderLoading() {
  const el = document.getElementById('loading-overlay');
  if (el) el.style.display = 'none';
}

// ============================================================
// INICIALIZAÇÃO
// Aguarda o DOM estar pronto e o Firebase inicializado
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  mostrarLoading('Conectando ao servidor...');

  // Aguarda o Firebase ser injetado pelo script inline do HTML
  let tentativas = 0;
  while (!window.db && tentativas < 20) {
    await new Promise(r => setTimeout(r, 150));
    tentativas++;
  }

  if (!window.db) {
    esconderLoading();
    alert('❌ Erro ao conectar com o Firebase. Recarregue a página.');
    return;
  }

  esconderLoading();
  verificarLogin();
  showSection('home');

  // Escuta Enter nos inputs de número para melhor UX
  const inputNum = document.getElementById('input-numero');
  if (inputNum) {
    inputNum.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') adicionarNumero();
    });
  }

  // Escuta Enter no input de login
  const inputSenha = document.getElementById('login-senha');
  if (inputSenha) {
    inputSenha.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') fazerLogin();
    });
  }
});

// ============================================================
// NAVEGAÇÃO ENTRE SEÇÕES
// ============================================================
function showSection(nome) {
  // Cancela listeners em tempo real de seções anteriores
  if (nome !== 'admin' && unsubscribeAdmin) {
    unsubscribeAdmin();
    unsubscribeAdmin = null;
  }
  if (nome !== 'conta' && unsubscribeConta) {
    unsubscribeConta();
    unsubscribeConta = null;
  }

  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

  const sec = document.getElementById('sec-' + nome);
  if (sec) sec.classList.add('active');

  // Executa ações específicas de cada seção
  if (nome === 'conta')     renderizarConta();
  if (nome === 'pagamento') preencherResumoPagamento();
  if (nome === 'admin')     renderizarAdmin();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// AUTENTICAÇÃO — ESTADO DA NAVBAR
// ============================================================
function verificarLogin() {
  const usuario   = getUsuarioLogado();
  const btnLogin  = document.getElementById('btn-login-nav');
  const btnConta  = document.getElementById('btn-minha-conta');
  const btnLogout = document.getElementById('btn-logout');
  const navUser   = document.getElementById('nav-user-info');
  const statsAdm  = document.getElementById('hero-stats-admin');

  if (usuario) {
    btnLogin.classList.add('hidden');
    btnLogout.classList.remove('hidden');
    navUser.classList.remove('hidden');

    if (usuario.isAdmin) {
      btnConta.textContent = 'Painel Admin';
      btnConta.onclick = () => showSection('admin');
      btnConta.classList.remove('hidden');
      navUser.textContent = '👑 Admin';
      if (statsAdm) {
        statsAdm.classList.remove('hidden');
        atualizarEstatisticasHome(); // Atualiza stats no hero para admin
      }
    } else {
      btnConta.textContent = 'Minha Conta';
      btnConta.onclick = () => showSection('conta');
      btnConta.classList.remove('hidden');
      navUser.textContent = 'Olá, ' + usuario.nome.split(' ')[0];
      if (statsAdm) statsAdm.classList.add('hidden');
    }
  } else {
    btnLogin.classList.remove('hidden');
    btnConta.classList.add('hidden');
    btnLogout.classList.add('hidden');
    navUser.classList.add('hidden');
    if (statsAdm) statsAdm.classList.add('hidden');
  }
}

/** Retorna o usuário logado da sessionStorage ou null */
function getUsuarioLogado() {
  const raw = sessionStorage.getItem('rifa_logado');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // JSON corrompido — limpa a sessão
    sessionStorage.removeItem('rifa_logado');
    return null;
  }
}

// ============================================================
// CADASTRO DE NOVO USUÁRIO
// ============================================================
async function cadastrar() {
  const nome  = document.getElementById('cad-nome').value.trim();
  const email = document.getElementById('cad-email').value.trim().toLowerCase();
  const senha = document.getElementById('cad-senha').value;
  const tel   = document.getElementById('cad-tel').value.trim();
  const msgEl = document.getElementById('msg-cadastro');

  // Validações de entrada
  if (!nome || nome.length < 3) {
    showMsg(msgEl, 'error', 'Informe seu nome completo (mínimo 3 caracteres).');
    return;
  }
  if (!email.endsWith('@gmail.com')) {
    showMsg(msgEl, 'error', 'Use um e-mail Gmail (@gmail.com).');
    return;
  }
  if (senha.length < 6) {
    showMsg(msgEl, 'error', 'A senha deve ter pelo menos 6 caracteres.');
    return;
  }
  if (tel.replace(/\D/g, '').length < 10) {
    showMsg(msgEl, 'error', 'Informe um número de telefone válido.');
    return;
  }

  mostrarLoading('Criando sua conta...');

  try {
    const dados = await dbLer();

    // Verifica duplicidade de e-mail
    if (dados.usuarios.find(u => u.email === email)) {
      esconderLoading();
      showMsg(msgEl, 'error', 'E-mail já cadastrado. Faça login.');
      return;
    }

    // Adiciona novo usuário (nunca armazene senha em texto claro em produção real)
    dados.usuarios.push({
      nome,
      email,
      senha,
      tel,
      criadoEm: new Date().toISOString()
    });

    await dbSalvar(dados);

    // Salva sessão e redireciona
    sessionStorage.setItem('rifa_logado', JSON.stringify({
      nome, email, tel, isAdmin: false
    }));

    esconderLoading();
    showMsg(msgEl, 'success', '✅ Conta criada! Redirecionando...');
    verificarLogin();
    setTimeout(() => showSection('home'), 1400);

  } catch (e) {
    esconderLoading();
    showMsg(msgEl, 'error', 'Erro ao criar conta. Tente novamente.');
    console.error('Erro no cadastro:', e);
  }
}

// ============================================================
// LOGIN
// ============================================================
async function fazerLogin() {
  const emailInput = document.getElementById('login-email').value.trim().toLowerCase();
  const senha      = document.getElementById('login-senha').value;
  const msgEl      = document.getElementById('msg-login');

  if (!emailInput || !senha) {
    showMsg(msgEl, 'error', 'Preencha e-mail e senha.');
    return;
  }

  // Login admin (sem consultar Firestore)
  if (emailInput === ADMIN_EMAIL && senha === ADMIN_SENHA) {
    sessionStorage.setItem('rifa_logado', JSON.stringify({
      nome: 'Administrador', email: ADMIN_EMAIL, isAdmin: true
    }));
    showMsg(msgEl, 'success', '🔐 Acesso admin liberado!');
    verificarLogin();
    setTimeout(() => showSection('admin'), 1000);
    return;
  }

  mostrarLoading('Verificando credenciais...');

  try {
    const dados   = await dbLer();
    const usuario = dados.usuarios.find(
      u => u.email === emailInput && u.senha === senha
    );

    esconderLoading();

    if (!usuario) {
      showMsg(msgEl, 'error', 'E-mail ou senha incorretos.');
      return;
    }

    sessionStorage.setItem('rifa_logado', JSON.stringify({
      nome    : usuario.nome,
      email   : usuario.email,
      tel     : usuario.tel,
      isAdmin : false
    }));

    showMsg(msgEl, 'success', `Bem-vindo, ${usuario.nome.split(' ')[0]}! 🎉`);
    verificarLogin();
    setTimeout(() => showSection('home'), 1200);

  } catch (e) {
    esconderLoading();
    showMsg(msgEl, 'error', 'Erro ao fazer login. Tente novamente.');
    console.error('Erro no login:', e);
  }
}

// ============================================================
// LOGOUT
// ============================================================
function logout() {
  // Cancela listeners ativos antes de sair
  if (unsubscribeAdmin) { unsubscribeAdmin(); unsubscribeAdmin = null; }
  if (unsubscribeConta) { unsubscribeConta(); unsubscribeConta = null; }

  sessionStorage.removeItem('rifa_logado');

  // Limpa estado da sessão de compra
  pacoteSelecionado = null;
  numerosEscolhidos = [];
  metodoPagamento   = null;

  document.querySelectorAll('.pacote-card').forEach(c => c.classList.remove('selected'));
  const barInfo = document.getElementById('pacote-selecionado-info');
  if (barInfo) barInfo.classList.add('hidden');

  verificarLogin();
  showSection('home');
}

// ============================================================
// SELEÇÃO DE PACOTES
// ============================================================
function selecionarPacote(el) {
  document.querySelectorAll('.pacote-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');

  const cotas = parseInt(el.dataset.cotas, 10);
  const preco = parseInt(el.dataset.preco, 10);
  pacoteSelecionado = { cotas, preco };
  numerosEscolhidos = []; // Limpa seleção anterior ao trocar de pacote

  document.getElementById('pacote-info-text').textContent =
    `${cotas} cota${cotas > 1 ? 's' : ''} por R$${preco},00`;
  document.getElementById('pacote-selecionado-info').classList.remove('hidden');
}

// ============================================================
// FLUXO DE COMPRA
// ============================================================
function handleComprar() {
  const usuario = getUsuarioLogado();
  if (!usuario)          { showSection('cadastro'); return; }
  if (usuario.isAdmin)   { alert('Você está logado como administrador.'); return; }
  if (!pacoteSelecionado){ alert('Selecione um pacote antes de continuar!'); return; }
  irParaEscolha();
}

function irParaEscolha() {
  const usuario = getUsuarioLogado();
  if (!usuario)          { showSection('cadastro'); return; }
  if (!pacoteSelecionado){ alert('Selecione um pacote!'); return; }

  numerosEscolhidos = [];
  atualizarNumerosUI();

  document.getElementById('num-pacote-label').textContent =
    `${pacoteSelecionado.cotas} cota${pacoteSelecionado.cotas > 1 ? 's' : ''} — R$${pacoteSelecionado.preco}`;

  showSection('numeros');
}

// ============================================================
// ESCOLHA DE NÚMEROS
// ============================================================

/**
 * Adiciona um número manualmente, verificando em tempo real no Firestore
 * se o número já está vendido ou pendente.
 */
async function adicionarNumero() {
  const input = document.getElementById('input-numero');
  const msgEl = document.getElementById('msg-numeros');
  const val   = input.value.trim();

  // Validações locais (rápidas, sem consultar o banco)
  if (!val || !/^\d+$/.test(val)) {
    showMsg(msgEl, 'error', 'Digite apenas números.');
    return;
  }
  if (val.length > 5) {
    showMsg(msgEl, 'error', 'Máximo 5 dígitos (00000 a 09047).');
    input.value = '';
    return;
  }

  const num    = val.padStart(5, '0');
  const numInt = parseInt(num, 10);

  if (numInt < 0 || numInt >= TOTAL_NUMEROS) {
    showMsg(msgEl, 'error', `Número deve estar entre 00000 e ${String(TOTAL_NUMEROS - 1).padStart(5, '0')}.`);
    input.value = '';
    return;
  }
  if (numerosEscolhidos.includes(num)) {
    showMsg(msgEl, 'error', `O número ${num} já foi adicionado por você.`);
    input.value = '';
    return;
  }
  if (numerosEscolhidos.length >= pacoteSelecionado.cotas) {
    showMsg(msgEl, 'error', `Limite de ${pacoteSelecionado.cotas} número(s) atingido.`);
    return;
  }

  // Consulta o banco para verificar disponibilidade em tempo real
  mostrarLoading('Verificando disponibilidade...');

  try {
    const dados    = await dbLer();
    const vendidos = dados.numerosVendidos  || [];
    const pendentes= dados.numerosPendentes || [];

    esconderLoading();

    // Número ocupado (vendido)
    if (vendidos.includes(num)) {
      showMsg(msgEl, 'error', `O número ${num} já foi vendido. Escolha outro.`);
      input.value = '';
      return;
    }

    // Número reservado (pendente por outro usuário)
    if (pendentes.includes(num)) {
      showMsg(msgEl, 'error', `O número ${num} está reservado. Escolha outro.`);
      input.value = '';
      return;
    }

    // Número disponível — adiciona à seleção local
    numerosEscolhidos.push(num);
    input.value = '';
    msgEl.classList.add('hidden');
    atualizarNumerosUI();

  } catch (e) {
    esconderLoading();
    showMsg(msgEl, 'error', 'Erro ao verificar número. Tente novamente.');
    console.error('Erro ao verificar número:', e);
  }
}

/**
 * Sorteia um número aleatório disponível (não vendido nem pendente)
 */
async function numeroAleatorio() {
  const msgEl = document.getElementById('msg-numeros');

  if (numerosEscolhidos.length >= pacoteSelecionado.cotas) {
    showMsg(msgEl, 'error', 'Limite de números atingido.');
    return;
  }

  mostrarLoading('Sorteando número disponível...');

  try {
    const dados    = await dbLer();
    const vendidos = dados.numerosVendidos  || [];
    const pendentes= dados.numerosPendentes || [];
    const ocupados = new Set([...vendidos, ...pendentes, ...numerosEscolhidos]);

    esconderLoading();

    // Tenta encontrar um número livre com até 1000 tentativas
    let num, tentativas = 0;
    do {
      num = String(Math.floor(Math.random() * TOTAL_NUMEROS)).padStart(5, '0');
      if (++tentativas > 1000) {
        showMsg(msgEl, 'error', 'Não foi possível encontrar um número disponível. Tente manualmente.');
        return;
      }
    } while (ocupados.has(num));

    numerosEscolhidos.push(num);
    msgEl.classList.add('hidden');
    atualizarNumerosUI();

  } catch (e) {
    esconderLoading();
    showMsg(msgEl, 'error', 'Erro ao sortear número. Tente novamente.');
    console.error('Erro no número aleatório:', e);
  }
}

/** Remove um número da seleção local */
function removerNumero(num) {
  numerosEscolhidos = numerosEscolhidos.filter(n => n !== num);
  atualizarNumerosUI();
}

/** Atualiza a interface visual dos números selecionados */
function atualizarNumerosUI() {
  const container = document.getElementById('numeros-escolhidos');
  if (!container) return;

  container.innerHTML = '';
  numerosEscolhidos.forEach(num => {
    const chip = document.createElement('div');
    chip.className = 'num-chip';
    chip.innerHTML = `${num} <span class="remove-chip" onclick="removerNumero('${num}')" title="Remover">✕</span>`;
    container.appendChild(chip);
  });

  const faltam      = pacoteSelecionado.cotas - numerosEscolhidos.length;
  const selecionados= numerosEscolhidos.length;

  document.getElementById('num-faltam').textContent       = faltam;
  document.getElementById('num-selecionados').textContent = selecionados;

  const btn = document.getElementById('btn-ir-pagamento');
  if (btn) {
    if (selecionados === pacoteSelecionado.cotas) {
      btn.classList.remove('hidden');
    } else {
      btn.classList.add('hidden');
    }
  }
}

// ============================================================
// PAGAMENTO
// ============================================================

/** Preenche o resumo da compra na tela de pagamento */
function preencherResumoPagamento() {
  if (!pacoteSelecionado) return;

  document.getElementById('pag-pacote').textContent  =
    `${pacoteSelecionado.cotas} cota${pacoteSelecionado.cotas > 1 ? 's' : ''}`;
  document.getElementById('pag-numeros').textContent =
    numerosEscolhidos.join(', ') || '—';
  document.getElementById('pag-total').textContent   =
    `R$ ${pacoteSelecionado.preco},00`;
}

/** Seleciona o método de pagamento e exibe os detalhes correspondentes */
function selecionarMetodo(metodo) {
  metodoPagamento = metodo;

  document.querySelectorAll('.metodo-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('metodo-' + metodo).classList.add('selected');

  document.getElementById('pag-pix').classList.add('hidden');
  document.getElementById('pag-dinheiro').classList.add('hidden');
  document.getElementById('pag-' + metodo).classList.remove('hidden');
}

/** Copia a chave Pix para a área de transferência */
function copiarPix() {
  const chave = '3e4ff6e6-4788-4fcb-8fde-03e23ffe2b2a';
  const msgEl = document.getElementById('msg-pagamento');

  navigator.clipboard.writeText(chave).then(() => {
    showMsg(msgEl, 'success', '✅ Chave Pix copiada!');
    setTimeout(() => msgEl.classList.add('hidden'), 2500);
  }).catch(() => {
    // Fallback para navegadores que não suportam clipboard API
    showMsg(msgEl, 'error', 'Não foi possível copiar. Copie manualmente: ' + chave);
  });
}

/**
 * Confirma o pedido usando transação atômica no Firestore.
 * Isso garante que nenhum número escolhido seja duplicado entre usuários.
 */
async function confirmarPagamento() {
  const msgEl = document.getElementById('msg-pagamento');

  if (!metodoPagamento) {
    showMsg(msgEl, 'error', 'Selecione uma forma de pagamento.');
    return;
  }

  // Validação do endereço para pagamento em dinheiro
  let enderecoCompleto = '';
  if (metodoPagamento === 'dinheiro') {
    const rua         = document.getElementById('end-rua').value.trim();
    const bairro      = document.getElementById('end-bairro').value.trim();
    const cidade      = document.getElementById('end-cidade').value.trim();
    const cep         = document.getElementById('end-cep').value.trim();
    const complemento = document.getElementById('end-complemento').value.trim();

    if (!rua)    { showMsg(msgEl, 'error', 'Informe a rua e número.'); return; }
    if (!bairro) { showMsg(msgEl, 'error', 'Informe o bairro.'); return; }
    if (!cidade) { showMsg(msgEl, 'error', 'Informe a cidade.'); return; }
    if (!cep)    { showMsg(msgEl, 'error', 'Informe o CEP.'); return; }

    enderecoCompleto = `${rua}, ${bairro}, ${cidade} — CEP: ${cep}${complemento ? ' (' + complemento + ')' : ''}`;
  }

  const usuario = getUsuarioLogado();
  if (!usuario) { showSection('login'); return; }

  // Verifica se ainda há números selecionados
  if (numerosEscolhidos.length === 0) {
    showMsg(msgEl, 'error', 'Nenhum número selecionado.');
    return;
  }

  mostrarLoading('Reservando seus números...');

  try {
    // Busca dados completos do usuário (para ter telefone atualizado)
    const dados         = await dbLer();
    const dadosUsuario  = dados.usuarios.find(u => u.email === usuario.email) || {};

    // Monta a transação
    const novaTransacao = {
      id      : 'TRX' + Date.now() + Math.random().toString(36).substr(2, 4).toUpperCase(),
      usuario : usuario.email,
      nome    : dadosUsuario.nome    || usuario.nome,
      telefone: dadosUsuario.tel     || usuario.tel || '—',
      endereco: enderecoCompleto || '—',
      numeros : [...numerosEscolhidos],
      cotas   : pacoteSelecionado.cotas,
      valor   : pacoteSelecionado.preco,
      metodo  : metodoPagamento === 'pix' ? 'Pix' : 'Dinheiro (visita)',
      data    : new Date().toLocaleString('pt-BR'),
      status  : 'Pendente'
    };

    // TRANSAÇÃO ATÔMICA: garante exclusividade dos números
    const resultado = await dbTransacao([...numerosEscolhidos], novaTransacao);

    esconderLoading();

    if (!resultado.sucesso) {
      if (resultado.numeroConflito) {
        showMsg(msgEl, 'error',
          `O número ${resultado.numeroConflito} foi reservado por outro usuário agora. Remova-o e tente novamente.`
        );
        // Remove o número conflitante da seleção local
        removerNumero(resultado.numeroConflito);
      } else {
        showMsg(msgEl, 'error', 'Erro ao registrar pedido. Tente novamente.');
      }
      return;
    }

    // Sucesso — exibe modal de confirmação
    const numerosStr = numerosEscolhidos.join(', ');
    document.getElementById('modal-text').textContent =
      `Seus números ${numerosStr} foram reservados com sucesso! Aguarde a confirmação do pagamento.`;

    document.getElementById('modal-sucesso').classList.remove('hidden');
    document.getElementById('modal-overlay').classList.remove('hidden');

    // Limpa o estado de compra
    pacoteSelecionado = null;
    numerosEscolhidos = [];
    metodoPagamento   = null;

    document.querySelectorAll('.pacote-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('pacote-selecionado-info').classList.add('hidden');

  } catch (e) {
    esconderLoading();
    showMsg(msgEl, 'error', 'Erro inesperado. Tente novamente.');
    console.error('Erro ao confirmar pagamento:', e);
  }
}

function fecharModal() {
  document.getElementById('modal-sucesso').classList.add('hidden');
  document.getElementById('modal-overlay').classList.add('hidden');
  showSection('conta');
}

// ============================================================
// MINHA CONTA — com onSnapshot (tempo real)
// ============================================================

/**
 * Renderiza a tela "Minha Conta" e inicia listener em tempo real.
 * O onSnapshot atualiza automaticamente quando o admin aprova/recusa.
 */
async function renderizarConta() {
  const usuario = getUsuarioLogado();
  if (!usuario)        { showSection('login'); return; }
  if (usuario.isAdmin) { showSection('admin'); return; }

  // Exibe informações do perfil imediatamente (dados da sessão)
  document.getElementById('conta-info').innerHTML = `
    <div class="conta-avatar">&#128100;</div>
    <div>
      <div class="conta-nome">${escapeHtml(usuario.nome)}</div>
      <div class="conta-email">${escapeHtml(usuario.email)}</div>
      <div class="conta-tel">Tel: ${escapeHtml(usuario.tel || '—')}</div>
    </div>
  `;

  mostrarLoading('Carregando seus dados...');

  // Cancela listener anterior se existir
  if (unsubscribeConta) {
    unsubscribeConta();
    unsubscribeConta = null;
  }

  try {
    const { onSnapshot } = await importFirestore();

    // Inicia escuta em tempo real
    unsubscribeConta = onSnapshot(getDbRef(), (snap) => {
      esconderLoading();

      const dados    = snap.exists() ? snap.data() : estadoVazio();
      const historico= dados.historico || [];
      const minhas   = historico.filter(t => t.usuario === usuario.email);

      renderizarDestaqueNumeros(minhas);
      renderizarListaRifas(minhas);
      renderizarHistorico(minhas);
    }, (error) => {
      esconderLoading();
      console.error('Erro no listener da conta:', error);
    });

  } catch (e) {
    esconderLoading();
    console.error('Erro ao renderizar conta:', e);
  }
}

/** Renderiza os números em destaque na tela da conta */
function renderizarDestaqueNumeros(minhas) {
  const numDestaque        = document.getElementById('conta-numeros-destaque');
  const confirmados        = minhas.filter(t => t.status === 'Confirmado').flatMap(t => t.numeros);
  const pendentes          = minhas.filter(t => t.status === 'Pendente').flatMap(t => t.numeros);

  let html = '';

  if (confirmados.length > 0) {
    html += `
      <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:0.5rem">
        Você tem <strong style="color:var(--verde)">${confirmados.length}</strong>
        número${confirmados.length > 1 ? 's' : ''} confirmado${confirmados.length > 1 ? 's' : ''}
        — Sorteio: <strong>21/06/2026 às 19h</strong>
      </div>
      <div class="conta-nums-lista">
        ${confirmados.map(n => `<span class="conta-num-big">${n}</span>`).join('')}
      </div>
    `;
  }

  if (pendentes.length > 0) {
    html += `
      <div style="font-size:0.85rem;color:#d97706;margin-top:0.8rem;margin-bottom:0.4rem">
        <strong>${pendentes.length}</strong>
        número${pendentes.length > 1 ? 's' : ''} aguardando confirmação de pagamento:
      </div>
      <div class="conta-nums-lista">
        ${pendentes.map(n => `<span class="conta-num-big" style="background:#d97706">${n}</span>`).join('')}
      </div>
    `;
  }

  if (!html) {
    html = `
      <div class="empty-state" style="padding:1rem">
        <div>🎟️</div>
        Você ainda não tem números.
        <a style="color:var(--verde);cursor:pointer" onclick="showSection('home')">
          Participar agora!
        </a>
      </div>
    `;
  }

  if (numDestaque) numDestaque.innerHTML = html;
}

/** Renderiza a lista de rifas compradas na tela da conta */
function renderizarListaRifas(minhas) {
  const el = document.getElementById('conta-rifas');
  if (!el) return;

  if (minhas.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <div>🎟️</div>
        Nenhuma rifa ainda.
        <a style="color:var(--verde);cursor:pointer" onclick="showSection('home')">Participar agora!</a>
      </div>
    `;
    return;
  }

  el.innerHTML = minhas.map(t => {
    const classeExtra = t.status === 'Pendente'  ? 'rifa-pendente'
                      : t.status === 'Recusado'  ? 'rifa-recusada'
                      : '';

    const estiloNum = t.status === 'Pendente'  ? 'background:#fef3c7;color:#92400e'
                    : t.status === 'Recusado'  ? 'background:#fef2f2;color:#dc2626'
                    : '';

    const enderecoHtml = t.metodo === 'Dinheiro (visita)' && t.endereco !== '—'
      ? `<div class="rifa-data" style="margin-top:0.2rem">${escapeHtml(t.endereco)}</div>`
      : '';

    return `
      <div class="rifa-item ${classeExtra}">
        <div>
          <div class="rifa-numeros">
            ${t.numeros.map(n => `<span class="rifa-num-badge" style="${estiloNum}">${n}</span>`).join('')}
          </div>
          <div class="rifa-data">${escapeHtml(t.data)} — ${escapeHtml(t.metodo)}</div>
          ${enderecoHtml}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.4rem">
          <div class="rifa-valor">R$ ${t.valor},00</div>
          <div class="status-badge status-${t.status.toLowerCase().replace(' ', '_')}">
            ${badgeIcon(t.status)} ${t.status}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/** Renderiza o histórico de transações na tela da conta */
function renderizarHistorico(minhas) {
  const el = document.getElementById('conta-historico');
  if (!el) return;

  if (minhas.length === 0) {
    el.innerHTML = `<div class="empty-state"><div>📋</div>Nenhuma transação ainda.</div>`;
    return;
  }

  el.innerHTML = minhas.map(t => `
    <div class="historico-item">
      <div>
        <div>${t.cotas} cota${t.cotas > 1 ? 's' : ''} — Números: ${t.numeros.join(', ')}</div>
        <div class="hist-desc">${escapeHtml(t.data)} — ${escapeHtml(t.metodo)} — ID: ${escapeHtml(t.id)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap">
        <div class="hist-valor">R$ ${t.valor},00</div>
        <div class="status-badge status-${t.status.toLowerCase().replace(' ', '_')}">
          ${badgeIcon(t.status)} ${t.status}
        </div>
      </div>
    </div>
  `).join('');
}

// ============================================================
// PAINEL ADMIN — com onSnapshot (tempo real)
// ============================================================

/**
 * Renderiza o painel admin e inicia listener em tempo real.
 * Qualquer alteração no Firestore atualiza automaticamente
 * a tabela, pendentes e estatísticas.
 */
async function renderizarAdmin() {
  const usuario = getUsuarioLogado();
  if (!usuario || !usuario.isAdmin) { showSection('login'); return; }

  mostrarLoading('Carregando painel administrativo...');

  // Cancela listener anterior se existir
  if (unsubscribeAdmin) {
    unsubscribeAdmin();
    unsubscribeAdmin = null;
  }

  try {
    const { onSnapshot } = await importFirestore();

    // Inicia escuta em tempo real
    unsubscribeAdmin = onSnapshot(getDbRef(), (snap) => {
      esconderLoading();

      const dados    = snap.exists() ? snap.data() : estadoVazio();
      const historico= dados.historico || [];
      tabelaDados    = historico;

      // Calcula estatísticas apenas com transações confirmadas
      const confirmadas = historico.filter(t => t.status === 'Confirmado');
      const pendentes   = historico.filter(t => t.status === 'Pendente');
      const totalCotas  = confirmadas.reduce((s, t) => s + t.cotas, 0);
      const compradores = new Set(confirmadas.map(t => t.usuario)).size;
      const arrecadado  = confirmadas.reduce((s, t) => s + t.valor, 0);
      const disponiveis = Math.max(0, TOTAL_NUMEROS - totalCotas);

      // Atualiza cards de estatísticas
      document.getElementById('adm-total-cotas').textContent      = totalCotas;
      document.getElementById('adm-disponiveis').textContent      = disponiveis;
      document.getElementById('adm-total-compradores').textContent= compradores;
      document.getElementById('adm-total-arrecadado').textContent = `R$ ${arrecadado},00`;

      // Badge de pendentes
      const badge = document.getElementById('badge-pendentes');
      if (pendentes.length > 0) {
        badge.textContent = pendentes.length;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }

      renderizarPendentes(pendentes);
      renderizarTabela(historico);

    }, (error) => {
      esconderLoading();
      console.error('Erro no listener admin:', error);
    });

  } catch (e) {
    esconderLoading();
    console.error('Erro ao renderizar admin:', e);
  }
}

/** Renderiza a lista de pagamentos pendentes */
function renderizarPendentes(pendentes) {
  const lista = document.getElementById('admin-pendentes-lista');
  if (!lista) return;

  if (pendentes.length === 0) {
    lista.innerHTML = `
      <div class="empty-state" style="padding:1rem">
        <div>✅</div>Nenhum pagamento pendente.
      </div>
    `;
    return;
  }

  lista.innerHTML = pendentes.map(t => `
    <div class="pendente-card" id="pendente-${t.id}">
      <div class="pendente-info">
        <div class="pendente-nome">
          <strong>${escapeHtml(t.nome)}</strong>
          <span class="pendente-metodo-badge">${escapeHtml(t.metodo)}</span>
        </div>
        <div class="pendente-detalhes">
          Email: ${escapeHtml(t.usuario)} — Tel: ${escapeHtml(t.telefone)}
        </div>
        <div class="pendente-detalhes">
          Números: <strong>${t.numeros.join(', ')}</strong>
          — ${t.cotas} cota${t.cotas > 1 ? 's' : ''}
          — <strong style="color:var(--verde)">R$ ${t.valor},00</strong>
        </div>
        ${t.metodo === 'Dinheiro (visita)' && t.endereco !== '—'
          ? `<div class="pendente-detalhes">Endereço: ${escapeHtml(t.endereco)}</div>`
          : ''}
        <div class="pendente-detalhes" style="color:var(--text-muted)">
          ${escapeHtml(t.data)} — ID: ${escapeHtml(t.id)}
        </div>
      </div>
      <div class="pendente-acoes">
        <button class="btn-aprovar" onclick="aprovarPagamento('${t.id}')">✅ Confirmar</button>
        <button class="btn-recusar" onclick="recusarPagamento('${t.id}')">❌ Recusar</button>
      </div>
    </div>
  `).join('');
}

/**
 * Aprova um pagamento:
 * 1. Move os números de pendentes → vendidos
 * 2. Atualiza o status da transação
 * Usa transação atômica para evitar condições de corrida.
 */
async function aprovarPagamento(id) {
  mostrarLoading('Aprovando pagamento...');

  try {
    const { runTransaction } = await importFirestore();

    await runTransaction(window.db, async (transaction) => {
      const snap  = await transaction.get(getDbRef());
      const dados = snap.exists() ? snap.data() : estadoVazio();

      const idx = dados.historico.findIndex(t => t.id === id);
      if (idx === -1) throw new Error('Transação não encontrada.');

      const numerosAprovados = dados.historico[idx].numeros;

      // Move números: pendentes → vendidos
      const pendentes        = (dados.numerosPendentes || []).filter(n => !numerosAprovados.includes(n));
      const vendidos         = [...(dados.numerosVendidos || []), ...numerosAprovados];
      dados.historico[idx].status = 'Confirmado';

      transaction.set(getDbRef(), {
        ...dados,
        numerosVendidos  : vendidos,
        numerosPendentes : pendentes,
        historico        : dados.historico
      });
    });

    esconderLoading();

    // Animação de saída do card
    animarSaidaCard('pendente-' + id, 'right');

  } catch (e) {
    esconderLoading();
    alert('Erro ao aprovar pagamento: ' + e.message);
    console.error('Erro ao aprovar:', e);
  }
}

/**
 * Recusa um pagamento:
 * 1. Remove os números da lista de pendentes (libera para outros)
 * 2. Atualiza o status da transação
 */
async function recusarPagamento(id) {
  if (!confirm('Tem certeza que deseja RECUSAR este pagamento?\nOs números serão liberados para outros usuários.')) return;

  mostrarLoading('Recusando pagamento...');

  try {
    const { runTransaction } = await importFirestore();

    await runTransaction(window.db, async (transaction) => {
      const snap  = await transaction.get(getDbRef());
      const dados = snap.exists() ? snap.data() : estadoVazio();

      const idx = dados.historico.findIndex(t => t.id === id);
      if (idx === -1) throw new Error('Transação não encontrada.');

      const numerosRecusados = dados.historico[idx].numeros;

      // Remove números da lista de pendentes (libera para outros)
      const pendentes = (dados.numerosPendentes || []).filter(n => !numerosRecusados.includes(n));
      dados.historico[idx].status = 'Recusado';

      transaction.set(getDbRef(), {
        ...dados,
        numerosPendentes: pendentes,
        historico       : dados.historico
      });
    });

    esconderLoading();
    animarSaidaCard('pendente-' + id, 'left');

  } catch (e) {
    esconderLoading();
    alert('Erro ao recusar pagamento: ' + e.message);
    console.error('Erro ao recusar:', e);
  }
}

/** Anima a saída de um card de pendente */
function animarSaidaCard(cardId, direcao) {
  const card = document.getElementById(cardId);
  if (card) {
    card.style.transition = 'all 0.4s ease';
    card.style.opacity    = '0';
    card.style.transform  = `translateX(${direcao === 'right' ? '40px' : '-40px'})`;
    // O onSnapshot vai atualizar a lista automaticamente
  }
}

/** Renderiza a tabela completa de compradores */
function renderizarTabela(dados) {
  const tbody = document.getElementById('admin-tbody');
  const vazio = document.getElementById('admin-vazio');
  if (!tbody || !vazio) return;

  if (dados.length === 0) {
    tbody.innerHTML = '';
    vazio.classList.remove('hidden');
    return;
  }

  vazio.classList.add('hidden');

  tbody.innerHTML = dados.map(t => `
    <tr>
      <td><strong>${escapeHtml(t.nome || '—')}</strong></td>
      <td>${escapeHtml(t.usuario)}</td>
      <td>${escapeHtml(t.telefone || '—')}</td>
      <td class="end-cell">${escapeHtml(t.endereco || '—')}</td>
      <td>${t.numeros.map(n => `<span class="num-badge">${n}</span>`).join(' ')}</td>
      <td><strong>${t.cotas}</strong></td>
      <td class="valor-badge">R$ ${t.valor},00</td>
      <td>
        <span class="metodo-badge ${t.metodo === 'Dinheiro (visita)' ? 'metodo-dinheiro' : ''}">
          ${escapeHtml(t.metodo)}
        </span>
      </td>
      <td>
        <span class="status-badge status-${t.status.toLowerCase().replace(' ', '_')}">
          ${badgeIcon(t.status)} ${t.status}
        </span>
      </td>
      <td style="white-space:nowrap;font-size:0.8rem">${escapeHtml(t.data)}</td>
      <td class="id-badge">${escapeHtml(t.id)}</td>
      <td>
        ${t.status === 'Pendente'
          ? `<div style="display:flex;gap:0.3rem">
               <button class="btn-tabela-aprovar" onclick="aprovarPagamento('${t.id}')">✅</button>
               <button class="btn-tabela-recusar" onclick="recusarPagamento('${t.id}')">❌</button>
             </div>`
          : `<span style="font-size:0.75rem;color:var(--text-muted)">
               ${t.status === 'Confirmado' ? '✅ Aprovado' : '❌ Recusado'}
             </span>`
        }
      </td>
    </tr>
  `).join('');
}

/** Filtra a tabela admin pelo termo de busca */
function filtrarTabela() {
  const termo = document.getElementById('admin-search').value.toLowerCase().trim();

  if (!termo) {
    renderizarTabela(tabelaDados);
    return;
  }

  const filtrado = tabelaDados.filter(t =>
    (t.nome      || '').toLowerCase().includes(termo) ||
    (t.usuario   || '').toLowerCase().includes(termo) ||
    (t.telefone  || '').includes(termo)               ||
    (t.endereco  || '').toLowerCase().includes(termo) ||
    t.numeros.some(n => n.includes(termo))
  );

  renderizarTabela(filtrado);
}

// ============================================================
// EXPORTAR CSV
// ============================================================
async function exportarCSV() {
  mostrarLoading('Exportando dados...');

  try {
    const dados    = await dbLer();
    const historico= dados.historico || [];
    esconderLoading();

    if (historico.length === 0) {
      alert('Nenhuma transação para exportar.');
      return;
    }

    const cab = ['ID', 'Nome', 'E-mail', 'Telefone', 'Endereço', 'Números', 'Cotas', 'Valor (R$)', 'Método', 'Data', 'Status'];

    const linhas = historico.map(t => [
      t.id,
      `"${(t.nome     || '').replace(/"/g, '""')}"`,
      t.usuario,
      t.telefone || '—',
      `"${(t.endereco || '').replace(/"/g, '""')}"`,
      `"${t.numeros.join(', ')}"`,
      t.cotas,
      t.valor,
      t.metodo,
      `"${t.data}"`,
      t.status
    ].join(';'));

    // BOM para compatibilidade com Excel (UTF-8)
    const csv  = '\uFEFF' + [cab.join(';'), ...linhas].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const data = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');

    a.href     = url;
    a.download = `rifas_${data}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

  } catch (e) {
    esconderLoading();
    alert('Erro ao exportar CSV: ' + e.message);
    console.error('Erro ao exportar:', e);
  }
}

// ============================================================
// LIMPAR TODOS OS DADOS (ADMIN)
// ============================================================
function confirmarLimpar() {
  document.getElementById('modal-limpar').classList.remove('hidden');
  document.getElementById('modal-limpar-overlay').classList.remove('hidden');
}

function fecharModalLimpar() {
  document.getElementById('modal-limpar').classList.add('hidden');
  document.getElementById('modal-limpar-overlay').classList.add('hidden');
}

async function limparTodosDados() {
  mostrarLoading('Limpando todos os dados...');

  try {
    await dbSalvar(estadoVazio());
    esconderLoading();
    fecharModalLimpar();
    // O onSnapshot vai atualizar automaticamente a UI
  } catch (e) {
    esconderLoading();
    alert('Erro ao limpar dados: ' + e.message);
    console.error('Erro ao limpar:', e);
  }
}

// ============================================================
// ESTATÍSTICAS DO HERO (para admin logado)
// ============================================================
async function atualizarEstatisticasHome() {
  try {
    const dados   = await dbLer();
    const vendidos= dados.numerosVendidos || [];
    const elV = document.getElementById('stat-vendidas');
    const elD = document.getElementById('stat-disponiveis');
    if (elV) elV.textContent = vendidos.length;
    if (elD) elD.textContent = Math.max(0, TOTAL_NUMEROS - vendidos.length);
  } catch (e) {
    console.error('Erro ao atualizar estatísticas do hero:', e);
  }
}

// ============================================================
// UTILITÁRIOS
// ============================================================

/**
 * Exibe uma mensagem de feedback ao usuário.
 * @param {HTMLElement} el   - Elemento onde a mensagem será exibida
 * @param {'error'|'success'} tipo - Tipo da mensagem
 * @param {string} texto     - Conteúdo da mensagem
 */
function showMsg(el, tipo, texto) {
  if (!el) return;
  el.className   = 'msg ' + tipo;
  el.textContent = texto;
  el.classList.remove('hidden');
}

/** Máscara de telefone: (XX) XXXXX-XXXX */
function mascaraTel(input) {
  let v = input.value.replace(/\D/g, '').substring(0, 11);
  if      (v.length > 6) v = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
  else if (v.length > 2) v = `(${v.slice(0,2)}) ${v.slice(2)}`;
  else if (v.length > 0) v = `(${v}`;
  input.value = v;
}

/** Máscara de CEP: XXXXX-XXX */
function mascaraCep(input) {
  let v = input.value.replace(/\D/g, '').substring(0, 8);
  if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5);
  input.value = v;
}

/** Retorna ícone/texto para o badge de status */
function badgeIcon(status) {
  if (status === 'Confirmado') return '✅';
  if (status === 'Recusado')   return '❌';
  return '⏳';
}

/**
 * Escapa caracteres HTML para prevenir XSS.
 * Sempre use esta função ao inserir dados do usuário no DOM via innerHTML.
 */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}
