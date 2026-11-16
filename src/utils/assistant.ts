import {AppConfig, AppDatabase, LocalTrabalho, Pagamento, RegistroPonto} from '../types';
import {
  calcRegistro,
  filterByMonth,
  filterByPeriod,
  findLocal,
  isTrocaLocal,
  monthlyHistory12,
  sumPagamentos,
  summarizeByLocal,
  summarizeRegistros,
  summarizeTrocasPlantao,
} from './calc';
import {
  addMonths,
  formatCurrencyBRL,
  formatDateBR,
  formatHours,
  formatMesRefLabel,
  formatMonthYear,
  hojeISO,
  MESES_PT,
  monthEnd,
  monthStart,
  normalizeText,
} from './format';

export interface AIProviderOption {
  id: string;
  nome: string;
  baseUrl: string;
  modelo: string;
  chaveEm: string;
  obs: string;
}

export const AI_PROVIDERS: AIProviderOption[] = [
  {
    id: 'openai',
    nome: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    modelo: 'gpt-4o-mini',
    chaveEm: 'platform.openai.com/api-keys',
    obs: 'Padrão. Chave começa com sk-.',
  },
  {
    id: 'gemini',
    nome: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    modelo: 'gemini-2.5-flash',
    chaveEm: 'aistudio.google.com/apikey',
    obs: 'Chave do Google AI Studio (começa com AIza). Alternativas: gemini-2.5-flash-lite.',
  },
  {
    id: 'groq',
    nome: 'Groq (Llama)',
    baseUrl: 'https://api.groq.com/openai/v1',
    modelo: 'llama-3.3-70b-versatile',
    chaveEm: 'console.groq.com/keys',
    obs: 'Rápido e com plano gratuito. Aceita CORS direto do navegador.',
  },
  {
    id: 'together',
    nome: 'Together AI (Llama)',
    baseUrl: 'https://api.together.xyz/v1',
    modelo: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    chaveEm: 'api.together.ai/settings/api-keys',
    obs: 'Vários modelos Meta Llama.',
  },
  {
    id: 'openrouter',
    nome: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelo: 'meta-llama/llama-3.3-70b-instruct:free',
    chaveEm: 'openrouter.ai/keys',
    obs: 'Endpoint unificado para vários modelos, inclui opções gratuitas.',
  },
  {
    id: 'fireworks',
    nome: 'Fireworks',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    modelo: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
    chaveEm: 'fireworks.ai/account/api-keys',
    obs: 'Modelos abertos com foco em produção.',
  },
  {
    id: 'ollama',
    nome: 'Ollama / LM Studio (local)',
    baseUrl: 'http://localhost:11434/v1',
    modelo: 'llama3.2',
    chaveEm: 'roda no seu computador',
    obs: 'Sem custo e offline. A chave pode ser qualquer texto (ex.: "local").',
  },
  {
    id: 'custom',
    nome: 'Outro (personalizado)',
    baseUrl: '',
    modelo: '',
    chaveEm: '',
    obs: 'Informe a URL base completa, terminando em /v1.',
  },
];

export function getAIProvider(id?: string): AIProviderOption {
  return AI_PROVIDERS.find((p) => p.id === id) || AI_PROVIDERS[0];
}

export function isAIConfigured(cfg?: Partial<AppConfig> | null): boolean {
  return !!(cfg?.iaAtiva && cfg?.iaKey && cfg?.iaModel && cfg?.iaBaseUrl);
}

export function getAIStatus(cfg?: Partial<AppConfig> | null): {
  nivel: 'local' | 'ok' | 'erro' | 'pendente';
  texto: string;
} {
  if (!isAIConfigured(cfg)) return {nivel: 'local', texto: 'Motor local (sem chave)'};
  const test = cfg?.iaUltimoTeste;
  if (test?.ok) return {nivel: 'ok', texto: 'IA conectada'};
  if (test && !test.ok) return {nivel: 'erro', texto: 'IA configurada · último teste falhou'};
  return {nivel: 'pendente', texto: 'IA configurada (não testada)'};
}

const STOP_WORDS = new Set([
  'de',
  'da',
  'do',
  'dos',
  'das',
  'no',
  'na',
  'em',
  'o',
  'a',
  'os',
  'as',
  'e',
  'para',
  'por',
  'meu',
  'minha',
]);

