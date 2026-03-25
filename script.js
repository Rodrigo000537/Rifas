// Rifa Solidária — Associação de Combate ao Câncer de Marília
// Admin: e-mail = "admin" | senha = "admin123"

const ADMIN_EMAIL   = 'admin';
const ADMIN_SENHA   = 'admin123';
const TOTAL_NUMEROS = 9048;

// ---- JSONBIN CONFIG ----
const JSONBIN_KEY = '$2a$10$oES4eCA3W8SA9988OpW8a.od/Bz/.lBXRLxV53j7XRAST8qPsZiG.';
const JSONBIN_URL = 'https://api.jsonbin.io/v3/b';
const BIN_ID      = '69c45538b7ec241ddca2c674';

// Estado local (apenas sessão)
let pacoteSelecionado = null;
let numerosEscolhidos = [];
let metodoPagamento   = null;
let tabelaDados       = [];
let dbCache           = null;

function estadoVazio() {
  return { usuarios: [], numerosVendidos: [], historico: [] };
}

// ---- JSONBIN: LER ----
async function dbLer() {
  try {
    const res  = await fetch(`${JSONBIN_URL}/${BIN_ID}/latest`, {
      headers: { 'X-Master-Key': JSONBIN_KEY }
    });
    const json = await res.json();
    dbCache = json.record || estadoVazio();
    return dbCache;
  } catch (e) {
    console.error('Erro ao ler JSONBin:', e);
    return dbCache || estadoVazio();
  }
}

// ---- JSONBIN: SALVAR ----
async function dbSalvar(dados) {
  dbCache = dados;
  try {
    await fetch(`${JSONBIN_URL}/${BIN_ID}`, {
      method : 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': JSONBIN_KEY
      },
      body: JSON.stringify(dados)
    });
  } catch (e) {
    console.error('Erro ao salvar JSONBin:', e);
  }
}

// ---- LOADING OVERLAY ----
function mostrarLoading(msg) {
  let el = document.getElementById('loading-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loading-overlay';
    el.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.45);
      backdrop-filter:blur(4px);z-index:9999;
      display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;
    `;
    el.innerHTML = `
      <div style="width:44px;height:44px;border:4px solid rgba(255,255,255,0.3);
        border-top-color:#22c55e;border-radius:50%;animation:spin 0.8s linear infinite"></div>
      <div id="loading-msg" style="color:white;font-family:'Syne',sans-serif;font-weight:700;font-size:1rem"></div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;
    document.body.appendChild(el);
  }
  document.getElementById('loading-msg').textContent = msg || 'Carregando...';
  el.style.display = 'flex';
}

function esconderLoading() {
  const el = document.getElementById('loading-overlay');
  if (el) el.style.display = 'none';
}

// ---- INIT ----
document.addEventListener('DOMContentLoaded', async () => {
  mostrarLoading('Conectando ao banco de dados...');
  await dbLer();
  esconderLoading();
  verificarLogin();
  showSection('home');
});

// ---- NAVEGAÇÃO ----
function showSection(nome) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const sec = document.getElementById('sec-' + nome);
  if (sec) sec.classList.add('active');
  if (nome === 'conta')     renderizarConta();
  if (nome === 'pagamento') preencherResumoPagamento();
  if (nome === 'admin')     renderizarAdmin();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---- NAVBAR ----
