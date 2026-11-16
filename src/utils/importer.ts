import {LocalTrabalho, Pagamento, RegistroPonto, TrocaPlantao} from '../types';
import {genId} from './calc';
import {hojeISO} from './format';

const normKey = (k: unknown) =>
  String(k || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const ALIASES = {
  locais: [
    'locais',
    'local',
    'localdetrabalho',
    'locaisdetrabalho',
    'locais_trabalho',
    'workspaces',
    'lugares',
    'empregos',
    'empresas',
    'places',
    'clients',
    'clientes',
    'sites',
  ],
  registros: [
    'registros',
    'registro',
    'pontos',
    'ponto',
    'batidas',
    'batida',
    'horas',
    'horastrabalhadas',
    'entries',
    'records',
    'shifts',
    'turnos',
    'plantoes',
    'timelogs',
    'timeclock',
    'logs',
    'dias',
    'jornadas',
  ],
  pagamentos: [
    'pagamentos',
    'pagamento',
    'recebimentos',
    'recebimento',
    'payments',
    'paids',
    'pagos',
    'recibos',
    'repasses',
  ],
  trocas: ['trocas', 'troca', 'trocasplantao', 'trocadeplantao', 'swaps', 'shiftswaps'],
};

function stripJSWrapper(raw: string): string {
  let s = String(raw).replace(/^\uFEFF/, '').trim();
  const dataUrl = s.match(/^data:application\/(?:json|octet-stream);base64,(.+)$/s);
  if (dataUrl) {
    try {
      return atob(dataUrl[1].replace(/\s/g, ''));
    } catch {
      return s;
    }
  }
  s = s.replace(
    /^\s*(?:export\s+default|module\.exports\s*=|window\.[\w$.]+\s*=|(?:const|let|var)\s+\w+\s*=)\s*/,
    '',
  );
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
  s = s.replace(/[;,]\s*$/, '').trim();
  return s;
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function tryRelaxedJson(text: string): unknown {
  let s = String(text);
  s = s.replace(/,\s*([}\]])/g, '$1');
  s = s.replace(/([{,[]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":');
  s = s.replace(/'((?:[^'\\]|\\.)*)'/g, (_, inner) =>
    JSON.stringify(inner.replace(/\\'/g, "'").replace(/\\\\/g, '\\')),
  );
  s = s.replace(/\bundefined\b/g, 'null').replace(/\bNaN\b/g, 'null');
  return tryJson(s);
}

function extractRawData(raw: string): {ok: true; dados: unknown} | {ok: false; motivo: string} {
  const trimmed = String(raw || '').replace(/^\uFEFF/, '').trim();
  if (!trimmed) return {ok: false, motivo: 'O arquivo está vazio.'};

  for (const candidate of [trimmed, stripJSWrapper(trimmed)]) {
    const parsed = tryJson(candidate) || tryRelaxedJson(candidate);
    if (parsed) return {ok: true, dados: parsed};
  }
  for (const candidate of [trimmed, stripJSWrapper(trimmed)]) {
    const start = candidate.search(/[[{]/);
    if (start < 0) continue;
    const closeChar = candidate[start] === '{' ? '}' : ']';
    const end = candidate.lastIndexOf(closeChar);
    if (end > start) {
      const slice = candidate.slice(start, end + 1);
      const parsed = tryJson(slice) || tryRelaxedJson(slice);
      if (parsed) return {ok: true, dados: parsed};
    }
  }
  return {
    ok: false,
    motivo: 'Não encontrei JSON válido no arquivo (talvez esteja truncado ou em outro formato).',
  };
}

function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  const map: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) map[normKey(k)] = obj[k];
  for (const k of keys) {
    const val = map[normKey(k)];
    if (val != null && val !== '') return val;
  }
  return undefined;
}

function parseNumber(val: unknown): number | undefined {
  if (val == null || val === '') return undefined;
  if (typeof val === 'number') return Number.isFinite(val) ? val : undefined;
  const s = String(val)
    .replace(/\s/g, '')
    .replace(/r\$/i, '')
    .replace(/\.(?=\d{3}\b)/g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function parseDateISO(val: unknown): string | undefined {
  if (val == null || val === '') return undefined;
  if (typeof val === 'number') {
    const d = new Date(val < 1e12 ? val * 1000 : val);
    return Number.isNaN(d.getTime()) ? undefined : hojeISO(d);
  }
  const s = String(val).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    const isDMY = a > 12 || b <= 12;
    const day = isDMY ? a : b;
    const month = isDMY ? b : a;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : hojeISO(d);
}

function parseTimeHHMM(val: unknown): string | undefined {
  if (val == null || val === '') return undefined;
  if (typeof val === 'number') {
    const mins = val <= 24 ? Math.round(val * 60) : Math.round(val);
    const hh = Math.floor((mins % 1440) / 60);
    const mm = mins % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  const s = String(val).trim();
  const m = s.match(/(\d{1,2})\s*[:hH]\s*(\d{2})?/);
  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2] || 0);
    if (hh <= 24 && mm < 60) {
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime()) && /\d{4}-\d{2}-\d{2}T/.test(s)) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return undefined;
}

const parseBool = (val: unknown) =>
  val === true || val === 1 || /^(sim|true|1|s|yes)$/i.test(String(val ?? '').trim());

function asStr(val: unknown): string {
  return val == null || typeof val === 'object' ? '' : String(val).trim();
}

interface CollectionInfo {
  chave: string;
  caminho: string;
  itens: unknown[];
  chaves: string[];
  pontos?: number;
}

function collectArrays(obj: unknown, depth = 0, path = ''): CollectionInfo[] {
  const out: CollectionInfo[] = [];
  if (!obj || typeof obj !== 'object' || depth > 4) return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const nextPath = path ? `${path}.${k}` : k;
    if (Array.isArray(v)) {
      const sample = v.find((item) => item && typeof item === 'object') as
        | Record<string, unknown>
        | undefined;
      out.push({
        chave: k,
        caminho: nextPath,
        itens: v,
        chaves: sample ? Object.keys(sample) : [],
      });
    } else if (v && typeof v === 'object') {
      out.push(...collectArrays(v, depth + 1, nextPath));
    }
  }
  return out;
}

function scoreLocais(col: CollectionInfo): number {
  if (!col.chaves.length) return 0;
  const keys = col.chaves.map(normKey);
  let score = 0;
  if (keys.some((k) => ['nome', 'name', 'titulo', 'title', 'local', 'descricao'].includes(k))) score += 3;
  if (keys.some((k) => ['valorhora', 'valor_hora', 'valor', 'salario', 'precohora', 'hourlyrate', 'rate', 'pagamento'].includes(k))) score += 3;
  if (keys.some((k) => ['limitenormal', 'limite', 'horasdia', 'cargahoraria'].includes(k))) score += 1;
  if (ALIASES.locais.includes(normKey(col.chave))) score += 3;
  return score;
}

function scoreRegistros(col: CollectionInfo): number {
  if (!col.chaves.length) return 0;
  const keys = col.chaves.map(normKey);
  let score = 0;
  if (keys.some((k) => ['data', 'date', 'dia', 'day', 'datainicio'].includes(k))) score += 3;
  if (keys.some((k) => ['entrada', 'entradahora', 'checkin', 'inicio', 'start', 'horaentrada', 'entradatime'].includes(k))) score += 3;
  if (keys.some((k) => ['saida', 'saidahora', 'checkout', 'fim', 'end', 'horasaida', 'saidaatime'].includes(k))) score += 2;
  if (keys.some((k) => ['horas', 'duracao', 'totalhoras', 'minutos'].includes(k))) score += 2;
  if (ALIASES.registros.includes(normKey(col.chave))) score += 3;
  return score;
}

function scorePagamentos(col: CollectionInfo): number {
  if (!col.chaves.length) return 0;
  const keys = col.chaves.map(normKey);
  let score = 0;
  if (ALIASES.pagamentos.includes(normKey(col.chave))) score += 4;
  if (keys.some((k) => ['valor', 'montante', 'amount', 'total'].includes(k))) score += 1;
  if (keys.some((k) => ['localid', 'local', 'data', 'datapagamento', 'periodo'].includes(k))) score += 1;
  return score;
}

function scoreTrocas(col: CollectionInfo): number {
  if (!col.chaves.length) return 0;
  const keys = col.chaves.map(normKey);
  let score = 0;
  if (ALIASES.trocas.includes(normKey(col.chave))) score += 4;
  if (keys.some((k) => ['paraquem', 'horastrabalhadas', 'horasressarcidas'].includes(k))) score += 3;
  if (keys.some((k) => ['datatrabalho', 'dataressarcimento'].includes(k))) score += 2;
  return score;
}

function normalizeLocal(raw: Record<string, unknown>, idx: number): LocalTrabalho {
  const lat = parseNumber(pick(raw, 'lat', 'latitude'));
  const lng = parseNumber(pick(raw, 'lng', 'lon', 'longitude'));
  return {
    id: asStr(pick(raw, 'id', 'uuid', '_id', 'chave', 'key')) || genId(),
    nome: asStr(pick(raw, 'nome', 'name', 'titulo', 'title', 'local', 'descricao', 'label')) || `Local ${idx + 1}`,
    tipo: asStr(pick(raw, 'tipo', 'type', 'categoria')) || 'Fixo',
    valor_hora: parseNumber(pick(raw, 'valor_hora', 'valorHora', 'valor hora', 'valor', 'salario', 'preco_hora', 'hourlyRate', 'rate')) ?? 0,
    limite_normal: parseNumber(pick(raw, 'limite_normal', 'limiteNormal', 'limite', 'horas_dia', 'carga_horaria')) ?? 8,
    fds_percent: parseNumber(pick(raw, 'fds_percent', 'percentual_fim_semana', 'adicional_fds', 'fim_semana')) ?? 0,
    cor: asStr(pick(raw, 'cor', 'color')) || '#4f46e5',
    raio: parseNumber(pick(raw, 'raio', 'radius')) ?? 300,
    lat: lat !== undefined && Number.isFinite(lat) ? lat : null,
    lng: lng !== undefined && Number.isFinite(lng) ? lng : null,
    obs: asStr(pick(raw, 'obs', 'observacao', 'nota', 'anotacao', 'notes', 'comentario')),
  };
}

function normalizeRegistro(
  raw: Record<string, unknown>,
  localIds: Map<string, LocalTrabalho>,
  localByName: Map<string, string>,
): (RegistroPonto & {_duracaoConvertida?: boolean}) | null {
  let data =
    parseDateISO(pick(raw, 'data', 'date', 'dia', 'day', 'data_registro', 'dataregistro', 'createdAt', 'created_at')) ||
    parseDateISO(pick(raw, 'entradaEm', 'entrada_em', 'startedAt', 'started_at', 'inicio', 'saidaEm', 'saida_em', 'finishedAt', 'finished_at', 'fim', 'timestamp'));

  let entrada = parseTimeHHMM(pick(raw, 'entrada', 'entrada_hora', 'hora_entrada', 'checkin', 'check_in', 'inicio', 'start', 'startedAt', 'inicio_expediente'));
  let saida = parseTimeHHMM(pick(raw, 'saida', 'saida_hora', 'hora_saida', 'checkout', 'check_out', 'fim', 'end', 'finishedAt', 'fim_expediente'));

  const entTs = pick(raw, 'entradaEm', 'startedAt', 'inicio_timestamp');
  const saiTs = pick(raw, 'saidaEm', 'finishedAt', 'fim_timestamp');
  if (!entrada && entTs) entrada = parseTimeHHMM(entTs);
  if (!saida && saiTs) saida = parseTimeHHMM(saiTs);

  let convertedDuration = false;
  if (!entrada && !saida) {
    const durH = parseNumber(pick(raw, 'duracaoHoras', 'duracao_horas', 'horas', 'duracao', 'totalHoras', 'total_horas', 'workedHours', 'hours'));
    const durM = parseNumber(pick(raw, 'duracaoMinutos', 'duracao_minutos', 'minutos', 'minutes', 'duracaoMin'));
    const hVal = durH !== undefined ? durH : durM !== undefined ? durM / 60 : undefined;
    if (hVal !== undefined && Number.isFinite(hVal) && hVal > 0) {
      entrada = '00:00';
      saida = parseTimeHHMM(hVal);
      convertedDuration = true;
    }
  }

  let pausaMin = parseNumber(pick(raw, 'pausa_min', 'pausaMin', 'pausa', 'intervalo', 'break_min', 'break')) ?? 0;
  if (pausaMin > 0 && pausaMin <= 3) pausaMin = Math.round(pausaMin * 60);

  const rawLocalId = pick(raw, 'localId', 'local_id', 'localid', 'localID', 'id_local');
  let localId = rawLocalId != null ? String(rawLocalId) : '';
  if (!localId || !localIds.has(localId)) {
    const nome = asStr(pick(raw, 'localNome', 'local_nome', 'local', 'localName', 'workspace', 'empresa', 'nomeLocal'));
    if (nome && localByName.has(normKey(nome))) {
      localId = localByName.get(normKey(nome)) || '';
    }
  }

  const rawTroca = pick(raw, 'troca_plantao', 'trocaPlantao', 'troca', 'shift_swap');
  let troca_plantao: '' | 'compensado' | 'nao_compensado' = '';
  if (rawTroca) {
    const nt = normKey(rawTroca);
    if (nt.includes('compens') && !nt.includes('nao')) troca_plantao = 'compensado';
    else if (nt.includes('nao') || nt.includes('ncompens')) troca_plantao = 'nao_compensado';
  }

  let obs = asStr(pick(raw, 'obs', 'observacao', 'nota', 'anotacao', 'notes', 'comentario', 'descricao'));
  if (convertedDuration) {
    obs = obs ? `${obs} (importado: duração total)` : 'Importado: apenas duração total';
  }

  if (!data) return null;

  return {
    id: asStr(pick(raw, 'id', 'uuid', '_id', 'chave', 'key')) || genId(),
    localId,
    data,
    entrada: entrada || '',
    saida: saida || '',
    pausa_min: pausaMin,
    feriado: parseBool(pick(raw, 'feriado', 'holiday', 'isHoliday')),
    agendado: parseBool(pick(raw, 'agendado', 'scheduled')),
    googleEventId: asStr(pick(raw, 'googleEventId', 'google_event_id')) || undefined,
    googleEventLink: asStr(pick(raw, 'googleEventLink', 'google_event_link')) || undefined,
    troca_plantao,
    valor_hora: parseNumber(pick(raw, 'valor_hora', 'valorHora', 'valor_hora_registro', 'rate', 'hourlyRate')),
    obs,
    _duracaoConvertida: convertedDuration,
  };
}

function normalizePagamento(
  raw: Record<string, unknown>,
  localIds: Map<string, LocalTrabalho>,
  localByName: Map<string, string>,
): Pagamento {
  const rawLocalId = pick(raw, 'localId', 'local_id', 'localid', 'id_local');
  let localId = rawLocalId != null ? String(rawLocalId) : '';
  if (!localId || !localIds.has(localId)) {
    const nome = asStr(pick(raw, 'localNome', 'local_nome', 'local', 'localName', 'workspace', 'empresa', 'cliente', 'client', 'place'));
    if (nome && localByName.has(normKey(nome))) {
      localId = localByName.get(normKey(nome)) || '';
    }
  }
  return {
    id: asStr(pick(raw, 'id', 'uuid', '_id')) || genId(),
    localId,
    valor: parseNumber(pick(raw, 'valor', 'montante', 'amount', 'total', 'valor_pago', 'valorpago')) ?? 0,
    data: parseDateISO(pick(raw, 'data', 'dataPagamento', 'date', 'pagoEm', 'createdAt')) || hojeISO(),
    de: parseDateISO(pick(raw, 'de', 'periodoDe', 'periodo_de', 'inicio', 'from')),
    ate: parseDateISO(pick(raw, 'ate', 'periodoAte', 'periodo_ate', 'fim', 'to')),
    obs: asStr(pick(raw, 'obs', 'observacao', 'nota', 'notes')),
  };
}

function normalizeTroca(raw: Record<string, unknown>): TrocaPlantao | null {
  const paraQuem = asStr(pick(raw, 'paraQuem', 'para_quem', 'pessoa', 'colega', 'nome'));
  const dataTrabalho = parseDateISO(pick(raw, 'dataTrabalho', 'data_trabalho', 'data', 'date'));
  if (!paraQuem && !dataTrabalho) return null;
  const rawDir = asStr(pick(raw, 'direcao', 'direction'));
  const direcao = rawDir === 'cobriu_para_mim' ? 'cobriu_para_mim' : 'eu_trabalhei';
  const rawHist = Array.isArray(raw.historicoRessarcimentos) ? raw.historicoRessarcimentos : [];
  const historicoRessarcimentos = rawHist
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      id: asStr(item.id) || genId(),
      data: parseDateISO(item.data) || hojeISO(),
      horas: parseNumber(item.horas) ?? 0,
      obs: asStr(item.obs) || undefined,
    }))
    .filter((item) => item.horas > 0);

  const horasRes = historicoRessarcimentos.length
    ? historicoRessarcimentos.reduce((acc, item) => acc + item.horas, 0)
    : parseNumber(pick(raw, 'horasRessarcidas', 'horas_ressarcidas', 'ressarcidas')) ?? 0;

  return {
    id: asStr(pick(raw, 'id', 'uuid', '_id')) || genId(),
    direcao,
    paraQuem: paraQuem || 'Sem nome',
    dataTrabalho: dataTrabalho || hojeISO(),
    horasTrabalhadas:
      parseNumber(pick(raw, 'horasTrabalhadas', 'horas_trabalhadas', 'horas', 'trabalhadas')) ?? 0,
    horasRessarcidas: horasRes,
    dataRessarcimento: parseDateISO(pick(raw, 'dataRessarcimento', 'data_ressarcimento')),
    historicoRessarcimentos: historicoRessarcimentos.length ? historicoRessarcimentos : undefined,
    obs: asStr(pick(raw, 'obs', 'observacao', 'observacoes', 'nota', 'notes')),
  };
}