function keywords(text: string): string[] {
  return normalizeText(text)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function detectMonth(text: string, hoje: string): string | null {
  const norm = normalizeText(text);
  const current = hoje.slice(0, 7);
  const isoMatch = norm.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])\b/);
  if (isoMatch) return `${isoMatch[1]}-${String(isoMatch[2]).padStart(2, '0')}`;
  if (/\b(mes passado|ultimo mes|mes anterior)\b/.test(norm)) return addMonths(current, -1);
  if (/\b(mes retrasado)\b/.test(norm)) return addMonths(current, -2);
  if (/\b(este mes|nesse mes|mes atual|esse mes|do mes)\b/.test(norm)) return current;

  const yearMatch = Number((norm.match(/\b(20\d{2})\b/) || [])[1]);
  for (let i = 0; i < MESES_PT.length; i++) {
    const full = normalizeText(MESES_PT[i]);
    const short = full.slice(0, 3);
    if (new RegExp(`\\b(${full}|${short})\\b`).test(norm)) {
      const m = i + 1;
      if (yearMatch) return `${yearMatch}-${String(m).padStart(2, '0')}`;
      const currM = Number(current.slice(5, 7));
      const y = m > currM + 1 ? Number(current.slice(0, 4)) - 1 : Number(current.slice(0, 4));
      return `${y}-${String(m).padStart(2, '0')}`;
    }
  }
  return null;
}

function detectLocal(text: string, locais: LocalTrabalho[]): LocalTrabalho | null {
  if (!locais.length) return null;
  const norm = normalizeText(text);
  let best: {local: LocalTrabalho; score: number} | null = null;
  for (const l of locais) {
    const ln = normalizeText(l.nome);
    let score = 0;
    if (norm.includes(ln)) {
      score = 100;
    } else {
      const words = keywords(l.nome);
      for (const w of words) {
        if (norm.includes(w)) score += 30;
      }
    }
    if (score > 0 && (!best || score > best.score)) best = {local: l, score};
  }
  return best?.local || null;
}

function detectPeriodRange(text: string, mesRef: string): {de: string; ate: string} {
  const m = normalizeText(text).match(/dia\s+(\d{1,2})\s*(?:a|ate|ao)\s*dia\s+(\d{1,2})/);
  if (m) {
    const p = (n: string) => String(n).padStart(2, '0');
    return {de: `${mesRef}-${p(m[1])}`, ate: `${mesRef}-${p(m[2])}`};
  }
  return {de: monthStart(mesRef), ate: monthEnd(mesRef)};
}

export interface ReceiptAction {
  local: LocalTrabalho;
  registros: RegistroPonto[];
  de: string;
  ate: string;
  pago: number;
  total: number;
  texto: string;
}

export interface HoursReportAction {
  selecionados: string[];
  de: string;
  ate: string;
}

export interface LocalAssistantResponse {
  texto: string;
  sugestoes?: string[];
  recibos?: ReceiptAction[];
  relatorios?: HoursReportAction[];
}

function buildReceiptData(params: {
  local: LocalTrabalho;
  mesRef: string;
  regs: RegistroPonto[];
  config: Partial<AppConfig>;
  pagamentos: Pagamento[];
  de: string;
  ate: string;
}): ReceiptAction {
  const {local, regs, config, pagamentos, de, ate} = params;
  const sum = summarizeRegistros(regs, [local], config);
  const pago = sumPagamentos(
    pagamentos.filter((p) => p.data >= de && p.data <= ate),
    local.id,
  );
  return {
    local,
    registros: regs,
    de,
    ate,
    pago,
    total: sum.valor,
    texto: `Recibo de **${local.nome}** (${formatDateBR(de)} a ${formatDateBR(ate)}): ${formatHours(sum.horas)} · ${formatCurrencyBRL(sum.valor)}.`,
  };
}

