import React, {useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import {
  Calendar,
  Check,
  Cloud,
  Copy,
  Download,
  Palette,
  RefreshCw,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import {SignaturePad} from '../components/SignaturePad';
import {ConfirmDialog, Field, Modal} from '../components/UI';
import {useStore} from '../context/StoreContext';
import {usePWAInstall} from '../hooks/usePWAInstall';
import {
  AI_PROVIDERS,
  askExternalAI,
  fetchAvailableModels,
  getAIProvider,
} from '../utils/assistant';
import {buildCalendarICS, downloadICS} from '../utils/googleCalendar';
import {parseImportFile, ParseImportResult} from '../utils/importer';
import {exportBackupJSON} from '../utils/storage';
import {
  generateSyncCode,
  isSyncConfigured,
  SUPABASE_SETUP_SQL,
} from '../utils/sync';

type ConfigSection = 'tudo' | 'calculo' | 'ia' | 'nuvem' | 'backup';

const SECTIONS: Array<{id: ConfigSection; label: string}> = [
  {id: 'tudo', label: 'Tudo'},
  {id: 'calculo', label: 'Cálculo e metas'},
  {id: 'ia', label: 'IA externa'},
  {id: 'nuvem', label: 'Nuvem e PWA'},
  {id: 'backup', label: 'Backup'},
];

export const Configuracoes: React.FC = () => {
  const {
    db,
    config,
    sync,
    patchConfig,
    enviarAgora,
    baixarAgora,
    aplicarImportacao,
    carregarExemplo,
    apagarTudo,
    toast,
  } = useStore();
  const {
    instalado,
    podeInstalar,
    ios,
    offlinePronto,
    temAtualizacao,
    verificandoAtualizacao,
    instalar,
    aplicarAtualizacao,
    verificarAtualizacao,
    forcarRecarregamento,
  } = usePWAInstall();

  const [section, setSection] = useState<ConfigSection>('tudo');
  const [models, setModels] = useState<string[]>([]);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);

  const [sqlOpen, setSqlOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<Extract<ParseImportResult, {ok: true}> | null>(
    null,
  );
  const [resetOpen, setResetOpen] = useState(false);

  const selectedProvider = useMemo(
    () => getAIProvider(config.iaProvedor),
    [config.iaProvedor],
  );

  const handleFetchModels = async () => {
    setModelsBusy(true);
    try {
      const list = await fetchAvailableModels(config);
      setModels(list);
      toast(`${list.length} modelo(s) encontrado(s).`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao buscar modelos.', 'erro');
    } finally {
      setModelsBusy(false);
    }
  };

  const handleTestAI = async () => {
    setAiTesting(true);
    try {
      const res = await askExternalAI({
        pergunta: 'Responda apenas com: conexão ok.',
        dados: db,
        config,
      });
      patchConfig({
        iaUltimoTeste: {
          ok: true,
          em: new Date().toISOString(),
          msg: res.resposta || 'Conexão confirmada.',
        },
      });
      toast('Conexão com a IA confirmada!');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha na conexão.';
      patchConfig({
        iaUltimoTeste: {ok: false, em: new Date().toISOString(), msg},
      });
      toast(msg, 'erro');
    } finally {
      setAiTesting(false);
    }
  };

  const handleDownloadBackup = () => {
    const json = exportBackupJSON(db);
    const blob = new Blob([json], {type: 'application/json;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rad-tunopay-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup JSON baixado.');
  };

  const handleSelectImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseImportFile(String(reader.result || ''));
      if (!result.ok) {
        toast(result.motivo, 'erro');
        return;
      }
      setImportPreview(result);
    };
    reader.readAsText(file);
  };

  const syncReady = isSyncConfigured(config);
  const show = (target: ConfigSection) => section === 'tudo' || section === target;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <SlidersHorizontal className="h-5 w-5 text-[var(--accent)]" />
            Configurações de funções
          </h2>
          <p className="text-xs text-[var(--muted)]">
            Ajuste regras de cálculo, assistente com IA, sincronização, PWA e backups.
          </p>
        </div>

        <Link to="/aparencia" className="btn btn-soft min-h-[40px] text-xs">
          <Palette className="h-4 w-4" />
          Tema e aparência
        </Link>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-1">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className={`tab ${section === s.id ? 'active' : ''}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Regras de cálculo */}
      {show('calculo') && (
        <section className="card card-pad space-y-4">
          <div>
            <h3 className="text-base font-bold">Regras de cálculo e metas</h3>
            <p className="text-xs text-[var(--muted)]">
              Defina a meta mensal e os multiplicadores aplicados automaticamente nos registros.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Meta mensal (h)">
              <input
                type="number"
                min="0"
                className="input font-mono"
                value={config.metaMensal}
                onChange={(e) => patchConfig({metaMensal: Number(e.target.value) || 0})}
              />
            </Field>
            <Field label="Adicional extra (%)">
              <input
                type="number"
                min="0"
                className="input font-mono"
                value={config.extraPercent}
                onChange={(e) => patchConfig({extraPercent: Number(e.target.value) || 0})}
              />
            </Field>
            <Field label="Multiplicador feriado">
              <input
                type="number"
                min="1"
                step="0.5"
                className="input font-mono"
                value={config.feriadoMult}
                onChange={(e) => patchConfig({feriadoMult: Number(e.target.value) || 1})}
              />
            </Field>
            <Field label="R$/hora padrão">
              <input
                type="number"
                min="0"
                step="0.5"
                className="input font-mono"
                value={config.valorHoraPadrao}
                onChange={(e) => patchConfig({valorHoraPadrao: Number(e.target.value) || 0})}
              />
            </Field>
          </div>

          <div className="space-y-3 border-t border-[var(--border)] pt-4">
            <div>
              <h4 className="text-sm font-bold">Dados opcionais para recibo e assinatura</h4>
              <p className="text-xs text-[var(--muted)]">
                Saem impressos no cabeçalho e na assinatura do recibo em PDF.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="CPF / CNPJ">
                <input
                  type="text"
                  className="input font-mono text-xs"
                  value={config.documento || ''}
                  onChange={(e) => patchConfig({documento: e.target.value})}
                  placeholder="000.000.000-00"
                />
              </Field>
              <Field label="Registro profissional">
                <input
                  type="text"
                  className="input text-xs"
                  value={config.registroProfissional || ''}
                  onChange={(e) => patchConfig({registroProfissional: e.target.value})}
                  placeholder="Ex.: CRM, COREN, CRP..."
                />
              </Field>
              <Field label="Chave Pix">
                <input
                  type="text"
                  className="input text-xs"
                  value={config.chavePix || ''}
                  onChange={(e) => patchConfig({chavePix: e.target.value})}
                  placeholder="E-mail, CPF, telefone..."
                />
              </Field>
            </div>
            <Field label="Assinatura no recibo (opcional)">
              <SignaturePad
                value={config.assinatura || ''}
                onChange={(sig) => patchConfig({assinatura: sig})}
              />
            </Field>
          </div>
        </section>
      )}

      {/* Assistente externo opcional */}
      {show('ia') && (
        <section className="card card-pad space-y-4">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold">
              <Sparkles className="h-5 w-5 text-[var(--accent)]" />
              Assistente com IA externa (opcional)
            </h3>
            <p className="text-xs text-[var(--muted)]">
              O assistente já funciona offline sem chave. Se quiser, conecte um provedor compatível com OpenAI.
            </p>
          </div>

          <label className="flex min-h-[40px] cursor-pointer items-center gap-2.5 text-sm font-semibold">
            <input
              type="checkbox"
              checked={config.iaAtiva}
              onChange={(e) => patchConfig({iaAtiva: e.target.checked})}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            <span>Usar IA externa quando estiver online</span>
          </label>

          {config.iaAtiva && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Provedor">
                  <select
                    className="input"
                    value={config.iaProvedor}
                    onChange={(e) => {
                      const p = getAIProvider(e.target.value);
                      patchConfig({
                        iaProvedor: p.id,
                        iaBaseUrl: p.baseUrl || config.iaBaseUrl,
                        iaModel: p.modelo || config.iaModel,
                      });
                      setModels([]);
                    }}
                  >
                    {AI_PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Chave da API" hint={selectedProvider.obs}>
                  <input
                    type="password"
                    className="input font-mono text-xs"
                    value={config.iaKey}
                    onChange={(e) => patchConfig({iaKey: e.target.value})}
                    placeholder="Cole sua chave..."
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="URL base (/v1)">
                  <input
                    type="url"
                    className="input font-mono text-xs"
                    value={config.iaBaseUrl}
                    onChange={(e) => patchConfig({iaBaseUrl: e.target.value})}
                  />
                </Field>
                <Field label="Modelo">
                  <div className="flex gap-2">
                    {models.length > 0 ? (
                      <select
                        className="input font-mono text-xs"
                        value={config.iaModel}
                        onChange={(e) => patchConfig({iaModel: e.target.value})}
                      >
                        {!models.includes(config.iaModel) && config.iaModel && (
                          <option value={config.iaModel}>{config.iaModel}</option>
                        )}
                        {models.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        className="input font-mono text-xs"
                        value={config.iaModel}
                        onChange={(e) => patchConfig({iaModel: e.target.value})}
                      />
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost text-xs"
                      disabled={modelsBusy}
                      onClick={handleFetchModels}
                    >
                      {modelsBusy ? '...' : 'Listar'}
                    </button>
                  </div>
                </Field>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="btn btn-soft text-xs"
                  disabled={aiTesting}
                  onClick={handleTestAI}
                >
                  {aiTesting ? 'Testando...' : 'Testar conexão'}
                </button>
                {config.iaUltimoTeste && (
                  <span
                    className={`text-xs font-semibold ${
                      config.iaUltimoTeste.ok ? 'text-[var(--ok)]' : 'text-[var(--danger)]'
                    }`}
                  >
                    {config.iaUltimoTeste.ok ? (
                      <>
                        <Check className="mr-1 inline h-3.5 w-3.5" />
                        {config.iaUltimoTeste.msg}
                      </>
                    ) : (
                      config.iaUltimoTeste.msg
                    )}
                  </span>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* PWA & Sincronização */}
      {show('nuvem') && (
        <>
          <section className="card card-pad space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-base font-bold">
                  <Smartphone className="h-5 w-5 text-[var(--accent)]" />
                  Aplicativo offline (PWA Android / iOS)
                </h3>
                <p className="text-xs text-[var(--muted)]">
                  {instalado
                    ? 'Executando como aplicativo instalado.'
                    : offlinePronto
                      ? 'Pronto para funcionar sem internet e ser instalado no celular.'
                      : 'O cache offline é preparado automaticamente pelo navegador.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!instalado && podeInstalar && (
                  <button
                    type="button"
                    className="btn btn-primary text-xs"
                    onClick={async () => {
                      const res = await instalar();
                      if (res.ok) toast('App instalado!');
                    }}
                  >
                    <Download className="h-4 w-4" />
                    Instalar agora
                  </button>
                )}
                {temAtualizacao ? (
                  <button
                    type="button"
                    className="btn btn-primary text-xs"
                    onClick={aplicarAtualizacao}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Aplicar nova versão
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-soft text-xs"
                    disabled={verificandoAtualizacao}
                    onClick={async () => {
                      const res = await verificarAtualizacao();
                      if (res.status === 'atualizando') {
                        toast('Atualização encontrada! Recarregando...');
                      } else if (res.status === 'atualizado') {
                        toast('Você já está na versão mais recente publicada neste endereço.');
                      } else if (res.status === 'indisponivel') {
                        toast('Sem Service Worker ativo neste ambiente.', 'erro');
                      } else {
                        toast('Verifique sua conexão com a internet para buscar atualizações.', 'erro');
                      }
                    }}
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${verificandoAtualizacao ? 'animate-spin' : ''}`}
                    />
                    {verificandoAtualizacao ? 'Verificando...' : 'Verificar atualização'}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost text-xs"
                  onClick={() => {
                    toast('Limpando cache visual e recarregando...');
                    void forcarRecarregamento();
                  }}
                >
                  Limpar cache e recarregar
                </button>
              </div>
            </div>
            {!instalado && !podeInstalar && (
              <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs text-[var(--muted)]">
                {ios
                  ? 'No iPhone/iPad (Safari): toque em Compartilhar e depois em "Adicionar à Tela de Início".'
                  : 'No Android (Chrome): toque no menu ⋮ do navegador e escolha "Instalar aplicativo" ou "Adicionar à tela inicial".'}
              </p>
            )}
          </section>

          <section className="card card-pad space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-base font-bold">
                  <Calendar className="h-5 w-5 text-[var(--accent)]" />
                  Agenda gratuita (Google Agenda / .ics)
                </h3>
                <p className="text-xs text-[var(--muted)]">
                  Exporte todos os plantões agendados em arquivo .ics para importar de graça no Google Agenda ou calendário do celular.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-soft text-xs"
                onClick={() => {
                  const scheduled = db.registros.filter((r) => !!r.agendado);
                  if (!scheduled.length) {
                    toast('Nenhum plantão agendado cadastrado.', 'erro');
                    return;
                  }
                  const ics = buildCalendarICS(scheduled, db.locais, config);
                  downloadICS(ics, 'plantoes-agendados-rad-tunopay.ics');
                  toast(`${scheduled.length} plantão(ões) exportado(s) em .ics!`);
                }}
              >
                <Download className="h-4 w-4" />
                Baixar agendados (.ics) ({db.registros.filter((r) => !!r.agendado).length})
              </button>
            </div>
          </section>

          <section className="card card-pad space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="flex items-center gap-2 text-base font-bold">
                  <Cloud className="h-5 w-5 text-[var(--accent)]" />
                  Sincronização opcional (Supabase)
                </h3>
                <p className="text-xs text-[var(--muted)]">
                  Sincronize seus dados entre Android e computador usando sua própria tabela no Supabase.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost text-xs"
                onClick={() => setSqlOpen(true)}
              >
                Ver SQL da tabela
              </button>
            </div>

            <label className="flex min-h-[40px] cursor-pointer items-center gap-2.5 text-sm font-semibold">
              <input
                type="checkbox"
                checked={config.syncAtiva}
                onChange={(e) => patchConfig({syncAtiva: e.target.checked})}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span>Ativar sincronização automática</span>
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Project URL (Supabase)">
                <input
                  type="url"
                  className="input font-mono text-xs"
                  value={config.syncUrl}
                  onChange={(e) => patchConfig({syncUrl: e.target.value})}
                  placeholder="https://xxxx.supabase.co"
                />
              </Field>
              <Field label="Anon / Publishable Key">
                <input
                  type="password"
                  className="input font-mono text-xs"
                  value={config.syncKey}
                  onChange={(e) => patchConfig({syncKey: e.target.value})}
                  placeholder="eyJhbGci... ou sb_publishable_..."
                />
              </Field>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <Field
                label="Código de sincronização (compartilhado entre aparelhos)"
                className="min-w-[200px] flex-1"
              >
                <input
                  type="text"
                  className="input font-mono uppercase"
                  value={config.syncCode}
                  onChange={(e) => patchConfig({syncCode: e.target.value.toUpperCase()})}
                  placeholder="EXEM-1234-ABCD"
                />
              </Field>
              <button
                type="button"
                className="btn btn-ghost min-h-[42px] text-xs"
                onClick={() => patchConfig({syncCode: generateSyncCode()})}
              >
                Gerar código
              </button>
              <button
                type="button"
                className="btn btn-soft min-h-[42px] text-xs"
                disabled={!syncReady || sync.estado === 'enviando'}
                onClick={() => enviarAgora()}
              >
                Enviar agora
              </button>
              <button
                type="button"
                className="btn btn-ghost min-h-[42px] text-xs"
                disabled={!syncReady || sync.estado === 'baixando'}
                onClick={async () => {
                  const res = await baixarAgora(config, {forcar: true});
                  if (res.ok && res.aplicado) toast('Dados atualizados da nuvem.');
                  else if (res.motivo) toast(res.motivo, 'erro');
                }}
              >
                Baixar agora
              </button>
            </div>

            {sync.erro && <p className="text-xs text-[var(--danger)]">{sync.erro}</p>}
          </section>
        </>
      )}

      {/* Backup, Importação & Dados */}
      {show('backup') && (
        <section className="card card-pad space-y-4">
          <div>
            <h3 className="text-base font-bold">Backup e dados</h3>
            <p className="text-xs text-[var(--muted)]">
              Exporte seus registros em JSON ou restaure um arquivo de backup anterior.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button type="button" className="btn btn-primary" onClick={handleDownloadBackup}>
              <Download className="h-4 w-4" />
              Exportar backup JSON
            </button>
            <label className="btn btn-soft cursor-pointer">
              <Upload className="h-4 w-4" />
              Restaurar backup
              <input
                type="file"
                accept=".json,.txt,.js,application/json"
                className="sr-only"
                onChange={handleSelectImportFile}
              />
            </label>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                carregarExemplo();
                toast('Dados de exemplo carregados.');
              }}
            >
              Carregar exemplo
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => setResetOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              Apagar tudo
            </button>
          </div>
        </section>
      )}

      {/* SQL Modal */}
      <Modal
        open={sqlOpen}
        onClose={() => setSqlOpen(false)}
        title="SQL da tabela de sincronização (Supabase)"
        footer={
          <>
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => {
                navigator.clipboard?.writeText(SUPABASE_SETUP_SQL);
                toast('SQL copiado.');
              }}
            >
              <Copy className="h-4 w-4" />
              Copiar SQL
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setSqlOpen(false)}>
              Fechar
            </button>
          </>
        }
      >
        <pre className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3.5 font-mono text-xs leading-relaxed">
          {SUPABASE_SETUP_SQL}
        </pre>
      </Modal>

      {/* Import Preview Modal */}
      <Modal
        open={!!importPreview}
        onClose={() => setImportPreview(null)}
        title="Confirmar restauração de backup"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setImportPreview(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (!importPreview) return;
                aplicarImportacao(importPreview.db);
                setImportPreview(null);
                toast('Backup restaurado com sucesso.');
              }}
            >
              Substituir e restaurar
            </button>
          </>
        }
      >
        {importPreview && (
          <div className="space-y-3 text-sm">
            <p className="text-[var(--muted)]">
              Os dados abaixo serão restaurados no aplicativo, substituindo os registros atuais:
            </p>
            <ul className="space-y-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3.5 font-mono text-xs">
              <li>Locais: {importPreview.relatorio.locais}</li>
              <li>Registros: {importPreview.relatorio.registros}</li>
              <li>Pagamentos: {importPreview.relatorio.pagamentos}</li>
              {importPreview.relatorio.trocas > 0 && (
                <li>Trocas de plantão: {importPreview.relatorio.trocas}</li>
              )}
            </ul>
            {importPreview.relatorio.ignorados.length > 0 && (
              <div className="rounded-xl border border-[var(--warn)]/40 bg-[var(--warn-soft)] p-3 text-xs text-[var(--warn)]">
                {importPreview.relatorio.ignorados.map((item, i) => (
                  <p key={i}>• {item}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Apagar todos os dados?"
        body="Isso remove todos os locais, registros de ponto, pagamentos e trocas de plantão salvos neste navegador. Essa ação não pode ser desfeita."
        confirmLabel="Apagar tudo"
        onConfirm={() => {
          apagarTudo();
          toast('Todos os dados foram apagados.');
        }}
      />
    </div>
  );
};
