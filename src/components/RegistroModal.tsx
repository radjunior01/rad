import React, {useEffect, useMemo, useState} from 'react';
import {AlertTriangle, Calendar, Clock, ExternalLink} from 'lucide-react';
import {useGoogleCalendar} from '../context/GoogleCalendarContext';
import {useStore} from '../context/StoreContext';
import {RegistroPonto} from '../types';
import {calcRegistro, detectOverlap, isTrocaLocal} from '../utils/calc';
import {agoraHHMM, formatCurrencyBRL, formatHours, hojeISO} from '../utils/format';
import {GoogleSignInButton} from './GoogleSignInButton';
import {Field, Modal} from './UI';

interface RegistroModalProps {
  open: boolean;
  onClose: () => void;
  registro?: RegistroPonto | null;
  defaultData?: string;
  defaultLocalId?: string;
}

export const RegistroModal: React.FC<RegistroModalProps> = ({
  open,
  onClose,
  registro,
  defaultData,
  defaultLocalId,
}) => {
  const {locais, registros, config, adicionarRegistro, editarRegistro, toast} = useStore();
  const gcal = useGoogleCalendar();

  const selectableLocais = useMemo(
    () =>
      locais.filter(
        (l) => !isTrocaLocal(l) || (registro && l.id === registro.localId),
      ),
    [locais, registro],
  );

  const [localId, setLocalId] = useState('');
  const [data, setData] = useState(hojeISO());
  const [entrada, setEntrada] = useState('08:00');
  const [saida, setSaida] = useState('17:00');
  const [pausaMin, setPausaMin] = useState('60');
  const [feriado, setFeriado] = useState(false);
  const [valorHora, setValorHora] = useState('');
  const [agendado, setAgendado] = useState(false);
  const [syncGoogle, setSyncGoogle] = useState(false);
  const [obs, setObs] = useState('');

  useEffect(() => {
    if (!open) return;
    if (registro) {
      setLocalId(registro.localId || selectableLocais[0]?.id || '');
      setData(registro.data || hojeISO());
      setEntrada(registro.entrada || '');
      setSaida(registro.saida || '');
      setPausaMin(String(registro.pausa_min ?? 0));
      setFeriado(!!registro.feriado);
      setAgendado(!!registro.agendado);
      setSyncGoogle(!!registro.googleEventId || (!!registro.agendado && gcal.connected));
      setValorHora(
        registro.valor_hora !== undefined && registro.valor_hora !== ''
          ? String(registro.valor_hora)
          : '',
      );
      setObs(registro.obs || '');
    } else {
      const initialId =
        defaultLocalId && selectableLocais.some((l) => l.id === defaultLocalId)
          ? defaultLocalId
          : selectableLocais[0]?.id || '';
      const targetDate = defaultData || hojeISO();
      const isFuture = targetDate > hojeISO();
      setLocalId(initialId);
      setData(targetDate);
      setEntrada('08:00');
      setSaida('17:00');
      setPausaMin('60');
      setFeriado(false);
      setAgendado(isFuture);
      setSyncGoogle(gcal.connected);
      setValorHora('');
      setObs('');
    }
  }, [open, registro, defaultData, defaultLocalId, selectableLocais, gcal.connected]);

  const selectedLocal = useMemo(
    () => selectableLocais.find((l) => l.id === localId) || null,
    [selectableLocais, localId],
  );

  const previewCandidate: Partial<RegistroPonto> = useMemo(
    () => ({
      id: registro?.id,
      localId,
      data,
      entrada,
      saida,
      pausa_min: Number(pausaMin) || 0,
      feriado,
      troca_plantao: '',
      valor_hora: valorHora === '' ? '' : Number(valorHora),
      obs,
    }),
    [registro?.id, localId, data, entrada, saida, pausaMin, feriado, valorHora, obs],
  );

  const calc = useMemo(
    () => calcRegistro(previewCandidate, selectedLocal, config),
    [previewCandidate, selectedLocal, config],
  );

  const overlap = useMemo(
    () => detectOverlap(registros, previewCandidate),
    [registros, previewCandidate],
  );

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!localId) {
      toast('Selecione um local de trabalho.', 'erro');
      return;
    }
    if (!data || !entrada) {
      toast('Informe data e horário de entrada.', 'erro');
      return;
    }

    const payload: Partial<RegistroPonto> = {
      localId,
      data,
      entrada,
      saida,
      pausa_min: Math.max(0, Number(pausaMin) || 0),
      feriado,
      agendado,
      troca_plantao: '',
      valor_hora: valorHora !== '' ? Number(valorHora) : undefined,
      obs: obs.trim(),
    };

    let savedReg: RegistroPonto;
    if (registro) {
      editarRegistro(registro.id, payload);
      savedReg = {...registro, ...payload};
      toast('Registro atualizado.');
    } else {
      savedReg = adicionarRegistro(payload);
      toast('Registro salvo.');
    }
    onClose();

    if (agendado && syncGoogle) {
      gcal.syncSingleShift(savedReg);
    } else if (registro?.googleEventId && !agendado) {
      gcal.removeShiftEvent(savedReg, true);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={registro ? 'Editar registro' : 'Novo registro de ponto'}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            form="registro-form"
            className="btn btn-primary"
            disabled={!selectableLocais.length}
          >
            {registro ? 'Salvar alterações' : 'Salvar registro'}
          </button>
        </>
      }
    >
      <form id="registro-form" onSubmit={handleSave} className="space-y-4">
        <Field label="Local de trabalho">
          <select
            className="input"
            value={localId}
            onChange={(e) => setLocalId(e.target.value)}
            required
          >
            {!selectableLocais.length && <option value="">Cadastre um local antes</option>}
            {selectableLocais.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome} ({l.tipo})
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Data">
            <input
              type="date"
              className="input font-mono"
              value={data}
              onChange={(e) => setData(e.target.value)}
              required
            />
          </Field>

          <Field label="Pausa (minutos)">
            <input
              type="number"
              min="0"
              step="5"
              className="input font-mono"
              value={pausaMin}
              onChange={(e) => setPausaMin(e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Entrada">
            <div className="flex gap-2">
              <input
                type="time"
                className="input font-mono"
                value={entrada}
                onChange={(e) => setEntrada(e.target.value)}
                required
              />
              <button
                type="button"
                className="btn btn-ghost px-3 text-xs"
                onClick={() => setEntrada(agoraHHMM())}
              >
                <Clock className="h-3.5 w-3.5" />
                agora
              </button>
            </div>
          </Field>

          <Field label="Saída" hint="Deixe vazio se o turno ainda estiver aberto.">
            <div className="flex gap-2">
              <input
                type="time"
                className="input font-mono"
                value={saida}
                onChange={(e) => setSaida(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-ghost px-3 text-xs"
                onClick={() => setSaida(agoraHHMM())}
              >
                <Clock className="h-3.5 w-3.5" />
                agora
              </button>
            </div>
          </Field>
        </div>

        <Field
          label="R$/hora neste dia (opcional)"
          hint={selectedLocal ? `Padrão do local: ${formatCurrencyBRL(selectedLocal.valor_hora)}` : undefined}
        >
          <input
            type="number"
            step="0.01"
            min="0"
            className="input font-mono"
            value={valorHora}
            onChange={(e) => setValorHora(e.target.value)}
            placeholder="Usar padrão do local"
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5 text-sm font-medium">
            <input
              type="checkbox"
              checked={feriado}
              onChange={(e) => setFeriado(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            <span>
              Feriado <span className="text-xs text-[var(--muted)]">(×{config.feriadoMult})</span>
            </span>
          </label>

          <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5 text-sm font-medium">
            <input
              type="checkbox"
              checked={agendado}
              onChange={(e) => {
                const checked = e.target.checked;
                setAgendado(checked);
                if (checked && gcal.connected) setSyncGoogle(true);
              }}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            <span>
              Plantão agendado <span className="text-xs text-[var(--muted)]">(escala futura)</span>
            </span>
          </label>
        </div>

        {(agendado || registro?.googleEventId) && (
          <div className="space-y-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-[var(--text)]">
                <Calendar className="h-4 w-4 text-[var(--accent)]" />
                <span>Google Calendar</span>
              </div>
              {registro?.googleEventId && (
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-[var(--ok-soft)] px-2 py-0.5 font-semibold text-[var(--ok)]">
                    Sincronizado
                  </span>
                  {registro.googleEventLink && (
                    <a
                      href={registro.googleEventLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-[var(--accent)] hover:underline"
                    >
                      Abrir <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}
            </div>

            {agendado ? (
              <>
                {gcal.connected ? (
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={syncGoogle}
                      onChange={(e) => setSyncGoogle(e.target.checked)}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    <span>
                      {registro?.googleEventId
                        ? 'Atualizar evento no Google Calendar ao salvar'
                        : 'Enviar evento para o Google Calendar ao salvar'}
                    </span>
                  </label>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[var(--muted)]">
                      Conecte sua conta Google para enviar este plantão para sua agenda.
                    </span>
                    <GoogleSignInButton
                      compact
                      disabled={gcal.isLoggingIn}
                      onClick={async () => {
                        const ok = await gcal.connect();
                        if (ok) setSyncGoogle(true);
                      }}
                      label={gcal.isLoggingIn ? 'Conectando...' : 'Conectar com o Google'}
                    />
                  </div>
                )}
              </>
            ) : (
              <p className="text-[var(--muted)]">
                Ao desmarcar como agendado e salvar, perguntaremos se deseja remover o evento do Google Calendar.
              </p>
            )}
          </div>
        )}

        <Field label="Observações">
          <input
            type="text"
            className="input"
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Ex.: Plantão noturno, cobertura..."
          />
        </Field>

        {overlap && (
          <div className="flex items-start gap-2.5 rounded-xl border border-[var(--warn)]/40 bg-[var(--warn-soft)] p-3 text-xs text-[var(--warn)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Horário sobreposto com outro registro neste mesmo local ({overlap.entrada}–
              {overlap.saida || 'aberto'}).
            </span>
          </div>
        )}

        {selectedLocal && entrada && saida && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-xs tabular-nums">
            <span className="text-[var(--muted)]">
              Total: <strong className="text-[var(--text)]">{formatHours(calc.horas)}</strong>
              {calc.extras > 0 && ` · ${formatHours(calc.extras)} extras`}
              {calc.fimDeSemana && !calc.feriado && selectedLocal.fds_percent > 0 && ` · FDS +${selectedLocal.fds_percent}%`}
            </span>
            <strong className="font-mono text-sm text-[var(--accent)]">
              {agendado ? `Previsão: ${formatCurrencyBRL(calc.valor)}` : formatCurrencyBRL(calc.valor)}
            </strong>
          </div>
        )}
      </form>
    </Modal>
  );
};