export function answerLocally(
  question: string,
  db: AppDatabase,
  hoje: string = hojeISO(),
): LocalAssistantResponse {
  const locais = (db.locais || []).filter((l) => !isTrocaLocal(l));
  const registros = (db.registros || []).filter((r) => {
    const loc = findLocal(r, db.locais || []);
    return !r.agendado && !isTrocaLocal(loc) && r.troca_plantao !== 'compensado';
  });
  const pagamentos = db.pagamentos || [];
  const trocas = db.trocas || [];
  const config = db.config;
  const norm = normalizeText(question);
  const mesRef = detectMonth(question, hoje) || hoje.slice(0, 7);
  const mesNome = formatMonthYear(Number(mesRef.slice(0, 4)), Number(mesRef.slice(5, 7)) - 1);
  const regsMes = filterByMonth(registros, mesRef);
  const localHit = detectLocal(question, locais);

  if (/troca|ressarc|devolv|colega|quem.*deve.*hora|plantao trocado/.test(norm)) {
    const sumTrocas = summarizeTrocasPlantao(trocas);
    if (!trocas.length) {
      return {
        texto: 'Você ainda não registrou nenhuma **troca de plantão** na aba Trocas.',
        sugestoes: ['Quanto vou receber este mês?', 'Tenho algo atrasado?'],
      };
    }
    const pendentes = sumTrocas.porPessoa.filter((p) => p.pendentes > 0);
    if (!pendentes.length) {
      return {
        texto: `Todas as suas **trocas de plantão** estão quitadas (${formatHours(sumTrocas.trabalhadas)} no total).`,
        sugestoes: ['Quanto vou receber este mês?'],
      };
    }
    const linhas = pendentes.map((p) => {
      const partes: string[] = [];
      if (p.aReceber > 0) partes.push(`te deve **${formatHours(p.aReceber)}**`);
      if (p.aDevolver > 0) partes.push(`você deve **${formatHours(p.aDevolver)}**`);
      return `• **${p.pessoa}**: ${partes.join(' · ')}`;
    });
    return {
      texto:
        `**Trocas de plantão (separadas do faturamento):**\n` +
        `• A receber: **${formatHours(sumTrocas.aReceberHoras)}** · A devolver: **${formatHours(sumTrocas.aDevolverHoras)}**\n` +
        linhas.join('\n'),
      sugestoes: ['Quanto vou receber este mês?', 'Tenho algo atrasado?'],
    };
  }

  if (!locais.length || !registros.length) {
    return {
      texto:
        'Ainda não tenho registros para analisar. Cadastre um local na aba **Locais** e registre o ponto — depois eu calculo tudo e gero o recibo.',
      sugestoes: ['Como cadastro um local?', 'Quais são as regras de cálculo?'],
    };
  }

  if (/recibo|comprovante|holerite|extrato/.test(norm)) {
    const targets = /todos os locais|todos|tudo/.test(norm) ? locais : localHit ? [localHit] : [];
    if (!targets.length) {
      return {
        texto: `Posso gerar o recibo, mas preciso saber de qual local.\nVocê tem: ${locais.map((l) => `**${l.nome}**`).join(', ')}.`,
        sugestoes: locais.slice(0, 4).map((l) => `Recibo de ${l.nome} de ${formatMesRefLabel(mesRef)}`),
      };
    }
    const recibos = targets
      .map((l) => {
        const list = regsMes.filter((r) => r.localId === l.id);
        if (!list.length) return null;
        const {de, ate} = detectPeriodRange(question, mesRef);
        const filtered = filterByPeriod(list, de, ate);
        return filtered.length
          ? buildReceiptData({local: l, mesRef, regs: filtered, config, pagamentos, de, ate})
          : null;
      })
      .filter((x): x is ReceiptAction => !!x);

    if (recibos.length) {
      return {
        texto: recibos.map((r) => r.texto).join('\n'),
        recibos,
        sugestoes: ['Ver o que está atrasado', `Total de ${mesNome}`],
      };
    }
    return {
      texto: `Não encontrei registros em **${targets[0].nome}** em ${mesNome}. Quer outro mês?`,
      sugestoes: [1, 2, 3].map((offset) => {
        const m = addMonths(mesRef, -offset);
        return `Recibo de ${targets[0].nome} de ${formatMesRefLabel(m)}`;
      }),
    };
  }

  if (/relatorio|espelho|folha de ponto|folha de horas|relatorio de horas/.test(norm)) {
    const targets = /todos os locais|todos|tudo/.test(norm) ? locais : localHit ? [localHit] : locais;
    const {de, ate} = detectPeriodRange(question, mesRef);
    const list = filterByPeriod(
      registros.filter((r) => targets.some((l) => l.id === r.localId)),
      de,
      ate,
    );
    const totalH = list.reduce((acc, r) => acc + calcRegistro(r, findLocal(r, locais), config).horas, 0);
    if (list.length) {
      return {
        texto: `Preparei o **relatório de horas** de ${mesNome}${targets.length === 1 ? ` — ${targets[0].nome}` : ` (${targets.length} locais)`}.\n• ${list.length} ${list.length === 1 ? 'registro' : 'registros'} · **${formatHours(totalH)}**\n• Período: ${formatDateBR(de)} a ${formatDateBR(ate)}\nSem valores em dinheiro: data, dia, local, entrada, saída, pausa e horas.`,
        relatorios: [{selecionados: targets.map((l) => l.id), de, ate}],
        sugestoes: [`Recibo de ${targets[0].nome} de ${formatMesRefLabel(mesRef)}`, 'Quanto vou receber este mês?'],
      };
    }
    return {
      texto: `Não há registros de ${targets.map((l) => `**${l.nome}**`).join(', ')} em ${mesNome}.`,
      sugestoes: [`Recibo de ${targets[0].nome} de ${formatMesRefLabel(mesRef)}`],
    };
  }

  if (/atrasad|falta receber|ainda.*receber|nao.*pago|em aberto|me deve|a receber/.test(norm)) {
    const pendentes = summarizeByLocal(registros, locais, pagamentos, config).filter(
      (s) => s.aReceber > 0.005,
    );
    const totalPend = pendentes.reduce((acc, s) => acc + s.aReceber, 0);
    if (pendentes.length) {
      return {
        texto:
          `Você tem **${formatCurrencyBRL(totalPend)}** a receber:\n` +
          pendentes
            .sort((a, b) => b.aReceber - a.aReceber)
            .map(
              (s) =>
                `• ${s.local.nome}: **${formatCurrencyBRL(s.aReceber)}** (devido ${formatCurrencyBRL(s.valor)}, pago ${formatCurrencyBRL(s.pago)})`,
            )
            .join('\n'),
        sugestoes: pendentes
          .slice(0, 3)
          .map((s) => `Recibo de ${s.local.nome} de ${formatMesRefLabel(addMonths(hoje.slice(0, 7), -1))}`),
      };
    }
    return {
      texto: 'Nada em atraso: tudo que você trabalhou já foi pago.',
      sugestoes: ['Quanto ganhei este mês?'],
    };
  }

  if (/quantas horas|horas (no|do|de) mes|total de horas|banco de horas|horas trabalhadas/.test(norm)) {
    const sum = summarizeRegistros(regsMes, locais, config);
    const meta = Number(config.metaMensal) || 0;
    const falta = Math.max(0, meta - sum.horas);
    return {
      texto:
        `Em **${mesNome}** você trabalhou **${formatHours(sum.horas)}** em ${sum.quantidade} ${sum.quantidade === 1 ? 'registro' : 'registros'}.\n• Normais: ${formatHours(sum.normais)}\n• Extras: ${formatHours(sum.extras)}` +
        (meta ? `\n• Meta de ${formatHours(meta)}: ${falta > 0 ? `faltam ${formatHours(falta)}` : 'meta batida'}` : ''),
      sugestoes: [`Valor de ${mesNome}`, `Recibo de ${localHit?.nome || locais[0].nome} de ${formatMesRefLabel(mesRef)}`],
    };
  }

  if (/extra|hora extra|feriado|dobro|fim de semana/.test(norm)) {
    const extrasH = regsMes.reduce((acc, r) => acc + calcRegistro(r, findLocal(r, locais), config).extras, 0);
    const feriados = regsMes.filter((r) => r.feriado);
    const feriadosH = feriados.reduce((acc, r) => acc + calcRegistro(r, findLocal(r, locais), config).horas, 0);
    const extrasValor = regsMes.reduce((acc, r) => {
      const c = calcRegistro(r, findLocal(r, locais), config);
      return acc + c.extras * c.valorHora * c.multDia * (1 + Number(config.extraPercent || 0) / 100);
    }, 0);
    return {
      texto: `Em **${mesNome}**:\n• Extras: **${formatHours(extrasH)}** → cerca de ${formatCurrencyBRL(extrasValor)} (\`+${config.extraPercent}%\` sobre a hora normal)\n• Feriados: **${feriados.length}** ${feriados.length === 1 ? 'dia' : 'dias'} (${formatHours(feriadosH)}) com hora ×${config.feriadoMult}`,
      sugestoes: [`Total de ${mesNome}`, `Recibo de ${locais[0].nome} de ${formatMesRefLabel(mesRef)}`],
    };
  }

  if (/por local|cada local|participacao|onde eu trabalhei|quais locais/.test(norm)) {
    const list = summarizeByLocal(regsMes, locais, pagamentos, config).filter((s) => s.horas > 0);
    if (list.length) {
      return {
        texto:
          `Em **${mesNome}**:\n` +
          list
            .sort((a, b) => b.valor - a.valor)
            .map((s) => `• **${s.local.nome}** — ${formatHours(s.horas)} · ${formatCurrencyBRL(s.valor)}`)
            .join('\n') +
          `\nTotal: **${formatCurrencyBRL(list.reduce((acc, s) => acc + s.valor, 0))}**`,
        sugestoes: [`Recibo de ${list[0].local.nome} de ${formatMesRefLabel(mesRef)}`],
      };
    }
    return {texto: `Nenhum registro em ${mesNome}.`};
  }

  if (/comparar|comparativo|melhor(es)? m(e|ê)s(es)?|ultimos 12|evolucao|tendencia|media/.test(norm)) {
    const hist = monthlyHistory12(registros, locais, config, hoje.slice(0, 7), 12).filter(
      (h) => h.valor > 0 || h.horas > 0,
    );
    if (!hist.length) return {texto: 'Ainda não há histórico de 12 meses para comparar.'};
    const best = hist.reduce((a, b) => (b.valor > a.valor ? b : a));
    const avg = hist.reduce((acc, h) => acc + h.valor, 0) / hist.length;
    return {
      texto:
        `Últimos 12 meses (${hist.length} com movimento):\n` +
        hist.map((h) => `• ${h.label}: ${formatHours(h.horas)} · ${formatCurrencyBRL(h.valor)}`).join('\n') +
        `\nMelhor mês: **${best.label}** com ${formatCurrencyBRL(best.valor)}. Média: **${formatCurrencyBRL(avg)}**.`,
      sugestoes: [`Recibo de ${locais[0].nome} de ${formatMesRefLabel(mesRef)}`],
    };
  }

  if (/ponto aberto|esqueci|sem saida|nao registrei a saida/.test(norm)) {
    const abertos = registros.filter((r) => r.entrada && !r.saida);
    if (abertos.length) {
      return {
        texto:
          `Encontrei ${abertos.length} ${abertos.length === 1 ? 'ponto em aberto' : 'pontos em aberto'}:\n` +
          abertos
            .map((r) => `• ${formatDateBR(r.data)} — ${findLocal(r, locais)?.nome || '—'} (entrada ${r.entrada})`)
            .join('\n') +
          '\nAbra o registro no Calendário para corrigir a saída.',
        sugestoes: ['Quanto vou receber este mês?'],
      };
    }
    return {texto: 'Nenhum ponto em aberto. Tudo certo por aqui.'};
  }

  if (/quanto|total|ganhei|recebi|receber|valor|faturamento|renda|pagamento/.test(norm)) {
    const sum = summarizeRegistros(regsMes, locais, config);
    if (!sum.quantidade) {
      return {
        texto: `Nenhum registro em **${mesNome}**.`,
        sugestoes: [`Total de ${formatMesRefLabel(addMonths(mesRef, -1))}`],
      };
    }
    const pagoMes = pagamentos
      .filter((p) => String(p.data || '').startsWith(mesRef))
      .reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
    const byLoc = summarizeByLocal(regsMes, locais, pagamentos, config).filter((s) => s.valor > 0);
    return {
      texto:
        `**${mesNome}**\n• Horas: **${formatHours(sum.horas)}** (${formatHours(sum.extras)} extras)\n• Valor: **${formatCurrencyBRL(sum.valor)}**\n• Pago no mês: ${formatCurrencyBRL(pagoMes)}` +
        (byLoc.length > 1
          ? '\n' +
            byLoc
              .sort((a, b) => b.valor - a.valor)
              .map((s) => `• ${s.local.nome}: ${formatCurrencyBRL(s.valor)}`)
              .join('\n')
          : '') +
        `\nQuer o PDF? Posso gerar o recibo de ${localHit ? `**${localHit.nome}**` : 'qualquer local'}.`,
      sugestoes: [`Recibo de ${byLoc[0]?.local.nome || locais[0].nome} de ${formatMesRefLabel(mesRef)}`, 'Ver o que está atrasado'],
    };
  }

  if (/^(oi|ola|bom dia|boa tarde|boa noite|tudo bem|e ai)\b/.test(norm) && norm.length < 40) {
    const sum = summarizeRegistros(regsMes, locais, config);
    return {
      texto: `Oi${config.nome ? `, ${config.nome}` : ''}! Em **${mesNome}** você tem ${formatHours(sum.horas)} e ${formatCurrencyBRL(sum.valor)} registrados.\nPosso gerar o recibo em PDF, apontar atrasos ou comparar os meses. O que você precisa?`,
      sugestoes: [
        `Recibo de ${locais[0].nome} de ${formatMesRefLabel(mesRef)}`,
        'Quanto vou receber este mês?',
        'Tenho algo atrasado?',
      ],
    };
  }

  if (/ajuda|como funciona|o que voce faz|regras|calculo/.test(norm)) {
    return {
      texto: `Eu leio seus registros e respondo na hora:\n• **“Quanto vou receber este mês?”** — valor, horas e extras\n• **“Gera o recibo de outubro do Hospital”** — PDF na hora\n• **“Tenho algo atrasado?”** — saldo por local\n• **“Quais foram meus melhores meses?”** — últimos 12 meses\n• **“Esqueci algum ponto aberto?”** — registros sem saída\nRegras: extras acima do limite diário (\`+${config.extraPercent}%\`), feriado ×${config.feriadoMult}, fim de semana conforme o local.`,
      sugestoes: ['Quanto vou receber este mês?', 'Tenho algo atrasado?', `Recibo de ${locais[0].nome}`],
    };
  }

  const fallback = summarizeRegistros(regsMes, locais, config);
  return {
    texto: `Não entendi exatamente, mas aqui vai o resumo de **${mesNome}**:\n• ${formatHours(fallback.horas)} · ${formatCurrencyBRL(fallback.valor)} em ${fallback.quantidade} ${fallback.quantidade === 1 ? 'registro' : 'registros'}\nVocê pode pedir: "quanto vou receber", "gera o recibo de outubro", "tenho algo atrasado" ou "melhores meses".`,
    sugestoes: ['Quanto vou receber este mês?', `Recibo de ${locais[0].nome}`, 'Tenho algo atrasado?'],
  };
}

