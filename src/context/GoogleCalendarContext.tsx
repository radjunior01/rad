import React, {createContext, useCallback, useContext, useEffect, useState} from 'react';
import {User} from 'firebase/auth';
import {Calendar, Loader2, RefreshCw, Trash2} from 'lucide-react';
import {GoogleSignInButton} from '../components/GoogleSignInButton';
import {Modal} from '../components/UI';
import {RegistroPonto} from '../types';
import {findLocal} from '../utils/calc';
import {formatDateBR} from '../utils/format';
import {
  clearCachedGoogleToken,
  createCalendarEvent,
  deleteCalendarEvent,
  getGoogleAccessToken,
  GoogleAuthExpiredError,
  googleSignIn,
  googleSignOut,
  initGoogleAuth,
  updateCalendarEvent,
} from '../utils/googleCalendar';
import {useStore} from './StoreContext';

export type CalendarSyncAction =
  | {
      kind: 'upsert';
      registro: RegistroPonto;
      localName: string;
    }
  | {
      kind: 'delete';
      registroId: string;
      googleEventId: string;
      label: string;
      clearLocalLink?: boolean;
    };

interface GoogleCalendarContextValue {
  user: User | null;
  connected: boolean;
  needsAuth: boolean;
  isLoggingIn: boolean;
  isSyncing: boolean;
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  requestSyncActions: (actions: CalendarSyncAction[], heading?: string) => void;
  syncSingleShift: (reg: RegistroPonto) => void;
  syncScheduledList: (regs: RegistroPonto[], heading?: string) => void;
  removeShiftEvent: (reg: RegistroPonto, clearLocalLink?: boolean) => void;
}

const GoogleCalendarContext = createContext<GoogleCalendarContextValue | null>(null);

