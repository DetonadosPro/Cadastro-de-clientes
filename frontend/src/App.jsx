import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { getUsuarioLogado } from './api.js';
import Login from './pages/Login.jsx';
import GerenciarUsuarios from './pages/GerenciarUsuarios.jsx';
import Layout from './components/Layout.jsx';
import ListaFonada from './pages/fonada/ListaFonada.jsx';
import FormFonada from './pages/fonada/FormFonada.jsx';
import HojeFonada from './pages/fonada/HojeFonada.jsx';
import ListaAoVivo from './pages/aovivo/ListaAoVivo.jsx';
import FormAoVivo from './pages/aovivo/FormAoVivo.jsx';
import HojeAoVivo from './pages/aovivo/HojeAoVivo.jsx';
import ListaClientes from './pages/clientes/ListaClientes.jsx';
import FormNovoCliente from './pages/clientes/FormNovoCliente.jsx';
import FichaCliente from './pages/clientes/FichaCliente.jsx';
import Lixeira from './pages/clientes/Lixeira.jsx';
import Agenda from './pages/agenda/Agenda.jsx';
import ListaCobranca from './pages/cobranca/ListaCobranca.jsx';
import Relatorios from './pages/relatorios/Relatorios.jsx';

function RotaProtegida({ children }) {
  const usuario = getUsuarioLogado();
  if (!usuario) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
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
        <Route path="cobranca" element={<ListaCobranca />} />
        <Route path="relatorios" element={<Relatorios />} />

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
      </Route>
    </Routes>
  );
}