function summarizeContextForAI(db: AppDatabase, hoje: string = hojeISO()) {
  const locais = (db.locais || []).filter((l) => !isTrocaLocal(l));
  const registros = (db.registros || []).filter((r) => {
    const loc = findLocal(r, db.locais || []);
    return !r.agendado && !isTrocaLocal(loc) && r.troca_plantao !== 'compensado';
  });
  const pagamentos = db.pagamentos || [];
  const config = db.config;
  const mesAtual = hoje.slice(0, 7);
  const regsMes = filterByMonth(registros, mesAtual);
  const trocasSummary = summarizeTrocasPlantao(db.trocas || []);
  return {
    hoje,
    mesAtual,
    config: {
      extraPercent: config.extraPercent,
      feriadoMult: config.feriadoMult,
      metaMensal: config.metaMensal,
    },
    locais: locais.map((l) => ({
      nome: l.nome,
      valor_hora: l.valor_hora,
      limite_normal: l.limite_normal,
      fds_percent: l.fds_percent,
    })),
    mes: summarizeRegistros(regsMes, locais, config),
    porLocal: summarizeByLocal(regsMes, locais, pagamentos, config).map((s) => ({
      local: s.local.nome,
      horas: s.horas,
      valor: s.valor,
      pago: s.pago,
      aReceber: s.aReceber,
    })),
    totalGeral: summarizeRegistros(registros, locais, config),
    pagoGeral: sumPagamentos(pagamentos),
    trocasSeparadasDoFaturamento: {
      aReceberHoras: trocasSummary.aReceberHoras,
      aDevolverHoras: trocasSummary.aDevolverHoras,
      porPessoa: trocasSummary.porPessoa,
    },
  };
}