export const GoogleCalendarProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const {locais, config, registros, editarRegistro, toast} = useStore();
  const [user, setUser] = useState<User | null>(null);
  const [tokenReady, setTokenReady] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingHeading, setPendingHeading] = useState('Confirmar no Google Calendar');
  const [pendingActions, setPendingActions] = useState<CalendarSyncAction[] | null>(null);

  useEffect(() => {
    const unsub = initGoogleAuth(
      (authUser) => {
        setUser(authUser);
        setTokenReady(true);
      },
      (authUser) => {
        setUser(authUser);
        setTokenReady(false);
      },
    );
    return () => unsub();
  }, []);

  const connect = useCallback(async (): Promise<boolean> => {
    setIsLoggingIn(true);
    try {
      const res = await googleSignIn();
      setUser(res.user);
      setTokenReady(true);
      toast(`Google Calendar conectado (${res.user.email || 'conta Google'}).`);
      return true;
    } catch (err) {
      const code = (err as {code?: string})?.code || '';
      if (code === 'auth/popup-closed-by-user') {
        toast('Login cancelado.', 'erro');
      } else {
        toast(
          err instanceof Error
            ? err.message
            : 'Não foi possível conectar ao Google Calendar.',
          'erro',
        );
      }
      return false;
    } finally {
      setIsLoggingIn(false);
    }
  }, [toast]);

  const disconnect = useCallback(async () => {
    try {
      await googleSignOut();
      setUser(null);
      setTokenReady(false);
      toast('Conta do Google Calendar desconectada.');
    } catch {
      clearCachedGoogleToken();
      setTokenReady(false);
    }
  }, [toast]);

  const requestSyncActions = useCallback(
    (actions: CalendarSyncAction[], heading = 'Confirmar alterações no Google Calendar') => {
      if (!actions.length) {
        toast('Nenhum plantão agendado para sincronizar.');
        return;
      }
      setPendingHeading(heading);
      setPendingActions(actions);
    },
    [toast],
  );

  const syncSingleShift = useCallback(
    (reg: RegistroPonto) => {
      const loc = findLocal(reg, locais);
      requestSyncActions(
        [
          {
            kind: 'upsert',
            registro: reg,
            localName: loc?.nome || 'Local',
          },
        ],
        reg.googleEventId
          ? 'Atualizar evento no Google Calendar?'
          : 'Criar evento no Google Calendar?',
      );
    },
    [locais, requestSyncActions],
  );

  const syncScheduledList = useCallback(
    (regs: RegistroPonto[], heading = 'Sincronizar plantões agendados com o Google Calendar?') => {
      const actions: CalendarSyncAction[] = regs
        .filter((r) => !!r.agendado)
        .map((r) => ({
          kind: 'upsert',
          registro: r,
          localName: findLocal(r, locais)?.nome || 'Local',
        }));
      requestSyncActions(actions, heading);
    },
    [locais, requestSyncActions],
  );

  const removeShiftEvent = useCallback(
    (reg: RegistroPonto, clearLocalLink = true) => {
      if (!reg.googleEventId) return;
      const loc = findLocal(reg, locais);
      requestSyncActions(
        [
          {
            kind: 'delete',
            registroId: reg.id,
            googleEventId: reg.googleEventId,
            label: `${loc?.nome || 'Plantão'} — ${formatDateBR(reg.data)} (${reg.entrada}–${reg.saida || '—'})`,
            clearLocalLink,
          },
        ],
        'Remover evento do Google Calendar?',
      );
    },
    [locais, requestSyncActions],
  );

  const executePending = async () => {
    if (!pendingActions?.length || isSyncing) return;

    let accessToken = await getGoogleAccessToken();
    if (!accessToken) {
      toast('Conecte sua conta Google antes de confirmar a sincronização.', 'erro');
      return;
    }

    setIsSyncing(true);
    let created = 0;
    let updated = 0;
    let deleted = 0;

    try {
      for (const action of pendingActions) {
        if (action.kind === 'upsert') {
          const reg = action.registro;
          const loc = findLocal(reg, locais);
          if (reg.googleEventId) {
            const updatedEv = await updateCalendarEvent(
              accessToken,
              reg.googleEventId,
              reg,
              loc,
              config,
            );
            editarRegistro(reg.id, {
              googleEventId: updatedEv.id,
              googleEventLink: updatedEv.htmlLink,
            });
            updated += 1;
          } else {
            const createdEv = await createCalendarEvent(accessToken, reg, loc, config);
            editarRegistro(reg.id, {
              googleEventId: createdEv.id,
              googleEventLink: createdEv.htmlLink,
            });
            created += 1;
          }
        } else if (action.kind === 'delete') {
          await deleteCalendarEvent(accessToken, action.googleEventId);
          if (
            action.clearLocalLink &&
            registros.some((r) => r.id === action.registroId)
          ) {
            editarRegistro(action.registroId, {
              googleEventId: undefined,
              googleEventLink: undefined,
            });
          }
          deleted += 1;
        }
      }

      const summaryParts: string[] = [];
      if (created > 0) summaryParts.push(`${created} criado(s)`);
      if (updated > 0) summaryParts.push(`${updated} atualizado(s)`);
      if (deleted > 0) summaryParts.push(`${deleted} removido(s)`);
      toast(`Google Calendar: ${summaryParts.join(', ')}.`);
      setPendingActions(null);
    } catch (err) {
      if (err instanceof GoogleAuthExpiredError) {
        setTokenReady(false);
        toast(err.message, 'erro');
      } else {
        toast(
          err instanceof Error ? err.message : 'Erro ao sincronizar com o Google Calendar.',
          'erro',
        );
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const value: GoogleCalendarContextValue = {
    user,
    connected: !!user && tokenReady,
    needsAuth: !tokenReady,
    isLoggingIn,
    isSyncing,
    connect,
    disconnect,
    requestSyncActions,
    syncSingleShift,
    syncScheduledList,
    removeShiftEvent,
  };

  return (
    <GoogleCalendarContext.Provider value={value}>
      {children}

      <Modal
        open={!!pendingActions}
        onClose={() => {
          if (!isSyncing) setPendingActions(null);
        }}
        title={pendingHeading}
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={isSyncing}
              onClick={() => setPendingActions(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={isSyncing || !tokenReady}
              onClick={executePending}
            >
              {isSyncing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sincronizando...
                </>
              ) : (
                'Confirmar no Google Calendar'
              )}
            </button>
          </>
        }
      >
        {pendingActions && (
          <div className="space-y-3 text-sm">
            <p className="text-[var(--muted)]">
              Revise exatamente o que será alterado na sua agenda principal do Google Calendar:
            </p>

            {!tokenReady && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--warn)]/40 bg-[var(--warn-soft)] p-3 text-xs">
                <span className="font-medium text-[var(--warn)]">
                  Conecte sua conta Google para enviar estas alterações ao calendário.
                </span>
                <GoogleSignInButton
                  compact
                  disabled={isLoggingIn}
                  onClick={() => void connect()}
                  label={isLoggingIn ? 'Conectando...' : 'Conectar Google'}
                />
              </div>
            )}

            {tokenReady && user?.email && (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--muted)]">
                Conta conectada: <strong className="text-[var(--text)]">{user.email}</strong>
              </div>
            )}

            <ul className="max-h-60 space-y-2 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs">
              {pendingActions.map((act, idx) => {
                if (act.kind === 'delete') {
                  return (
                    <li key={`del-${act.registroId}-${idx}`} className="flex items-start gap-2">
                      <Trash2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--danger)]" />
                      <span>
                        <strong className="text-[var(--danger)]">Remover evento:</strong>{' '}
                        {act.label}
                      </span>
                    </li>
                  );
                }
                const isUpdate = !!act.registro.googleEventId;
                return (
                  <li key={`up-${act.registro.id}-${idx}`} className="flex items-start gap-2">
                    {isUpdate ? (
                      <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                    ) : (
                      <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ok)]" />
                    )}
                    <span>
                      <strong className={isUpdate ? 'text-[var(--accent)]' : 'text-[var(--ok)]'}>
                        {isUpdate ? 'Atualizar evento:' : 'Criar evento:'}
                      </strong>{' '}
                      [Plantão] {act.localName} — {formatDateBR(act.registro.data)} (
                      {act.registro.entrada || '08:00'}–{act.registro.saida || '+1h'})
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Modal>
    </GoogleCalendarContext.Provider>
  );
};

export function useGoogleCalendar(): GoogleCalendarContextValue {
  const ctx = useContext(GoogleCalendarContext);
  if (!ctx) throw new Error('useGoogleCalendar deve ser usado dentro de GoogleCalendarProvider');
  return ctx;
}
