import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {
  AppConfig,
  AppDatabase,
  LocalTrabalho,
  Pagamento,
  RegistroPonto,
  SyncState,
  ThemeMode,
  ToastMessage,
  TrocaPlantao,
} from '../types';
import {genId} from '../utils/calc';
import {
  ACCENT_PALETTES,
  applyBackgroundVars,
  clearDatabase,
  createEmptyDatabase,
  createSampleData,
  loadBackgroundSettings,
  loadDatabase,
  saveDatabase,
} from '../utils/storage';
import {isSyncConfigured, pullFromCloud, pushToCloud} from '../utils/sync';

interface StoreContextValue {
  db: AppDatabase;
  config: AppConfig;
  locais: LocalTrabalho[];
  registros: RegistroPonto[];
  pagamentos: Pagamento[];
  trocas: TrocaPlantao[];
  sync: SyncState;
  syncAtivo: boolean;
  patchConfig: (patch: Partial<AppConfig>) => void;
  toast: (msg: string, tipo?: 'ok' | 'erro') => void;
  enviarAgora: (cfgOverride?: AppConfig) => Promise<void>;
  baixarAgora: (
    cfgOverride?: AppConfig,
    opts?: {forcar?: boolean},
  ) => Promise<{ok: boolean; aplicado?: boolean; motivo?: string}>;
  adicionarLocal: (dados: Partial<LocalTrabalho>) => LocalTrabalho;
  editarLocal: (id: string, patch: Partial<LocalTrabalho>) => void;
  excluirLocal: (id: string) => void;
  adicionarRegistro: (dados: Partial<RegistroPonto>) => RegistroPonto;
  editarRegistro: (id: string, patch: Partial<RegistroPonto>) => void;
  excluirRegistro: (id: string) => void;
  adicionarPagamento: (dados: Partial<Pagamento>) => Pagamento;
  excluirPagamento: (id: string) => void;
  adicionarTroca: (dados: Partial<TrocaPlantao>) => TrocaPlantao;
  editarTroca: (id: string, patch: Partial<TrocaPlantao>) => void;
  excluirTroca: (id: string) => void;
  aplicarImportacao: (dados: {
    config?: Partial<AppConfig>;
    locais?: LocalTrabalho[];
    registros?: RegistroPonto[];
    pagamentos?: Pagamento[];
    trocas?: TrocaPlantao[];
  }) => void;
  carregarExemplo: () => void;
  apagarTudo: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

function isDarkMode(tema: ThemeMode): boolean {
  if (tema === 'escuro') return true;
  if (tema === 'claro') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function preserveLocalSecrets(cfg: AppConfig): Partial<AppConfig> {
  const keys: Array<keyof AppConfig> = [
    'iaKey',
    'syncAtiva',
    'syncUrl',
    'syncKey',
    'syncCode',
    'syncUltimoEnvio',
  ];
  const out: Partial<AppConfig> = {};
  for (const k of keys) {
    if (cfg[k] !== undefined) {
      (out as Record<string, unknown>)[k] = cfg[k];
    }
  }
  return out;
}

export const StoreProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [db, setDb] = useState<AppDatabase>(loadDatabase);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [sync, setSync] = useState<SyncState>({
    estado: 'idle',
    ultimo: null,
    erro: '',
    puxadoEm: null,
  });

  const syncingRef = useRef(false);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextPushRef = useRef(false);

  useEffect(() => {
    saveDatabase(db);
  }, [db]);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => root.classList.toggle('dark', isDarkMode(db.config.tema));
    apply();
    applyBackgroundVars(loadBackgroundSettings());

    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = () => apply();
    mq?.addEventListener?.('change', onChange);
    return () => mq?.removeEventListener?.('change', onChange);
  }, [db.config.tema]);

  useEffect(() => {
    const palette = ACCENT_PALETTES[db.config.accent] || ACCENT_PALETTES.indigo;
    const root = document.documentElement;
    const dark = root.classList.contains('dark');
    root.style.setProperty('--accent', palette.hex);
    root.style.setProperty('--accent-2', palette.hex);
    root.style.setProperty('--accent-soft', dark ? palette.softDark : palette.soft);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0b1020' : palette.hex);
    applyBackgroundVars(loadBackgroundSettings());
  }, [db.config.accent, db.config.tema]);

  const mutateDb = useCallback((updater: (prev: AppDatabase) => AppDatabase) => {
    setDb((prev) => {
      const next = updater(prev);
      return {
        ...next,
        meta: {...(next.meta || {}), atualizadoEm: new Date().toISOString()},
      };
    });
  }, []);

  const enviarAgora = useCallback(
    async (cfgOverride?: AppConfig) => {
      const cfg = cfgOverride || db.config;
      if (!isSyncConfigured(cfg)) return;
      syncingRef.current = true;
      setSync((s) => ({...s, estado: 'enviando'}));
      try {
        const res = await pushToCloud(cfg, db);
        setSync({estado: 'ok', ultimo: res.em, erro: '', puxadoEm: null});
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao enviar.';
        setSync((s) => ({...s, estado: 'erro', erro: msg}));
      } finally {
        syncingRef.current = false;
      }
    },
    [db],
  );

  const baixarAgora = useCallback(
    async (cfgOverride?: AppConfig, opts: {forcar?: boolean} = {}) => {
      const cfg = cfgOverride || db.config;
      if (!isSyncConfigured(cfg)) return {ok: false, motivo: 'não configurado'};
      syncingRef.current = true;
      setSync((s) => ({...s, estado: 'baixando'}));
      try {
        const cloud = await pullFromCloud(cfg);
        if (!cloud) {
          syncingRef.current = false;
          setSync({estado: 'vazio', ultimo: null, erro: '', puxadoEm: null});
          return {ok: false, motivo: 'sem dados na nuvem'};
        }
        const localTs = new Date(db.meta?.atualizadoEm || 0).getTime();
        const cloudTs = new Date(cloud.em || 0).getTime();
        if (!(opts.forcar || !localTs || cloudTs >= localTs)) {
          syncingRef.current = false;
          setSync({estado: 'local-mais-novo', ultimo: cloud.em, erro: '', puxadoEm: null});
          return {ok: true, aplicado: false};
        }
        const payload = cloud.payload || {};
        skipNextPushRef.current = true;
        setDb((prev) => ({
          ...prev,
          locais: payload.locais || [],
          registros: payload.registros || [],
          pagamentos: payload.pagamentos || [],
          trocas: Array.isArray(payload.trocas) ? payload.trocas : prev.trocas || [],
          config: {
            ...prev.config,
            ...(payload.config || {}),
            ...preserveLocalSecrets(prev.config),
          },
          meta: {
            ...(payload.meta || {}),
            atualizadoEm: cloud.em || payload.meta?.atualizadoEm || null,
          },
        }));
        setSync({
          estado: 'ok',
          ultimo: cloud.em,
          erro: '',
          puxadoEm: new Date().toISOString(),
        });
        return {ok: true, aplicado: true};
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao baixar.';
        setSync((s) => ({...s, estado: 'erro', erro: msg}));
        return {ok: false, motivo: msg};
      } finally {
        syncingRef.current = false;
      }
    },
    [db.config, db.meta?.atualizadoEm],
  );

  const toast = useCallback((msg: string, tipo: 'ok' | 'erro' = 'ok') => {
    const id = genId();
    setToasts((list) => [...list, {id, msg, tipo}]);
    setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  useEffect(() => {
    if (isSyncConfigured(db.config)) {
      baixarAgora(db.config);
    }
    // run only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isSyncConfigured(db.config) || syncingRef.current || !db.meta?.atualizadoEm) return;
    if (skipNextPushRef.current) {
      skipNextPushRef.current = false;
      return;
    }
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => {
      enviarAgora(db.config);
    }, 2500);
    return () => {
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    };
  }, [db.meta?.atualizadoEm, db.config, enviarAgora]);

  const value = useMemo<StoreContextValue>(() => {
    const patchConfig = (patch: Partial<AppConfig>) => {
      const touchesAI = ['iaBaseUrl', 'iaModel', 'iaKey', 'iaProvedor', 'iaAtiva'].some(
        (k) => k in patch,
      );
      mutateDb((prev) => ({
        ...prev,
        config: {
          ...prev.config,
          ...patch,
          ...(touchesAI ? {iaUltimoTeste: null} : {}),
        },
      }));
    };

    return {
      db,
      config: db.config,
      locais: db.locais,
      registros: db.registros,
      pagamentos: db.pagamentos,
      trocas: db.trocas || [],
      sync,
      syncAtivo: isSyncConfigured(db.config),
      patchConfig,
      toast,
      enviarAgora,
      baixarAgora,
      adicionarLocal(dados) {
        const novo: LocalTrabalho = {
          id: genId(),
          nome: '',
          tipo: 'Fixo',
          valor_hora: 0,
          limite_normal: 8,
          fds_percent: 0,
          cor: '#4f46e5',
          raio: 300,
          lat: null,
          lng: null,
          obs: '',
          ...dados,
        };
        mutateDb((prev) => ({...prev, locais: [...prev.locais, novo]}));
        return novo;
      },
      editarLocal(id, patch) {
        mutateDb((prev) => ({
          ...prev,
          locais: prev.locais.map((l) => (l.id === id ? {...l, ...patch} : l)),
        }));
      },
      excluirLocal(id) {
        if (db.registros.some((r) => r.localId === id)) {
          throw new Error('Este local tem registros e não pode ser excluído.');
        }
        mutateDb((prev) => ({
          ...prev,
          locais: prev.locais.filter((l) => l.id !== id),
        }));
      },
      adicionarRegistro(dados) {
        const novo: RegistroPonto = {
          id: genId(),
          localId: '',
          data: '',
          entrada: '',
          saida: '',
          pausa_min: 0,
          feriado: false,
          troca_plantao: '',
          obs: '',
          ...dados,
        };
        mutateDb((prev) => ({...prev, registros: [...prev.registros, novo]}));
        return novo;
      },
      editarRegistro(id, patch) {
        mutateDb((prev) => ({
          ...prev,
          registros: prev.registros.map((r) => (r.id === id ? {...r, ...patch} : r)),
        }));
      },
      excluirRegistro(id) {
        mutateDb((prev) => ({
          ...prev,
          registros: prev.registros.filter((r) => r.id !== id),
        }));
      },
      adicionarPagamento(dados) {
        const novo: Pagamento = {
          id: genId(),
          localId: '',
          valor: 0,
          data: new Date().toISOString().slice(0, 10),
          obs: '',
          ...dados,
        };
        mutateDb((prev) => ({...prev, pagamentos: [...prev.pagamentos, novo]}));
        return novo;
      },
      excluirPagamento(id) {
        mutateDb((prev) => ({
          ...prev,
          pagamentos: prev.pagamentos.filter((p) => p.id !== id),
        }));
      },
      adicionarTroca(dados) {
        const novo: TrocaPlantao = {
          id: genId(),
          paraQuem: '',
          dataTrabalho: new Date().toISOString().slice(0, 10),
          horasTrabalhadas: 0,
          horasRessarcidas: 0,
          dataRessarcimento: '',
          obs: '',
          ...dados,
        };
        mutateDb((prev) => ({...prev, trocas: [...(prev.trocas || []), novo]}));
        return novo;
      },
      editarTroca(id, patch) {
        mutateDb((prev) => ({
          ...prev,
          trocas: (prev.trocas || []).map((t) => (t.id === id ? {...t, ...patch} : t)),
        }));
      },
      excluirTroca(id) {
        mutateDb((prev) => ({
          ...prev,
          trocas: (prev.trocas || []).filter((t) => t.id !== id),
        }));
      },
      aplicarImportacao(dados) {
        const fresh = createEmptyDatabase();
        const cfgPatch: Partial<AppConfig> = {};
        if (dados.config) {
          for (const k of [
            'nome',
            'documento',
            'registroProfissional',
            'chavePix',
            'assinatura',
            'metaMensal',
            'extraPercent',
            'feriadoMult',
            'valorHoraPadrao',
          ] as const) {
            const val = dados.config[k];
            if (val !== undefined && val !== null) {
              (cfgPatch as Record<string, unknown>)[k] = val;
            }
          }
        }
        mutateDb((prev) => ({
          ...fresh,
          config: {
            ...fresh.config,
            documento: prev.config.documento,
            registroProfissional: prev.config.registroProfissional,
            chavePix: prev.config.chavePix,
            assinatura: prev.config.assinatura,
            ...cfgPatch,
            tema: prev.config.tema,
            accent: prev.config.accent,
            iaAtiva: prev.config.iaAtiva,
            iaProvedor: prev.config.iaProvedor,
            iaBaseUrl: prev.config.iaBaseUrl,
            iaModel: prev.config.iaModel,
            iaKey: prev.config.iaKey,
            iaUltimoTeste: prev.config.iaUltimoTeste,
          },
          locais: dados.locais || [],
          registros: dados.registros || [],
          pagamentos: dados.pagamentos || [],
          trocas: dados.trocas || [],
        }));
      },
      carregarExemplo() {
        setDb(createSampleData());
      },
      apagarTudo() {
        clearDatabase();
        setDb(createEmptyDatabase());
      },
    };
  }, [db, sync, toast, enviarAgora, baixarAgora, mutateDb]);

  return (
    <StoreContext.Provider value={value}>
      {children}
      <div className="fixed inset-x-0 bottom-24 z-[80] flex flex-col items-center gap-2 px-4 pointer-events-none md:bottom-8">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pop card pointer-events-auto px-4 py-3 text-sm font-semibold shadow-lg"
            style={{
              background: t.tipo === 'erro' ? 'var(--danger-soft)' : 'var(--surface)',
              color: t.tipo === 'erro' ? 'var(--danger)' : 'var(--text)',
              borderColor: t.tipo === 'erro' ? 'var(--danger)' : 'var(--border)',
              maxWidth: 420,
            }}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </StoreContext.Provider>
  );
};

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore deve ser usado dentro de StoreProvider');
  return ctx;
}