const AI_SYSTEM_PROMPT = `Você é o assistente do app "rad TunoPay", em português do Brasil.
Você recebe um resumo em JSON com os registros reais do usuário.
Regras:
- Nunca invente números: use apenas os valores do JSON.
- Seja curto e direto (no máximo 6 linhas), tom cordial.
- Se o usuário pedir recibo/comprovante/holerite, preencha "recibo".
- Responda SOMENTE com JSON válido no formato:
{"resposta": "texto em pt-BR", "recibo": {"local": "nome do local ou vazio", "mes": "YYYY-MM ou vazio"} | null}`;

function formatProviderError(status: number, raw: string): string {
  const clean = String(raw || '').replace(/\s+/g, ' ').slice(0, 140);
  if (status === 401 || status === 403) {
    return `Chave recusada (${status}). Confira a chave e as permissões no painel do provedor.`;
  }
  if (status === 404) {
    return 'Endpoint ou modelo não encontrado (404). Confira a URL base (termina em /v1) e o id do modelo.';
  }
  if (status === 429) {
    return 'Limite de uso atingido (429). Tente de novo em instantes ou troque de modelo/plano.';
  }
  if (status === 400 || status === 422) {
    return `O provedor recusou os parâmetros (${status}). ${clean}`;
  }
  if (status >= 500) {
    return `O servidor do provedor está instável (${status}). Tente novamente em alguns segundos.`;
  }
  return `Provedor respondeu ${status}. ${clean}`;
}

