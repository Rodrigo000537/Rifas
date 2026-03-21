// RifaTop — Rifa Solidária Associação de Combate ao Câncer de Marília
// Admin: e-mail = "admin" | senha = "admin123"

const ADMIN_EMAIL = 'admin';
const ADMIN_SENHA = 'admin123';
const TOTAL_NUMEROS = 100000; // 00000 a 99999

let pacoteSelecionado = null;
let numerosEscolhidos = [];
let metodoPagamento = null;
let tabelaDados = []; // cache para filtro

document.addEventListener('DOMContentLoaded', () => {
  inicializarDados();
  verificarLogin();
  atualizarEstatisticas();
  showSection('home');
});

// ---- INIT ----
function inicializarDados() {
  if (!localStorage.getItem('rifa_usuarios')) localStorage.setItem('rifa_usuarios', JSON.stringify([]));
  if (!localStorage.getItem('rifa_numerosVendidos')) localStorage.setItem('rifa_numerosVendidos', JSON.stringify([]));
  if (!localStorage.getItem('rifa_historico')) localStorage.setItem('rifa_historico', JSON.stringify([]));
}

// ---- NAVEGAÇÃO ----
function showSection(nome) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const sec = document.getElementById('sec-' + nome);
  if (sec) sec.classList.add('active');
  if (nome === 'conta') renderizarConta();
  if (nome === 'pagamento') preencherResumoPagamento();
  if (nome === 'admin') renderizarAdmin();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---- NAVBAR ----
function verificarLogin() {
  const usuario = getUsuarioLogado();
  const btnLogin = document.getElementById('btn-login-nav');
  const btnConta = document.getElementById('btn-minha-conta');
  const btnLogout = document.getElementById('btn-logout');
  const navUser = document.getElementById('nav-user-info');

  if (usuario) {
    btnLogin.classList.add('hidden');
    btnLogout.classList.remove('hidden');
    navUser.classList.remove('hidden');

    if (usuario.isAdmin) {
      // Admin vê painel admin em vez de "minha conta"
      btnConta.textContent = '🔐 Painel Admin';
      btnConta.onclick = () => showSection('admin');
      btnConta.classList.remove('hidden');
      navUser.textContent = '🔐 Admin';
    } else {
      btnConta.textContent = 'Minha Conta';
      btnConta.onclick = () => showSection('conta');
      btnConta.classList.remove('hidden');
      navUser.textContent = '👋 ' + usuario.nome.split(' ')[0];
    }
  } else {
    btnLogin.classList.remove('hidden');
    btnConta.classList.add('hidden');
    btnLogout.classList.add('hidden');
    navUser.classList.add('hidden');
  }
}

function getUsuarioLogado() {
  const logado = localStorage.getItem('rifa_logado');
  if (!logado) return null;
  const dados = JSON.parse(logado);
  return dados || null;
}

// ---- CADASTRO ----
function cadastrar() {
  const nome = document.getElementById('cad-nome').value.trim();
  const email = document.getElementById('cad-email').value.trim().toLowerCase();
  const senha = document.getElementById('cad-senha').value;
  const tel = document.getElementById('cad-tel').value.trim();
  const msgEl = document.getElementById('msg-cadastro');

  if (!nome || nome.length < 3) { showMsg(msgEl, 'error', 'Informe seu nome completo (mínimo 3 caracteres).'); return; }
  if (!email.endsWith('@gmail.com')) { showMsg(msgEl, 'error', 'Use um e-mail Gmail (@gmail.com).'); return; }
  if (senha.length < 6) { showMsg(msgEl, 'error', 'Senha deve ter pelo menos 6 caracteres.'); return; }
  if (tel.replace(/\D/g, '').length < 10) { showMsg(msgEl, 'error', 'Informe um número de telefone válido.'); return; }

  const usuarios = JSON.parse(localStorage.getItem('rifa_usuarios'));
  if (usuarios.find(u => u.email === email)) { showMsg(msgEl, 'error', 'Este e-mail já está cadastrado. Faça login.'); return; }

  const novoUsuario = { nome, email, senha, tel, criadoEm: new Date().toISOString() };
  usuarios.push(novoUsuario);
  localStorage.setItem('rifa_usuarios', JSON.stringify(usuarios));
  localStorage.setItem('rifa_logado', JSON.stringify({ nome, email, tel, isAdmin: false }));

  showMsg(msgEl, 'success', '✅ Conta criada! Redirecionando...');
  verificarLogin();
  setTimeout(() => showSection('home'), 1400);
}

