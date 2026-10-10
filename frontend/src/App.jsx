import React, { lazy, Suspense } from 'react';
import { EstadoCarregando } from './components/Interface.jsx';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { getUsuarioLogado, getToken } from './api.js';
const Login = lazy(() => import('./pages/Login.jsx'));
const GerenciarUsuarios = lazy(() => import('./pages/GerenciarUsuarios.jsx'));
import Layout from './components/Layout.jsx';
const ListaFonada = lazy(() => import('./pages/fonada/ListaFonada.jsx'));
const FormFonada = lazy(() => import('./pages/fonada/FormFonada.jsx'));
const HojeFonada = lazy(() => import('./pages/fonada/HojeFonada.jsx'));
const ListaAoVivo = lazy(() => import('./pages/aovivo/ListaAoVivo.jsx'));
const FormAoVivo = lazy(() => import('./pages/aovivo/FormAoVivo.jsx'));
const HojeAoVivo = lazy(() => import('./pages/aovivo/HojeAoVivo.jsx'));
const ListaClientes = lazy(() => import('./pages/clientes/ListaClientes.jsx'));
const FormNovoCliente = lazy(() => import('./pages/clientes/FormNovoCliente.jsx'));
const FichaCliente = lazy(() => import('./pages/clientes/FichaCliente.jsx'));
const Lixeira = lazy(() => import('./pages/clientes/Lixeira.jsx'));
const Agenda = lazy(() => import('./pages/agenda/Agenda.jsx'));
const CentralCobranca = lazy(() => import('./pages/cobranca/CentralCobranca.jsx'));
const Relatorios = lazy(() => import('./pages/relatorios/Relatorios.jsx'));
const Recall = lazy(() => import('./pages/recall/Recall.jsx'));
const Configuracoes = lazy(() => import('./pages/Configuracoes.jsx'));

function RotaProtegida({ children }) {
  const location = useLocation();
  const usuario = getUsuarioLogado();
  if (!usuario || !getToken()) return <Navigate to="/login" replace state={{ retorno: location.pathname + location.search + location.hash }} />;
  return children;
}

function PaginaNaoEncontrada() {
  return <div className="estado-vazio painel" role="status">
    <h1>Página não encontrada</h1>
    <p>Confira o endereço ou volte para a Agenda.</p>
    <Link className="btn" to="/agenda">Ir para a Agenda</Link>
  </div>;
}

export default function App() {
  return (
    <Suspense fallback={<EstadoCarregando rotulo="Abrindo página…" />}><Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/gerenciar-usuarios" element={<GerenciarUsuarios />} />

      <Route
        path="/"
        element={
          <RotaProtegida>
            <Layout />
          </RotaProtegida>
        }
      >
        <Route index element={<Navigate to="/agenda" replace />} />

        <Route path="agenda" element={<Agenda />} />
        <Route path="cobranca" element={<CentralCobranca />} />
        <Route path="relatorios" element={<Relatorios />} />
        <Route path="recall" element={<Recall />} />
        <Route path="configuracoes" element={<Configuracoes />} />

        <Route path="clientes" element={<ListaClientes />} />
        <Route path="clientes/novo" element={<FormNovoCliente />} />
        <Route path="clientes/lixeira" element={<Lixeira />} />
        <Route path="clientes/:id" element={<FichaCliente />} />

        <Route path="fonada" element={<ListaFonada />} />
        <Route path="fonada/novo" element={<FormFonada />} />
        <Route path="fonada/hoje" element={<HojeFonada />} />
        <Route path="fonada/:id" element={<FormFonada />} />

        <Route path="ao-vivo" element={<ListaAoVivo />} />
        <Route path="ao-vivo/novo" element={<FormAoVivo />} />
        <Route path="ao-vivo/hoje" element={<HojeAoVivo />} />
        <Route path="ao-vivo/:id" element={<FormAoVivo />} />
        <Route path="*" element={<PaginaNaoEncontrada />} />
      </Route>
    </Routes></Suspense>
  );
}