function stripThinkingAndFences(raw: string): string {
  return String(raw || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

function extractChoiceText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const d = data as Record<string, unknown>;

  if (typeof d.output_text === 'string' && d.output_text.trim()) {
    return d.output_text;
  }

  const choices = Array.isArray(d.choices) ? d.choices : [];
  const first = (choices[0] || {}) as Record<string, unknown>;
  const msg = (first.message || {}) as Record<string, unknown>;
  const content = msg.content;

  if (typeof content === 'string' && content.trim()) {
    return content;
  }

  if (Array.isArray(content)) {
    const parts = content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (!part || typeof part !== 'object') return '';
        const p = part as Record<string, unknown>;
        if (p.type === 'thinking' || p.type === 'reasoning') return '';
        if (typeof p.text === 'string') return p.text;
        if (typeof p.content === 'string') return p.content;
        return '';
      })
      .filter(Boolean);
    if (parts.length) return parts.join('\n');
  }

  if (typeof first.text === 'string' && first.text.trim()) {
    return first.text;
  }

  if (typeof msg.refusal === 'string' && msg.refusal.trim()) {
    return msg.refusal;
  }

  const candidates = Array.isArray(d.candidates) ? d.candidates : [];
  const cand0 = (candidates[0] || {}) as Record<string, unknown>;
  const candContent = (cand0.content || {}) as Record<string, unknown>;
  if (Array.isArray(candContent.parts)) {
    const geminiParts = candContent.parts
      .map((p) => (p && typeof p === 'object' ? String((p as Record<string, unknown>).text || '') : ''))
      .filter(Boolean);
    if (geminiParts.length) return geminiParts.join('\n');
  }

  return '';
}