export type ParseImportResult =
  | {
      ok: true;
      db: {
        config: Record<string, unknown>;
        locais: LocalTrabalho[];
        registros: RegistroPonto[];
        pagamentos: Pagamento[];
        trocas: TrocaPlantao[];
      };
      relatorio: {
        locais: number;
        registros: number;
        pagamentos: number;
        trocas: number;
        ignorados: string[];
        chavesTopo: string[];
        origem: {locais: string; registros: string; pagamentos: string};
      };
    }
  | {
      ok: false;
      motivo: string;
      detalhes?: {chavesTopo: string[]; colecoesEncontradas: string[]};
    };

export function parseImportFile(raw: string): ParseImportResult {
  const extracted = extractRawData(raw);
  if (!extracted.ok) return extracted;

  const data = extracted.dados;
  const isArr = Array.isArray(data);
  const obj = isArr ? null : (data as Record<string, unknown>);

  if (isArr && !(data as unknown[]).length) {
    return {ok: false, motivo: 'O arquivo tem uma lista vazia.'};
  }

  const collections = isArr ? [] : collectArrays(data);
  const topKeys = obj ? Object.keys(obj).slice(0, 25) : ['(lista na raiz do arquivo)'];

  let colLocais: CollectionInfo | null = null;
  let colRegistros: CollectionInfo | null = null;
  let colPagamentos: CollectionInfo | null = null;
  let colTrocas: CollectionInfo | null = null;

  for (const col of collections) {
    const sl = scoreLocais(col);
    const sr = scoreRegistros(col);
    const sp = scorePagamentos(col);
    const st = scoreTrocas(col);
    if (sl >= 3 && (!colLocais || sl > (colLocais.pontos || 0))) colLocais = {...col, pontos: sl};
    if (sr >= 3 && (!colRegistros || sr > (colRegistros.pontos || 0))) colRegistros = {...col, pontos: sr};
    if (sp >= 4 && (!colPagamentos || sp > (colPagamentos.pontos || 0))) colPagamentos = {...col, pontos: sp};
    if (st >= 4 && (!colTrocas || st > (colTrocas.pontos || 0))) colTrocas = {...col, pontos: st};
  }

  if (isArr) {
    const arr = data as unknown[];
    const sample = (arr.find((x) => x && typeof x === 'object') || {}) as Record<string, unknown>;
    const rootCol: CollectionInfo = {
      chave: '(raiz)',
      caminho: '(raiz)',
      itens: arr,
      chaves: Object.keys(sample),
    };
    const sl = scoreLocais(rootCol);
    const sr = scoreRegistros(rootCol);
    if (sr >= sl && sr >= 3) colRegistros = {...rootCol, pontos: sr};
    else if (sl >= 3) colLocais = {...rootCol, pontos: sl};
  }

  if (!colLocais && !colRegistros && !colTrocas) {
    return {
      ok: false,
      motivo: 'Não identifiquei locais nem registros neste arquivo.',
      detalhes: {
        chavesTopo: topKeys,
        colecoesEncontradas: collections.map((c) => c.caminho).slice(0, 12),
      },
    };
  }

  const locais: LocalTrabalho[] = (colLocais?.itens || [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map(normalizeLocal);

  const localMap = new Map<string, LocalTrabalho>(locais.map((l) => [l.id, l]));
  const localNameMap = new Map<string, string>(locais.map((l) => [normKey(l.nome), l.id]));

  const rawRegs = colRegistros?.itens || [];
  let semLocal = 0;
  let semData = 0;
  let durConv = 0;
  const registros: RegistroPonto[] = [];

  for (const r of rawRegs) {
    if (!r || typeof r !== 'object') continue;
    const norm = normalizeRegistro(r as Record<string, unknown>, localMap, localNameMap);
    if (!norm) {
      semData++;
      continue;
    }
    if (!norm.localId) {
      if (!localNameMap.has(normKey('Local importado'))) {
        const fallback: LocalTrabalho = {
          id: genId(),
          nome: 'Local importado',
          tipo: 'Fixo',
          valor_hora: 0,
          limite_normal: 8,
          fds_percent: 0,
          cor: '#64748b',
          raio: 300,
          lat: null,
          lng: null,
          obs: 'Criado na importação',
        };
        locais.push(fallback);
        localMap.set(fallback.id, fallback);
        localNameMap.set(normKey(fallback.nome), fallback.id);
      }
      norm.localId = localNameMap.get(normKey('Local importado')) || '';
      semLocal++;
    }
    if (!norm.entrada && !norm.saida) continue;
    if (norm._duracaoConvertida) durConv++;
    delete norm._duracaoConvertida;
    registros.push(norm);
  }

  const pagamentos: Pagamento[] = (colPagamentos?.itens || [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => normalizePagamento(x, localMap, localNameMap))
    .filter((p) => p.localId && p.valor > 0);

  const trocas: TrocaPlantao[] = (colTrocas?.itens || [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map(normalizeTroca)
    .filter((x): x is TrocaPlantao => !!x);

  const ignorados: string[] = [];
  if (semData) ignorados.push(`${semData} ${semData === 1 ? 'registro' : 'registros'} sem data válida`);
  if (semLocal) {
    ignorados.push(`${semLocal} ${semLocal === 1 ? 'registro' : 'registros'} sem local (agrupados em "Local importado")`);
  }
  if (durConv) {
    ignorados.push(`${durConv} ${durConv === 1 ? 'registro' : 'registros'} só com duração (importados como 00:00–duração)`);
  }

  const cfg = obj?.config && typeof obj.config === 'object' ? {...(obj.config as Record<string, unknown>)} : {};

  return {
    ok: true,
    db: {config: cfg, locais, registros, pagamentos, trocas},
    relatorio: {
      locais: locais.length,
      registros: registros.length,
      pagamentos: pagamentos.length,
      trocas: trocas.length,
      ignorados,
      chavesTopo: topKeys,
      origem: {
        locais: colLocais?.caminho || '—',
        registros: colRegistros?.caminho || '—',
        pagamentos: colPagamentos?.caminho || '—',
      },
    },
  };
}
