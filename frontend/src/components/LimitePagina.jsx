import React from 'react';
import { AvisoInline } from './Interface.jsx';

export default class LimitePagina extends React.Component {
  state = { falhou: false };
  static getDerivedStateFromError() { return { falhou: true }; }
  render() {
    if (this.state.falhou) return <AvisoInline titulo="Não foi possível abrir esta página" acao={<button className="btn secundario" onClick={() => window.location.reload()}>Recarregar</button>}>Tente recarregar a página. Seus rascunhos salvos serão preservados.</AvisoInline>;
    return this.props.children;
  }
}
