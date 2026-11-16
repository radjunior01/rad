import {AppConfig, LocalTrabalho, RegistroPonto} from '../types';
import {calcRegistro, findLocal, isTrocaLocal} from './calc';
import {DIAS_SEMANA_CURTO, formatDateBR} from './format';

function csvCell(val: string | number): string {
  const s = String(val ?? '').replace(/\r?\n/g, ' ');
  if (/[;"\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildRecordsCSV(params: {
  registros: RegistroPonto[];
  locais: LocalTrabalho[];
  config: Partial<AppConfig>;
}): string {
  const {registros, locais, config} = params;
  const header = [
    'Data',
    'Dia',
    'Local',
    'Tipo',
    'Entrada',
    'Saída',
    'Pausa (min)',
    'Horas',
    'Normais',
    'Extras',
    'Feriado',
    'Valor/hora (R$)',
    'Valor total (R$)',
    'Observação',
  ];

  const rows = [...registros]
    .filter((r) => !r.agendado && !isTrocaLocal(findLocal(r, locais)) && r.troca_plantao !== 'compensado')
    .sort((a, b) => a.data.localeCompare(b.data) || String(a.entrada).localeCompare(String(b.entrada)))
    .map((r) => {
      const loc = findLocal(r, locais);
      const calc = calcRegistro(r, loc, config);
      const dt = new Date(`${r.data}T12:00:00`);
      const num = (n: number) => n.toFixed(2).replace('.', ',');
      return [
        formatDateBR(r.data),
        DIAS_SEMANA_CURTO[dt.getDay()] || '',
        loc?.nome || 'Local removido',
        loc?.tipo || '',
        r.entrada || '',
        r.saida || 'aberto',
        r.pausa_min || 0,
        num(calc.horas),
        num(calc.normais),
        num(calc.extras),
        r.feriado ? 'Sim' : 'Não',
        num(calc.valorHora),
        num(calc.valor),
        r.obs || '',
      ];
    });

  const lines = [header, ...rows].map((cols) => cols.map(csvCell).join(';')).join('\r\n');
  return `\uFEFF${lines}`;
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