function parseAIJson(raw: string): Record<string, unknown> | null {
  const clean = stripThinkingAndFences(raw);
  if (!clean) return null;

  const tryParseObj = (text: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  };

  const direct = tryParseObj(clean);
  if (direct) return direct;

  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return tryParseObj(clean.slice(start, end + 1));
  }
  return null;
}

function extractRespostaFromObject(obj: Record<string, unknown>): string {
  const candidates = [
    obj.resposta,
    obj.response,
    obj.texto,
    obj.text,
    obj.mensagem,
    obj.message,
    obj.answer,
    obj.reply,
    obj.conteudo,
    obj.content,
  ];
  for (const val of candidates) {
    if (typeof val === 'string' && val.trim()) {
      return val.trim();
    }
  }
  return '';
}

function parseAIResponseData(data: unknown): {
  resposta: string;
  recibo: {local?: string; mes?: string} | null;
} | null {
  const rawStr = extractChoiceText(data);
  const cleaned = stripThinkingAndFences(rawStr);
  if (!cleaned) return null;

  const parsed = parseAIJson(cleaned);
  if (!parsed) {
    return {resposta: cleaned.slice(0, 1200), recibo: null};
  }

  const rawRecibo = parsed.recibo;
  const reciboObj =
    rawRecibo && typeof rawRecibo === 'object' && !Array.isArray(rawRecibo)
      ? (rawRecibo as {local?: string; mes?: string})
      : null;
  const recibo =
    reciboObj && (reciboObj.local || reciboObj.mes)
      ? {
          local: reciboObj.local ? String(reciboObj.local).trim() : '',
          mes: reciboObj.mes ? String(reciboObj.mes).trim() : '',
        }
      : null;

  let resposta = extractRespostaFromObject(parsed);
  if (!resposta && recibo) {
    resposta = `Gerando recibo${recibo.local ? ` de **${recibo.local}**` : ''}${recibo.mes ? ` (${recibo.mes})` : ''}.`;
  }

  if (!resposta) {
    return null;
  }

  return {resposta, recibo};
}

