import React, {useMemo, useState} from 'react';
import {
  DollarSign,
  Edit3,
  FileText,
  MapPin,
  Navigation,
  Plus,
  Trash2,
} from 'lucide-react';
import {ConfirmDialog, EmptyState, Field, Modal} from '../components/UI';
import {useStore} from '../context/StoreContext';
import {LocalTrabalho} from '../types';
import {
  isTrocaLocal,
  summarizeByLocal,
  TIPOS_LOCAL,
} from '../utils/calc';
import {
  formatCurrencyBRL,
  formatDateBR,
  formatHours,
  hojeISO,
  mesAtualRef,
  monthEnd,
  monthStart,
} from '../utils/format';
import {buildHoursOnlyPDF} from '../utils/pdf';
import {LOCAL_COLORS} from '../utils/storage';

export const Locais: React.FC = () => {
  const {
    config,
    locais,
    registros,
    pagamentos,
    adicionarLocal,
    editarLocal,
    excluirLocal,
    adicionarPagamento,
    excluirPagamento,
    toast,
  } = useStore();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LocalTrabalho | null>(null);
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<string>('Fixo');
  const [valorHora, setValorHora] = useState('0');
  const [limiteNormal, setLimiteNormal] = useState('8');
  const [fdsPercent, setFdsPercent] = useState('0');
  const [cor, setCor] = useState(LOCAL_COLORS[0]);
  const [raio, setRaio] = useState('300');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [obs, setObs] = useState('');
  const [gpsBusy, setGpsBusy] = useState(false);

  const [payLocal, setPayLocal] = useState<LocalTrabalho | null>(null);
  const [payValor, setPayValor] = useState('');
  const [payData, setPayData] = useState(hojeISO());
  const [payDe, setPayDe] = useState('');
  const [payAte, setPayAte] = useState('');
  const [payObs, setPayObs] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<LocalTrabalho | null>(null);

  const visibleLocais = useMemo(() => locais.filter((l) => !isTrocaLocal(l)), [locais]);
  const workedRegistros = useMemo(() => registros.filter((r) => !r.agendado), [registros]);

  const resumoPorLocal = useMemo(
    () => summarizeByLocal(workedRegistros, visibleLocais, pagamentos, config),
    [workedRegistros, visibleLocais, pagamentos, config],
  );

  const openCreate = () => {
    setEditing(null);
    setNome('');
    setTipo('Fixo');
    setValorHora(config.valorHoraPadrao ? String(config.valorHoraPadrao) : '0');
    setLimiteNormal('8');
    setFdsPercent('0');
    setCor(LOCAL_COLORS[visibleLocais.length % LOCAL_COLORS.length]);
    setRaio('300');
    setLat('');
    setLng('');
    setObs('');
    setFormOpen(true);
  };

  const openEdit = (l: LocalTrabalho) => {
    setEditing(l);
    setNome(l.nome);
    setTipo(isTrocaLocal(l) ? 'Fixo' : l.tipo || 'Fixo');
    setValorHora(String(l.valor_hora ?? 0));
    setLimiteNormal(String(l.limite_normal ?? 8));
    setFdsPercent(String(l.fds_percent ?? 0));
    setCor(l.cor || LOCAL_COLORS[0]);
    setRaio(String(l.raio ?? 300));
    setLat(l.lat != null ? String(l.lat) : '');
    setLng(l.lng != null ? String(l.lng) : '');
    setObs(l.obs || '');
    setFormOpen(true);
  };

  const captureGPS = () => {
    if (!navigator.geolocation) {
      toast('Geolocalização não suportada neste navegador.', 'erro');
      return;
    }
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setGpsBusy(false);
        toast('Coordenadas capturadas.');
      },
      () => {
        setGpsBusy(false);
        toast('Permita a localização no navegador para capturar o GPS.', 'erro');
      },
      {enableHighAccuracy: true, timeout: 10000},
    );
  };

  const handleSaveLocal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      toast('Informe o nome do local.', 'erro');
      return;
    }
    const parsedLat = lat.trim() === '' ? null : Number(lat);
    const parsedLng = lng.trim() === '' ? null : Number(lng);
    const payload: Partial<LocalTrabalho> = {
      nome: nome.trim(),
      tipo,
      valor_hora: Math.max(0, Number(valorHora) || 0),
      limite_normal: Math.max(0, Number(limiteNormal) || 0),
      fds_percent: Math.max(0, Number(fdsPercent) || 0),
      cor,
      raio: Math.max(50, Number(raio) || 300),
      lat: parsedLat != null && Number.isFinite(parsedLat) ? parsedLat : null,
      lng: parsedLng != null && Number.isFinite(parsedLng) ? parsedLng : null,
      obs: obs.trim(),
    };
    if (editing) {
      editarLocal(editing.id, payload);
      toast('Local atualizado.');
    } else {
      adicionarLocal(payload);
      toast('Local cadastrado.');
    }
    setFormOpen(false);
  };

  const handleAddPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payLocal) return;
    const val = Number(payValor);
    if (!Number.isFinite(val) || val <= 0) {
      toast('Informe um valor válido.', 'erro');
      return;
    }
    adicionarPagamento({
      localId: payLocal.id,
      valor: val,
      data: payData || hojeISO(),
      de: payDe || undefined,
      ate: payAte || undefined,
      obs: payObs.trim(),
    });
    setPayValor('');
    setPayObs('');
    toast('Pagamento registrado.');
  };

  const handleExportLocalHours = (l: LocalTrabalho) => {
    const mes = mesAtualRef();
    const doc = buildHoursOnlyPDF({
      config,
      registros,
      locais,
      selecionados: [l.id],
      de: monthStart(mes),
      ate: monthEnd(mes),
      incluirObs: true,
    });
    doc.save(`espelho-${l.nome.toLowerCase().replace(/\s+/g, '-')}-${mes}.pdf`);
    toast('Espelho de horas baixado.');
  };

  const payLocalResumo = payLocal
    ? resumoPorLocal.find((s) => s.local.id === payLocal.id)
    : null;
  const payList = useMemo(
    () =>
      payLocal
        ? pagamentos
            .filter((p) => p.localId === payLocal.id)
            .sort((a, b) => b.data.localeCompare(a.data))
        : [],
    [payLocal, pagamentos],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Locais de trabalho</h2>
          <p className="text-xs text-[var(--muted)]">
            Configure valor/hora, limite diário, adicional de fim de semana e GPS.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Novo local
        </button>
      </div>

      {!visibleLocais.length ? (
        <EmptyState
          icon={<MapPin className="h-6 w-6" />}
          title="Nenhum local cadastrado"
          desc="Cadastre seus locais de trabalho ou plantões para começar a registrar horas e ganhos."
          action={
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Adicionar primeiro local
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {visibleLocais.map((l) => {
            const fin = resumoPorLocal.find((s) => s.local.id === l.id);

            return (
              <div key={l.id} className="card card-pad flex flex-col justify-between gap-4">
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="h-3.5 w-3.5 shrink-0 rounded-full"
                        style={{background: l.cor}}
                      />
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-bold">{l.nome}</h3>
                        <p className="text-xs text-[var(--muted)]">
                          {l.tipo}
                          {` · ${formatCurrencyBRL(l.valor_hora)}/h`}
                          {l.limite_normal > 0 && ` · limite ${l.limite_normal}h/dia`}
                          {l.fds_percent > 0 && ` · FDS +${l.fds_percent}%`}
                        </p>
                      </div>
                    </div>
                  </div>

                  {l.lat != null && l.lng != null && (
                    <div className="flex items-center gap-1.5 text-xs text-[var(--ok)]">
                      <Navigation className="h-3.5 w-3.5" />
                      <span>GPS ativo (raio {l.raio || 300} m)</span>
                    </div>
                  )}

                  {l.obs && <p className="text-xs text-[var(--muted)]">{l.obs}</p>}

                  {fin && (
                    <div className="grid grid-cols-3 gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs tabular-nums">
                      <div>
                        <div className="text-[var(--muted)]">Total horas</div>
                        <div className="font-mono font-bold">{formatHours(fin.horas)}</div>
                      </div>
                      <div>
                        <div className="text-[var(--muted)]">Pago</div>
                        <div className="font-mono font-bold text-[var(--ok)]">
                          {formatCurrencyBRL(fin.pago)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[var(--muted)]">A receber</div>
                        <div
                          className={`font-mono font-bold ${
                            fin.aReceber > 0.01 ? 'text-[var(--accent)]' : 'text-[var(--muted)]'
                          }`}
                        >
                          {formatCurrencyBRL(fin.aReceber)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
                  <button
                    type="button"
                    className="btn btn-soft min-h-[38px] px-3 py-1.5 text-xs"
                    onClick={() => {
                      setPayLocal(l);
                      setPayValor('');
                      setPayData(hojeISO());
                      setPayDe('');
                      setPayAte('');
                      setPayObs('');
                    }}
                  >
                    <DollarSign className="h-3.5 w-3.5" />
                    Pagamentos
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost min-h-[38px] px-3 py-1.5 text-xs"
                    onClick={() => handleExportLocalHours(l)}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Espelho PDF
                  </button>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(l)}
                      aria-label={`Editar ${l.nome}`}
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(l)}
                      aria-label={`Excluir ${l.nome}`}
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Local Create / Edit Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Editar local' : 'Novo local de trabalho'}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setFormOpen(false)}>
              Cancelar
            </button>
            <button type="submit" form="local-form" className="btn btn-primary">
              Salvar local
            </button>
          </>
        }
      >
        <form id="local-form" onSubmit={handleSaveLocal} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nome do local">
              <input
                type="text"
                className="input"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Hospital São Lucas"
                required
              />
            </Field>
            <Field label="Tipo">
              <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {TIPOS_LOCAL.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Valor/hora (R$)">
              <input
                type="number"
                step="0.01"
                min="0"
                className="input font-mono"
                value={valorHora}
                onChange={(e) => setValorHora(e.target.value)}
              />
            </Field>
            <Field label="Limite/dia (h)">
              <input
                type="number"
                step="0.5"
                min="0"
                className="input font-mono"
                value={limiteNormal}
                onChange={(e) => setLimiteNormal(e.target.value)}
              />
            </Field>
            <Field label="FDS (+%)">
              <input
                type="number"
                step="1"
                min="0"
                className="input font-mono"
                value={fdsPercent}
                onChange={(e) => setFdsPercent(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Cor de identificação">
            <div className="flex flex-wrap gap-2">
              {LOCAL_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCor(c)}
                  aria-label={`Selecionar cor ${c}`}
                  className={`h-8 w-8 rounded-full border-2 transition-transform ${
                    cor === c ? 'scale-110 border-[var(--text)]' : 'border-transparent'
                  }`}
                  style={{background: c}}
                />
              ))}
            </div>
          </Field>

          <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold">Reconhecimento automático por GPS (opcional)</span>
              <button
                type="button"
                className="btn btn-ghost min-h-[36px] px-3 text-xs"
                onClick={captureGPS}
                disabled={gpsBusy}
              >
                <Navigation className="h-3.5 w-3.5" />
                {gpsBusy ? 'Localizando...' : 'Usar minha localização'}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Latitude">
                <input
                  type="number"
                  step="any"
                  className="input font-mono text-xs"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  placeholder="-23.5505"
                />
              </Field>
              <Field label="Longitude">
                <input
                  type="number"
                  step="any"
                  className="input font-mono text-xs"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  placeholder="-46.6333"
                />
              </Field>
              <Field label="Raio (m)">
                <input
                  type="number"
                  min="50"
                  step="50"
                  className="input font-mono text-xs"
                  value={raio}
                  onChange={(e) => setRaio(e.target.value)}
                />
              </Field>
            </div>
          </div>

          <Field label="Observações">
            <input
              type="text"
              className="input"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Anotações sobre contrato, escala ou acerto..."
            />
          </Field>
        </form>
      </Modal>

      {/* Payments Modal */}
      <Modal
        open={!!payLocal}
        onClose={() => setPayLocal(null)}
        title={payLocal ? `Pagamentos · ${payLocal.nome}` : 'Pagamentos'}
        wide
      >
        {payLocal && (
          <div className="space-y-5">
            {payLocalResumo && (
              <div className="grid grid-cols-3 gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3.5 text-xs tabular-nums">
                <div>
                  <div className="text-[var(--muted)]">Total devido</div>
                  <div className="font-mono text-base font-bold">
                    {formatCurrencyBRL(payLocalResumo.valor)}
                  </div>
                </div>
                <div>
                  <div className="text-[var(--muted)]">Pago</div>
                  <div className="font-mono text-base font-bold text-[var(--ok)]">
                    {formatCurrencyBRL(payLocalResumo.pago)}
                  </div>
                </div>
                <div>
                  <div className="text-[var(--muted)]">Saldo</div>
                  <div className="font-mono text-base font-bold text-[var(--accent)]">
                    {formatCurrencyBRL(payLocalResumo.aReceber)}
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleAddPayment} className="space-y-3 rounded-2xl border border-[var(--border)] p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold">Registrar novo pagamento</div>
                <div className="flex flex-wrap items-center gap-2">
                  {payLocalResumo && payLocalResumo.aReceber > 0.01 && (
                    <button
                      type="button"
                      className="btn btn-soft min-h-[30px] px-2.5 py-1 text-[11px]"
                      onClick={() => setPayValor(payLocalResumo.aReceber.toFixed(2))}
                    >
                      Preencher saldo ({formatCurrencyBRL(payLocalResumo.aReceber)})
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost min-h-[30px] px-2.5 py-1 text-[11px]"
                    onClick={() => {
                      const mes = mesAtualRef();
                      setPayDe(monthStart(mes));
                      setPayAte(monthEnd(mes));
                    }}
                  >
                    Mês atual
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Valor (R$)">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="input font-mono"
                    value={payValor}
                    onChange={(e) => setPayValor(e.target.value)}
                    placeholder="0,00"
                    required
                  />
                </Field>
                <Field label="Data do pagamento">
                  <input
                    type="date"
                    className="input font-mono"
                    value={payData}
                    onChange={(e) => setPayData(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Ref. de (opcional)">
                  <input
                    type="date"
                    className="input font-mono"
                    value={payDe}
                    onChange={(e) => setPayDe(e.target.value)}
                  />
                </Field>
                <Field label="Ref. até (opcional)">
                  <input
                    type="date"
                    className="input font-mono"
                    value={payAte}
                    onChange={(e) => setPayAte(e.target.value)}
                  />
                </Field>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Observação" className="min-w-[200px] flex-1">
                  <input
                    type="text"
                    className="input"
                    value={payObs}
                    onChange={(e) => setPayObs(e.target.value)}
                    placeholder="Ex.: Pix, adiantamento..."
                  />
                </Field>
                <button type="submit" className="btn btn-primary min-h-[42px]">
                  <Plus className="h-4 w-4" />
                  Lançar pagamento
                </button>
              </div>
            </form>

            <div>
              <h3 className="mb-2 text-xs font-bold text-[var(--muted)]">Histórico de pagamentos</h3>
              {!payList.length ? (
                <p className="py-4 text-center text-sm text-[var(--muted)]">
                  Nenhum pagamento lançado neste local.
                </p>
              ) : (
                <div className="divide-y divide-[var(--border)]">
                  {payList.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div>
                        <div className="font-mono text-sm font-bold text-[var(--ok)] tabular-nums">
                          {formatCurrencyBRL(p.valor)}
                        </div>
                        <div className="text-xs text-[var(--muted)]">
                          {formatDateBR(p.data)}
                          {p.de && p.ate && ` · ref. ${formatDateBR(p.de)} a ${formatDateBR(p.ate)}`}
                          {p.obs && ` · ${p.obs}`}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          excluirPagamento(p.id);
                          toast('Pagamento excluído.');
                        }}
                        aria-label="Excluir pagamento"
                        className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Excluir local?"
        body={
          deleteTarget
            ? `Deseja excluir "${deleteTarget.nome}"? Locais que possuem registros de ponto não podem ser excluídos.`
            : ''
        }
        confirmLabel="Excluir"
        onConfirm={() => {
          if (!deleteTarget) return;
          try {
            excluirLocal(deleteTarget.id);
            toast('Local excluído.');
          } catch (err) {
            toast(err instanceof Error ? err.message : 'Não foi possível excluir.', 'erro');
          }
        }}
      />
    </div>
  );
};