function verificarLogin() {
  const usuario   = getUsuarioLogado();
  const btnLogin  = document.getElementById('btn-login-nav');
  const btnConta  = document.getElementById('btn-minha-conta');
  const btnLogout = document.getElementById('btn-logout');
  const navUser   = document.getElementById('nav-user-info');
  const statsAdmin= document.getElementById('hero-stats-admin');

  if (usuario) {
    btnLogin.classList.add('hidden');
    btnLogout.classList.remove('hidden');
    navUser.classList.remove('hidden');

    if (usuario.isAdmin) {
      btnConta.textContent = 'Painel Admin';
      btnConta.onclick = () => showSection('admin');
      btnConta.classList.remove('hidden');
      navUser.textContent = 'Admin';
      if (statsAdmin) {
        statsAdmin.classList.remove('hidden');
        atualizarEstatisticas();
      }
    } else {
      btnConta.textContent = 'Minha Conta';
      btnConta.onclick = () => showSection('conta');
      btnConta.classList.remove('hidden');
      navUser.textContent = 'Ola, ' + usuario.nome.split(' ')[0];
      if (statsAdmin) statsAdmin.classList.add('hidden');
    }
  } else {
    btnLogin.classList.remove('hidden');
    btnConta.classList.add('hidden');
    btnLogout.classList.add('hidden');
    navUser.classList.add('hidden');
    if (statsAdmin) statsAdmin.classList.add('hidden');
  }
}

function getUsuarioLogado() {
  const logado = sessionStorage.getItem('rifa_logado');
  if (!logado) return null;
  try { return JSON.parse(logado); } catch { return null; }
}

// ---- CADASTRO ----
async function cadastrar() {
  const nome  = document.getElementById('cad-nome').value.trim();
  const email = document.getElementById('cad-email').value.trim().toLowerCase();
  const senha = document.getElementById('cad-senha').value;
  const tel   = document.getElementById('cad-tel').value.trim();
  const msgEl = document.getElementById('msg-cadastro');

  if (!nome || nome.length < 3)         { showMsg(msgEl, 'error', 'Informe seu nome completo (minimo 3 caracteres).'); return; }
  if (!email.endsWith('@gmail.com'))     { showMsg(msgEl, 'error', 'Use um e-mail Gmail (@gmail.com).'); return; }
  if (senha.length < 6)                  { showMsg(msgEl, 'error', 'Senha deve ter pelo menos 6 caracteres.'); return; }
  if (tel.replace(/\D/g,'').length < 10){ showMsg(msgEl, 'error', 'Informe um numero de telefone valido.'); return; }

  mostrarLoading('Criando sua conta...');
  const db = await dbLer();

  if (db.usuarios.find(u => u.email === email)) {
    esconderLoading();
    showMsg(msgEl, 'error', 'E-mail ja cadastrado. Faca login.');
    return;
  }

  db.usuarios.push({ nome, email, senha, tel, criadoEm: new Date().toISOString() });
  await dbSalvar(db);
  esconderLoading();

  sessionStorage.setItem('rifa_logado', JSON.stringify({ nome, email, tel, isAdmin: false }));
  showMsg(msgEl, 'success', 'Conta criada! Redirecionando...');
  verificarLogin();
  setTimeout(() => showSection('home'), 1400);
}

// ---- LOGIN ----
async function fazerLogin() {
  const emailInput = document.getElementById('login-email').value.trim().toLowerCase();
  const senha      = document.getElementById('login-senha').value;
  const msgEl      = document.getElementById('msg-login');

  if (!emailInput || !senha) { showMsg(msgEl, 'error', 'Preencha e-mail e senha.'); return; }

  if (emailInput === ADMIN_EMAIL && senha === ADMIN_SENHA) {
    sessionStorage.setItem('rifa_logado', JSON.stringify({ nome: 'Administrador', email: ADMIN_EMAIL, isAdmin: true }));
    showMsg(msgEl, 'success', 'Acesso admin liberado!');
    verificarLogin();
    setTimeout(() => showSection('admin'), 1000);
    return;
  }

  mostrarLoading('Verificando credenciais...');
  const db      = await dbLer();
  const usuario = db.usuarios.find(u => u.email === emailInput && u.senha === senha);
  esconderLoading();

  if (!usuario) { showMsg(msgEl, 'error', 'E-mail ou senha incorretos.'); return; }

  sessionStorage.setItem('rifa_logado', JSON.stringify({ nome: usuario.nome, email: usuario.email, tel: usuario.tel, isAdmin: false }));
  showMsg(msgEl, 'success', 'Bem-vindo, ' + usuario.nome.split(' ')[0] + '!');
  verificarLogin();
  setTimeout(() => showSection('home'), 1200);
}

