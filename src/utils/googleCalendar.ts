import {AppConfig, LocalTrabalho, RegistroPonto} from '../types';
import {calcRegistro, findLocal} from './calc';
import {formatCurrencyBRL, formatHours} from './format';

function addDaysISO(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function addMinutesToHHMM(hhmm: string, minutesToAdd: number): {hhmm: string; dayOffset: number} {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (Number.isFinite(h) ? h : 8) * 60 + (Number.isFinite(m) ? m : 0) + minutesToAdd;
  const dayOffset = Math.floor(total / 1440);
  const mod = ((total % 1440) + 1440) % 1440;
  const nh = String(Math.floor(mod / 60)).padStart(2, '0');
  const nm = String(mod % 60).padStart(2, '0');
  return {hhmm: `${nh}:${nm}`, dayOffset};
}

function getShiftRange(reg: Partial<RegistroPonto>): {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
} {
  const startDate = reg.data || new Date().toISOString().slice(0, 10);
  const startTime = reg.entrada || '08:00';
  let endDate = startDate;
  let endTime = reg.saida || '';

  if (!endTime) {
    const plus1h = addMinutesToHHMM(startTime, 60);
    endTime = plus1h.hhmm;
    if (plus1h.dayOffset > 0) {
      endDate = addDaysISO(startDate, plus1h.dayOffset);
    }
  } else if (endTime <= startTime) {
    endDate = addDaysISO(startDate, 1);
  }

  return {startDate, startTime, endDate, endTime};
}

function buildDescription(
  reg: Partial<RegistroPonto>,
  local: LocalTrabalho | null,
  config: AppConfig,
): string {
  const {startTime, endTime} = getShiftRange(reg);
  const calc = calcRegistro(reg, local, config);
  const lines: string[] = [
    `Local: ${local?.nome || 'Local não informado'}`,
    `Horário: ${startTime} às ${reg.saida || endTime}`,
  ];
  if (calc.horas > 0) lines.push(`Duração prevista: ${formatHours(calc.horas)}`);
  if ((reg.pausa_min || 0) > 0) lines.push(`Pausa: ${reg.pausa_min} min`);
  if (reg.feriado) lines.push('Feriado: Sim');
  if (calc.valor > 0) lines.push(`Previsão: ${formatCurrencyBRL(calc.valor)}`);
  if (reg.obs) lines.push(`Observações: ${reg.obs}`);
  lines.push('', 'Adicionado via rad TunoPay');
  return lines.join('\n');
}

function toCompactLocalStamp(isoDate: string, hhmm: string): string {
  return `${isoDate.replace(/-/g, '')}T${hhmm.replace(':', '')}00`;
}

function toUTCStamp(isoDate: string, hhmm: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0);
  return dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeICS(value: string): string {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function foldICSLine(line: string): string {
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > 73) {
    chunks.push(rest.slice(0, 73));
    rest = ` ${rest.slice(73)}`;
  }
  chunks.push(rest);
  return chunks.join('\r\n');
}

/**
 * Link gratuito que abre o Google Calendar já preenchido com o plantão (sem API nem plano pago).
 */
export function buildGoogleCalendarUrl(
  reg: Partial<RegistroPonto>,
  local: LocalTrabalho | null,
  config: AppConfig,
): string {
  const {startDate, startTime, endDate, endTime} = getShiftRange(reg);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `[Plantão] ${local?.nome || 'Turno agendado'}`,
    dates: `${toCompactLocalStamp(startDate, startTime)}/${toCompactLocalStamp(endDate, endTime)}`,
    ctz: tz,
    details: buildDescription(reg, local, config),
  });
  if (local?.nome) {
    params.set('location', local.nome);
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Gera arquivo .ics (RFC 5545) gratuito compatível com Google Agenda, iOS, Android e Outlook.
 */
export function buildCalendarICS(
  registros: RegistroPonto[],
  locais: LocalTrabalho[],
  config: AppConfig,
): string {
  const nowUtc = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//rad TunoPay//Plantoes Agendados//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Plantões Agendados - rad TunoPay',
  ];

  for (const reg of registros) {
    if (!reg.data || !reg.entrada) continue;
    const local = findLocal(reg, locais);
    const {startDate, startTime, endDate, endTime} = getShiftRange(reg);
    const summary = `[Plantão] ${local?.nome || 'Turno agendado'}`;
    const desc = buildDescription(reg, local, config);

    lines.push(
      'BEGIN:VEVENT',
      foldICSLine(`UID:${reg.id}@radtunopay`),
      `DTSTAMP:${nowUtc}`,
      `DTSTART:${toUTCStamp(startDate, startTime)}`,
      `DTEND:${toUTCStamp(endDate, endTime)}`,
      foldICSLine(`SUMMARY:${escapeICS(summary)}`),
      foldICSLine(`DESCRIPTION:${escapeICS(desc)}`),
      ...(local?.nome ? [foldICSLine(`LOCATION:${escapeICS(local.nome)}`)] : []),
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Lembrete de plantão',
      'TRIGGER:-PT60M',
      'END:VALARM',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

export function downloadICS(icsContent: string, filename: string): void {
  const blob = new Blob([icsContent], {type: 'text/calendar;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