// ---- LOGIN ----
function fazerLogin() {
  const emailInput = document.getElementById('login-email').value.trim().toLowerCase();
  const senha = document.getElementById('login-senha').value;
  const msgEl = document.getElementById('msg-login');

  if (!emailInput || !senha) { showMsg(msgEl, 'error', 'Preencha e-mail e senha.'); return; }

  // Login admin
  if (emailInput === ADMIN_EMAIL && senha === ADMIN_SENHA) {
    localStorage.setItem('rifa_logado', JSON.stringify({ nome: 'Administrador', email: ADMIN_EMAIL, isAdmin: true }));
    showMsg(msgEl, 'success', '🔐 Acesso admin liberado!');
    verificarLogin();
    setTimeout(() => showSection('admin'), 1000);
    return;
  }

  // Login usuário comum
  const usuarios = JSON.parse(localStorage.getItem('rifa_usuarios'));
  const usuario = usuarios.find(u => u.email === emailInput && u.senha === senha);
  if (!usuario) { showMsg(msgEl, 'error', 'E-mail ou senha incorretos.'); return; }

  localStorage.setItem('rifa_logado', JSON.stringify({ nome: usuario.nome, email: usuario.email, tel: usuario.tel, isAdmin: false }));
  showMsg(msgEl, 'success', '✅ Bem-vindo, ' + usuario.nome.split(' ')[0] + '!');
  verificarLogin();
  setTimeout(() => showSection('home'), 1200);
}

function logout() {
  localStorage.removeItem('rifa_logado');
  pacoteSelecionado = null;
  numerosEscolhidos = [];
  metodoPagamento = null;
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
  if (!usuario) { showSection('cadastro'); return; }
  if (usuario.isAdmin) { alert('Você está logado como administrador.'); return; }
  if (!pacoteSelecionado) { alert('Selecione um pacote antes de continuar!'); return; }
  irParaEscolha();
}

function irParaEscolha() {
  const usuario = getUsuarioLogado();
  if (!usuario) { showSection('cadastro'); return; }
  if (!pacoteSelecionado) { alert('Selecione um pacote!'); return; }
  numerosEscolhidos = [];
  atualizarNumerosUI();
  document.getElementById('num-pacote-label').textContent =
    `${pacoteSelecionado.cotas} cota${pacoteSelecionado.cotas > 1 ? 's' : ''} — R$${pacoteSelecionado.preco}`;
  showSection('numeros');
}

// ---- NÚMEROS (máx 5 dígitos = 00000 a 99999) ----
function adicionarNumero() {
  const input = document.getElementById('input-numero');
  const msgEl = document.getElementById('msg-numeros');
  const val = input.value.trim();

  if (!val || val === '' || !/^\d+$/.test(val)) { showMsg(msgEl, 'error', 'Digite apenas números.'); return; }
  if (val.length > 5) { showMsg(msgEl, 'error', 'O número pode ter no máximo 5 dígitos (0 a 99999).'); input.value = ''; return; }

  const num = val.padStart(5, '0'); // sempre 5 dígitos
  const numInt = parseInt(num);

  if (numInt < 0 || numInt > 99999) { showMsg(msgEl, 'error', 'Número deve estar entre 00000 e 99999.'); input.value = ''; return; }
  if (numerosEscolhidos.includes(num)) { showMsg(msgEl, 'error', `O número ${num} já foi adicionado por você.`); input.value = ''; return; }

  const vendidos = JSON.parse(localStorage.getItem('rifa_numerosVendidos') || '[]');
  if (vendidos.includes(num)) { showMsg(msgEl, 'error', `O número ${num} já foi vendido. Escolha outro.`); input.value = ''; return; }

  if (numerosEscolhidos.length >= pacoteSelecionado.cotas) { showMsg(msgEl, 'error', `Limite de ${pacoteSelecionado.cotas} número(s) atingido.`); return; }

  numerosEscolhidos.push(num);
  input.value = '';
  msgEl.classList.add('hidden');
  atualizarNumerosUI();
}

