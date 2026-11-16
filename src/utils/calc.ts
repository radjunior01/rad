import {
  AppConfig,
  CalculoRegistro,
  LocalTrabalho,
  Pagamento,
  RegistroPonto,
  ResumoHoras,
  ResumoLocal,
  TrocaPlantao,
} from '../types';
import {isWeekend, normalizeText, pad2} from './format';

export const DEFAULTS_CALC = {
  extraPercent: 50,
  feriadoMult: 2,
  fdsPercent: 0,
  limiteNormal: 8,
  valorHora: 0,
  metaMensal: 220,
};

export const TIPOS_LOCAL = ['Fixo', 'Freelance', 'Eventual'] as const;

export function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().slice(0, 12);
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function isTrocaLocal(local?: Partial<LocalTrabalho> | null): boolean {
  const tipo = String(local?.tipo || '').toLowerCase();
  return tipo.includes('troca');
}

export function timeToMinutes(hhmm?: string | null): number | null {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (Number(m) || 0);
}

export function diffMinutes(entrada?: string, saida?: string): number {
  const a = timeToMinutes(entrada);
  const b = timeToMinutes(saida);
  if (a === null || b === null) return 0;
  let d = b - a;
  if (d < 0) d += 1440;
  return d;
}

export function calcHours(reg?: Partial<RegistroPonto> | null): number {
  if (!reg || !reg.entrada || !reg.saida) return 0;
  const mins = diffMinutes(reg.entrada, reg.saida) - (Number(reg.pausa_min) || 0);
  return Math.max(0, mins) / 60;
}

export function isRegistroAberto(reg?: Partial<RegistroPonto> | null): boolean {
  return !!(reg && reg.entrada && !reg.saida);
}

export function resolveHourlyRate(
  reg?: Partial<RegistroPonto> | null,
  local?: Partial<LocalTrabalho> | null,
  config: Partial<AppConfig> = {},
): number {
  const regVal = Number(reg?.valor_hora);
  if (Number.isFinite(regVal) && regVal > 0) return regVal;
  return Number(local?.valor_hora ?? config?.valorHoraPadrao ?? DEFAULTS_CALC.valorHora) || 0;
}

export function hasCustomRate(reg?: Partial<RegistroPonto> | null): boolean {
  const v = Number(reg?.valor_hora);
  return Number.isFinite(v) && v > 0;
}

export function findLocal(reg: {localId?: string}, locais: LocalTrabalho[]): LocalTrabalho | null {
  return locais.find((l) => l.id === reg.localId) || null;
}

export function calcRegistro(
  reg: Partial<RegistroPonto> | null | undefined,
  local: Partial<LocalTrabalho> | null | undefined,
  config: Partial<AppConfig> = {},
): CalculoRegistro {
  const horas = calcHours(reg);
  const valorHora = resolveHourlyRate(reg, local, config);
  const limite = Number(local?.limite_normal ?? DEFAULTS_CALC.limiteNormal) || 0;
  const extraPercent = Number(config.extraPercent ?? DEFAULTS_CALC.extraPercent);
  const feriadoMult = Number(config.feriadoMult ?? DEFAULTS_CALC.feriadoMult);

  const normais = limite > 0 ? Math.min(horas, limite) : horas;
  const extras = Math.max(0, horas - normais);

  let multDia = 1;
  if (reg?.feriado) {
    multDia = feriadoMult;
  } else if (reg?.data && isWeekend(reg.data)) {
    const fds = Number(local?.fds_percent ?? DEFAULTS_CALC.fdsPercent) || 0;
    multDia = 1 + fds / 100;
  }

  const troca = isTrocaLocal(local);
  const rende = !troca && reg?.troca_plantao !== 'compensado';
  const bruto = (normais * multDia + extras * multDia * (1 + extraPercent / 100)) * valorHora;

  return {
    horas,
    normais,
    extras,
    multDia,
    valorHora,
    valor: rende ? bruto : 0,
    rende,
    aberto: isRegistroAberto(reg),
    agendado: !!reg?.agendado,
    troca,
    feriado: !!reg?.feriado,
    fimDeSemana: reg?.data ? isWeekend(reg.data) : false,
  };
}

