export const MESES_PT = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export const DIAS_SEMANA_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export const pad2 = (n: number | string) => String(n).padStart(2, '0');

export function hojeISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function agoraHHMM(d: Date = new Date()): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

export function formatDateBR(iso?: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function formatCurrencyBRL(v: number | string | undefined | null): string {
  return (Number(v) || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function formatHours(h: number | string | undefined | null): string {
  const mins = Math.round((Number(h) || 0) * 60);
  const sign = mins < 0 ? '-' : '';
  const abs = Math.abs(mins);
  const hh = Math.floor(abs / 60);
  const mm = abs % 60;
  return mm === 0 ? `${sign}${hh}h` : `${sign}${hh}h${pad2(mm)}`;
}

export function formatMMSS(totalMinutes: number): string {
  const m = Math.max(0, Math.round(Number(totalMinutes) || 0));
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

export function formatMonthYear(year: number, monthIndex0: number): string {
  return `${MESES_PT[monthIndex0]} de ${year}`;
}

export function formatMesRefLabel(mesRef: string): string {
  const [y, m] = mesRef.split('-').map(Number);
  return `${MESES_PT[(m || 1) - 1]}/${y}`;
}

export function formatMesRefNome(mesRef: string): string {
  const [y, m] = mesRef.split('-').map(Number);
  return `${MESES_PT[(m || 1) - 1]} de ${y}`;
}

export function mesAtualRef(): string {
  return hojeISO().slice(0, 7);
}

export function addMonths(mesRef: string, delta: number): string {
  const [y, m] = mesRef.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function monthStart(mesRef: string): string {
  return `${mesRef}-01`;
}

export function monthEnd(mesRef: string): string {
  const [y, m] = mesRef.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${mesRef}-${pad2(lastDay)}`;
}

export function isWeekend(isoDate: string): boolean {
  const day = parseISODate(isoDate).getDay();
  return day === 0 || day === 6;
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '—';
  if (meters >= 1000) return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
  return `${Math.round(meters)} m`;
}

export function normalizeText(text: string): string {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
