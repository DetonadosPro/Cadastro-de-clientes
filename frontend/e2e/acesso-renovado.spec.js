import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const SENHA = 'SenhaExemploTeste2026!';
const contas = () => [
  { id: 1, usuario: 'angela', nome: 'Ángela de Souza', data_nascimento: '27/08/90', criado_em: '2026-09-01T12:00:00Z' },
  { id: 2, usuario: 'bruno', nome: 'Bruno Oliveira', data_nascimento: null, criado_em: '2026-10-08T12:00:00Z' },
];
async function preparar(page, opcoes = {}) {
  const estado = { contas: opcoes.vazio ? [] : contas(), logins: [], escritas: [], offline: false, erroLista: false, erroEscrita: false, renovar: false, expirar: false };
  await page.route('**/api/**', async route => {
    const req = route.request(), caminho = new URL(req.url()).pathname, metodo = req.method();
    if (caminho === '/api/auth/login') {
      estado.logins.push(req.postDataJSON());
      if (estado.offline) return route.abort('failed');
      if (req.postDataJSON().senha !== SENHA) return route.fulfill({ status: 401, json: { erro: 'Usuário ou senha inválidos.' } });
      await new Promise(resolve => setTimeout(resolve, 100));
      return route.fulfill({ json: { token: 'token-exemplo', usuario: 'angela', nome: 'Ángela de Souza' } });
    }
    if (caminho === '/api/auth/verificar-senha-mestra') return route.fulfill({ status: req.postDataJSON().senha === SENHA ? 200 : 401, json: req.postDataJSON().senha === SENHA ? { ok: true } : { erro: 'Senha incorreta.' } });
    if (caminho.startsWith('/api/auth/usuarios')) {
      if (estado.renovar || req.headers()['x-senha-mestra'] !== SENHA) return route.fulfill({ status: 401, json: { erro: 'Senha incorreta.' } });
      if (metodo === 'GET') return route.fulfill({ status: estado.erroLista ? 500 : 200, json: estado.erroLista ? { erro: 'Lista indisponível.' } : { usuarios: estado.contas } });
      estado.escritas.push({ metodo, caminho, dados: metodo === 'DELETE' ? null : req.postDataJSON() });
      if (estado.erroEscrita) return route.fulfill({ status: 500, json: { erro: 'Operação indisponível.' } });
      if (metodo === 'POST') { const { senha, ...dados } = req.postDataJSON(); estado.contas.push({ id: 3, ...dados, criado_em: '2026-10-09T15:00:00Z' }); }
      if (metodo === 'DELETE') estado.contas = estado.contas.filter(u => u.id !== Number(caminho.split('/').at(-1)));
      return route.fulfill({ status: metodo === 'POST' ? 201 : 200, json: { ok: true } });
    }
    if (estado.expirar && caminho === '/api/clientes') return route.fulfill({ status: 401, json: { erro: 'Sessão expirada.' } });
    if (caminho === '/api/clientes') return route.fulfill({ json: { clientes: [], total: 0 } });
    if (caminho === '/api/clientes/lixeira') return route.fulfill({ json: { clientes: [], total: 0, total_pedidos: 0 } });
    if (caminho === '/api/configuracoes') return route.fulfill({ json: { limite_segunda_mensagem: 12, meses_mensagem_em_haver: 3, versao: 1 } });
    if (caminho === '/api/eventos') return route.fulfill({ contentType: 'text/event-stream', body: 'event: conectado\ndata: {"ok":true,"versao":1,"instancia":"qa"}\n\n' });
    return route.fulfill({ json: { fonada: [], aoVivo: [], lembretes: [], contagens: [], itens: [], total: 0 } });
  });
  return estado;
}
async function entrar(page) {
  await page.getByLabel('Usuário', { exact: true }).fill('  angela  ');
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}
async function administrar(page) {
  await page.goto('/gerenciar-usuarios');
  await page.getByLabel('Senha mestra', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Usuários do sistema' })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Novo usuário' })).toBeEnabled();
}
async function auditar(page, seletor) {
  if (await page.getByRole('dialog').count()) await page.getByRole('dialog').evaluate(async el => { await Promise.all(el.closest('.dialogo-fundo').getAnimations({ subtree: true }).map(a => a.finished)); });
  const resultado = await new AxeBuilder({ page }).include(seletor).analyze();
  expect(resultado.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('login exibe senha, trata falhas e lembra somente usuário após acesso válido', async ({ page }) => {
  const estado = await preparar(page);
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill('angela');
  await page.getByLabel('Senha', { exact: true }).fill('incorreta');
  await page.getByRole('button', { name: 'Mostrar senha', exact: true }).click();
  await expect(page.getByLabel('Senha', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Ocultar senha', exact: true }).click();
  await page.getByLabel('Lembrar meu usuário').check();
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText('Usuário ou senha inválidos.')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => localStorage.getItem('pombo_usuario_lembrado'))).toBeNull();
  estado.offline = true;
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText(/Não foi possível conectar ao servidor/)).toBeVisible();
  estado.offline = false;
  await page.getByRole('button', { name: 'Entrar', exact: true }).evaluate(b => { b.click(); b.click(); });
  await expect(page).toHaveURL(/\/agenda$/);
  expect(estado.logins).toHaveLength(3);
  await page.goto('/login');
  await expect(page.getByLabel('Usuário', { exact: true })).toHaveValue('angela');
  await expect(page.getByLabel('Senha', { exact: true })).toHaveValue('');
  await page.getByLabel('Lembrar meu usuário').uncheck();
  expect(await page.evaluate(() => localStorage.getItem('pombo_usuario_lembrado'))).toBeNull();
  const armazenamento = await page.evaluate(() => JSON.stringify(localStorage));
  expect(armazenamento).not.toContain(SENHA);
  expect(armazenamento).not.toContain('incorreta');
});

test('primeiro acesso explica recuperação e retorna à página solicitada', async ({ page }) => {
  const estado = await preparar(page);
  await page.goto('/clientes?busca=Maria');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('button', { name: 'Precisa de acesso?' }).click();
  await expect(page.getByRole('dialog')).toContainText('Não é preciso excluir sua conta.');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Precisa de acesso?' })).toBeFocused();
  await entrar(page);
  await expect(page).toHaveURL(/\/clientes\?busca=Maria$/);
  expect(estado.logins[0].usuario).toBe('angela');
  await page.goto('/login?retorno=https%3A%2F%2Foutro.test');
  await entrar(page);
  await expect(page).toHaveURL(/\/agenda$/);
});

test('sessão expirada informa motivo e devolve à mesma página após login', async ({ page }) => {
  const estado = await preparar(page);
  await page.addInitScript(() => { if (!sessionStorage.getItem('sessao-preparada')) { localStorage.setItem('pombo_token', 'token-vencido'); localStorage.setItem('pombo_usuario', 'angela'); sessionStorage.setItem('sessao-preparada', '1'); } });
  estado.expirar = true;
  await page.goto('/clientes?busca=Maria');
  await expect(page).toHaveURL(/motivo=sessao-expirada/);
  await expect(page.getByText('Entre novamente para continuar')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('pombo_token'))).toBeNull();
  estado.expirar = false;
  await entrar(page);
  await expect(page).toHaveURL(/\/clientes\?busca=Maria$/);
});

