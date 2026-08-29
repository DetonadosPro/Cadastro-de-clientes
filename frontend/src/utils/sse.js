export async function lerEventosSse(resposta, aoEvento) {
  const leitor = resposta.body.getReader();
  const decoder = new TextDecoder();
  let acumulado = '';
  while (true) {
    const { done, value } = await leitor.read();
    if (done) break;
    acumulado += decoder.decode(value, { stream: true });
    const blocos = acumulado.split(/\r?\n\r?\n/);
    acumulado = blocos.pop() || '';
    for (const bloco of blocos) {
      const tipo = bloco.match(/^event:\s*(.+)$/m)?.[1];
      const texto = bloco.match(/^data:\s*(.+)$/m)?.[1];
      if (tipo === 'atualizacao' && texto) aoEvento(JSON.parse(texto));
    }
  }
}
