# Pombo-Correio — Sistema de Pedidos

Sistema local para gerenciar os dois tipos de pedido do negócio:

- **Mensagem fonada** (telefone) — pacote com 2 mensagens em até 6 meses
- **Mensagem ao vivo** (carro de som) — pedido único, com endereço e lista de músicas

---

## 1. Instalar o Node.js (só na primeira vez)

1. Baixe o Node.js em **https://nodejs.org** (escolha a versão "LTS")
2. Instale normalmente (Próximo, Próximo, Instalar)
3. Para confirmar que instalou certo, abra o **Prompt de Comando** (pesquise "cmd" no menu iniciar) e digite:
   ```
   node --version
   ```
   Deve aparecer um número tipo `v22.x.x` ou mais novo (o sistema precisa do Node 22.5 ou superior).

O banco de dados usado (SQLite) já vem embutido no Node — não precisa instalar Python nem Visual Studio Build Tools.

---

## 2. Preparar as pastas do sistema

Extraia a pasta `pombo-correio` em um lugar fácil de achar, por exemplo `C:\pombo-correio`.

Dentro dela você vai ver duas pastas: `backend` e `frontend`.

---

## 3. Instalar as dependências (só na primeira vez, e sempre que atualizar o sistema)

Abra o Prompt de Comando dentro da pasta `backend`:

```
cd C:\pombo-correio\backend
npm install
```

Isso vai baixar tudo que o sistema precisa (leva alguns minutos na primeira vez).

Depois, faça o mesmo na pasta `frontend`, em **outra** janela do Prompt de Comando:

```
cd C:\pombo-correio\frontend
npm install
```

---

## 4. Importar os dados da planilha antiga (só uma vez)

1. Copie o arquivo `cadastro.XLSM` para dentro de `backend\scripts\`
2. No Prompt de Comando, dentro da pasta `backend`:
   ```
   npm run importar
   ```
3. Vai aparecer um resumo tipo:
   ```
   ✅ X usuário(s) importado(s) da aba "usuario".
   ✅ 19917 pacote(s) de mensagem fonada importado(s) da aba "BD".
   ✅ 2490 pedido(s) de mensagem ao vivo importado(s) da aba "aovivo".
   ```

**Atenção**: os usuários de login importados ficam com a mesma senha simples que tinham antes (ou "trocar123" se não tinham senha). Troque essas senhas assim que possível — veja a seção 6.

Se rodar `npm run importar` de novo, os dados serão duplicados. Rode só uma vez (ou apague o arquivo `backend\data\pombo.db` antes de importar de novo).

---

## 5. Ligar o sistema no dia a dia

### Opção mais fácil: clique duplo

Na pasta `pombo-correio` (a pasta principal, ao lado de `backend` e `frontend`) tem dois arquivos:

- **`iniciar.bat`** — dê um clique duplo para ligar o sistema. Ele abre duas janelas pretas (Backend e Frontend) automaticamente. Pode deixá-las abertas minimizadas enquanto usa o sistema.
- **`parar.bat`** — dê um clique duplo para desligar tudo de uma vez.

Depois de rodar `iniciar.bat`, espere alguns segundos e acesse o endereço mostrado na janela do Frontend (normalmente `http://localhost:5173`).

**Importante**: esses dois arquivos precisam ficar em `C:\pombo-correio\` (não dentro de `backend` nem `frontend`) para funcionarem corretamente.

### Opção manual (linha de comando)

Se preferir, ou se o `iniciar.bat` não funcionar por algum motivo, você pode ligar cada parte manualmente. Precisa deixar **duas janelas do Prompt de Comando abertas ao mesmo tempo**: uma pro backend, outra pro frontend.

**Janela 1 — Backend:**
```
cd C:\pombo-correio\backend
npm start
```
Vai aparecer: `✅ Servidor Pombo-Correio rodando em http://localhost:3001`

(Pode aparecer um aviso amarelo `ExperimentalWarning: SQLite is an experimental feature` — isso é normal, é só um aviso do Node sobre o banco de dados embutido, não afeta o funcionamento.)

**Janela 2 — Frontend:**
```
cd C:\pombo-correio\frontend
npm run dev
```
Vai aparecer um endereço tipo `http://localhost:5173`

Abra esse endereço no navegador (Chrome, Edge, etc). Pronto, o sistema está no ar.

Para **desligar**, feche as duas janelas do Prompt de Comando (ou aperte Ctrl+C em cada uma), ou rode o `parar.bat`.

---

## 6. Trocar a senha de um usuário

Ainda não existe uma tela para isso — por enquanto, peça ajuda para criar um novo usuário com senha segura usando este comando (com o backend rodando), substituindo `MEUUSUARIO` e `MINHASENHA`:

```
curl -X POST http://localhost:3001/api/auth/criar-usuario -H "Content-Type: application/json" -d "{\"usuario\":\"MEUUSUARIO\",\"senha\":\"MINHASENHA\"}"
```

---

## 7. Acessar de outros computadores/celulares na mesma rede Wi-Fi

1. Na máquina que está rodando o backend e o frontend, descubra o IP local:
   ```
   ipconfig
   ```
   Procure por "Endereço IPv4" (ex: `192.168.0.10`)

2. Em outro computador/celular na mesma rede, acesse no navegador:
   ```
   http://192.168.0.10:5173
   ```
   (troque pelo IP que você encontrou)

---

## Onde ficam os dados

O banco de dados fica em **um único arquivo**: `backend\data\pombo.db`

Isso é tudo que você precisa fazer backup — copie esse arquivo periodicamente para um lugar seguro (pendrive, nuvem, etc).

---

## Estrutura do projeto

```
pombo-correio/
├── backend/           → API e banco de dados
│   ├── src/
│   │   ├── db/         → schema do banco (database.js)
│   │   ├── routes/      → rotas da API (fonadas, ao-vivo, auth)
│   │   └── server.js    → ponto de entrada
│   ├── scripts/
│   │   └── importar-planilha.js  → importa dados do Excel antigo
│   └── data/
│       └── pombo.db     → o banco de dados (criado automaticamente)
│
└── frontend/           → telas do sistema
    └── src/
        ├── pages/fonada/    → telas de mensagem fonada
        ├── pages/aovivo/    → telas de mensagem ao vivo
        └── components/      → menu lateral, etc
```