test('senha mestra incorreta mantém tela e sessão; encerrar limpa autorização administrativa', async ({ page }) => {
  await preparar(page);
  await page.addInitScript(() => { localStorage.setItem('pombo_token', 'token-existente'); localStorage.setItem('pombo_usuario', 'angela'); });
  await page.goto('/gerenciar-usuarios');
  await page.getByLabel('Senha mestra', { exact: true }).fill('incorreta');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText('Senha incorreta.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/gerenciar-usuarios$/);
  expect(await page.evaluate(() => localStorage.getItem('pombo_token'))).toBe('token-existente');
  await page.getByLabel('Senha mestra', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: 'Encerrar administração' }).click();
  await expect(page.getByLabel('Senha mestra', { exact: true })).toHaveValue('');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(SENHA);
});

test('administração busca, ordena, cria e redefine senha com confirmação', async ({ page }) => {
  const estado = await preparar(page); await administrar(page);
  await page.getByLabel('Encontrar pessoa ou usuário').fill('ANGELA');
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('button', { name: 'Limpar busca' }).click();
  await page.getByLabel('Ordenar por').selectOption('recentes');
  await expect(page.getByRole('article').first()).toContainText('Bruno Oliveira');
  await page.getByRole('button', { name: '+ Novo usuário' }).click();
  const dialogo = page.getByRole('dialog');
  await page.getByLabel('Nome completo', { exact: true }).fill('Carolina Mendes');
  await page.getByLabel('Usuário (login) *', { exact: true }).fill('  carolina  ');
  await page.getByLabel('Data de nascimento', { exact: true }).fill('270890');
  await page.getByLabel('Senha *', { exact: true }).fill(SENHA);
  await page.getByLabel('Confirmar senha *', { exact: true }).fill('outra');
  await dialogo.getByRole('button', { name: 'Criar usuário', exact: true }).click();
  await expect(dialogo).toContainText('As senhas não coincidem.');
  expect(estado.escritas).toHaveLength(0);
  await page.getByLabel('Confirmar senha *', { exact: true }).fill(SENHA);
  await dialogo.getByRole('button', { name: 'Criar usuário', exact: true }).evaluate(b => { b.click(); b.click(); });
  await expect(dialogo).toHaveCount(0);
  await expect(page.getByRole('article').first()).toContainText('Carolina Mendes');
  expect(estado.escritas).toHaveLength(1);
  expect(estado.escritas[0].dados.usuario).toBe('carolina');
  expect(estado.escritas[0].dados.data_nascimento).toBe('27/08/90');
  await page.getByRole('button', { name: 'Redefinir senha de carolina' }).click();
  await expect(page.getByLabel('Nova senha *', { exact: true })).toHaveValue('');
  await page.getByLabel('Nova senha *', { exact: true }).fill(SENHA);
  await page.getByLabel('Confirmar senha *', { exact: true }).fill(SENHA);
  estado.erroEscrita = true;
  await dialogo.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(dialogo).toContainText('Operação indisponível.');
  await expect(page.getByLabel('Nova senha *', { exact: true })).toHaveValue(SENHA);
  estado.erroEscrita = false;
  await dialogo.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(dialogo).toHaveCount(0);
  expect(estado.escritas.at(-1).caminho).toBe('/api/auth/usuarios/3/senha');
  await expect(page.getByRole('article').filter({ hasText: 'carolina' })).toBeVisible();
});