function logout() {
  sessionStorage.removeItem('rifa_logado');
  pacoteSelecionado = null;
  numerosEscolhidos = [];
  metodoPagamento   = null;
  verificarLogin();
  showSection('home');
}

// ---- PACOTES ----
function selecionarPacote(el) {
  document.querySelectorAll('.pacote-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  const cotas = parseInt(el.dataset.cotas);
  const preco = parseInt(el.dataset.preco);
  pacoteSelecionado = { cotas, preco };
  numerosEscolhidos = [];
  document.getElementById('pacote-info-text').textContent = `${cotas} cota${cotas > 1 ? 's' : ''} por R$${preco},00`;
  document.getElementById('pacote-selecionado-info').classList.remove('hidden');
}

function handleComprar() {
  const usuario = getUsuarioLogado();
  if (!usuario)          { showSection('cadastro'); return; }
  if (usuario.isAdmin)   { alert('Voce esta logado como administrador.'); return; }
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
    `${pacoteSelecionado.cotas} cota${pacoteSelecionado.cotas > 1 ? 's' : ''} - R$${pacoteSelecionado.preco}`;
  showSection('numeros');
}

// ---- NUMEROS ----
async function adicionarNumero() {
  const input = document.getElementById('input-numero');
  const msgEl = document.getElementById('msg-numeros');
  const val   = input.value.trim();

  if (!val || !/^\d+$/.test(val))  { showMsg(msgEl, 'error', 'Digite apenas numeros.'); return; }
  if (val.length > 5)               { showMsg(msgEl, 'error', 'Maximo 5 digitos (00000 a 09047).'); input.value = ''; return; }

  const num    = val.padStart(5, '0');
  const numInt = parseInt(num);

  if (numInt < 0 || numInt >= TOTAL_NUMEROS) {
    showMsg(msgEl, 'error', `Numero deve estar entre 00000 e ${String(TOTAL_NUMEROS - 1).padStart(5,'0')}.`);
    input.value = ''; return;
  }
  if (numerosEscolhidos.includes(num)) {
    showMsg(msgEl, 'error', `O numero ${num} ja foi adicionado por voce.`);
    input.value = ''; return;
  }
  if (numerosEscolhidos.length >= pacoteSelecionado.cotas) {
    showMsg(msgEl, 'error', `Limite de ${pacoteSelecionado.cotas} numero(s) atingido.`);
    return;
  }

  mostrarLoading('Verificando disponibilidade...');
  const db = await dbLer();
  esconderLoading();

  if ((db.numerosVendidos || []).includes(num)) {
    showMsg(msgEl, 'error', `O numero ${num} ja foi vendido. Escolha outro.`);
    input.value = ''; return;
  }

  numerosEscolhidos.push(num);
  input.value = '';
  msgEl.classList.add('hidden');
  atualizarNumerosUI();
}

async function numeroAleatorio() {
  const msgEl = document.getElementById('msg-numeros');
  if (numerosEscolhidos.length >= pacoteSelecionado.cotas) { showMsg(msgEl, 'error', 'Limite atingido.'); return; }

  mostrarLoading('Sorteando numero...');
  const db       = await dbLer();
  const vendidos = db.numerosVendidos || [];
  esconderLoading();

  let tentativas = 0, num;
  do {
    num = String(Math.floor(Math.random() * TOTAL_NUMEROS)).padStart(5, '0');
    if (++tentativas > 500) { showMsg(msgEl, 'error', 'Nenhum numero disponivel. Tente manualmente.'); return; }
  } while (vendidos.includes(num) || numerosEscolhidos.includes(num));

  numerosEscolhidos.push(num);
  msgEl.classList.add('hidden');
  atualizarNumerosUI();
}

function removerNumero(num) {
  numerosEscolhidos = numerosEscolhidos.filter(n => n !== num);
  atualizarNumerosUI();
}

function atualizarNumerosUI() {
  const container = document.getElementById('numeros-escolhidos');
  container.innerHTML = '';
  numerosEscolhidos.forEach(num => {
    const chip = document.createElement('div');
    chip.className = 'num-chip';
    chip.innerHTML = `${num} <span class="remove-chip" onclick="removerNumero('${num}')">x</span>`;
    container.appendChild(chip);
  });
  document.getElementById('num-faltam').textContent       = pacoteSelecionado.cotas - numerosEscolhidos.length;
  document.getElementById('num-selecionados').textContent = numerosEscolhidos.length;
  const btn = document.getElementById('btn-ir-pagamento');
  numerosEscolhidos.length === pacoteSelecionado.cotas ? btn.classList.remove('hidden') : btn.classList.add('hidden');
}

// ---- PAGAMENTO ----
function preencherResumoPagamento() {
  if (!pacoteSelecionado) return;
  document.getElementById('pag-pacote').textContent  = `${pacoteSelecionado.cotas} cota${pacoteSelecionado.cotas > 1 ? 's' : ''}`;
  document.getElementById('pag-numeros').textContent = numerosEscolhidos.join(', ') || '-';
  document.getElementById('pag-total').textContent   = `R$ ${pacoteSelecionado.preco},00`;
}

function selecionarMetodo(metodo) {
  metodoPagamento = metodo;
  document.querySelectorAll('.metodo-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('metodo-' + metodo).classList.add('selected');
  document.getElementById('pag-pix').classList.add('hidden');
  document.getElementById('pag-dinheiro').classList.add('hidden');
  document.getElementById('pag-' + metodo).classList.remove('hidden');
}

function copiarPix() {
  navigator.clipboard.writeText('3e4ff6e6-4788-4fcb-8fde-03e23ffe2b2a').then(() => {
    const msgEl = document.getElementById('msg-pagamento');
    showMsg(msgEl, 'success', 'Chave Pix copiada!');
    setTimeout(() => msgEl.classList.add('hidden'), 2000);
  });
}

async function confirmarPagamento() {
  const msgEl = document.getElementById('msg-pagamento');
  if (!metodoPagamento) { showMsg(msgEl, 'error', 'Selecione uma forma de pagamento.'); return; }

  let enderecoCompleto = '';

  if (metodoPagamento === 'dinheiro') {
    const rua         = document.getElementById('end-rua').value.trim();
    const bairro      = document.getElementById('end-bairro').value.trim();
    const cidade      = document.getElementById('end-cidade').value.trim();
    const cep         = document.getElementById('end-cep').value.trim();
    const complemento = document.getElementById('end-complemento').value.trim();

    if (!rua)    { showMsg(msgEl, 'error', 'Informe a rua e numero.'); return; }
    if (!bairro) { showMsg(msgEl, 'error', 'Informe o bairro.'); return; }
    if (!cidade) { showMsg(msgEl, 'error', 'Informe a cidade.'); return; }
    if (!cep)    { showMsg(msgEl, 'error', 'Informe o CEP.'); return; }

    enderecoCompleto = `${rua}, ${bairro}, ${cidade} - CEP: ${cep}${complemento ? ' (' + complemento + ')' : ''}`;
  }

  const usuario = getUsuarioLogado();
  if (!usuario) { showSection('login'); return; }

  mostrarLoading('Registrando seu pedido...');
  const db             = await dbLer();
  const dadosCompletos = db.usuarios.find(u => u.email === usuario.email) || {};

  const novaTransacao = {
    id      : 'TRX' + Date.now(),
    usuario : usuario.email,
    nome    : dadosCompletos.nome || usuario.nome,
    telefone: dadosCompletos.tel  || usuario.tel || '-',
    endereco: enderecoCompleto || '-',
    numeros : [...numerosEscolhidos],
    cotas   : pacoteSelecionado.cotas,
    valor   : pacoteSelecionado.preco,
    metodo  : metodoPagamento === 'pix' ? 'Pix' : 'Dinheiro (visita)',
    data    : new Date().toLocaleString('pt-BR'),
    status  : 'Pendente'
  };

  db.historico.push(novaTransacao);
  await dbSalvar(db);
  esconderLoading();

  const numerosStr = numerosEscolhidos.join(', ');
  document.getElementById('modal-text').textContent =
    `Seus numeros ${numerosStr} foram reservados e seu pagamento esta em analise!`;

  document.getElementById('modal-sucesso').classList.remove('hidden');
  document.getElementById('modal-overlay').classList.remove('hidden');

  pacoteSelecionado = null;
  numerosEscolhidos = [];
  metodoPagamento   = null;
  document.querySelectorAll('.pacote-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('pacote-selecionado-info').classList.add('hidden');
}

function fecharModal() {
  document.getElementById('modal-sucesso').classList.add('hidden');
  document.getElementById('modal-overlay').classList.add('hidden');
  showSection('conta');
}

// ---- MINHA CONTA ----
async function renderizarConta() {
  const usuario = getUsuarioLogado();
  if (!usuario)        { showSection('login'); return; }
  if (usuario.isAdmin) { showSection('admin'); return; }

  document.getElementById('conta-info').innerHTML = `
    <div class="conta-avatar">&#128100;</div>
    <div>
      <div class="conta-nome">${escapeHtml(usuario.nome)}</div>
      <div class="conta-email">${escapeHtml(usuario.email)}</div>
      <div class="conta-tel">Tel: ${escapeHtml(usuario.tel || '-')}</div>
    </div>`;

  mostrarLoading('Carregando seus dados...');
  const db  = await dbLer();
  esconderLoading();

  const historico          = db.historico || [];
  const minhas             = historico.filter(t => t.usuario === usuario.email);
  const todosNums          = minhas.filter(t => t.status === 'Confirmado').flatMap(t => t.numeros);
  const todosNumsPendentes = minhas.filter(t => t.status === 'Pendente').flatMap(t => t.numeros);
  const numDestaque        = document.getElementById('conta-numeros-destaque');

  let htmlDestaque = '';
  if (todosNums.length > 0) {
    htmlDestaque += `<div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:0.5rem">
      Voce tem <strong style="color:var(--verde)">${todosNums.length}</strong> numero${todosNums.length > 1 ? 's' : ''} confirmado${todosNums.length > 1 ? 's' : ''} - Sorteio: <strong>21/06/2026 as 19h</strong>
    </div>
    <div class="conta-nums-lista">${todosNums.map(n => `<span class="conta-num-big">${n}</span>`).join('')}</div>`;
  }
  if (todosNumsPendentes.length > 0) {
    htmlDestaque += `<div style="font-size:0.85rem;color:#d97706;margin-top:0.8rem;margin-bottom:0.4rem">
      <strong>${todosNumsPendentes.length}</strong> numero${todosNumsPendentes.length > 1 ? 's' : ''} aguardando confirmacao de pagamento:
    </div>
    <div class="conta-nums-lista">${todosNumsPendentes.map(n => `<span class="conta-num-big" style="background:#d97706">${n}</span>`).join('')}</div>`;
  }
  if (!htmlDestaque) {
    htmlDestaque = `<div class="empty-state" style="padding:1rem"><div>&#127967;</div>Voce ainda nao tem numeros. <a style="color:var(--verde);cursor:pointer" onclick="showSection('home')">Participar agora!</a></div>`;
  }
  numDestaque.innerHTML = htmlDestaque;

  document.getElementById('conta-rifas').innerHTML = minhas.length === 0
    ? `<div class="empty-state"><div>&#127967;</div>Nenhuma rifa ainda. <a style="color:var(--verde);cursor:pointer" onclick="showSection('home')">Participar agora!</a></div>`
    : minhas.map(t => `
      <div class="rifa-item ${t.status === 'Pendente' ? 'rifa-pendente' : t.status === 'Recusado' ? 'rifa-recusada' : ''}">
        <div>
          <div class="rifa-numeros">${t.numeros.map(n => `<span class="rifa-num-badge" style="${t.status==='Pendente'?'background:#fef3c7;color:#92400e':t.status==='Recusado'?'background:#fef2f2;color:#dc2626':''}">${n}</span>`).join('')}</div>
          <div class="rifa-data">${t.data} - ${t.metodo}</div>
          ${t.metodo === 'Dinheiro (visita)' ? `<div class="rifa-data" style="margin-top:0.2rem">${escapeHtml(t.endereco)}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.4rem">
          <div class="rifa-valor">R$ ${t.valor},00</div>
          <div class="status-badge status-${t.status.toLowerCase().replace(' ','_')}">${badgeIcon(t.status)} ${t.status}</div>
        </div>
      </div>`).join('');

  document.getElementById('conta-historico').innerHTML = minhas.length === 0
    ? `<div class="empty-state"><div>&#128203;</div>Nenhuma transacao ainda.</div>`
    : minhas.map(t => `
      <div class="historico-item">
        <div>
          <div>${t.cotas} cota${t.cotas > 1 ? 's' : ''} - Numeros: ${t.numeros.join(', ')}</div>
          <div class="hist-desc">${t.data} - ${t.metodo} - ID: ${t.id}</div>
        </div>
        <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap">
          <div class="hist-valor">R$ ${t.valor},00</div>
          <div class="status-badge status-${t.status.toLowerCase().replace(' ','_')}">${badgeIcon(t.status)} ${t.status}</div>
        </div>
      </div>`).join('');
}

// ---- PAINEL ADMIN ----
async function renderizarAdmin() {
  const usuario = getUsuarioLogado();
  if (!usuario || !usuario.isAdmin) { showSection('login'); return; }

  mostrarLoading('Carregando painel...');
  const db  = await dbLer();
  esconderLoading();

  const historico   = db.historico || [];
  tabelaDados       = historico;

  const confirmadas = historico.filter(t => t.status === 'Confirmado');
  const pendentes   = historico.filter(t => t.status === 'Pendente');
  const totalCotas  = confirmadas.reduce((s, t) => s + t.cotas, 0);
  const compradores = [...new Set(confirmadas.map(t => t.usuario))].length;
  const arrecadado  = confirmadas.reduce((s, t) => s + t.valor, 0);
  const disponiveis = TOTAL_NUMEROS - totalCotas;

  document.getElementById('adm-total-cotas').textContent       = totalCotas;
  document.getElementById('adm-disponiveis').textContent       = disponiveis < 0 ? 0 : disponiveis;
  document.getElementById('adm-total-compradores').textContent = compradores;
  document.getElementById('adm-total-arrecadado').textContent  = `R$ ${arrecadado},00`;

  const badge = document.getElementById('badge-pendentes');
  if (pendentes.length > 0) {
    badge.textContent = pendentes.length;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }

  renderizarPendentes(pendentes);
  renderizarTabela(historico);
}

function renderizarPendentes(pendentes) {
  const lista = document.getElementById('admin-pendentes-lista');
  if (pendentes.length === 0) {
    lista.innerHTML = `<div class="empty-state" style="padding:1rem"><div>&#9989;</div>Nenhum pagamento pendente.</div>`;
    return;
  }
  lista.innerHTML = pendentes.map(t => `
    <div class="pendente-card" id="pendente-${t.id}">
      <div class="pendente-info">
        <div class="pendente-nome"><strong>${escapeHtml(t.nome)}</strong> <span class="pendente-metodo-badge">${t.metodo}</span></div>
        <div class="pendente-detalhes">Email: ${escapeHtml(t.usuario)} - Tel: ${escapeHtml(t.telefone)}</div>
        <div class="pendente-detalhes">Numeros: <strong>${t.numeros.join(', ')}</strong> - ${t.cotas} cota${t.cotas>1?'s':''} - <strong style="color:var(--verde)">R$ ${t.valor},00</strong></div>
        ${t.metodo === 'Dinheiro (visita)' ? `<div class="pendente-detalhes">Endereco: ${escapeHtml(t.endereco)}</div>` : ''}
        <div class="pendente-detalhes" style="color:var(--text-muted)">${t.data} - ID: ${t.id}</div>
      </div>
      <div class="pendente-acoes">
        <button class="btn-aprovar" onclick="aprovarPagamento('${t.id}')">Confirmar</button>
        <button class="btn-recusar" onclick="recusarPagamento('${t.id}')">Recusar</button>
      </div>
    </div>`).join('');
}

async function aprovarPagamento(id) {
  mostrarLoading('Aprovando pagamento...');
  const db  = await dbLer();
  const idx = db.historico.findIndex(t => t.id === id);
  if (idx === -1) { esconderLoading(); return; }

  db.historico[idx].status = 'Confirmado';
  const novos = db.historico[idx].numeros.filter(n => !(db.numerosVendidos || []).includes(n));
  db.numerosVendidos = [...(db.numerosVendidos || []), ...novos];

  await dbSalvar(db);
  esconderLoading();

  const card = document.getElementById('pendente-' + id);
  if (card) {
    card.style.transition = 'all 0.4s';
    card.style.opacity    = '0';
    card.style.transform  = 'translateX(40px)';
    setTimeout(() => renderizarAdmin(), 450);
  } else {
    renderizarAdmin();
  }
}

async function recusarPagamento(id) {
  if (!confirm('Tem certeza que deseja RECUSAR este pagamento?')) return;

  mostrarLoading('Recusando pagamento...');
  const db  = await dbLer();
  const idx = db.historico.findIndex(t => t.id === id);
  if (idx === -1) { esconderLoading(); return; }

  db.historico[idx].status = 'Recusado';
  await dbSalvar(db);
  esconderLoading();

  const card = document.getElementById('pendente-' + id);
  if (card) {
    card.style.transition = 'all 0.4s';
    card.style.opacity    = '0';
    card.style.transform  = 'translateX(-40px)';
    setTimeout(() => renderizarAdmin(), 450);
  } else {
    renderizarAdmin();
  }
}

function renderizarTabela(dados) {
  const tbody = document.getElementById('admin-tbody');
  const vazio = document.getElementById('admin-vazio');

  if (dados.length === 0) { tbody.innerHTML = ''; vazio.classList.remove('hidden'); return; }

  vazio.classList.add('hidden');
  tbody.innerHTML = dados.map(t => `
    <tr>
      <td><strong>${escapeHtml(t.nome || '-')}</strong></td>
      <td>${escapeHtml(t.usuario)}</td>
      <td>${escapeHtml(t.telefone || '-')}</td>
      <td class="end-cell">${escapeHtml(t.endereco || '-')}</td>
      <td>${t.numeros.map(n => `<span class="num-badge">${n}</span>`).join(' ')}</td>
      <td><strong>${t.cotas}</strong></td>
      <td class="valor-badge">R$ ${t.valor},00</td>
      <td><span class="metodo-badge ${t.metodo === 'Dinheiro (visita)' ? 'metodo-dinheiro' : ''}">${escapeHtml(t.metodo)}</span></td>
      <td><span class="status-badge status-${t.status.toLowerCase().replace(' ','_')}">${badgeIcon(t.status)} ${t.status}</span></td>
      <td style="white-space:nowrap;font-size:0.8rem">${escapeHtml(t.data)}</td>
      <td class="id-badge">${escapeHtml(t.id)}</td>
      <td>
        ${t.status === 'Pendente' ? `
          <div style="display:flex;gap:0.3rem">
            <button class="btn-tabela-aprovar" onclick="aprovarPagamento('${t.id}')">OK</button>
            <button class="btn-tabela-recusar" onclick="recusarPagamento('${t.id}')">X</button>
          </div>` : `<span style="font-size:0.75rem;color:var(--text-muted)">${t.status === 'Confirmado' ? 'Aprovado' : 'Recusado'}</span>`}
      </td>
    </tr>`).join('');
}

function filtrarTabela() {
  const termo = document.getElementById('admin-search').value.toLowerCase();
  if (!termo) { renderizarTabela(tabelaDados); return; }
  const filtrado = tabelaDados.filter(t =>
    (t.nome     || '').toLowerCase().includes(termo) ||
    t.usuario.toLowerCase().includes(termo) ||
    t.numeros.some(n => n.includes(termo)) ||
    (t.telefone || '').includes(termo) ||
    (t.endereco || '').toLowerCase().includes(termo)
  );
  renderizarTabela(filtrado);
}

async function exportarCSV() {
  mostrarLoading('Exportando dados...');
  const db = await dbLer();
  esconderLoading();

  const historico = db.historico || [];
  if (historico.length === 0) { alert('Nenhuma transacao para exportar.'); return; }

  const cab    = ['ID','Nome','E-mail','Telefone','Endereco','Numeros','Cotas','Valor (R$)','Metodo','Data','Status'];
  const linhas = historico.map(t => [
    t.id,
    `"${(t.nome    || '').replace(/"/g,'""')}"`,
    t.usuario,
    t.telefone || '-',
    `"${(t.endereco|| '').replace(/"/g,'""')}"`,
    `"${t.numeros.join(', ')}"`,
    t.cotas,
    t.valor,
    t.metodo,
    `"${t.data}"`,
    t.status
  ].join(';'));

  const csv  = [cab.join(';'), ...linhas].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `rifas_${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function confirmarLimpar() {
  document.getElementById('modal-limpar').classList.remove('hidden');
  document.getElementById('modal-limpar-overlay').classList.remove('hidden');
}

function fecharModalLimpar() {
  document.getElementById('modal-limpar').classList.add('hidden');
  document.getElementById('modal-limpar-overlay').classList.add('hidden');
}

async function limparTodosDados() {
  mostrarLoading('Limpando dados...');
  await dbSalvar(estadoVazio());
  esconderLoading();
  fecharModalLimpar();
  atualizarEstatisticas();
  renderizarAdmin();
}

// ---- ESTATISTICAS ----
function atualizarEstatisticas() {
  const db       = dbCache || estadoVazio();
  const vendidos = db.numerosVendidos || [];
  const elV = document.getElementById('stat-vendidas');
  const elD = document.getElementById('stat-disponiveis');
  if (elV) elV.textContent = vendidos.length;
  if (elD) elD.textContent = Math.max(0, TOTAL_NUMEROS - vendidos.length);
}

// ---- UTILITARIOS ----
function showMsg(el, tipo, texto) {
  el.className = 'msg ' + tipo;
  el.textContent = texto;
  el.classList.remove('hidden');
}

function mascaraTel(input) {
  let v = input.value.replace(/\D/g,'').substring(0,11);
  if      (v.length > 6) v = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
  else if (v.length > 2) v = `(${v.slice(0,2)}) ${v.slice(2)}`;
  else if (v.length > 0) v = `(${v}`;
  input.value = v;
}

function mascaraCep(input) {
  let v = input.value.replace(/\D/g,'').substring(0,8);
  if (v.length > 5) v = v.slice(0,5) + '-' + v.slice(5);
  input.value = v;
}

function badgeIcon(status) {
  if (status === 'Confirmado') return 'OK';
  if (status === 'Recusado')   return 'X';
  return '...';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