function numeroAleatorio() {
  const msgEl = document.getElementById('msg-numeros');
  if (numerosEscolhidos.length >= pacoteSelecionado.cotas) { showMsg(msgEl, 'error', 'Limite atingido.'); return; }

  const vendidos = JSON.parse(localStorage.getItem('rifa_numerosVendidos') || '[]');
  let tentativas = 0, num;
  do {
    num = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
    if (++tentativas > 500) { showMsg(msgEl, 'error', 'Nenhum número disponível. Tente manualmente.'); return; }
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
    chip.innerHTML = `${num} <span class="remove-chip" onclick="removerNumero('${num}')">✕</span>`;
    container.appendChild(chip);
  });
  document.getElementById('num-faltam').textContent = pacoteSelecionado.cotas - numerosEscolhidos.length;
  document.getElementById('num-selecionados').textContent = numerosEscolhidos.length;
  const btn = document.getElementById('btn-ir-pagamento');
  numerosEscolhidos.length === pacoteSelecionado.cotas ? btn.classList.remove('hidden') : btn.classList.add('hidden');
}

// ---- PAGAMENTO ----
function preencherResumoPagamento() {
  if (!pacoteSelecionado) return;
  document.getElementById('pag-pacote').textContent = `${pacoteSelecionado.cotas} cota${pacoteSelecionado.cotas > 1 ? 's' : ''}`;
  document.getElementById('pag-numeros').textContent = numerosEscolhidos.join(', ') || '—';
  document.getElementById('pag-total').textContent = `R$ ${pacoteSelecionado.preco},00`;
}

