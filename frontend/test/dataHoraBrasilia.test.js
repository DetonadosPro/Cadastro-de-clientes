import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dataHoraBrasilia } from '../src/utils/dataHoraBrasilia.js';

test('horário de Brasília mantém o dia anterior ao UTC e normaliza meia-noite', () => {
  assert.deepEqual(dataHoraBrasilia(new Date('2026-10-10T02:55:00Z')), { data: '09/10/26', horario: '23:55' });
  assert.deepEqual(dataHoraBrasilia(new Date('2026-10-10T03:00:00Z')), { data: '10/10/26', horario: '00:00' });
});

test('mesmo instante produz a mesma data e hora com computadores em fusos diferentes', () => {
  const modulo = new URL('../src/utils/dataHoraBrasilia.js', import.meta.url).href;
  const codigo = `import { dataHoraBrasilia } from ${JSON.stringify(modulo)}; console.log(JSON.stringify(dataHoraBrasilia(new Date('2026-10-10T03:55:00Z'))));`;
  for (const TZ of ['UTC', 'Asia/Tokyo', 'America/Sao_Paulo']) {
    const resultado = execFileSync(process.execPath, ['--input-type=module', '-e', codigo], { env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(resultado), { data: '10/10/26', horario: '00:55' });
  }
});
