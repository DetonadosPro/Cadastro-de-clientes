// A ativação é opcional e registra somente interações reais na interface QA.
// A origem JSX vem do React em desenvolvimento; a instrumentação não entra no build.
import fs from 'node:fs';
import path from 'node:path';
import { test } from '@playwright/test';

export function registrarAuditoriaControles() {
  if (process.env.QA_AUDIT_CONTROLS !== '1') return;
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      const chave = '__qa_auditoria_controles';
      const vistos = new Set();
      try {
        for (const item of JSON.parse(localStorage.getItem(chave) || '[]')) vistos.add(JSON.stringify(item));
      } catch { /* sem dados anteriores */ }
      function registrar(tipo, alvo) {
        const fibra = Object.keys(alvo || {}).find((k) => k.startsWith('__reactFiber'));
        let atual = fibra && alvo[fibra];
        let fonte;
        while (atual && !fonte) {
          const candidata = atual._debugSource;
          if (candidata?.fileName?.replaceAll('\\', '/').includes('/frontend/src/')) fonte = candidata;
          atual = atual.return;
        }
        if (!fonte?.fileName || !fonte?.lineNumber) return;
        const arquivo = fonte.fileName.replaceAll('\\', '/');
        const inicio = arquivo.indexOf('/frontend/src/');
        if (inicio < 0) return;
        const item = { tipo, origem: `${arquivo.slice(inicio + 1)}:${fonte.lineNumber}` };
        vistos.add(JSON.stringify(item));
        localStorage.setItem(chave, JSON.stringify([...vistos].map((v) => JSON.parse(v))));
      }
      window.addEventListener('click', (e) => {
        const alvo = e.target?.closest?.('button, a[href], [role="button"], [role="tab"], [role="checkbox"]');
        if (alvo) registrar('acao', alvo);
      }, true);
      window.addEventListener('input', (e) => {
        const alvo = e.target?.closest?.('input, textarea');
        if (alvo) registrar('campo', alvo);
      }, true);
      window.addEventListener('change', (e) => {
        const alvo = e.target?.closest?.('input, textarea, select');
        if (alvo) registrar('campo', alvo);
      }, true);
    });
  });

  test.afterEach(async ({ context }, info) => {
    for (const pagina of context.pages()) {
      if (pagina.isClosed()) continue;
      const eventos = await pagina.evaluate(() => {
        try { return JSON.parse(localStorage.getItem('__qa_auditoria_controles') || '[]'); }
        catch { return []; }
      }).catch(() => []);
      if (!eventos.length) continue;
      fs.appendFileSync(path.resolve('../docs/auditoria/evidencias/interacoes-controles-qa.ndjson'),
        `${JSON.stringify({ teste: info.title, status: info.status, eventos })}\n`);
      break;
    }
  });
}
