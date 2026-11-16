import React, {useEffect, useMemo, useRef, useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {ArrowLeftRight, CalendarPlus, CheckCircle2, Edit3, Plus, Trash2} from 'lucide-react';
import {ConfirmDialog, EmptyState, Field, Modal, StatCard} from '../components/UI';
import {useStore} from '../context/StoreContext';
import {TrocaDirecao, TrocaPlantao, TrocaRessarcimentoItem} from '../types';
import {genId, getTrocaHorasRessarcidas, summarizeTrocasPlantao} from '../utils/calc';
import {formatDateBR, formatHours, hojeISO, normalizeText} from '../utils/format';

type StatusFilter = 'todas' | 'pendentes' | 'quitadas';
type DirecaoFilter = 'todas' | TrocaDirecao;

const QUICK_HOURS = [6, 8, 12, 24];

export const Trocas: React.FC = () => {
  const {trocas, adicionarTroca, editarTroca, excluirTroca, toast} = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const openedShortcutRef = useRef(false);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todas');
  const [direcaoFilter, setDirecaoFilter] = useState<DirecaoFilter>('todas');
  const [pessoaFilter, setPessoaFilter] = useState('');

  // Main create/edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TrocaPlantao | null>(null);
  const [direcao, setDirecao] = useState<TrocaDirecao>('eu_trabalhei');
  const [paraQuem, setParaQuem] = useState('');
  const [dataTrabalho, setDataTrabalho] = useState(hojeISO());
  const [horasTrabalhadas, setHorasTrabalhadas] = useState('12');
  const [horasRessarcidas, setHorasRessarcidas] = useState('0');
  const [dataRessarcimento, setDataRessarcimento] = useState('');
  const [obs, setObs] = useState('');

  // Partial repayment modal
  const [repTarget, setRepTarget] = useState<TrocaPlantao | null>(null);
  const [repHoras, setRepHoras] = useState('6');
  const [repData, setRepData] = useState(hojeISO());
  const [repObs, setRepObs] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<TrocaPlantao | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDirecao('eu_trabalhei');
    setParaQuem('');
    setDataTrabalho(hojeISO());
    setHorasTrabalhadas('12');
    setHorasRessarcidas('0');
    setDataRessarcimento('');
    setObs('');
    setModalOpen(true);
  };

  useEffect(() => {
    if (searchParams.get('nova') !== '1') {
      openedShortcutRef.current = false;
      return;
    }
    if (openedShortcutRef.current) return;
    openedShortcutRef.current = true;
    setSearchParams({}, {replace: true});
    openCreate();
  }, [searchParams, setSearchParams]);

  const pessoasUnicas = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of trocas) {
      const nome = String(t.paraQuem || '').trim();
      if (!nome) continue;
      const key = normalizeText(nome);
      if (!map.has(key)) map.set(key, nome);
    }
    return Array.from(map.entries())
      .map(([key, nome]) => ({key, nome}))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [trocas]);

  const filteredTrocas = useMemo(() => {
    return trocas
      .filter((t) => {
        const dir: TrocaDirecao =
          t.direcao === 'cobriu_para_mim' ? 'cobriu_para_mim' : 'eu_trabalhei';
        if (direcaoFilter !== 'todas' && dir !== direcaoFilter) return false;
        if (pessoaFilter && normalizeText(t.paraQuem) !== pessoaFilter) return false;
        const trab = Math.max(0, Number(t.horasTrabalhadas) || 0);
        const res = getTrocaHorasRessarcidas(t);
        if (statusFilter === 'pendentes' && res >= trab) return false;
        if (statusFilter === 'quitadas' && res < trab) return false;
        return true;
      })
      .sort(
        (a, b) =>
          String(b.dataTrabalho || '').localeCompare(String(a.dataTrabalho || '')) ||
          a.paraQuem.localeCompare(b.paraQuem, 'pt-BR'),
      );
  }, [trocas, direcaoFilter, pessoaFilter, statusFilter]);

  const summary = useMemo(
    () =>
      summarizeTrocasPlantao(
        pessoaFilter
          ? trocas.filter((t) => normalizeText(t.paraQuem) === pessoaFilter)
          : trocas,
      ),
    [trocas, pessoaFilter],
  );

  const openEdit = (t: TrocaPlantao) => {
    setEditing(t);
    setDirecao(t.direcao === 'cobriu_para_mim' ? 'cobriu_para_mim' : 'eu_trabalhei');
    setParaQuem(t.paraQuem || '');
    setDataTrabalho(t.dataTrabalho || hojeISO());
    setHorasTrabalhadas(String(t.horasTrabalhadas ?? 0));
    setHorasRessarcidas(String(getTrocaHorasRessarcidas(t)));
    setDataRessarcimento(t.dataRessarcimento || '');
    setObs(t.obs || '');
    setModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paraQuem.trim()) {
      toast('Informe o nome do colega.', 'erro');
      return;
    }
    if (!dataTrabalho) {
      toast('Informe a data do plantão.', 'erro');
      return;
    }
    const trab = Math.max(0, Number(horasTrabalhadas) || 0);
    const res = Math.max(0, Number(horasRessarcidas) || 0);
    if (trab <= 0) {
      toast('Informe quantas horas tem o plantão.', 'erro');
      return;
    }

    let historico = editing?.historicoRessarcimentos ? [...editing.historicoRessarcimentos] : undefined;
    if (!editing && res > 0) {
      historico = [
        {
          id: genId(),
          data: dataRessarcimento || hojeISO(),
          horas: res,
          obs: 'Ressarcimento inicial',
        },
      ];
    } else if (editing && (!historico || !historico.length) && res > 0) {
      historico = [
        {
          id: genId(),
          data: dataRessarcimento || hojeISO(),
          horas: res,
        },
      ];
    }

    const payload: Partial<TrocaPlantao> = {
      direcao,
      paraQuem: paraQuem.trim(),
      dataTrabalho,
      horasTrabalhadas: trab,
      horasRessarcidas: historico?.length
        ? historico.reduce((acc, item) => acc + Math.max(0, Number(item.horas) || 0), 0)
        : res,
      dataRessarcimento: dataRessarcimento || undefined,
      historicoRessarcimentos: historico,
      obs: obs.trim(),
    };

    if (editing) {
      editarTroca(editing.id, payload);
      toast('Troca atualizada.');
    } else {
      adicionarTroca(payload);
      toast('Troca registrada.');
    }
    setModalOpen(false);
  };

  const handleQuitar = (t: TrocaPlantao) => {
    const trab = Math.max(0, Number(t.horasTrabalhadas) || 0);
    const resAtual = getTrocaHorasRessarcidas(t);
    const falta = Math.max(0, trab - resAtual);
    const hoje = hojeISO();
    const prevHist = Array.isArray(t.historicoRessarcimentos) ? t.historicoRessarcimentos : [];
    const nextHist: TrocaRessarcimentoItem[] =
      falta > 0
        ? [
            ...prevHist,
            {
              id: genId(),
              data: hoje,
              horas: falta,
              obs: 'Quitação',
            },
          ]
        : prevHist;

    editarTroca(t.id, {
      horasRessarcidas: trab,
      dataRessarcimento: t.dataRessarcimento || hoje,
      historicoRessarcimentos: nextHist,
    });
    toast(`Troca com ${t.paraQuem} quitada!`);
  };

  const openRepayment = (t: TrocaPlantao) => {
    const trab = Math.max(0, Number(t.horasTrabalhadas) || 0);
    const res = getTrocaHorasRessarcidas(t);
    const falta = Math.max(0, trab - res);
    setRepTarget(t);
    setRepHoras(String(falta > 0 ? Math.min(6, falta) : 6));
    setRepData(hojeISO());
    setRepObs('');
  };

  const handleSaveRepayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repTarget) return;
    const h = Math.max(0, Number(repHoras) || 0);
    if (h <= 0) {
      toast('Informe a quantidade de horas devolvidas.', 'erro');
      return;
    }
    const existing = Array.isArray(repTarget.historicoRessarcimentos)
      ? [...repTarget.historicoRessarcimentos]
      : [];
    const baseRessarc = getTrocaHorasRessarcidas(repTarget);
    if (!existing.length && baseRessarc > 0) {
      existing.push({
        id: genId(),
        data: repTarget.dataRessarcimento || repTarget.dataTrabalho,
        horas: baseRessarc,
        obs: 'Devolução anterior',
      });
    }
    existing.push({
      id: genId(),
      data: repData || hojeISO(),
      horas: h,
      obs: repObs.trim() || undefined,
    });
    const totalRes = existing.reduce((acc, item) => acc + Math.max(0, Number(item.horas) || 0), 0);
    editarTroca(repTarget.id, {
      historicoRessarcimentos: existing,
      horasRessarcidas: totalRes,
      dataRessarcimento: repData || hojeISO(),
    });
    toast(`${formatHours(h)} registradas no histórico de devoluções.`);
    setRepTarget(null);
  };

  const handleRemoveRepaymentItem = (t: TrocaPlantao, itemId: string) => {
    const nextHist = (t.historicoRessarcimentos || []).filter((item) => item.id !== itemId);
    const totalRes = nextHist.reduce((acc, item) => acc + Math.max(0, Number(item.horas) || 0), 0);
    editarTroca(t.id, {
      historicoRessarcimentos: nextHist,
      horasRessarcidas: totalRes,
      dataRessarcimento: nextHist[nextHist.length - 1]?.data || '',
    });
    toast('Devolução removida.');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Trocas de plantão</h2>
          <p className="text-xs text-[var(--muted)]">
            Controle separado de horas a receber e a devolver com colegas. Não entra nos locais, faturamento, PDF ou recibos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-1">
            <button
              type="button"
              className={`tab ${statusFilter === 'todas' ? 'active' : ''}`}
              onClick={() => setStatusFilter('todas')}
            >
              Todas
            </button>
            <button
              type="button"
              className={`tab ${statusFilter === 'pendentes' ? 'active' : ''}`}
              onClick={() => setStatusFilter('pendentes')}
            >
              Pendentes
            </button>
            <button
              type="button"
              className={`tab ${statusFilter === 'quitadas' ? 'active' : ''}`}
              onClick={() => setStatusFilter('quitadas')}
            >
              Quitadas
            </button>
          </div>

          <select
            aria-label="Filtrar direção da troca"
            className="input w-auto min-w-[150px]"
            value={direcaoFilter}
            onChange={(e) => setDirecaoFilter(e.target.value as DirecaoFilter)}
          >
            <option value="todas">Todas direções</option>
            <option value="eu_trabalhei">Eu trabalhei (me devem)</option>
            <option value="cobriu_para_mim">Cobriram para mim (devo)</option>
          </select>

          {pessoasUnicas.length > 0 && (
            <select
              aria-label="Filtrar por pessoa"
              className="input w-auto min-w-[160px]"
              value={pessoaFilter}
              onChange={(e) => setPessoaFilter(e.target.value)}
            >
              <option value="">Todas as pessoas</option>
              {pessoasUnicas.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.nome}
                </option>
              ))}
            </select>
          )}

          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nova troca
          </button>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total em trocas" value={formatHours(summary.trabalhadas)} />
        <StatCard label="Já ressarcidas" value={formatHours(summary.ressarcidas)} tone="ok" />
        <StatCard
          label="Me devem (a receber)"
          value={formatHours(summary.aReceberHoras)}
          tone={summary.aReceberHoras > 0 ? 'warn' : 'ok'}
        />
        <StatCard
          label="Estou devendo"
          value={formatHours(summary.aDevolverHoras)}
          tone={summary.aDevolverHoras > 0 ? 'warn' : 'default'}
        />
      </section>

      {summary.porPessoa.length > 0 && (
        <section className="card card-pad overflow-x-auto">
          <h3 className="mb-3 text-sm font-bold">Saldo por colega</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Colega</th>
                <th className="text-right">Trocas</th>
                <th className="text-right">Me devem</th>
                <th className="text-right">Eu devo</th>
                <th className="text-right">Saldo líquido</th>
              </tr>
            </thead>
            <tbody>
              {summary.porPessoa.map((item) => (
                <tr key={normalizeText(item.pessoa)}>
                  <td className="font-semibold">{item.pessoa}</td>
                  <td className="text-right font-mono tabular-nums">{item.registros}</td>
                  <td className="text-right font-mono tabular-nums text-[var(--ok)]">
                    {item.aReceber > 0 ? formatHours(item.aReceber) : '—'}
                  </td>
                  <td className="text-right font-mono tabular-nums text-[var(--warn)]">
                    {item.aDevolver > 0 ? formatHours(item.aDevolver) : '—'}
                  </td>
                  <td
                    className={`text-right font-mono font-bold tabular-nums ${
                      item.saldo > 0
                        ? 'text-[var(--ok)]'
                        : item.saldo < 0
                          ? 'text-[var(--warn)]'
                          : 'text-[var(--muted)]'
                    }`}
                  >
                    {item.saldo === 0
                      ? 'Quitado'
                      : item.saldo > 0
                        ? `+${formatHours(item.saldo)}`
                        : `-${formatHours(Math.abs(item.saldo))}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {!filteredTrocas.length ? (
        <EmptyState
          icon={<ArrowLeftRight className="h-6 w-6" />}
          title={trocas.length ? 'Nenhuma troca neste filtro' : 'Nenhuma troca registrada'}
          desc={
            trocas.length
              ? 'Altere o filtro acima ou cadastre uma nova troca.'
              : 'Registre aqui plantões que você cobriu para colegas ou que cobriram para você, com devoluções parciais por data e observações.'
          }
          action={
            !trocas.length ? (
              <button type="button" className="btn btn-primary" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Registrar primeira troca
              </button>
            ) : undefined
          }
        />
      ) : (
        <section className="card card-pad divide-y divide-[var(--border)]">
          {filteredTrocas.map((t) => {
            const dir: TrocaDirecao =
              t.direcao === 'cobriu_para_mim' ? 'cobriu_para_mim' : 'eu_trabalhei';
            const trab = Math.max(0, Number(t.horasTrabalhadas) || 0);
            const res = getTrocaHorasRessarcidas(t);
            const falta = Math.max(0, trab - res);
            const quitada = falta === 0;
            const hist = Array.isArray(t.historicoRessarcimentos) ? t.historicoRessarcimentos : [];

            return (
              <div key={t.id} className="space-y-2 py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
                      <span className="truncate">{t.paraQuem}</span>
                      <span className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-semibold text-[var(--muted)]">
                        {dir === 'cobriu_para_mim' ? 'Cobriu para mim' : 'Eu trabalhei para'}
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold ${
                          quitada
                            ? 'bg-[var(--ok)]/15 text-[var(--ok)]'
                            : 'bg-[var(--warn-soft)] text-[var(--warn)]'
                        }`}
                      >
                        {quitada
                          ? 'Quitada'
                          : dir === 'cobriu_para_mim'
                            ? `Devo ${formatHours(falta)}`
                            : `Falta ${formatHours(falta)}`}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[var(--muted)] tabular-nums">
                      Plantão em {formatDateBR(t.dataTrabalho)} · {formatHours(trab)} total ·{' '}
                      {formatHours(res)} ressarc.
                      {t.dataRessarcimento && !hist.length && ` · Ressarcido em ${formatDateBR(t.dataRessarcimento)}`}
                    </div>
                    {t.obs && <div className="mt-1 text-xs text-[var(--muted)]">{t.obs}</div>}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    {!quitada && (
                      <>
                        <button
                          type="button"
                          onClick={() => openRepayment(t)}
                          className="btn btn-ghost min-h-[36px] px-2.5 py-1 text-xs"
                          title="Registrar devolução parcial com data"
                        >
                          <CalendarPlus className="h-3.5 w-3.5" />
                          + Devolução
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuitar(t)}
                          className="btn btn-soft min-h-[36px] px-2.5 py-1 text-xs"
                          title="Quitar horas restantes"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Quitar
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => openEdit(t)}
                      aria-label="Editar troca"
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(t)}
                      aria-label="Excluir troca"
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {hist.length > 0 && (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/70 px-3 py-2 text-xs">
                    <div className="mb-1 font-semibold text-[var(--muted)]">
                      Histórico de devoluções
                    </div>
                    <div className="space-y-1">
                      {hist.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-2 tabular-nums"
                        >
                          <span>
                            <strong className="font-mono text-[var(--ok)]">
                              {formatHours(item.horas)}
                            </strong>{' '}
                            em {formatDateBR(item.data)}
                            {item.obs && <span className="text-[var(--muted)]"> · {item.obs}</span>}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveRepaymentItem(t, item.id)}
                            aria-label="Remover devolução"
                            className="rounded px-1.5 py-0.5 text-[11px] text-[var(--muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                          >
                            remover
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* Modal Create / Edit Troca */}
      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        title={editing ? 'Editar troca de plantão' : 'Nova troca de plantão'}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </button>
            <button type="submit" form="troca-form" className="btn btn-primary">
              {editing ? 'Salvar alterações' : 'Salvar troca'}
            </button>
          </>
        }
      >
        <form id="troca-form" onSubmit={handleSave} className="space-y-4">
          <Field label="Tipo da troca">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDirecao('eu_trabalhei')}
                className={`rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition-colors ${
                  direcao === 'eu_trabalhei'
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)]'
                }`}
              >
                Eu trabalhei para colega
                <span className="mt-0.5 block font-normal opacity-80">Colega me deve horas</span>
              </button>
              <button
                type="button"
                onClick={() => setDirecao('cobriu_para_mim')}
                className={`rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition-colors ${
                  direcao === 'cobriu_para_mim'
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)]'
                }`}
              >
                Colega cobriu para mim
                <span className="mt-0.5 block font-normal opacity-80">Eu devo horas ao colega</span>
              </button>
            </div>
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={direcao === 'cobriu_para_mim' ? 'Quem trabalhou para mim' : 'Para quem trabalhei'}>
              <input
                type="text"
                list="trocas-pessoas-list"
                className="input"
                value={paraQuem}
                onChange={(e) => setParaQuem(e.target.value)}
                placeholder="Ex.: Dr. Marcos, Dra. Ana..."
                required
              />
              <datalist id="trocas-pessoas-list">
                {pessoasUnicas.map((p) => (
                  <option key={p.key} value={p.nome} />
                ))}
              </datalist>
            </Field>

            <Field label="Data do plantão">
              <input
                type="date"
                className="input font-mono"
                value={dataTrabalho}
                onChange={(e) => setDataTrabalho(e.target.value)}
                required
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Quantas horas trabalhou">
              <input
                type="number"
                step="0.5"
                min="0.5"
                className="input font-mono"
                value={horasTrabalhadas}
                onChange={(e) => setHorasTrabalhadas(e.target.value)}
                required
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {QUICK_HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHorasTrabalhadas(String(h))}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 font-mono text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--text)]"
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </Field>

            {(!editing || !(editing.historicoRessarcimentos && editing.historicoRessarcimentos.length > 0)) ? (
              <Field label="Horas já ressarcidas">
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    className="input font-mono"
                    value={horasRessarcidas}
                    onChange={(e) => setHorasRessarcidas(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-soft min-h-[42px] px-3 text-xs"
                    onClick={() => {
                      setHorasRessarcidas(horasTrabalhadas || '0');
                      if (!dataRessarcimento) setDataRessarcimento(hojeISO());
                    }}
                  >
                    Quitar tudo
                  </button>
                </div>
              </Field>
            ) : (
              <Field
                label="Horas já ressarcidas (histórico)"
                hint="Gerencie datas parciais direto no card da troca."
              >
                <input
                  type="text"
                  className="input font-mono"
                  value={formatHours(getTrocaHorasRessarcidas(editing))}
                  disabled
                />
              </Field>
            )}
          </div>

          {(!editing || !(editing.historicoRessarcimentos && editing.historicoRessarcimentos.length > 0)) && (
            <Field label="Data do ressarcimento (opcional)">
              <input
                type="date"
                className="input font-mono"
                value={dataRessarcimento}
                onChange={(e) => setDataRessarcimento(e.target.value)}
              />
            </Field>
          )}

          <Field label="Observações">
            <textarea
              rows={3}
              className="input"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Ex.: Turno noturno no PS, combinamos devolver em maio..."
            />
          </Field>
        </form>
      </Modal>

      {/* Modal Partial Repayment */}
      <Modal
        open={!!repTarget}
        onClose={() => setRepTarget(null)}
        title={repTarget ? `Registrar devolução · ${repTarget.paraQuem}` : 'Registrar devolução'}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setRepTarget(null)}>
              Cancelar
            </button>
            <button type="submit" form="repay-form" className="btn btn-primary">
              Salvar devolução
            </button>
          </>
        }
      >
        <form id="repay-form" onSubmit={handleSaveRepayment} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Horas devolvidas">
              <input
                type="number"
                step="0.5"
                min="0.5"
                className="input font-mono"
                value={repHoras}
                onChange={(e) => setRepHoras(e.target.value)}
                required
              />
            </Field>
            <Field label="Data da devolução">
              <input
                type="date"
                className="input font-mono"
                value={repData}
                onChange={(e) => setRepData(e.target.value)}
                required
              />
            </Field>
          </div>
          <Field label="Observação (opcional)">
            <input
              type="text"
              className="input"
              value={repObs}
              onChange={(e) => setRepObs(e.target.value)}
              placeholder="Ex.: Cobriu metade da manhã..."
            />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Excluir troca?"
        body={
          deleteTarget
            ? `Excluir o registro de troca com ${deleteTarget.paraQuem} (${formatDateBR(deleteTarget.dataTrabalho)})?`
            : ''
        }
        confirmLabel="Excluir"
        onConfirm={() => {
          if (deleteTarget) {
            excluirTroca(deleteTarget.id);
            toast('Troca excluída.');
          }
        }}
      />
    </div>
  );
};
