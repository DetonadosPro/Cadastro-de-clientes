import { test, expect } from '@playwright/test';
import { entrar } from './apoio.js';
import { registrar } from './fase4-modal-helper.js';

test('BTN-249/250/261/262: série comparada e paginação do relatório', async ({ page }) => {
  await entrar(page);
  await page.route('**/api/relatorios/vendas?*', (rota) => {
    const pagina = Number(new URL(rota.request().url()).searchParams.get('pagina') || 1);
    const dados = {
      geral: { valorTotal: 30, quantidade: 1, ticketMedio: 30 },
      fonada: { valorTotal: 30, quantidade: 1 }, aoVivo: { valorTotal: 0, quantidade: 0 },
      itens: [{ id: pagina, sistema: 'FONADA', data: '23/09/26', os: `QA-${pagina}`, nome: `QA PAGINA ${pagina}`, valor: 30, forma: 'PIX', statusPagamento: 'NÃO' }],
      itensTotal: 2, pagina, totalPaginas: 2, limite: 100,
      graficos: { vendasPorDia: [{ data: '23/09/26', valor: 30, quantidade: 1, valorFonada: 30, quantidadeFonada: 1 }],
        periodoAnterior: [{ data: '23/08/26', valor: 20, quantidade: 1, valorFonada: 20, quantidadeFonada: 1 }], pagamentosPorDia: [] },
    };
    return rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dados) });
  });
  await page.goto('/relatorios?aba=vendas&inicio=01%2F09%2F26&fim=23%2F09%2F26&inicioB=01%2F08%2F26&fimB=23%2F08%2F26');
  await expect(page.getByText('QA PAGINA 1')).toBeVisible();
  const legenda = page.locator('.seletor-series-grafico');
  await legenda.getByRole('button', { name: 'Período B' }).click();
  await expect(legenda.getByRole('button', { name: 'Período B' })).toHaveClass(/ativo/);
  registrar('BTN-250', page, '.seletor-series-grafico button:has-text("Período B")', 'destacar comparação', 'série B ativa');
  await legenda.getByRole('button', { name: 'Período A' }).click();
  await expect(legenda.getByRole('button', { name: 'Período A' })).toHaveClass(/ativo/);
  registrar('BTN-249', page, '.seletor-series-grafico button:has-text("Período A")', 'destacar período base', 'série A ativa');
  await page.locator('.controles-paginacao-relatorio').getByRole('button', { name: 'Próxima' }).click();
  await expect(page.getByText('QA PAGINA 2')).toBeVisible();
  registrar('BTN-262', page, '.controles-paginacao-relatorio button:has-text("Próxima")', 'avançar relatório', 'item da página 2 exibido');
  await page.locator('.controles-paginacao-relatorio').getByRole('button', { name: 'Anterior' }).click();
  await expect(page.getByText('QA PAGINA 1')).toBeVisible();
  registrar('BTN-261', page, '.controles-paginacao-relatorio button:has-text("Anterior")', 'voltar relatório', 'item da página 1 exibido');
});

test('BTN-254: tabela de equipe revela o 51º funcionário', async ({ page }) => {
  await entrar(page);
  const funcionarios = Array.from({ length: 51 }, (_, indice) => ({ usuario: `QA FUNCIONARIO ${String(indice + 1).padStart(2, '0')}`, vendasTotal: 1, valorVendidoTotal: 10, valorVendidoFonada: 10, valorVendidoAoVivo: 0, ticketMedio: 10, participacaoPercentual: 2, vendasFonada: 1, vendasAoVivo: 0 }));
  await page.route('**/api/relatorios/desempenho?*', (rota) => rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ funcionarios, valorEquipe: 510 }) }));
  await page.goto('/relatorios?aba=desempenho&inicio=01%2F09%2F26&fim=23%2F09%2F26');
  await expect(page.locator('.tabela-desempenho tbody tr')).toHaveCount(50);
  await page.locator('.tabela-desempenho-wrap').getByRole('button', { name: /Mostrar mais/ }).click();
  await expect(page.locator('.tabela-desempenho tbody tr')).toHaveCount(51);
  await expect(page.getByText('QA FUNCIONARIO 51').last()).toBeVisible();
  registrar('BTN-254', page, '.tabela-desempenho-wrap .lista-mostrar-mais button', 'mostrar mais equipe', '51º funcionário exibido');
});
