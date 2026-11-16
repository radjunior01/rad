import {jsPDF} from 'jspdf';
import {AppConfig, LocalTrabalho, Pagamento, RegistroPonto, ResumoHoras} from '../types';
import {calcRegistro, findLocal, isTrocaLocal} from './calc';
import {
  DIAS_SEMANA_CURTO,
  formatCurrencyBRL,
  formatDateBR,
  formatHours,
  formatMonthYear,
} from './format';

const MARGIN_X = 14;

function drawHeader(doc: jsPDF, title: string, subtitle: string) {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, width, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('rad TunoPay', MARGIN_X, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(subtitle || '', MARGIN_X, 18);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(title, width - MARGIN_X, 12, {align: 'right'});
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(new Date().toLocaleString('pt-BR'), width - MARGIN_X, 18, {align: 'right'});
  doc.setTextColor(15, 23, 42);
  doc.setFillColor(255, 255, 255);
}

function drawFooter(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120, 130, 150);
    doc.text(`Página ${i} de ${pages}`, width - MARGIN_X, height - 8, {align: 'right'});
    doc.text('Gerado por rad TunoPay', MARGIN_X, height - 8);
  }
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  const height = doc.internal.pageSize.getHeight();
  if (y > height - needed) {
    doc.addPage();
    return 30;
  }
  return y;
}

interface TableCol {
  label: string;
  w: number;
  align?: 'left' | 'right' | 'center';
}

function drawTable(
  doc: jsPDF,
  startY: number,
  cols: TableCol[],
  rows: string[][],
  opts: {titulo?: string; rodape?: number} = {},
): number {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const sumW = cols.reduce((acc, c) => acc + c.w, 0);
  const scale = (width - MARGIN_X * 2) / sumW;
  const footerPad = opts.rodape ?? 26;
  let y = startY;

  if (opts.titulo) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(String(opts.titulo), MARGIN_X, y);
    doc.setFont('helvetica', 'normal');
    y += 6;
  }

  const drawHead = (hy: number) => {
    doc.setFillColor(241, 245, 249);
    doc.rect(MARGIN_X, hy - 5, width - MARGIN_X * 2, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(70, 85, 110);
    let x = MARGIN_X + 1;
    for (const c of cols) {
      const cw = c.w * scale;
      doc.text(String(c.label), c.align === 'right' ? x + cw - 2 : x + 1, hy, {
        align: c.align === 'right' ? 'right' : 'left',
      });
      x += cw;
    }
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'normal');
    return hy + 8;
  };

  y = drawHead(y);
  doc.setFontSize(8.5);
  rows.forEach((row, idx) => {
    if (y > height - footerPad) {
      doc.addPage();
      y = drawHead(30);
    }
    if (idx % 2 === 1) {
      doc.setFillColor(249, 250, 252);
      doc.rect(MARGIN_X, y - 4.5, width - MARGIN_X * 2, 7, 'F');
    }
    let x = MARGIN_X + 1;
    cols.forEach((c, ci) => {
      const cw = c.w * scale;
      const cell = row[ci] ?? '';
      doc.text(String(cell), c.align === 'right' ? x + cw - 2 : x + 1, y, {
        align: c.align === 'right' ? 'right' : 'left',
        maxWidth: cw - 3,
      });
      x += cw;
    });
    y += 7;
  });

  doc.setDrawColor(226, 232, 240);
  doc.line(MARGIN_X, y - 3, width - MARGIN_X, y - 3);
  return y + 4;
}

function drawSummaryBox(
  doc: jsPDF,
  startY: number,
  lines: Array<[string, string, boolean?]>,
): number {
  const width = doc.internal.pageSize.getWidth();
  const boxH = 12 + lines.length * 6;
  const y = ensureSpace(doc, startY, boxH + 20);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(MARGIN_X, y - 4, width - MARGIN_X * 2, boxH, 3, 3, 'F');
  doc.setFontSize(9.5);
  let cy = y + 4;
  for (const [label, val, bold] of lines) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(90, 100, 120);
    doc.text(label, MARGIN_X + 4, cy);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(bold ? 30 : 15, bold ? 41 : 23, bold ? 59 : 42);
    doc.text(String(val), width - MARGIN_X - 4, cy, {align: 'right'});
    cy += 6;
  }
  doc.setTextColor(15, 23, 42);
  return y + boxH + 8;
}

