const BANCO_QA = 'pombo_correio_qa_auditoria';

export default async function validarAmbienteQA(config) {
  if (process.env.QA_E2E_ISOLATED_DB !== '1') {
    throw new Error('Suíte abortada: QA_E2E_ISOLATED_DB=1 é obrigatório.');
  }
  if (!process.env.QA_E2E_PASSWORD || !process.env.QA_E2E_MASTER_PASSWORD) {
    throw new Error('Suíte abortada: informe QA_E2E_PASSWORD e QA_E2E_MASTER_PASSWORD.');
  }

  const base = new URL(config.projects[0].use.baseURL);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
    throw new Error('Suíte abortada: o navegador deve apontar para o servidor QA local.');
  }
  const api = new URL('/api/', base);
  const login = await fetch(new URL('auth/login', api), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: process.env.QA_E2E_USER || 'QA_AUDITOR', senha: process.env.QA_E2E_PASSWORD }),
  });
  if (!login.ok) throw new Error(`Suíte abortada: login QA indisponível (${login.status}).`);
  const { token } = await login.json();
  const diagnostico = await fetch(new URL('diagnostico/performance', api), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!diagnostico.ok) throw new Error(`Suíte abortada: diagnóstico QA indisponível (${diagnostico.status}).`);
  const { auditoriaQa } = await diagnostico.json();
  if (auditoriaQa?.ambiente !== 'test' || auditoriaQa?.banco !== BANCO_QA) {
    throw new Error(`Suíte abortada: servidor não confirmou NODE_ENV=test e banco ${BANCO_QA}.`);
  }
}