export function splitWorkedAndScheduled(registros: RegistroPonto[]): {
  trabalhados: RegistroPonto[];
  agendados: RegistroPonto[];
} {
  const trabalhados: RegistroPonto[] = [];
  const agendados: RegistroPonto[] = [];
  for (const r of registros) {
    if (r.agendado) agendados.push(r);
    else trabalhados.push(r);
  }
  return {trabalhados, agendados};
}

export function summarizeRegistros(
  registros: RegistroPonto[],
  locais: LocalTrabalho[],
  config: Partial<AppConfig>,
): ResumoHoras {
  let horas = 0;
  let normais = 0;
  let extras = 0;
  let valor = 0;
  for (const r of registros) {
    const c = calcRegistro(r, findLocal(r, locais), config);
    horas += c.horas;
    normais += c.normais;
    extras += c.extras;
    valor += c.valor;
  }
  return {horas, normais, extras, valor, quantidade: registros.length};
}

export function sumPagamentos(pagamentos: Pagamento[], localId?: string): number {
  return pagamentos
    .filter((p) => (localId ? p.localId === localId : true))
    .reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
}

export function summarizeByLocal(
  registros: RegistroPonto[],
  locais: LocalTrabalho[],
  pagamentos: Pagamento[],
  config: Partial<AppConfig>,
): ResumoLocal[] {
  return locais.map((local) => {
    const regs = registros.filter((r) => r.localId === local.id);
    const res = summarizeRegistros(regs, locais, config);
    const pago = sumPagamentos(pagamentos, local.id);
    return {
      local,
      ...res,
      pago,
      aReceber: res.valor - pago,
    };
  });
}

export interface ResumoTrocaPorPessoa {
  pessoa: string;
  registros: number;
  trabalhadas: number;
  ressarcidas: number;
  pendentes: number;
  aReceber: number;
  aDevolver: number;
  saldo: number;
}

export function getTrocaHorasRessarcidas(t: TrocaPlantao): number {
  if (Array.isArray(t.historicoRessarcimentos) && t.historicoRessarcimentos.length > 0) {
    return t.historicoRessarcimentos.reduce(
      (acc, item) => acc + Math.max(0, Number(item.horas) || 0),
      0,
    );
  }
  return Math.max(0, Number(t.horasRessarcidas) || 0);
}

export function summarizeTrocasPlantao(trocas: TrocaPlantao[]): {
  porPessoa: ResumoTrocaPorPessoa[];
  trabalhadas: number;
  ressarcidas: number;
  pendentes: number;
  aReceberHoras: number;
  aDevolverHoras: number;
  saldo: number;
} {
  const map = new Map<string, ResumoTrocaPorPessoa>();
  let aReceberHoras = 0;
  let aDevolverHoras = 0;

  for (const t of trocas) {
    const nome = String(t.paraQuem || '').trim() || 'Sem nome';
    const key = normalizeText(nome) || 'sem-nome';
    const trab = Math.max(0, Number(t.horasTrabalhadas) || 0);
    const res = getTrocaHorasRessarcidas(t);
    const falta = Math.max(0, trab - res);
    const direcao = t.direcao === 'cobriu_para_mim' ? 'cobriu_para_mim' : 'eu_trabalhei';

    const cur = map.get(key) || {
      pessoa: nome,
      registros: 0,
      trabalhadas: 0,
      ressarcidas: 0,
      pendentes: 0,
      aReceber: 0,
      aDevolver: 0,
      saldo: 0,
    };
    cur.registros += 1;
    cur.trabalhadas += trab;
    cur.ressarcidas += res;
    if (direcao === 'cobriu_para_mim') {
      cur.aDevolver += falta;
      aDevolverHoras += falta;
    } else {
      cur.aReceber += falta;
      aReceberHoras += falta;
    }
    cur.pendentes = cur.aReceber + cur.aDevolver;
    cur.saldo = cur.aReceber - cur.aDevolver;
    map.set(key, cur);
  }

  const porPessoa = Array.from(map.values()).sort(
    (a, b) => b.pendentes - a.pendentes || b.trabalhadas - a.trabalhadas,
  );
  const trabalhadas = porPessoa.reduce((acc, p) => acc + p.trabalhadas, 0);
  const ressarcidas = porPessoa.reduce((acc, p) => acc + p.ressarcidas, 0);
  return {
    porPessoa,
    trabalhadas,
    ressarcidas,
    pendentes: aReceberHoras + aDevolverHoras,
    aReceberHoras,
    aDevolverHoras,
    saldo: aReceberHoras - aDevolverHoras,
  };
}