async function postChatCompletion(params: {
  base: string;
  key: string;
  body: Record<string, unknown>;
  signal: AbortSignal;
}) {
  const res = await fetch(`${params.base}/chat/completions`, {
    method: 'POST',
    signal: params.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.key}`,
    },
    body: JSON.stringify(params.body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(formatProviderError(res.status, detail)) as Error & {status?: number};
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function fetchAvailableModels(cfg: Partial<AppConfig>): Promise<string[]> {
  const base = (cfg.iaBaseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('Preencha a URL base antes de buscar modelos.');
  if (!cfg.iaKey) throw new Error('Informe a chave da API antes de buscar modelos.');

  const res = await fetch(`${base}/models`, {
    headers: {Authorization: `Bearer ${cfg.iaKey}`},
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    if (res.status === 404) {
      throw new Error('Este provedor não expõe /models. Copie o id do modelo no painel dele.');
    }
    throw new Error(formatProviderError(res.status, txt));
  }
  const json = await res.json().catch(() => null);
  const rawList: string[] = ((json?.data || json?.models || []) as Array<string | {id?: string; name?: string}>)
    .map((m) => (typeof m === 'string' ? m : m.id || m.name || ''))
    .map((m) => String(m).replace(/^models\//, ''))
    .filter(Boolean);
  const skip = /(embedding|aqa|tts|image|imagen|veo|lyria|live|robotics|computer-use|guard)/i;
  const filtered = rawList.filter((m) => !skip.test(m));
  return (filtered.length ? filtered : rawList).sort();
}

export async function askExternalAI(params: {
  pergunta: string;
  dados: AppDatabase;
  config: Partial<AppConfig>;
}): Promise<{resposta: string; recibo: {local?: string; mes?: string} | null}> {
  const {pergunta, dados, config} = params;
  const base = (config.iaBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);

  const systemContent = `${AI_SYSTEM_PROMPT}\n\nDados do usuário (JSON): ${JSON.stringify(summarizeContextForAI(dados))}`;

  const body = {
    model: config.iaModel,
    temperature: 0.2,
    messages: [
      {role: 'system', content: systemContent},
      {role: 'user', content: pergunta},
    ],
  };

  try {
    let data: unknown = null;
    let parsedResult: {resposta: string; recibo: {local?: string; mes?: string} | null} | null = null;

    try {
      data = await postChatCompletion({
        base,
        key: config.iaKey || '',
        signal: ctrl.signal,
        body: {...body, response_format: {type: 'json_object'}},
      });
      parsedResult = parseAIResponseData(data);
    } catch (err) {
      const status = (err as {status?: number}).status;
      if (status !== 400 && status !== 422 && status !== 404) throw err;
    }

    if (!parsedResult) {
      data = await postChatCompletion({base, key: config.iaKey || '', signal: ctrl.signal, body});
      parsedResult = parseAIResponseData(data);
    }

    if (!parsedResult || !parsedResult.resposta.trim()) {
      throw new Error('O provedor devolveu uma resposta em branco.');
    }

    return parsedResult;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('O provedor demorou demais para responder (30s).');
    }
    if (err instanceof TypeError) {
      throw new Error('Não consegui falar com o provedor (rede ou CORS bloqueado).');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