function selecionarMetodo(metodo) {
  metodoPagamento = metodo;
  document.querySelectorAll('.metodo-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('metodo-' + metodo).classList.add('selected');
  document.getElementById('pag-pix').classList.add('hidden');
  document.getElementById('pag-google').classList.add('hidden');
  document.getElementById('pag-' + metodo).classList.remove('hidden');
}

function copiarPix() {
  navigator.clipboard.writeText('rodrigopontes1337@gmail.com').then(() => {
    const msgEl = document.getElementById('msg-pagamento');
    showMsg(msgEl, 'success', '📋 Chave Pix copiada!');
    setTimeout(() => msgEl.classList.add('hidden'), 2000);
  });
}

function confirmarPagamento() {
  const msgEl = document.getElementById('msg-pagamento');
  if (!metodoPagamento) { showMsg(msgEl, 'error', 'Selecione um método de pagamento.'); return; }
  if (metodoPagamento === 'google') {
    const codigo = document.getElementById('google-code').value.trim();
    if (codigo.replace(/\W/g, '').length < 12) { showMsg(msgEl, 'error', 'Insira o código do Cartão Google Play.'); return; }
  }

  const usuario = getUsuarioLogado();
  if (!usuario) { showSection('login'); return; }

  // Salvar números como vendidos
  const vendidos = JSON.parse(localStorage.getItem('rifa_numerosVendidos') || '[]');
  localStorage.setItem('rifa_numerosVendidos', JSON.stringify([...vendidos, ...numerosEscolhidos]));

  // Buscar dados completos do usuário para salvar no histórico
  const usuarios = JSON.parse(localStorage.getItem('rifa_usuarios') || '[]');
  const dadosCompletos = usuarios.find(u => u.email === usuario.email) || {};

  // Salvar transação
  const historico = JSON.parse(localStorage.getItem('rifa_historico') || '[]');
  historico.push({
    id: 'TRX' + Date.now(),
    usuario: usuario.email,
    nome: dadosCompletos.nome || usuario.nome,
    telefone: dadosCompletos.tel || usuario.tel || '—',
    numeros: [...numerosEscolhidos],
    cotas: pacoteSelecionado.cotas,
    valor: pacoteSelecionado.preco,
    metodo: metodoPagamento === 'pix' ? 'Pix' : 'Google Play',
    data: new Date().toLocaleString('pt-BR'),
    status: 'Confirmado'
  });
  localStorage.setItem('rifa_historico', JSON.stringify(historico));
  atualizarEstatisticas();

  document.getElementById('modal-text').textContent = `Seus números ${numerosEscolhidos.join(', ')} foram registrados! Boa sorte! 🍀`;
  document.getElementById('modal-sucesso').classList.remove('hidden');
  document.getElementById('modal-overlay').classList.remove('hidden');

  // Reset
  pacoteSelecionado = null;
  numerosEscolhidos = [];
  metodoPagamento = null;
  document.querySelectorAll('.pacote-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('pacote-selecionado-info').classList.add('hidden');
}

function fecharModal() {
  document.getElementById('modal-sucesso').classList.add('hidden');
  document.getElementById('modal-overlay').classList.add('hidden');
  showSection('conta');
}

// ---- MINHA CONTA ----
function renderizarConta() {
  const usuario = getUsuarioLogado();
  if (!usuario) { showSection('login'); return; }
  if (usuario.isAdmin) { showSection('admin'); return; }

  document.getElementById('conta-info').innerHTML = `
    <div class="conta-avatar">👤</div>
    <div>
      <div class="conta-nome">${escapeHtml(usuario.nome)}</div>
      <div class="conta-email">${escapeHtml(usuario.email)}</div>
      <div class="conta-tel">📱 ${escapeHtml(usuario.tel || '—')}</div>
    </div>`;

  const historico = JSON.parse(localStorage.getItem('rifa_historico') || '[]');
  const minhas = historico.filter(t => t.usuario === usuario.email);

  document.getElementById('conta-rifas').innerHTML = minhas.length === 0
    ? `<div class="empty-state"><div>🎟️</div>Nenhuma rifa ainda. <a style="color:var(--verde);cursor:pointer" onclick="showSection('home')">Participar agora!</a></div>`
    : minhas.map(t => `
      <div class="rifa-item">
        <div>
          <div class="rifa-numeros">${t.numeros.map(n => `<span class="rifa-num-badge">${n}</span>`).join('')}</div>
          <div class="rifa-data">📅 ${t.data} — ${t.metodo}</div>
        </div>
        <div class="rifa-valor">R$ ${t.valor},00</div>
      </div>`).join('');

  document.getElementById('conta-historico').innerHTML = minhas.length === 0
    ? `<div class="empty-state"><div>📋</div>Nenhuma transação ainda.</div>`
    : minhas.map(t => `
      <div class="historico-item">
        <div>
          <div>${t.cotas} cota${t.cotas > 1 ? 's' : ''} — Números: ${t.numeros.join(', ')}</div>
          <div class="hist-desc">${t.data} · ${t.metodo} · ID: ${t.id}</div>
        </div>
        <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap">
          <div class="hist-valor">R$ ${t.valor},00</div>
          <div class="hist-status">✅ ${t.status}</div>
        </div>
      </div>`).join('');
}

// ---- PAINEL ADMIN ----
function renderizarAdmin() {
  const usuario = getUsuarioLogado();
  if (!usuario || !usuario.isAdmin) { showSection('login'); return; }

  const historico = JSON.parse(localStorage.getItem('rifa_historico') || '[]');
  tabelaDados = historico;

  // Stats
  const totalCotas = historico.reduce((s, t) => s + t.cotas, 0);
  const compradores = [...new Set(historico.map(t => t.usuario))].length;
  const arrecadado = historico.reduce((s, t) => s + t.valor, 0);

  document.getElementById('adm-total-cotas').textContent = totalCotas;
  document.getElementById('adm-total-compradores').textContent = compradores;
  document.getElementById('adm-total-arrecadado').textContent = `R$ ${arrecadado},00`;
  document.getElementById('adm-total-transacoes').textContent = historico.length;

  renderizarTabela(historico);
}

function renderizarTabela(dados) {
  const tbody = document.getElementById('admin-tbody');
  const vazio = document.getElementById('admin-vazio');

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
      <td>${t.numeros.map(n => `<span class="num-badge">${n}</span>`).join(' ')}</td>
      <td><strong>${t.cotas}</strong></td>
      <td class="valor-badge">R$ ${t.valor},00</td>
      <td><span class="metodo-badge">${escapeHtml(t.metodo)}</span></td>
      <td style="white-space:nowrap;font-size:0.8rem">${escapeHtml(t.data)}</td>
      <td class="id-badge">${escapeHtml(t.id)}</td>
    </tr>`).join('');
}

function filtrarTabela() {
  const termo = document.getElementById('admin-search').value.toLowerCase();
  if (!termo) { renderizarTabela(tabelaDados); return; }
  const filtrado = tabelaDados.filter(t =>
    (t.nome || '').toLowerCase().includes(termo) ||
    t.usuario.toLowerCase().includes(termo) ||
    t.numeros.some(n => n.includes(termo)) ||
    (t.telefone || '').includes(termo)
  );
  renderizarTabela(filtrado);
}

function exportarCSV() {
  const historico = JSON.parse(localStorage.getItem('rifa_historico') || '[]');
  if (historico.length === 0) { alert('Nenhuma transação para exportar.'); return; }

  const cabecalho = ['ID', 'Nome', 'E-mail', 'Telefone', 'Números', 'Cotas', 'Valor (R$)', 'Método', 'Data', 'Status'];
  const linhas = historico.map(t => [
    t.id,
    `"${(t.nome || '').replace(/"/g, '""')}"`,
    t.usuario,
    t.telefone || '—',
    `"${t.numeros.join(', ')}"`,
    t.cotas,
    t.valor,
    t.metodo,
    `"${t.data}"`,
    t.status
  ].join(';'));

  const csv = [cabecalho.join(';'), ...linhas].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rifas_cancer_marilia_${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}.csv`;
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

function limparTodosDados() {
  localStorage.removeItem('rifa_usuarios');
  localStorage.removeItem('rifa_numerosVendidos');
  localStorage.removeItem('rifa_historico');
  inicializarDados();
  fecharModalLimpar();
  atualizarEstatisticas();
  renderizarAdmin();
}

// ---- ESTATÍSTICAS ----
function atualizarEstatisticas() {
  const vendidos = JSON.parse(localStorage.getItem('rifa_numerosVendidos') || '[]');
  const elV = document.getElementById('stat-vendidas');
  const elD = document.getElementById('stat-disponiveis');
  if (elV) elV.textContent = vendidos.length;
  if (elD) elD.textContent = TOTAL_NUMEROS - vendidos.length;
}

// ---- UTILITÁRIOS ----
function showMsg(el, tipo, texto) {
  el.className = 'msg ' + tipo;
  el.textContent = texto;
  el.classList.remove('hidden');
}

function mascaraTel(input) {
  let v = input.value.replace(/\D/g, '').substring(0, 11);
  if (v.length > 6) v = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
  else if (v.length > 2) v = `(${v.slice(0,2)}) ${v.slice(2)}`;
  else if (v.length > 0) v = `(${v}`;
  input.value = v;
}

function mascaraGoogle(input) {
  let v = input.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().substring(0, 16);
  const parts = [];
  for (let i = 0; i < v.length; i += 4) parts.push(v.slice(i, i + 4));
  input.value = parts.join('-');
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