export function filterByMonth(registros: RegistroPonto[], mesRef: string): RegistroPonto[] {
  return registros.filter((r) => String(r.data || '').startsWith(mesRef));
}

export function filterByPeriod(registros: RegistroPonto[], de?: string, ate?: string): RegistroPonto[] {
  return registros.filter((r) => (!de || r.data >= de) && (!ate || r.data <= ate));
}

export function monthlyHistory12(
  registros: RegistroPonto[],
  locais: LocalTrabalho[],
  config: Partial<AppConfig>,
  mesRef: string,
  count = 12,
) {
  const out: Array<{mes: string; label: string; horas: number; valor: number}> = [];
  const [y, m] = mesRef.split('-').map(Number);
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    const ref = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    const sum = summarizeRegistros(filterByMonth(registros, ref), locais, config);
    out.push({
      mes: ref,
      label: `${pad2(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`,
      horas: Number(sum.horas.toFixed(2)),
      valor: Number(sum.valor.toFixed(2)),
    });
  }
  return out;
}

export function breakdownByLocal(
  registros: RegistroPonto[],
  locais: LocalTrabalho[],
  pagamentos: Pagamento[],
  config: Partial<AppConfig>,
  mesRef?: string,
) {
  const list = mesRef ? filterByMonth(registros, mesRef) : registros;
  return summarizeByLocal(list, locais, pagamentos, config)
    .filter((item) => item.valor > 0)
    .map((item) => ({
      nome: item.local.nome,
      cor: item.local.cor,
      horas: Number(item.horas.toFixed(2)),
      valor: Number(item.valor.toFixed(2)),
    }));
}

export function detectOverlap(
  registros: RegistroPonto[],
  candidate: Partial<RegistroPonto>,
): RegistroPonto | null {
  const start = timeToMinutes(candidate.entrada);
  const end = timeToMinutes(candidate.saida);
  if (start === null || end === null) return null;

  for (const r of registros) {
    if (r.id === candidate.id || r.data !== candidate.data || r.localId !== candidate.localId) continue;
    const rs = timeToMinutes(r.entrada);
    const re = timeToMinutes(r.saida);
    if (rs === null || re === null) continue;
    const inRange = (x: number, a: number, b: number) => (a <= b ? x >= a && x < b : x >= a || x < b);
    if (inRange(start, rs, re) || inRange(end - 1, rs, re)) return r;
  }
  return null;
}

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

export function findNearestLocal(
  locais: LocalTrabalho[],
  coords: {lat: number; lng: number} | null,
): {local: LocalTrabalho; distancia: number; foraDoRaio?: boolean} | null {
  if (!coords) return null;
  let best: {local: LocalTrabalho; distancia: number} | null = null;
  for (const l of locais) {
    if (l.lat == null || l.lng == null) continue;
    const d = haversineMeters(coords.lat, coords.lng, l.lat, l.lng);
    if (!best || d < best.distancia) {
      best = {local: l, distancia: d};
    }
  }
  if (!best) return null;
  const raio = Number(best.local.raio) || 300;
  return best.distancia <= raio ? best : {...best, foraDoRaio: true};
}
