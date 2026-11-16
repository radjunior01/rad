import React, {useMemo, useState} from 'react';
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  ExternalLink,
  LogOut,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import {GoogleSignInButton} from '../components/GoogleSignInButton';
import {RegistroModal} from '../components/RegistroModal';
import {ConfirmDialog, Modal} from '../components/UI';
import {useGoogleCalendar} from '../context/GoogleCalendarContext';
import {useStore} from '../context/StoreContext';
import {RegistroPonto} from '../types';
import {calcRegistro, filterByMonth, findLocal, isTrocaLocal, summarizeRegistros} from '../utils/calc';
import {
  addMonths,
  DIAS_SEMANA_CURTO,
  formatCurrencyBRL,
  formatDateBR,
  formatHours,
  formatMesRefNome,
  hojeISO,
  mesAtualRef,
  pad2,
} from '../utils/format';

export const Calendario: React.FC = () => {
  const {locais, registros, config, editarRegistro, excluirRegistro, toast} = useStore();
  const gcal = useGoogleCalendar();
  const [mesRef, setMesRef] = useState(mesAtualRef);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingReg, setEditingReg] = useState<RegistroPonto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RegistroPonto | null>(null);

  const hoje = hojeISO();
  const regularRegistros = useMemo(
    () =>
      registros.filter((r) => {
        const loc = findLocal(r, locais);
        return !isTrocaLocal(loc) && r.troca_plantao !== 'compensado';
      }),
    [registros, locais],
  );
  const regsMes = useMemo(() => filterByMonth(regularRegistros, mesRef), [regularRegistros, mesRef]);
  const regsTrabalhadosMes = useMemo(() => regsMes.filter((r) => !r.agendado), [regsMes]);
  const regsAgendadosMes = useMemo(() => regsMes.filter((r) => !!r.agendado), [regsMes]);
  const sumMes = useMemo(
    () => summarizeRegistros(regsTrabalhadosMes, locais, config),
    [regsTrabalhadosMes, locais, config],
  );
  const sumAgendadosMes = useMemo(
    () => summarizeRegistros(regsAgendadosMes, locais, config),
    [regsAgendadosMes, locais, config],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, RegistroPonto[]>();
    for (const r of regsMes) {
      const list = map.get(r.data) || [];
      list.push(r);
      map.set(r.data, list);
    }
    return map;
  }, [regsMes]);

  const calendarCells = useMemo(() => {
    const [y, m] = mesRef.split('-').map(Number);
    const firstWeekday = new Date(y, m - 1, 1).getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const cells: Array<{iso: string | null; day: number | null}> = [];
    for (let i = 0; i < firstWeekday; i++) cells.push({iso: null, day: null});
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({iso: `${mesRef}-${pad2(d)}`, day: d});
    }
    return cells;
  }, [mesRef]);

  const diasTrabalhados = byDate.size;
  const dayRecords = selectedDay
    ? [...(byDate.get(selectedDay) || [])].sort((a, b) => a.entrada.localeCompare(b.entrada))
    : [];

  return (
    <div className="space-y-5">
      {/* Month header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost min-h-[42px] px-3"
            onClick={() => setMesRef((m) => addMonths(m, -1))}
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="min-w-[160px] text-center text-base font-bold capitalize sm:text-lg">
            {formatMesRefNome(mesRef)}
          </h2>
          <button
            type="button"
            className="btn btn-ghost min-h-[42px] px-3"
            onClick={() => setMesRef((m) => addMonths(m, 1))}
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {mesRef !== mesAtualRef() && (
            <button
              type="button"
              className="btn btn-soft min-h-[40px] px-3 text-xs"
              onClick={() => setMesRef(mesAtualRef())}
            >
              Hoje
            </button>
          )}
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setEditingReg(null);
            setModalOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Novo registro
        </button>
      </div>

      {/* Summary strip */}
      <div className="card card-pad flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm tabular-nums">
        <span>
          <strong className="font-mono text-[var(--text)]">{diasTrabalhados}</strong>{' '}
          <span className="text-[var(--muted)]">
            {diasTrabalhados === 1 ? 'dia na agenda' : 'dias na agenda'}
          </span>
        </span>
        <span>
          <strong className="font-mono text-[var(--text)]">{formatHours(sumMes.horas)}</strong>{' '}
          <span className="text-[var(--muted)]">({formatHours(sumMes.extras)} extras)</span>
          {sumAgendadosMes.horas > 0 && (
            <span className="ml-1.5 text-[var(--accent)]">
              + {formatHours(sumAgendadosMes.horas)} agend.
            </span>
          )}
        </span>
        <span className="font-mono font-bold text-[var(--accent)]">
          {formatCurrencyBRL(sumMes.valor)}
          {sumAgendadosMes.valor > 0 && (
            <span className="ml-1.5 font-normal text-[var(--muted)]">
              (prev. {formatCurrencyBRL(sumMes.valor + sumAgendadosMes.valor)})
            </span>
          )}
        </span>
      </div>

      {/* Google Calendar sync bar */}
      <div className="card card-pad flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <Calendar className="h-4 w-4 shrink-0 text-[var(--accent)]" />
          <div>
            <div className="font-bold text-[var(--text)]">Google Calendar</div>
            <div className="text-[var(--muted)]">
              {gcal.connected
                ? `Conectado: ${gcal.user?.email || 'conta Google'}`
                : 'Conecte sua conta para sincronizar plantões agendados.'}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {gcal.connected ? (
            <>
              <button
                type="button"
                className="btn btn-soft min-h-[36px] px-3 py-1.5 text-xs"
                onClick={() => {
                  const list = regsAgendadosMes.length
                    ? regsAgendadosMes
                    : regularRegistros.filter((r) => !!r.agendado && r.data >= hoje);
                  gcal.syncScheduledList(
                    list,
                    regsAgendadosMes.length
                      ? `Sincronizar ${regsAgendadosMes.length} plantão(ões) agendado(s) do mês?`
                      : 'Sincronizar próximos plantões agendados?',
                  );
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Sincronizar agendados ({regsAgendadosMes.length || regularRegistros.filter((r) => !!r.agendado && r.data >= hoje).length})
              </button>
              <button
                type="button"
                className="btn btn-ghost min-h-[36px] px-3 py-1.5 text-xs"
                onClick={() => void gcal.disconnect()}
                title="Desconectar conta Google"
              >
                <LogOut className="h-3.5 w-3.5" />
                Desconectar
              </button>
            </>
          ) : (
            <GoogleSignInButton
              compact
              disabled={gcal.isLoggingIn}
              onClick={() => void gcal.connect()}
              label={gcal.isLoggingIn ? 'Conectando...' : 'Conectar com o Google'}
            />
          )}
        </div>
      </div>

      {/* Calendar grid */}
      <div className="card card-pad">
        <div className="mb-2 grid grid-cols-7 text-center text-xs font-bold uppercase text-[var(--muted)]">
          {DIAS_SEMANA_CURTO.map((d) => (
            <div key={d} className="py-1.5">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {calendarCells.map((cell, idx) => {
            if (!cell.iso || !cell.day) {
              return <div key={`empty-${idx}`} className="min-h-[62px] sm:min-h-[82px]" />;
            }
            const list = byDate.get(cell.iso) || [];
            const workedList = list.filter((r) => !r.agendado);
            const schedList = list.filter((r) => !!r.agendado);
            const daySum = summarizeRegistros(workedList.length ? workedList : schedList, locais, config);
            const onlyScheduled = workedList.length === 0 && schedList.length > 0;
            const hasFeriado = list.some((r) => r.feriado);
            const hasOpen = workedList.some((r) => r.entrada && !r.saida);
            const isToday = cell.iso === hoje;
            const colors = Array.from(
              new Set(list.map((r) => findLocal(r, locais)?.cor || '#64748b')),
            ).slice(0, 3);

            return (
              <button
                key={cell.iso}
                type="button"
                onClick={() => setSelectedDay(cell.iso)}
                className={`flex min-h-[62px] flex-col justify-between rounded-xl border p-1.5 text-left transition-colors sm:min-h-[82px] sm:p-2 ${
                  isToday
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]/50'
                    : onlyScheduled
                      ? 'border-dashed border-[var(--accent)]/60 bg-[var(--surface-2)]/60 hover:border-[var(--accent)]'
                      : list.length
                        ? 'border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--accent)]/60'
                        : 'border-[var(--border)]/60 bg-transparent hover:bg-[var(--surface-2)]'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={`font-mono text-xs font-bold tabular-nums ${
                      isToday ? 'text-[var(--accent)]' : 'text-[var(--text)]'
                    }`}
                  >
                    {cell.day}
                  </span>
                  <div className="flex items-center gap-1">
                    {schedList.length > 0 && (
                      <span
                        title="Plantão agendado"
                        className="text-[10px] font-bold text-[var(--accent)]"
                      >
                        AG
                      </span>
                    )}
                    {hasFeriado && (
                      <span
                        title="Feriado"
                        className="text-[10px] font-bold text-[var(--warn)]"
                      >
                        FER
                      </span>
                    )}
                  </div>
                </div>

                {list.length > 0 && (
                  <div className="space-y-1">
                    <div
                      className={`font-mono text-[11px] font-bold leading-none tabular-nums ${
                        onlyScheduled ? 'text-[var(--accent)]' : ''
                      }`}
                    >
                      {hasOpen ? 'aberto' : formatHours(daySum.horas)}
                      {daySum.extras > 0 ? '+' : ''}
                    </div>
                    <div className="flex items-center gap-1">
                      {colors.map((c, i) => (
                        <span
                          key={i}
                          className="h-2 w-2 rounded-full"
                          style={{background: c}}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Day details modal */}
      <Modal
        open={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? `Dia ${formatDateBR(selectedDay)}` : ''}
        footer={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setEditingReg(null);
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Adicionar neste dia
          </button>
        }
      >
        {!dayRecords.length ? (
          <p className="py-6 text-center text-sm text-[var(--muted)]">
            Nenhum registro lançado neste dia.
          </p>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {dayRecords.map((r) => {
              const loc = findLocal(r, locais);
              const calc = calcRegistro(r, loc, config);
              return (
                <div key={r.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-bold">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{background: loc?.cor || 'var(--muted)'}}
                      />
                      <span className="truncate">{loc?.nome || 'Local removido'}</span>
                      {r.agendado && (
                        <span className="rounded-md bg-[var(--accent-soft)] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--accent)]">
                          Agendado
                        </span>
                      )}
                      {r.googleEventId && (
                        <span className="rounded-md bg-[var(--ok-soft)] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--ok)]">
                          Google Agenda
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--muted)] tabular-nums">
                      {r.entrada}–{r.saida || 'aberto'}
                      {r.pausa_min ? ` · pausa ${r.pausa_min}m` : ''}
                      {calc.horas > 0 ? ` · ${formatHours(calc.horas)}` : ''}
                      {calc.extras > 0 ? ` (${formatHours(calc.extras)} extras)` : ''}
                      {r.feriado ? ' · Feriado' : ''}
                    </div>
                    {r.obs && <div className="mt-1 text-xs text-[var(--muted)]">{r.obs}</div>}
                    {r.googleEventLink && (
                      <a
                        href={r.googleEventLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)] hover:underline"
                      >
                        Ver no Google Calendar <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!calc.aberto && !calc.troca && (
                      <span className="mr-1 font-mono text-xs font-bold tabular-nums">
                        {formatCurrencyBRL(calc.valor)}
                      </span>
                    )}
                    {r.agendado && (
                      <button
                        type="button"
                        onClick={() => gcal.syncSingleShift(r)}
                        title={
                          r.googleEventId
                            ? 'Atualizar evento no Google Calendar'
                            : 'Enviar para o Google Calendar'
                        }
                        aria-label="Sincronizar com Google Calendar"
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--accent)] hover:bg-[var(--accent-soft)]"
                      >
                        <Calendar className="h-4 w-4" />
                      </button>
                    )}
                    {r.agendado && (
                      <button
                        type="button"
                        onClick={() => {
                          editarRegistro(r.id, {agendado: false});
                          toast('Plantão confirmado como realizado!');
                        }}
                        title="Confirmar como ponto trabalhado"
                        className="btn btn-soft min-h-[34px] px-2.5 py-1 text-xs"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Confirmar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingReg(r);
                        setModalOpen(true);
                      }}
                      aria-label="Editar registro"
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(r)}
                      aria-label="Excluir registro"
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      <RegistroModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingReg(null);
        }}
        registro={editingReg}
        defaultData={selectedDay || undefined}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Excluir registro?"
        body={
          deleteTarget
            ? `Excluir o turno de ${formatDateBR(deleteTarget.data)} (${deleteTarget.entrada}–${deleteTarget.saida || 'aberto'})?${deleteTarget.googleEventId ? ' Se quiser, você também poderá remover o evento do Google Calendar em seguida.' : ''}`
            : ''
        }
        confirmLabel="Excluir"
        onConfirm={() => {
          if (deleteTarget) {
            const toDelete = deleteTarget;
            excluirRegistro(toDelete.id);
            toast('Registro excluído.');
            if (toDelete.googleEventId) {
              gcal.removeShiftEvent(toDelete, false);
            }
          }
        }}
      />
    </div>
  );
};
