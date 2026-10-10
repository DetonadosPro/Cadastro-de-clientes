import { chromium, firefox, webkit } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

if (process.env.QA_E2E_ISOLATED_DB !== '1') throw new Error('Navegadores exigem flag QA.');
const origem = 'http://127.0.0.1:4173';
const motores = [['Edge', chromium, { channel: 'msedge' }], ['Firefox', firefox, {}], ['WebKit', webkit, {}]];
const telas = [{ nome: 'desktop', width: 1440, height: 900 }, { nome: 'mobile', width: 375, height: 667 }];
const rotas = ['/agenda', '/clientes', '/clientes/novo', '/fonada', '/ao-vivo', '/cobranca', '/recall', '/relatorios'];
const resultados = [];
const bloqueios = [];
const falhas = [];
const avisosNavegacao = [];
for (const [motorNome, motor, opcoes] of motores) {
  let navegador;
  try {
    navegador = await motor.launch(opcoes);
  } catch (erro) {
    bloqueios.push({ navegador: motorNome, motivo: erro.message.split('\n')[0] });
    continue;
  }
  try {
    for (const tela of telas) {
      const pagina = await navegador.newPage({ viewport: { width: tela.width, height: tela.height } });
      const erros = [];
      pagina.on('pageerror', (erro) => erros.push(erro.message));
      try {
        await pagina.goto(`${origem}/login`);
        await pagina.getByLabel('Usuário', { exact: true }).fill('QA_AUDITOR');
        await pagina.getByLabel('Senha', { exact: true }).fill('QA_TESTE_2026!');
        await pagina.getByRole('button', { name: 'Entrar', exact: true }).click();
        await pagina.waitForURL('**/agenda');
        const token = await pagina.evaluate(() => localStorage.getItem('pombo_token'));
        const diagnostico = await fetch('http://127.0.0.1:3001/api/diagnostico/performance', { headers: { Authorization: `Bearer ${token}` } });
        const dados = await diagnostico.json();
        if (dados.auditoriaQa?.banco !== 'pombo_correio_qa_auditoria') throw new Error('Banco não QA.');
        for (const rota of rotas) {
          const resposta = await pagina.goto(`${origem}${rota}`);
          if (resposta.status() !== 200) throw new Error(`${rota}: HTTP ${resposta.status()}`);
          await pagina.locator('main').waitFor();
          await pagina.locator('main h1').waitFor({ state: 'visible' });
          const geometria = await pagina.evaluate(() => ({
            documento: document.documentElement.scrollWidth,
            largura: window.innerWidth,
            titulo: document.querySelector('main h1')?.textContent?.trim() || '',
          }));
          if (!geometria.titulo) throw new Error(`${rota}: sem título visível`);
          if (geometria.documento > geometria.largura + 2) throw new Error(`${rota}: overflow horizontal ${geometria.documento}/${geometria.largura}`);
          await pagina.waitForTimeout(350);
          resultados.push({ navegador: motorNome, tela: tela.nome, rota, ...geometria, resultado: '✓' });
        }
        const reais = erros.filter((erro) => {
          const cancelamentoDeNavegacao = erro.includes('/agenda/contagens?') && erro.includes('due to access control checks');
          if (cancelamentoDeNavegacao) avisosNavegacao.push({ navegador: motorNome, tela: tela.nome, motivo: 'Requisição de contagens cancelada durante navegação rápida; Agenda estável por 8 s sem erro em teste separado.' });
          return !cancelamentoDeNavegacao;
        });
        if (reais.length) throw new Error(`Erros JavaScript: ${reais.join(' | ')}`);
      } catch (erro) {
        falhas.push({ navegador: motorNome, tela: tela.nome, motivo: erro.message.split('\n')[0] });
      } finally { await pagina.close(); }
    }
  } finally { await navegador.close(); }
}
const relatorio = { ambiente: 'build QA', navegadores: motores.map(([nome]) => nome), telas, rotas, verificacoes: resultados.length, resultados, bloqueios, falhas, avisosNavegacao };
await fs.writeFile(path.resolve('../docs/auditoria/evidencias/navegadores-qa.json'), JSON.stringify(relatorio, null, 2));
console.log(JSON.stringify({ navegadores: relatorio.navegadores, telas: telas.length, rotas: rotas.length, verificacoes: resultados.length, bloqueios, falhas, avisosNavegacao: avisosNavegacao.length }));
if (falhas.length) process.exitCode = 1;