test('falha de consulta permite tentar novamente; remover exige confirmação e autorização pode ser renovada', async ({ page }) => {
  const estado = await preparar(page); estado.erroLista = true;
  await page.goto('/gerenciar-usuarios'); await page.getByLabel('Senha mestra', { exact: true }).fill(SENHA); await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText('Lista indisponível.')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Novo usuário' })).toBeDisabled();
  estado.erroLista = false; await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await page.getByRole('button', { name: 'Remover bruno', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(estado.escritas).toHaveLength(0);
  await page.getByRole('button', { name: 'Remover bruno', exact: true }).click();
  await page.getByRole('button', { name: 'Remover conta', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  expect(estado.escritas).toHaveLength(1);
  estado.renovar = true; await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect(page.getByText(/A autorização precisa ser renovada/)).toBeVisible();
  await expect(page.getByLabel('Senha mestra', { exact: true })).toHaveValue('');
});

for (const width of [1600, 768, 390, 320]) {
  test(`login, ajuda e administração são acessíveis em ${width}px`, async ({ page }, info) => {
    test.setTimeout(60000);
    await preparar(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/login'); await expect(page.getByRole('heading', { name: 'Entre na sua conta' })).toBeVisible();
    await auditar(page, '.acesso-pagina');
    await page.screenshot({ path: info.outputPath(`login-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Precisa de acesso?' }).click();
    await auditar(page, '.acesso-dialog'); await page.keyboard.press('Escape');
    await page.goto('/gerenciar-usuarios'); await expect(page.getByLabel('Senha mestra', { exact: true })).toBeVisible();
    await auditar(page, '.acesso-pagina');
    await page.screenshot({ path: info.outputPath(`mestra-${width}.png`), fullPage: true });
    await administrar(page); await auditar(page, '.acesso-equipe-pagina');
    await page.screenshot({ path: info.outputPath(`equipe-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: '+ Novo usuário' }).click(); await auditar(page, '.acesso-dialog');
    await page.screenshot({ path: info.outputPath(`conta-${width}.png`), fullPage: true });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Redefinir senha de angela' }).click(); await auditar(page, '.acesso-dialog'); await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Remover angela', exact: true }).click(); await auditar(page, '.acesso-dialog'); await page.keyboard.press('Escape');
  });
}

test('primeira conta pode ser criada a partir da administração vazia', async ({ page }) => {
  await preparar(page, { vazio: true }); await administrar(page);
  await expect(page.getByText('Nenhum usuário cadastrado')).toBeVisible();
  await auditar(page, '.acesso-equipe-pagina');
  await page.getByRole('button', { name: 'Criar usuário', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Novo usuário' })).toBeVisible();
});
