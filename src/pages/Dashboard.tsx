import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import {
  AlertTriangle,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Coffee,
  Download,
  Edit3,
  MapPin,
  Navigation,
  Play,
  Plus,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {RegistroModal} from '../components/RegistroModal';
import {ConfirmDialog, EmptyState, Modal, ProgressBar, StatCard} from '../components/UI';
import {useGoogleCalendar} from '../context/GoogleCalendarContext';
import {useStore} from '../context/StoreContext';
import {usePWAInstall} from '../hooks/usePWAInstall';
import {RegistroPonto} from '../types';
import {
  calcRegistro,
  diffMinutes,
  filterByMonth,
  findLocal,
  findNearestLocal,
  isRegistroAberto,
  isTrocaLocal,
  summarizeRegistros,
  timeToMinutes,
} from '../utils/calc';
import {
  agoraHHMM,
  formatCurrencyBRL,
  formatDateBR,
  formatDistance,
  formatHours,
  formatMMSS,
  hojeISO,
  mesAtualRef,
} from '../utils/format';

export const Dashboard: React.FC = () => {
  const {
    config,
    locais,
    registros,
    adicionarRegistro,
    editarRegistro,
    excluirRegistro,
    carregarExemplo,
    toast,
  } = useStore();
  const gcal = useGoogleCalendar();
  const {instalado, podeInstalar, ios, instalar} = usePWAInstall();
  const [searchParams, setSearchParams] = useSearchParams();
  const autoPunchRef = useRef(false);

  const [now, setNow] = useState(() => new Date());
  const [selectedLocalId, setSelectedLocalId] = useState('');
  const [gpsCoords, setGpsCoords] = useState<{lat: number; lng: number; precisao?: number} | null>(
    null,
  );
  const [gpsBusy, setGpsBusy] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingReg, setEditingReg] = useState<RegistroPonto | null>(null);
  const [pausaOpen, setPausaOpen] = useState(false);
  const [pausaAdd, setPausaAdd] = useState('15');
  const [deleteTarget, setDeleteTarget] = useState<RegistroPonto | null>(null);

  const [installDismissed, setInstallDismissed] = useState(() => {
    try {
      return localStorage.getItem('ch-install-dismissed') === '1';
    } catch {
      return false;
    }
  });
  const [iosGuideOpen, setIosGuideOpen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const hoje = hojeISO(now);
  const mesRef = mesAtualRef();

  const openReg = useMemo(
    () =>
      [...registros]
        .filter((r) => isRegistroAberto(r))
        .sort((a, b) => `${b.data}${b.entrada}`.localeCompare(`${a.data}${a.entrada}`))[0] || null,
    [registros],
  );

  const openOld = useMemo(
    () => (openReg && openReg.data < hoje ? openReg : null),
    [openReg, hoje],
  );

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
  const sumAgendadosMes = useMemo(
    () => summarizeRegistros(agendadosMes, regularLocais, config),
    [agendadosMes, regularLocais, config],
  );
  const proximosAgendados = useMemo(
    () =>
      registros
        .filter((r) => !!r.agendado && r.data >= hoje && !isTrocaLocal(findLocal(r, locais)))
        .sort((a, b) => `${a.data}${a.entrada}`.localeCompare(`${b.data}${b.entrada}`))
        .slice(0, 4),
    [registros, locais, hoje],
  );

  const hasAnyGpsLocal = useMemo(
    () => regularLocais.some((l) => l.lat != null && l.lng != null),
    [regularLocais],
  );

  const detectLocation = useCallback(
    (silent = false) => {
      if (!navigator.geolocation) {
        if (!silent) toast('Geolocalização não disponível neste navegador.', 'erro');
        return;
      }
      setGpsBusy(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            precisao: Math.round(pos.coords.accuracy),
          };
          setGpsCoords(coords);
          const match = findNearestLocal(regularLocais, coords);
          if (match && !match.foraDoRaio && !openReg) {
            setSelectedLocalId(match.local.id);
            if (!silent) {
              toast(`Local detectado: ${match.local.nome} (${formatDistance(match.distancia)})`);
            }
          } else if (!silent && match) {
            toast(
              `Local mais próximo: ${match.local.nome} a ${formatDistance(match.distancia)}.`,
            );
          }
          setGpsBusy(false);
        },
        () => {
          setGpsBusy(false);
          if (!silent) toast('Não foi possível obter a localização.', 'erro');
        },
        {enableHighAccuracy: true, timeout: 10000, maximumAge: 60000},
      );
    },
    [regularLocais, openReg, toast],
  );

  useEffect(() => {
    if (!hasAnyGpsLocal) return;
    navigator.permissions
      ?.query({name: 'geolocation'})
      .then((res) => {
        if (res.state === 'granted') detectLocation(true);
      })
      .catch(() => {});
  }, [hasAnyGpsLocal, detectLocation]);

  useEffect(() => {
    if (!selectedLocalId && regularLocais.length) {
      setSelectedLocalId(regularLocais[0].id);
    } else if (selectedLocalId && !regularLocais.some((l) => l.id === selectedLocalId)) {
      setSelectedLocalId(regularLocais[0]?.id || '');
    }
  }, [regularLocais, selectedLocalId]);

  const gpsMatch = useMemo(() => findNearestLocal(regularLocais, gpsCoords), [regularLocais, gpsCoords]);

  const elapsedMinutes = useMemo(() => {
    if (!openReg) return 0;
    const nowHHMM = agoraHHMM(now);
    let mins = diffMinutes(openReg.entrada, nowHHMM);
    if (openReg.data < hoje) {
      const startM = timeToMinutes(openReg.entrada) || 0;
      const nowM = timeToMinutes(nowHHMM) || 0;
      const dayDiff = Math.max(
        1,
        Math.round((new Date(hoje).getTime() - new Date(openReg.data).getTime()) / 86400000),
      );
      mins = dayDiff * 1440 - startM + nowM;
    }
    return Math.max(0, mins - (Number(openReg.pausa_min) || 0));
  }, [openReg, now, hoje]);

  const handleClockIn = useCallback(
    (localIdOverride?: string) => {
      const targetId = localIdOverride || selectedLocalId || regularLocais[0]?.id || '';
      if (!targetId) {
        toast('Cadastre e selecione um local antes de bater o ponto.', 'erro');
        return;
      }
      const hora = agoraHHMM(new Date());
      adicionarRegistro({
        localId: targetId,
        data: hojeISO(),
        entrada: hora,
        saida: '',
        pausa_min: 0,
        feriado: false,
        troca_plantao: '',
        obs: '',
        ...(gpsCoords ? gpsCoords : {}),
      });
      const loc = regularLocais.find((l) => l.id === targetId);
      toast(`Entrada registrada às ${hora}${loc ? ` em ${loc.nome}` : ''}.`);
    },
    [selectedLocalId, regularLocais, adicionarRegistro, gpsCoords, toast],
  );

  const handleClockOut = useCallback(() => {
    if (!openReg) return;
    const hora = agoraHHMM(new Date());
    editarRegistro(openReg.id, {saida: hora});
    const loc = findLocal(openReg, locais);
    const calc = calcRegistro({...openReg, saida: hora}, loc, config);
    toast(`Saída registrada às ${hora} · ${formatHours(calc.horas)}.`);
  }, [openReg, editarRegistro, locais, config, toast]);

  useEffect(() => {
    if (searchParams.get('bater') !== '1') {
      autoPunchRef.current = false;
      return;
    }
    if (autoPunchRef.current) return;
    autoPunchRef.current = true;
    setSearchParams({}, {replace: true});

    if (openReg) {
      handleClockOut();
    } else if (regularLocais.length > 0) {
      handleClockIn(selectedLocalId || regularLocais[0].id);
    } else {
      toast('Cadastre um local antes de usar o atalho de bater ponto.', 'erro');
    }
  }, [
    searchParams,
    setSearchParams,
    openReg,
    regularLocais,
    selectedLocalId,
    handleClockIn,
    handleClockOut,
    toast,
  ]);

  const handleAddPause = (mins: number) => {
    if (!openReg || mins <= 0) return;
    const total = (Number(openReg.pausa_min) || 0) + mins;
    editarRegistro(openReg.id, {pausa_min: total});
    toast(`Pausa atualizada para ${total} min.`);
    setPausaOpen(false);
  };

  const dismissInstall = () => {
    setInstallDismissed(true);
    try {
      localStorage.setItem('ch-install-dismissed', '1');
    } catch {
      // ignore
    }
  };

  const regsMes = useMemo(() => filterByMonth(regularRegistros, mesRef), [regularRegistros, mesRef]);
  const regsHoje = useMemo(() => regularRegistros.filter((r) => r.data === hoje), [regularRegistros, hoje]);
  const sumMes = useMemo(() => summarizeRegistros(regsMes, regularLocais, config), [regsMes, regularLocais, config]);
  const sumHoje = useMemo(() => summarizeRegistros(regsHoje, regularLocais, config), [regsHoje, regularLocais, config]);

  const dailyChartData = useMemo(() => {
    const [y, m] = mesRef.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const byDay = new Map<string, number>();
    for (const r of regsMes) {
      const h = calcRegistro(r, findLocal(r, regularLocais), config).horas;
      byDay.set(r.data, (byDay.get(r.data) || 0) + h);
    }
    const items: Array<{dia: string; horas: number}> = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${mesRef}-${String(d).padStart(2, '0')}`;
      items.push({dia: String(d), horas: Number((byDay.get(iso) || 0).toFixed(2))});
    }
    return items;
  }, [mesRef, regsMes, regularLocais, config]);

  const recentRecords = useMemo(
    () =>
      [...regularRegistros]
        .sort((a, b) => `${b.data}${b.entrada}`.localeCompare(`${a.data}${a.entrada}`))
        .slice(0, 6),
    [regularRegistros],
  );

  const openLocal = openReg ? findLocal(openReg, locais) : null;
  const showInstallBanner = !instalado && !installDismissed && (podeInstalar || ios);

  return (
    <div className="space-y-5">
      {/* Install banner on Android / iOS */}
      {showInstallBanner && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-[var(--accent)]/30 bg-[var(--accent-soft)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-[var(--accent)]">
              Instale o rad TunoPay no celular
            </div>
            <p className="text-xs text-[var(--muted)]">
              Abre direto da tela inicial e funciona offline mesmo sem internet.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-primary min-h-[40px] px-3.5 text-xs"
              onClick={async () => {
                if (podeInstalar) {
                  const res = await instalar();
                  if (res.ok) toast('App instalado!');
                } else {
                  setIosGuideOpen(true);
                }
              }}
            >
              <Download className="h-4 w-4" />
              Instalar
            </button>
            <button
              type="button"
              onClick={dismissInstall}
              aria-label="Dispensar aviso"
              className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--muted)] hover:bg-[var(--surface)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Open shift from previous day warning */}
      {openOld && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-[var(--warn)]/40 bg-[var(--warn-soft)] px-4 py-3 text-[var(--warn)]">
          <div className="flex items-center gap-2.5 text-sm font-semibold">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>
              Há um ponto em aberto de {formatDateBR(openOld.data)} (entrada {openOld.entrada}).
            </span>
          </div>
          <button
            type="button"
            className="btn btn-ghost border-[var(--warn)]/40 text-xs font-bold text-[var(--warn)]"
            onClick={() => {
              setEditingReg(openOld);
              setModalOpen(true);
            }}
          >
            Corrigir agora
          </button>
        </div>
      )}

      {/* Clock / Punch Hero Card */}
      <section className="card card-pad">
        {!regularLocais.length ? (
          <EmptyState
            icon={<MapPin className="h-6 w-6" />}
            title="Comece cadastrando um local"
            desc="Adicione seu local de trabalho com valor/hora e limite diário, ou carregue um exemplo pronto para testar."
            action={
              <>
                <Link to="/locais" className="btn btn-primary">
                  <Plus className="h-4 w-4" />
                  Cadastrar local
                </Link>
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
              </>
            }
          />
        ) : (
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-[var(--muted)]">
                {openReg ? 'Turno em andamento' : 'Horário atual'}
              </div>
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="font-mono text-4xl font-bold tracking-tight tabular-nums md:text-5xl">
                  {now.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit', second: '2-digit'})}
                </span>
                {openReg && (
                  <span className="font-mono text-lg font-bold text-[var(--ok)] tabular-nums">
                    {formatMMSS(elapsedMinutes)} decorrido
                  </span>
                )}
              </div>

              {openReg ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--muted)]">
                  {openLocal && (
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--text)]">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{background: openLocal.cor}}
                      />
                      {openLocal.nome}
                    </span>
                  )}
                  <span>·</span>
                  <span className="font-mono tabular-nums">Entrada {openReg.entrada}</span>
                  <span>·</span>
                  <span>Pausa {openReg.pausa_min || 0} min</span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <select
                    aria-label="Local de trabalho"
                    className="input max-w-xs"
                    value={selectedLocalId}
                    onChange={(e) => setSelectedLocalId(e.target.value)}
                  >
                    {regularLocais.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nome} ({l.tipo})
                      </option>
                    ))}
                  </select>
                  {hasAnyGpsLocal && (
                    <button
                      type="button"
                      className="btn btn-ghost min-h-[42px] px-3 text-xs"
                      onClick={() => detectLocation(false)}
                      disabled={gpsBusy}
                      title="Detectar local mais próximo por GPS"
                    >
                      <Navigation className="h-4 w-4" />
                      {gpsBusy ? 'Buscando...' : 'GPS'}
                    </button>
                  )}
                  {gpsMatch && !gpsMatch.foraDoRaio && (
                    <span className="text-xs font-semibold text-[var(--ok)]">
                      Perto de {gpsMatch.local.nome} ({formatDistance(gpsMatch.distancia)})
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {openReg ? (
                <>
                  <button type="button" className="btn btn-danger btn-lg" onClick={handleClockOut}>
                    <Square className="h-4 w-4" />
                    Registrar saída
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost min-h-[48px]"
                    onClick={() => {
                      setPausaAdd('15');
                      setPausaOpen(true);
                    }}
                  >
                    <Coffee className="h-4 w-4" />
                    Pausa
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost min-h-[48px]"
                    onClick={() => {
                      setEditingReg(openReg);
                      setModalOpen(true);
                    }}
                  >
                    <Edit3 className="h-4 w-4" />
                    Editar
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    onClick={() => handleClockIn()}
                  >
                    <Play className="h-4 w-4" />
                    Registrar entrada
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost min-h-[48px]"
                    onClick={() => {
                      setEditingReg(null);
                      setModalOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Registrar manual
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 4 KPI Summary Cards */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Horas hoje"
          value={formatHours(sumHoje.horas)}
          sub={sumHoje.valor > 0 ? formatCurrencyBRL(sumHoje.valor) : `${sumHoje.quantidade} registro(s)`}
        />
        <StatCard
          label="Horas no mês"
          value={formatHours(sumMes.horas)}
          sub={`${sumMes.quantidade} ${sumMes.quantidade === 1 ? 'registro' : 'registros'}`}
        />
        <StatCard
          label="Extras no mês"
          value={formatHours(sumMes.extras)}
          sub={`+${config.extraPercent}% adicional`}
          tone={sumMes.extras > 0 ? 'warn' : 'default'}
        />
        <StatCard
          label="Ganhos no mês"
          value={formatCurrencyBRL(sumMes.valor)}
          sub={
            sumAgendadosMes.horas > 0
              ? `Previsão +agend.: ${formatCurrencyBRL(sumMes.valor + sumAgendadosMes.valor)}`
              : 'Estimativa bruta'
          }
          accent
        />
      </section>

      {proximosAgendados.length > 0 && (
        <section className="card card-pad space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <CalendarClock className="h-4 w-4 text-[var(--accent)]" />
              Próximos plantões agendados
            </h2>
            <Link to="/calendario" className="text-xs font-semibold text-[var(--accent)] hover:underline">
              Ver agenda
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {proximosAgendados.map((r) => {
              const loc = findLocal(r, locais);
              const calc = calcRegistro(r, loc, config);
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-2)]/60 px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-bold">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{background: loc?.cor || 'var(--muted)'}}
                      />
                      <span className="truncate">{loc?.nome || 'Local'}</span>
                      {r.googleEventId && (
                        <span className="rounded bg-[var(--ok-soft)] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-[var(--ok)]">
                          Google Agenda
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[var(--muted)] tabular-nums">
                      {formatDateBR(r.data)} · {r.entrada}–{r.saida || '—'} ·{' '}
                      {formatHours(calc.horas)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--accent)] hover:bg-[var(--accent-soft)]"
                      title={
                        r.googleEventId
                          ? 'Atualizar no Google Calendar'
                          : 'Enviar para o Google Calendar'
                      }
                      aria-label="Sincronizar com Google Calendar"
                      onClick={() => gcal.syncSingleShift(r)}
                    >
                      <Calendar className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-soft min-h-[32px] px-2.5 py-1 text-[11px]"
                      onClick={() => {
                        editarRegistro(r.id, {agendado: false});
                        toast('Plantão confirmado!');
                      }}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Confirmar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Monthly Goal */}
      {config.metaMensal > 0 && (
        <section className="card card-pad space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-bold">Meta mensal</span>
            <span className="font-mono text-xs font-semibold text-[var(--muted)] tabular-nums">
              {formatHours(sumMes.horas)} de {formatHours(config.metaMensal)} (
              {Math.min(999, Math.round((sumMes.horas / config.metaMensal) * 100))}%)
            </span>
          </div>
          <ProgressBar value={sumMes.horas} max={config.metaMensal} />
        </section>
      )}

      {/* Daily Chart + Recent Records */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <section className="card card-pad lg:col-span-7">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-base font-bold">Horas por dia no mês</h2>
            <Link to="/totais" className="text-xs font-semibold text-[var(--accent)] hover:underline">
              Ver totais
            </Link>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyChartData} margin={{top: 4, right: 4, left: -24, bottom: 0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="dia"
                  tick={{fill: 'var(--muted)', fontSize: 11}}
                  axisLine={false}
                  tickLine={false}
                  interval={2}
                />
                <YAxis
                  tick={{fill: 'var(--muted)', fontSize: 11}}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value) => [formatHours(Number(value)), 'Horas']}
                  labelFormatter={(label) => `Dia ${label}`}
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="horas" fill="var(--accent)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card card-pad lg:col-span-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-bold">Últimos registros</h2>
            <Link
              to="/calendario"
              className="text-xs font-semibold text-[var(--accent)] hover:underline"
            >
              Ver agenda
            </Link>
          </div>
          {!recentRecords.length ? (
            <p className="py-8 text-center text-sm text-[var(--muted)]">
              Nenhum registro lançado ainda.
            </p>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {recentRecords.map((r) => {
                const loc = findLocal(r, locais);
                const calc = calcRegistro(r, loc, config);
                return (
                  <div key={r.id} className="flex items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{background: loc?.cor || 'var(--muted)'}}
                        />
                        <span className="truncate">{loc?.nome || 'Local removido'}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-[var(--muted)] tabular-nums">
                        {formatDateBR(r.data)} · {r.entrada}–{r.saida || 'aberto'}
                        {calc.horas > 0 ? ` · ${formatHours(calc.horas)}` : ''}
                        {r.feriado ? ' · Feriado' : ''}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {!calc.aberto && !calc.troca && (
                        <span className="mr-1 font-mono text-xs font-bold tabular-nums">
                          {formatCurrencyBRL(calc.valor)}
                        </span>
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
        </section>
      </div>

      {/* Modals */}
      <RegistroModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingReg(null);
        }}
        registro={editingReg}
        defaultLocalId={selectedLocalId}
      />

      <Modal
        open={pausaOpen}
        onClose={() => setPausaOpen(false)}
        title="Adicionar pausa ao turno"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setPausaOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleAddPause(Number(pausaAdd) || 0)}
            >
              Somar pausa
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--muted)]">
            Pausa atual neste turno: <strong className="text-[var(--text)]">{openReg?.pausa_min || 0} min</strong>
          </p>
          <div className="grid grid-cols-4 gap-2">
            {[15, 30, 45, 60].map((m) => (
              <button
                key={m}
                type="button"
                className="btn btn-ghost font-mono text-sm"
                onClick={() => handleAddPause(m)}
              >
                +{m}m
              </button>
            ))}
          </div>
          <div>
            <label className="label">Ou informe em minutos</label>
            <input
              type="number"
              min="1"
              className="input font-mono"
              value={pausaAdd}
              onChange={(e) => setPausaAdd(e.target.value)}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={iosGuideOpen}
        onClose={() => setIosGuideOpen(false)}
        title="Instalar no iPhone / iPad"
        footer={
          <button type="button" className="btn btn-primary" onClick={() => setIosGuideOpen(false)}>
            Entendi
          </button>
        }
      >
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>Toque em Compartilhar na barra do Safari.</li>
          <li>Escolha Adicionar à Tela de Início.</li>
          <li>Toque em Adicionar.</li>
        </ol>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Excluir registro?"
        body={
          deleteTarget
            ? `Tem certeza que deseja excluir o registro de ${formatDateBR(deleteTarget.data)} (${deleteTarget.entrada}–${deleteTarget.saida || 'aberto'})?${deleteTarget.googleEventId ? ' Se quiser, você também poderá remover o evento do Google Calendar em seguida.' : ''}`
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
