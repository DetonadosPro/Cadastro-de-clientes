import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { RascunhosProvider } from './RascunhosContext.jsx';
import { ToastProvider } from './ToastContext.jsx';
import { AgendaAlertaProvider } from './AgendaAlertaContext.jsx';
import { TempoRealProvider } from './TempoRealContext.jsx';
import './estilos.css';
import './modernizacao.css';
import './experiencia-v2.css';
import './interface-v3.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <RascunhosProvider>
        <ToastProvider>
          <TempoRealProvider>
            <AgendaAlertaProvider>
              <App />
            </AgendaAlertaProvider>
          </TempoRealProvider>
        </ToastProvider>
      </RascunhosProvider>
    </BrowserRouter>
  </React.StrictMode>
);