export function buildMonthlyFinancialPDF(params: {
  config: Partial<AppConfig>;
  mesRef: string;
  registros: RegistroPonto[];
  locais: LocalTrabalho[];
  resumo: ResumoHoras;
  pagamentos: Pagamento[];
  nota?: string;
}): jsPDF {
  const {config, mesRef, registros, locais, resumo, pagamentos, nota} = params;
  const doc = new jsPDF({unit: 'mm', format: 'a4'});
  const [ano, mes] = mesRef.split('-').map(Number);

  drawHeader(
    doc,
    `Relatório · ${formatMonthYear(ano, mes - 1)}`,
    config?.nome ? `Colaborador: ${config.nome}` : 'Relatório de horas trabalhadas',
  );

  let y = 36;
  const sorted = [...registros]
    .filter((r) => !r.agendado && !isTrocaLocal(findLocal(r, locais)) && r.troca_plantao !== 'compensado')
    .sort((a, b) => a.data.localeCompare(b.data));
  if (nota) {
    doc.setFontSize(8);
    doc.setTextColor(120, 130, 150);
    doc.text(String(nota), MARGIN_X, y - 4);
    doc.setTextColor(15, 23, 42);
  }

  y = drawTable(
    doc,
    y,
    [
      {label: 'Data', w: 21},
      {label: 'Local', w: 38},
      {label: 'Entrada', w: 14},
      {label: 'Saída', w: 14},
      {label: 'Pausa', w: 12, align: 'right'},
      {label: 'Horas', w: 13, align: 'right'},
      {label: 'Normais', w: 14, align: 'right'},
      {label: 'Extras', w: 13, align: 'right'},
      {label: 'Fer.', w: 9, align: 'center'},
      {label: 'Valor', w: 20, align: 'right'},
    ],
    sorted.map((r) => {
      const loc = findLocal(r, locais);
      const calc = calcRegistro(r, loc, config);
      return [
        formatDateBR(r.data),
        loc?.nome || '—',
        r.entrada || '—',
        r.saida || 'aberto',
        r.pausa_min ? `${r.pausa_min}m` : '—',
        formatHours(calc.horas),
        formatHours(calc.normais),
        formatHours(calc.extras),
        r.feriado ? 'sim' : '—',
        formatCurrencyBRL(calc.valor),
      ];
    }),
  );

  const pagoMes = (pagamentos || [])
    .filter((p) => String(p.data || '').startsWith(mesRef))
    .reduce((acc, p) => acc + (Number(p.valor) || 0), 0);

  drawSummaryBox(doc, y + 2, [
    ['Total de horas', formatHours(resumo.horas)],
    ['Horas normais', formatHours(resumo.normais)],
    ['Horas extras', formatHours(resumo.extras)],
    ['Valor total do mês', formatCurrencyBRL(resumo.valor), true],
    ['Pago no mês', formatCurrencyBRL(pagoMes)],
    ['Saldo do mês', formatCurrencyBRL(resumo.valor - pagoMes), true],
  ]);

  drawFooter(doc);
  return doc;
}

