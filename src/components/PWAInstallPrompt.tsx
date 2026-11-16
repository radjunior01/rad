import React, {useState} from 'react';
import {Download, RefreshCw, Share, Smartphone, WifiOff} from 'lucide-react';
import {useOnlineStatus} from '../hooks/useOnlineStatus';
import {usePWAInstall} from '../hooks/usePWAInstall';
import {useStore} from '../context/StoreContext';
import {Modal} from './UI';

export const PWAInstallButton: React.FC = () => {
  const {instalado, podeInstalar, ios, instalar} = usePWAInstall();
  const {toast} = useStore();
  const [guideOpen, setGuideOpen] = useState(false);

  if (instalado) return null;

  const handleClick = async () => {
    if (podeInstalar) {
      const res = await instalar();
      if (res.ok) {
        toast('App instalado na tela inicial.');
      }
      return;
    }
    setGuideOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="btn btn-soft min-h-[40px] px-3 py-1.5 text-xs"
        title="Instalar aplicativo no dispositivo"
      >
        <Download className="h-4 w-4" />
        <span className="hidden sm:inline">Instalar app</span>
        <span className="sm:hidden">Instalar</span>
      </button>

      <Modal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        title={ios ? 'Instalar no iPhone / iPad' : 'Instalar no Android / computador'}
        footer={
          <button type="button" className="btn btn-primary" onClick={() => setGuideOpen(false)}>
            Entendi
          </button>
        }
      >
        {ios ? (
          <div className="space-y-3 text-sm leading-relaxed">
            <p className="text-[var(--muted)]">
              No Safari do iOS, a instalação é feita pelo menu de compartilhamento:
            </p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Toque no ícone <strong>Compartilhar</strong> (<Share className="inline h-4 w-4 align-text-bottom" />) na barra do Safari.
              </li>
              <li>
                Role a lista e escolha <strong>Adicionar à Tela de Início</strong>.
              </li>
              <li>
                Toque em <strong>Adicionar</strong> no canto superior direito.
              </li>
            </ol>
          </div>
        ) : (
          <div className="space-y-3 text-sm leading-relaxed">
            <p className="text-[var(--muted)]">
              Você pode instalar este aplicativo diretamente no Android ou no navegador do computador:
            </p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                No <strong>Chrome</strong> ou <strong>Edge</strong> para Android, abra o menu <strong>⋮</strong> no canto superior direito.
              </li>
              <li>
                Toque em <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.
              </li>
              <li>
                Confirme em <strong>Instalar</strong> para abrir em tela cheia e usar offline.
              </li>
            </ol>
            <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs text-[var(--muted)]">
              <Smartphone className="mr-1.5 inline h-4 w-4 align-text-bottom text-[var(--accent)]" />
              Se estiver visualizando em um iframe de prévia, abra a URL publicada (GitHub Pages ou Netlify) direto no Chrome do celular para ver o prompt nativo.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const {temAtualizacao, aplicarAtualizacao} = usePWAInstall();

  if (isOnline && !temAtualizacao) return null;

  return (
    <div className="flex flex-col gap-2 px-4 pt-3 md:px-7">
      {!isOnline && (
        <div
          role="status"
          className="mx-auto flex w-full max-w-[1120px] items-center gap-2.5 rounded-xl border border-[var(--warn)]/30 bg-[var(--warn-soft)] px-3.5 py-2 text-xs font-semibold text-[var(--warn)]"
        >
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>Você está offline. Registros e PDFs continuam funcionando normalmente no aparelho.</span>
        </div>
      )}
      {temAtualizacao && (
        <div
          role="status"
          className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3.5 py-2 text-xs font-semibold text-[var(--accent)]"
        >
          <span>Nova versão disponível do rad TunoPay.</span>
          <button
            type="button"
            onClick={aplicarAtualizacao}
            className="btn btn-primary min-h-[34px] px-3 py-1 text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar agora
          </button>
        </div>
      )}
    </div>
  );
};
