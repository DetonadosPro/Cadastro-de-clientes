import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';
import { exercitarFechamentos, registrar } from './fase4-modal-helper.js';

test('MODAL-016: comparação de dois clientes cancela sem mesclar e confirma com persistência', async ({ page, request }) => {
  test.setTimeout(90000);
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const prefixo = `TESTE_QA_MODAL_016_${Date.now()}`;
  const clientes = [];
  try {
    for (const lado of ['A', 'B']) {
      const resposta = await request.post('/api/clientes', { headers, data: { nome: `${prefixo}_${lado}`, bairro: `Bairro ${lado}` } });
      expect(resposta.status()).toBe(201);
      clientes.push(await resposta.json());
    }
    await page.goto(`/clientes?busca=${encodeURIComponent(prefixo)}`);
    for (const cliente of clientes) await page.getByRole('row').filter({ hasText: cliente.nome }).getByRole('checkbox').check();
    const abrir = async () => {
      await page.getByRole('button', { name: 'Comparar e mesclar' }).click();
      return page.getByRole('dialog', { name: 'Comparar e mesclar clientes' });
    };
    const semEfeito = async () => {
      for (const cliente of clientes) {
        const atual = (await (await request.get(`/api/clientes/${cliente.id}`, { headers })).json()).cliente;
        expect(atual.excluido_em).toBeNull();
      }
    };
    const dialogo = await exercitarFechamentos(page, 'MODAL-016', abrir,
      'Comparar e mesclar clientes', 'Confirmar mesclagem', semEfeito);
    await dialogo.locator('input[name="destinoMescla"]').first().check();
    await dialogo.locator('#mescla-bairro').selectOption(String(clientes[1].id));
    await dialogo.getByRole('button', { name: 'Confirmar mesclagem' }).click();
    await expect(dialogo).toHaveCount(0);
    const destino = (await (await request.get(`/api/clientes/${clientes[0].id}`, { headers })).json()).cliente;
    const origem = (await (await request.get(`/api/clientes/${clientes[1].id}`, { headers })).json()).cliente;
    expect(destino.bairro).toBe('Bairro B');
    expect(origem.excluido_em).toBeTruthy();
    registrar('MODAL-016', page, 'role=button[name=Confirmar mesclagem]', 'confirmar', 'bairro da origem escolhido no destino; origem arquivada');
    registrar('BTN-152', page, 'role=button[name=Cancelar]', 'cancelar', 'ambos os clientes permaneceram ativos');
  } finally {
    for (const cliente of clientes) {
      const resposta = await request.get(`/api/clientes/${cliente.id}`, { headers });
      if (resposta.status() === 200 && !(await resposta.json()).cliente.excluido_em) await request.delete(`/api/clientes/${cliente.id}`, { headers });
      await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
    }
  }
});