export function buildReceiptPDF(params: {
  config: Partial<AppConfig>;
  local: LocalTrabalho;
  registros: RegistroPonto[];
  de: string;
  ate: string;
  pago: number;
  total: number;
}): jsPDF {
  const {config, local, registros, de, ate, pago, total} = params;
  const doc = new jsPDF({unit: 'mm', format: 'a4'});

  drawHeader(
    doc,
    'Recibo de pagamento',
    config?.nome ? `Colaborador: ${config.nome}` : 'Recibo de horas',
  );

  let y = 36;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(local?.nome || 'Local', MARGIN_X, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90, 100, 120);
  doc.text(`Período: ${formatDateBR(de)} a ${formatDateBR(ate)}`, MARGIN_X, y + 5);

  const extraMeta: string[] = [];
  if (config?.documento?.trim()) extraMeta.push(`CPF/CNPJ: ${config.documento.trim()}`);
  if (config?.registroProfissional?.trim()) extraMeta.push(`Reg.: ${config.registroProfissional.trim()}`);
  if (config?.chavePix?.trim()) extraMeta.push(`Pix: ${config.chavePix.trim()}`);
  if (extraMeta.length) {
    doc.text(extraMeta.join(' · '), MARGIN_X, y + 10, {
      maxWidth: doc.internal.pageSize.getWidth() - MARGIN_X * 2,
    });
    y += 17;
  } else {
    y += 12;
  }
  doc.setTextColor(15, 23, 42);

  const sorted = [...registros]
    .filter(() => !isTrocaLocal(local))
    .filter((r) => !r.agendado && r.troca_plantao !== 'compensado')
    .sort((a, b) => a.data.localeCompare(b.data));
  y = drawTable(
    doc,
    y,
    [
      {label: 'Data', w: 21},
      {label: 'Horário', w: 30},
      {label: 'Horas', w: 16, align: 'right'},
      {label: 'Normais', w: 18, align: 'right'},
      {label: 'Extras', w: 16, align: 'right'},
      {label: 'Fer.', w: 12, align: 'center'},
      {label: 'R$ hora', w: 20, align: 'right'},
      {label: 'Valor', w: 22, align: 'right'},
    ],
    sorted.map((r) => {
      const calc = calcRegistro(r, local, config);
      return [
        formatDateBR(r.data),
        `${r.entrada}–${r.saida || 'aberto'}`,
        formatHours(calc.horas),
        formatHours(calc.normais),
        formatHours(calc.extras),
        r.feriado ? 'sim' : '—',
        formatCurrencyBRL(calc.valorHora),
        formatCurrencyBRL(calc.valor),
      ];
    }),
  );

  const totalHoras = sorted.reduce((acc, r) => acc + calcRegistro(r, local, config).horas, 0);
  y = drawSummaryBox(doc, y + 2, [
    ['Total de horas', formatHours(totalHoras)],
    ['Valor bruto no período', formatCurrencyBRL(total), true],
    ['Já pago', formatCurrencyBRL(pago)],
    ['Saldo a receber', formatCurrencyBRL(total - pago), true],
  ]);

  y = ensureSpace(doc, y + 4, 48);
  doc.setFontSize(9);
  doc.setTextColor(90, 100, 120);
  const docSuffix = config?.documento?.trim() ? ` (CPF/CNPJ ${config.documento.trim()})` : '';
  const decl = `Declaro${docSuffix} ter recebido de ${local?.nome || '—'} a quantia de ${formatCurrencyBRL(Math.min(pago, total) || total)} referente às horas trabalhadas no período de ${formatDateBR(de)} a ${formatDateBR(ate)}.`;
  doc.text(doc.splitTextToSize(decl, doc.internal.pageSize.getWidth() - MARGIN_X * 2), MARGIN_X, y);
  y += 28;

  if (config?.assinatura) {
    try {
      doc.addImage(config.assinatura, 'PNG', MARGIN_X + 6, y - 16, 52, 15);
    } catch {
      // ignore invalid image
    }
  }

  doc.setDrawColor(180, 190, 205);
  doc.line(MARGIN_X, y, MARGIN_X + 70, y);
  doc.line(
    doc.internal.pageSize.getWidth() - MARGIN_X - 70,
    y,
    doc.internal.pageSize.getWidth() - MARGIN_X,
    y,
  );
  doc.setFontSize(8);
  doc.text(config?.nome || 'Colaborador', MARGIN_X, y + 4);
  doc.text(local?.nome || 'Empregador', doc.internal.pageSize.getWidth() - MARGIN_X, y + 4, {
    align: 'right',
  });

  drawFooter(doc);
  return doc;
}

