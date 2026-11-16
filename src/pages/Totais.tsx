import React, {useMemo, useState} from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Receipt,
  Share2,
} from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {Field, Modal, StatCard} from '../components/UI';
import {useStore} from '../context/StoreContext';
import {
  breakdownByLocal,
  filterByMonth,
  filterByPeriod,
  findLocal,
  isTrocaLocal,
  monthlyHistory12,
  sumPagamentos,
  summarizeByLocal,
  summarizeRegistros,
} from '../utils/calc';
import {
  addMonths,
  formatCurrencyBRL,
  formatHours,
  formatMesRefNome,
  mesAtualRef,
  monthEnd,
  monthStart,
} from '../utils/format';
import {buildRecordsCSV, downloadCSV} from '../utils/csv';
import {
  buildHoursOnlyPDF,
  buildMonthlyFinancialPDF,
  buildReceiptPDF,
  shareOrSavePDF,
} from '../utils/pdf';

export const Totais: React.FC = () => {
  const {config, locais, registros, pagamentos, toast} = useStore();
  const [mesRef, setMesRef] = useState(mesAtualRef);

  // Monthly financial PDF modal
  const [relatorioOpen, setRelatorioOpen] = useState(false);
  const [relLocais, setRelLocais] = useState<string[]>([]);

  // Receipt modal
  const [reciboOpen, setReciboOpen] = useState(false);
  const [recLocalId, setRecLocalId] = useState('');
  const [recDe, setRecDe] = useState(() => monthStart(mesAtualRef()));
  const [recAte, setRecAte] = useState(() => monthEnd(mesAtualRef()));

  // Hours-only modal
  const [horasOpen, setHorasOpen] = useState(false);
  const [horasLocais, setHorasLocais] = useState<string[]>([]);
  const [horasDe, setHorasDe] = useState(() => monthStart(mesAtualRef()));
  const [horasAte, setHorasAte] = useState(() => monthEnd(mesAtualRef()));
  const [horasObs, setHorasObs] = useState(true);

  const regularLocais = useMemo(() => locais.filter((l) => !isTrocaLocal(l)), [locais]);
  const regularRegistros = useMemo(
    () =>
      registros.filter((r) => {
        const loc = findLocal(r, locais);
        return !r.agendado && !isTrocaLocal(loc) && r.troca_plantao !== 'compensado';
      }),
    [registros, locais],
  );
  const agendadosMes = useMemo(
    () =>
      filterByMonth(
        registros.filter((r) => !!r.agendado && !isTrocaLocal(findLocal(r, locais))),
        mesRef,
      ),
    [registros, locais, mesRef],
  );

  const regsMes = useMemo(() => filterByMonth(regularRegistros, mesRef), [regularRegistros, mesRef]);
  const sumMes = useMemo(
    () => summarizeRegistros(regsMes, regularLocais, config),
    [regsMes, regularLocais, config],
  );
  const sumAgendadosMes = useMemo(
    () => summarizeRegistros(agendadosMes, regularLocais, config),
    [agendadosMes, regularLocais, config],
  );
  const pagoMes = useMemo(
    () =>
      pagamentos
        .filter((p) => String(p.data || '').startsWith(mesRef))
        .reduce((acc, p) => acc + (Number(p.valor) || 0), 0),
    [pagamentos, mesRef],
  );

  const porLocalMes = useMemo(
    () => summarizeByLocal(regsMes, regularLocais, pagamentos, config).filter((s) => s.horas > 0),
    [regsMes, regularLocais, pagamentos, config],
  );

  const porLocalGeral = useMemo(
    () => summarizeByLocal(regularRegistros, regularLocais, pagamentos, config),
    [regularRegistros, regularLocais, pagamentos, config],
  );

  const totalAReceber = useMemo(
    () =>
      porLocalGeral
        .filter((s) => s.aReceber > 0.01)
        .reduce((acc, s) => acc + s.aReceber, 0),
    [porLocalGeral],
  );

  const pendentes = useMemo(
    () =>
      porLocalGeral
        .filter((s) => s.aReceber > 0.01)
        .sort((a, b) => b.aReceber - a.aReceber),
    [porLocalGeral],
  );

  const hist12 = useMemo(
    () => monthlyHistory12(regularRegistros, regularLocais, config, mesRef, 12),
    [regularRegistros, regularLocais, config, mesRef],
  );

  const pieData = useMemo(
    () => breakdownByLocal(regularRegistros, regularLocais, pagamentos, config, mesRef),
    [regularRegistros, regularLocais, pagamentos, config, mesRef],
  );

  const openRelatorioPDF = () => {
    const comRegistro = regularLocais
      .filter((l) => regsMes.some((r) => r.localId === l.id))
      .map((l) => l.id);
    setRelLocais(comRegistro.length ? comRegistro : regularLocais.map((l) => l.id));
    setRelatorioOpen(true);
  };

  const openRecibo = () => {
    setRecLocalId(regularLocais[0]?.id || '');
    setRecDe(monthStart(mesRef));
    setRecAte(monthEnd(mesRef));
    setReciboOpen(true);
  };

  const openHorasOnly = () => {
    const start = monthStart(mesRef);
    const end = monthEnd(mesRef);
    const comRegistro = regularLocais
      .filter((l) =>
        filterByPeriod(
          regularRegistros.filter((r) => r.localId === l.id),
          start,
          end,
        ).length > 0,
      )
      .map((l) => l.id);
    setHorasLocais(comRegistro.length ? comRegistro : regularLocais.map((l) => l.id));
    setHorasDe(start);
    setHorasAte(end);
    setHorasObs(true);
    setHorasOpen(true);
  };

  const generateMonthlyPDF = async (share: boolean) => {
    if (!relLocais.length) {
      toast('Selecione pelo menos um local.', 'erro');
      return;
    }
    const regsFiltrados = regsMes.filter((r) => relLocais.includes(r.localId));
    if (!regsFiltrados.length) {
      toast('Não há registros nos locais selecionados neste mês.', 'erro');
      return;
    }
    const locaisSelecionados = regularLocais.filter((l) => relLocais.includes(l.id));
    const resumoFiltrado = summarizeRegistros(regsFiltrados, regularLocais, config);
    const pagsFiltrados = pagamentos.filter((p) => relLocais.includes(p.localId));
    const todosMarcados = relLocais.length === regularLocais.length;
    const nota = todosMarcados
      ? undefined
      : `Locais incluídos: ${locaisSelecionados.map((l) => l.nome).join(', ')}`;

    const doc = buildMonthlyFinancialPDF({
      config,
      mesRef,
      registros: regsFiltrados,
      locais: regularLocais,
      resumo: resumoFiltrado,
      pagamentos: pagsFiltrados,
      nota,
    });
    const slug =
      locaisSelecionados.length === 1
        ? `-${locaisSelecionados[0].nome.toLowerCase().replace(/\s+/g, '-')}`
        : '';
    const filename = `relatorio${slug}-${mesRef}.pdf`;
    if (share) {
      const res = await shareOrSavePDF(doc, filename, `Relatório · ${formatMesRefNome(mesRef)}`);
      if (res === 'shared') toast('Relatório compartilhado.');
      else if (res === 'downloaded') toast('Relatório PDF baixado.');
    } else {
      doc.save(filename);
      toast('Relatório PDF baixado.');
    }
    setRelatorioOpen(false);
  };

  const handleGenerateMonthlyPDF = (e: React.FormEvent) => {
    e.preventDefault();
    void generateMonthlyPDF(false);
  };

  const generateReceipt = async (share: boolean) => {
    const loc = regularLocais.find((l) => l.id === recLocalId);
    if (!loc) {
      toast('Selecione um local.', 'erro');
      return;
    }
    const list = filterByPeriod(
      regularRegistros.filter((r) => r.localId === loc.id),
      recDe,
      recAte,
    );
    const sum = summarizeRegistros(list, [loc], config);
    const pago = sumPagamentos(
      pagamentos.filter((p) => p.data >= recDe && p.data <= recAte),
      loc.id,
    );
    const doc = buildReceiptPDF({
      config,
      local: loc,
      registros: list,
      de: recDe,
      ate: recAte,
      pago,
      total: sum.valor,
    });
    const filename = `recibo-${loc.nome.toLowerCase().replace(/\s+/g, '-')}-${recDe}.pdf`;
    if (share) {
      const res = await shareOrSavePDF(doc, filename, `Recibo · ${loc.nome}`);
      if (res === 'shared') toast('Recibo compartilhado.');
      else if (res === 'downloaded') toast('Recibo gerado em PDF.');
    } else {
      doc.save(filename);
      toast('Recibo gerado em PDF.');
    }
    setReciboOpen(false);
  };

  const handleGenerateReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    void generateReceipt(false);
  };

  const generateHoursPDF = async (share: boolean) => {
    if (!horasLocais.length) {
      toast('Selecione pelo menos um local.', 'erro');
      return;
    }
    const doc = buildHoursOnlyPDF({
      config,
      registros: regularRegistros,
      locais: regularLocais,
      selecionados: horasLocais,
      de: horasDe,
      ate: horasAte,
      incluirObs: horasObs,
    });
    const filename = `espelho-horas-${horasDe}-a-${horasAte}.pdf`;
    if (share) {
      const res = await shareOrSavePDF(doc, filename, 'Espelho de horas');
      if (res === 'shared') toast('Espelho compartilhado.');
      else if (res === 'downloaded') toast('Relatório de horas gerado.');
    } else {
      doc.save(filename);
      toast('Relatório de horas gerado.');
    }
    setHorasOpen(false);
  };

  const handleGenerateHoursPDF = (e: React.FormEvent) => {
    e.preventDefault();
    void generateHoursPDF(false);
  };

  const handleExportCSV = () => {
    if (!regsMes.length) {
      toast('Sem registros neste mês para exportar.', 'erro');
      return;
    }
    const csv = buildRecordsCSV({registros: regsMes, locais: regularLocais, config});
    downloadCSV(csv, `registros-${mesRef}.csv`);
    toast('Planilha CSV (Excel) baixada.');
  };

  return (
    <div className="space-y-5">
      {/* Month & Export Controls */}
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
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-primary"
            onClick={openRelatorioPDF}
            disabled={!regsMes.length}
          >
            <Download className="h-4 w-4" />
            Relatório PDF
          </button>
          <button
            type="button"
            className="btn btn-soft"
            onClick={openRecibo}
            disabled={!regularLocais.length}
          >
            <Receipt className="h-4 w-4" />
            Recibo
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={openHorasOnly}
            disabled={!regularLocais.length}
          >
            <Clock className="h-4 w-4" />
            Só horas
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleExportCSV}
            disabled={!regsMes.length}
            title="Exportar mês para Excel (CSV)"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Excel / CSV
          </button>
        </div>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Horas no mês"
          value={formatHours(sumMes.horas)}
          sub={`${formatHours(sumMes.normais)} normais · ${formatHours(sumMes.extras)} extras`}
        />
        <StatCard
          label="Bruto no mês"
          value={formatCurrencyBRL(sumMes.valor)}
          sub={
            sumAgendadosMes.horas > 0
              ? `Previsão +agend.: ${formatCurrencyBRL(sumMes.valor + sumAgendadosMes.valor)}`
              : `${sumMes.quantidade} registro(s)`
          }
          accent
        />
        <StatCard
          label="Pago no mês"
          value={formatCurrencyBRL(pagoMes)}
          sub="Pagamentos lançados"
          tone="ok"
        />
        <StatCard
          label="A receber (geral)"
          value={formatCurrencyBRL(totalAReceber)}
          sub="Todos os períodos"
          tone={totalAReceber > 0.01 ? 'warn' : 'default'}
        />
      </section>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <section className="card card-pad lg:col-span-7">
          <h3 className="mb-4 text-sm font-bold">Evolução nos últimos 12 meses</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={hist12} margin={{top: 6, right: 4, left: -12, bottom: 0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{fill: 'var(--muted)', fontSize: 11}}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  tick={{fill: 'var(--muted)', fontSize: 11}}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{fill: 'var(--muted)', fontSize: 11}}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value, name) =>
                    name === 'valor'
                      ? [formatCurrencyBRL(Number(value)), 'Valor']
                      : [formatHours(Number(value)), 'Horas']
                  }
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Bar yAxisId="left" dataKey="valor" fill="var(--accent)" radius={[6, 6, 0, 0]} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="horas"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{r: 3}}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card card-pad lg:col-span-5">
          <h3 className="mb-4 text-sm font-bold">Participação por local ({formatMesRefNome(mesRef)})</h3>
          {!pieData.length ? (
            <p className="py-20 text-center text-sm text-[var(--muted)]">
              Sem ganhos registrados neste mês.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="valor"
                      nameKey="nome"
                      innerRadius={48}
                      outerRadius={76}
                      paddingAngle={3}
                    >
                      {pieData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.cor} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val) => formatCurrencyBRL(Number(val))}
                      contentStyle={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-full space-y-1.5 text-xs">
                {pieData.map((item) => (
                  <div key={item.nome} className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 truncate">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{background: item.cor}}
                      />
                      <span className="truncate font-semibold">{item.nome}</span>
                    </span>
                    <span className="font-mono font-bold tabular-nums">
                      {formatCurrencyBRL(item.valor)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Breakdown Table for selected month */}
      <section className="card card-pad overflow-x-auto">
        <h3 className="mb-3 text-sm font-bold">Resumo por local no mês</h3>
        {!porLocalMes.length ? (
          <p className="py-6 text-center text-sm text-[var(--muted)]">
            Nenhum lançamento em {formatMesRefNome(mesRef)}.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Local</th>
                <th className="text-right">Registros</th>
                <th className="text-right">Horas</th>
                <th className="text-right">Extras</th>
                <th className="text-right">Valor bruto</th>
              </tr>
            </thead>
            <tbody>
              {porLocalMes.map((s) => (
                <tr key={s.local.id}>
                  <td className="font-semibold">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{background: s.local.cor}}
                      />
                      {s.local.nome}
                    </span>
                  </td>
                  <td className="text-right font-mono tabular-nums">{s.quantidade}</td>
                  <td className="text-right font-mono tabular-nums">{formatHours(s.horas)}</td>
                  <td className="text-right font-mono tabular-nums">{formatHours(s.extras)}</td>
                  <td className="text-right font-mono font-bold tabular-nums">
                    {formatCurrencyBRL(s.valor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Pending receivables across all time */}
      {pendentes.length > 0 && (
        <section className="card card-pad overflow-x-auto">
          <h3 className="mb-3 text-sm font-bold">Saldos pendentes a receber (geral)</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Local</th>
                <th className="text-right">Devido</th>
                <th className="text-right">Pago</th>
                <th className="text-right">A receber</th>
              </tr>
            </thead>
            <tbody>
              {pendentes.map((s) => (
                <tr key={s.local.id}>
                  <td className="font-semibold">{s.local.nome}</td>
                  <td className="text-right font-mono tabular-nums">
                    {formatCurrencyBRL(s.valor)}
                  </td>
                  <td className="text-right font-mono tabular-nums text-[var(--ok)]">
                    {formatCurrencyBRL(s.pago)}
                  </td>
                  <td className="text-right font-mono font-bold tabular-nums text-[var(--warn)]">
                    {formatCurrencyBRL(s.aReceber)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}


      {/* Receipt Modal */}
      <Modal
        open={reciboOpen}
        onClose={() => setReciboOpen(false)}
        title="Gerar recibo de pagamento (PDF)"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setReciboOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => void generateReceipt(true)}
            >
              <Share2 className="h-4 w-4" />
              Compartilhar
            </button>
            <button type="submit" form="recibo-form" className="btn btn-primary">
              <FileText className="h-4 w-4" />
              Baixar recibo
            </button>
          </>
        }
      >
        <form id="recibo-form" onSubmit={handleGenerateReceipt} className="space-y-4">
          <Field label="Local de trabalho">
            <select
              className="input"
              value={recLocalId}
              onChange={(e) => setRecLocalId(e.target.value)}
              required
            >
              {regularLocais.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data inicial">
              <input
                type="date"
                className="input font-mono"
                value={recDe}
                onChange={(e) => setRecDe(e.target.value)}
                required
              />
            </Field>
            <Field label="Data final">
              <input
                type="date"
                className="input font-mono"
                value={recAte}
                onChange={(e) => setRecAte(e.target.value)}
                required
              />
            </Field>
          </div>
        </form>
      </Modal>

      {/* Monthly Financial PDF Modal */}
      <Modal
        open={relatorioOpen}
        onClose={() => setRelatorioOpen(false)}
        title={`Relatório PDF · ${formatMesRefNome(mesRef)}`}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setRelatorioOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-soft"
              disabled={!relLocais.length}
              onClick={() => void generateMonthlyPDF(true)}
            >
              <Share2 className="h-4 w-4" />
              Compartilhar
            </button>
            <button
              type="submit"
              form="relatorio-pdf-form"
              className="btn btn-primary"
              disabled={!relLocais.length}
            >
              <Download className="h-4 w-4" />
              Baixar PDF
            </button>
          </>
        }
      >
        <form id="relatorio-pdf-form" onSubmit={handleGenerateMonthlyPDF} className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <span className="label mb-0">Escolha os locais para baixar</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-xs font-semibold text-[var(--accent)] hover:underline"
                onClick={() => setRelLocais(regularLocais.map((l) => l.id))}
              >
                Todos
              </button>
              <span className="text-xs text-[var(--muted)]">·</span>
              <button
                type="button"
                className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--text)]"
                onClick={() => setRelLocais([])}
              >
                Limpar
              </button>
            </div>
          </div>

          <div className="max-h-60 divide-y divide-[var(--border)] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3">
            {regularLocais.map((l) => {
              const checked = relLocais.includes(l.id);
              const qtd = regsMes.filter((r) => r.localId === l.id).length;
              const sumL = summarizeRegistros(
                regsMes.filter((r) => r.localId === l.id),
                [l],
                config,
              );
              return (
                <label
                  key={l.id}
                  className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setRelLocais((prev) =>
                          checked ? prev.filter((id) => id !== l.id) : [...prev, l.id],
                        )
                      }
                      className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                    />
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{background: l.cor}}
                    />
                    <span className="truncate font-medium">{l.nome}</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs text-[var(--muted)] tabular-nums">
                    {qtd} reg · {formatHours(sumL.horas)}
                  </span>
                </label>
              );
            })}
          </div>
        </form>
      </Modal>

      {/* Hours-only PDF Modal */}
      <Modal
        open={horasOpen}
        onClose={() => setHorasOpen(false)}
        title="Espelho de horas em PDF (sem R$)"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setHorasOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-soft"
              disabled={!horasLocais.length}
              onClick={() => void generateHoursPDF(true)}
            >
              <Share2 className="h-4 w-4" />
              Compartilhar
            </button>
            <button
              type="submit"
              form="horas-pdf-form"
              className="btn btn-primary"
              disabled={!horasLocais.length}
            >
              <FileText className="h-4 w-4" />
              Baixar espelho
            </button>
          </>
        }
      >
        <form id="horas-pdf-form" onSubmit={handleGenerateHoursPDF} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="De">
              <input
                type="date"
                className="input font-mono"
                value={horasDe}
                onChange={(e) => setHorasDe(e.target.value)}
                required
              />
            </Field>
            <Field label="Até">
              <input
                type="date"
                className="input font-mono"
                value={horasAte}
                onChange={(e) => setHorasAte(e.target.value)}
                required
              />
            </Field>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="label mb-0">Locais incluídos</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-xs font-semibold text-[var(--accent)] hover:underline"
                  onClick={() => setHorasLocais(regularLocais.map((l) => l.id))}
                >
                  Todos
                </button>
                <span className="text-xs text-[var(--muted)]">·</span>
                <button
                  type="button"
                  className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--text)]"
                  onClick={() => setHorasLocais([])}
                >
                  Limpar
                </button>
              </div>
            </div>
            <div className="max-h-52 divide-y divide-[var(--border)] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3">
              {regularLocais.map((l) => {
                const checked = horasLocais.includes(l.id);
                const regsPeriodo = filterByPeriod(
                  regularRegistros.filter((r) => r.localId === l.id),
                  horasDe,
                  horasAte,
                );
                const sumL = summarizeRegistros(regsPeriodo, [l], config);
                return (
                  <label
                    key={l.id}
                    className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 py-2 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setHorasLocais((prev) =>
                            checked ? prev.filter((id) => id !== l.id) : [...prev, l.id],
                          )
                        }
                        className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                      />
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{background: l.cor}}
                      />
                      <span className="truncate font-medium">{l.nome}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-[var(--muted)] tabular-nums">
                      {regsPeriodo.length} reg · {formatHours(sumL.horas)}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <label className="flex min-h-[40px] cursor-pointer items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={horasObs}
              onChange={(e) => setHorasObs(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            <span>Incluir coluna de observações</span>
          </label>
        </form>
      </Modal>
    </div>
  );
};
