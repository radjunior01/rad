import {HashRouter, Navigate, Route, Routes} from 'react-router-dom';
import {Layout} from './components/Layout';
import {StoreProvider} from './context/StoreContext';
import {Aparencia} from './pages/Aparencia';
import {Assistente} from './pages/Assistente';
import {Calendario} from './pages/Calendario';
import {Configuracoes} from './pages/Configuracoes';
import {Dashboard} from './pages/Dashboard';
import {Locais} from './pages/Locais';
import {Totais} from './pages/Totais';
import {Trocas} from './pages/Trocas';

export default function App() {
  return (
    <HashRouter>
      <StoreProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/locais" element={<Locais />} />
            <Route path="/calendario" element={<Calendario />} />
            <Route path="/trocas" element={<Trocas />} />
            <Route path="/totais" element={<Totais />} />
            <Route path="/assistente" element={<Assistente />} />
            <Route path="/aparencia" element={<Aparencia />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Layout>
      </StoreProvider>
    </HashRouter>
  );
}