export function buildHoursOnlyPDF(params: {
  config: Partial<AppConfig>;
  registros: RegistroPonto[];
  locais: LocalTrabalho[];
  selecionados: string[];
  de?: string;
  ate?: string;
  incluirObs?: boolean;
}): jsPDF {
  const {config, registros = [], locais = [], selecionados = [], de, ate, incluirObs = true} = params;
  const doc = new jsPDF({unit: 'mm', format: 'a4'});
  const regularLocais = locais.filter((l) => !isTrocaLocal(l));
  const ids = (selecionados.length ? selecionados : regularLocais.map((l) => l.id)).filter((id) =>
    regularLocais.some((l) => l.id === id),
  );
  const names = regularLocais.filter((l) => ids.includes(l.id)).map((l) => l.nome);

  const rows = registros
    .filter((r) => ids.includes(r.localId))
    .filter((r) => !r.agendado && r.troca_plantao !== 'compensado')
    .filter((r) => (!de || r.data >= de) && (!ate || r.data <= ate))
    .sort((a, b) => a.data.localeCompare(b.data) || String(a.entrada).localeCompare(String(b.entrada)))
    .map((r) => {
      const loc = findLocal(r, regularLocais);
      const calc = calcRegistro(r, loc, {...config, extraPercent: 0});
      const dt = new Date(`${r.data}T12:00:00`);
      return {
        data: formatDateBR(r.data),
        dia: DIAS_SEMANA_CURTO[dt.getDay()] || '',
        local: loc?.nome || '—',
        entrada: r.entrada || '—',
        saida: r.saida || 'em aberto',
        pausa: r.pausa_min ? `${r.pausa_min}m` : '—',
        horas: formatHours(calc.horas),
        extras: calc.extras > 0 ? formatHours(calc.extras) : '—',
        feriado: r.feriado ? 'sim' : '—',
        obs: incluirObs ? r.obs || '' : '',
        _horas: calc.horas,
        _extras: calc.extras,
        _localId: r.localId,
      };
    });

  const totalHoras = rows.reduce((acc, r) => acc + r._horas, 0);
  const totalExtras = rows.reduce((acc, r) => acc + r._extras, 0);

  drawHeader(
    doc,
    'Relatório de horas',
    config?.nome ? `Colaborador: ${config.nome}` : 'Espelho de ponto',
  );

  let y = 38;
  doc.setFontSize(8.5);
  doc.setTextColor(70, 85, 110);
  doc.text(`Período: ${de ? formatDateBR(de) : '—'} a ${ate ? formatDateBR(ate) : '—'}`, MARGIN_X, y);
  doc.text(
    `Total: ${formatHours(totalHoras)} · ${rows.length} ${rows.length === 1 ? 'registro' : 'registros'}`,
    doc.internal.pageSize.getWidth() - MARGIN_X,
    y,
    {align: 'right'},
  );
  y += 5;

  const locaisLabel =
    names.length > 3 ? `${names.slice(0, 3).join(', ')} e mais ${names.length - 3}` : names.join(', ') || '—';
  doc.text(`Locais: ${locaisLabel}`, MARGIN_X, y, {
    maxWidth: doc.internal.pageSize.getWidth() - MARGIN_X * 2,
  });
  doc.setTextColor(15, 23, 42);
  y += 10;

  const cols: TableCol[] = [
    {label: 'Data', w: 19},
    {label: 'Dia', w: 11},
    {label: 'Local', w: 33},
    {label: 'Entrada', w: 13},
    {label: 'Saída', w: 13},
    {label: 'Pausa', w: 11, align: 'right'},
    {label: 'Horas', w: 13, align: 'right'},
    {label: 'Extras', w: 13, align: 'right'},
    {label: 'Fer.', w: 9, align: 'center'},
  ];
  if (incluirObs) cols.push({label: 'Observação', w: 34});

  y = drawTable(
    doc,
    y,
    cols,
    rows.map((r) => {
      const row = [r.data, r.dia, r.local, r.entrada, r.saida, r.pausa, r.horas, r.extras, r.feriado];
      if (incluirObs) row.push(r.obs);
      return row;
    }),
  );

  const byLocal = regularLocais
    .filter((l) => ids.includes(l.id))
    .map((l) => {
      const sub = rows.filter((r) => r._localId === l.id);
      return {
        nome: l.nome,
        qtd: sub.length,
        horas: sub.reduce((acc, r) => acc + r._horas, 0),
        extras: sub.reduce((acc, r) => acc + r._extras, 0),
      };
    })
    .filter((l) => l.qtd > 0);

  y = ensureSpace(doc, y + 4, 60);
  drawTable(
    doc,
    y,
    [
      {label: 'Local', w: 60},
      {label: 'Registros', w: 22, align: 'right'},
      {label: 'Horas', w: 26, align: 'right'},
      {label: 'Extras', w: 26, align: 'right'},
    ],
    [
      ...byLocal.map((l) => [
        l.nome,
        String(l.qtd),
        formatHours(l.horas),
        l.extras > 0 ? formatHours(l.extras) : '—',
      ]),
      ['Total', String(rows.length), formatHours(totalHoras), totalExtras > 0 ? formatHours(totalExtras) : '—'],
    ],
    {titulo: 'Total de horas por local'},
  );

  drawFooter(doc);
  return doc;
}

export async function shareOrSavePDF(
  doc: jsPDF,
  filename: string,
  title?: string,
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  try {
    const blob = doc.output('blob');
    const file = new File([blob], filename, {type: 'application/pdf'});
    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
    };
    if (nav.share && (!nav.canShare || nav.canShare({files: [file]}))) {
      await nav.share({
        files: [file],
        title: title || filename,
        text: title || 'Documento gerado pelo rad TunoPay',
      });
      return 'shared';
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return 'cancelled';
    }
  }
  doc.save(filename);
  return 'downloaded';
}
