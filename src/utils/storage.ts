import {AccentKey, AppDatabase, BackgroundSettings} from '../types';
import {DEFAULTS_CALC, genId} from './calc';
import {hojeISO} from './format';

export const STORAGE_KEY = 'controle-horas/v1';
export const APP_SIGNATURE = 'controle-de-horas';
export const WALLPAPER_KEY = 'controle-horas/fundo';
export const WALLPAPER_DEFAULTS: Omit<BackgroundSettings, 'imagem'> = {
  opacidade: 55,
  blur: 0,
  dim: 30,
};

export const LOCAL_COLORS = [
  '#4f46e5',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#64748b',
];

export const ACCENT_PALETTES: Record<
  AccentKey,
  {nome: string; hex: string; soft: string; softDark: string}
> = {
  indigo: {nome: 'Índigo', hex: '#4f46e5', soft: '#eef2ff', softDark: '#1e2350'},
  sky: {nome: 'Azul', hex: '#0284c7', soft: '#e0f2fe', softDark: '#0b2b40'},
  emerald: {nome: 'Esmeralda', hex: '#059669', soft: '#d1fae5', softDark: '#06301f'},
  amber: {nome: 'Âmbar', hex: '#d97706', soft: '#fef3c7', softDark: '#332206'},
  rose: {nome: 'Rosa', hex: '#e11d48', soft: '#ffe4e6', softDark: '#3a0f1a'},
  violet: {nome: 'Violeta', hex: '#7c3aed', soft: '#ede9fe', softDark: '#241046'},
};

export function createEmptyDatabase(): AppDatabase {
  return {
    versao: 1,
    config: {
      nome: '',
      tema: 'sistema',
      accent: 'indigo',
      metaMensal: DEFAULTS_CALC.metaMensal,
      extraPercent: DEFAULTS_CALC.extraPercent,
      feriadoMult: DEFAULTS_CALC.feriadoMult,
      valorHoraPadrao: 0,
      iaAtiva: false,
      iaProvedor: 'openai',
      iaBaseUrl: 'https://api.openai.com/v1',
      iaModel: 'gpt-4o-mini',
      iaKey: '',
      iaUltimoTeste: null,
      syncAtiva: false,
      syncUrl: '',
      syncKey: '',
      syncCode: '',
      syncUltimoEnvio: null,
      onboardingFeito: false,
      documento: '',
      registroProfissional: '',
      chavePix: '',
      assinatura: '',
    },
    locais: [],
    registros: [],
    pagamentos: [],
    trocas: [],
    meta: {atualizadoEm: null},
  };
}

export function loadDatabase(): AppDatabase {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyDatabase();
    const parsed = JSON.parse(raw);
    const base = createEmptyDatabase();
    return {
      ...base,
      ...parsed,
      config: {...base.config, ...(parsed.config || {})},
      locais: Array.isArray(parsed.locais) ? parsed.locais : [],
      registros: Array.isArray(parsed.registros) ? parsed.registros : [],
      pagamentos: Array.isArray(parsed.pagamentos) ? parsed.pagamentos : [],
      trocas: Array.isArray(parsed.trocas) ? parsed.trocas : [],
      meta: {atualizadoEm: null, ...(parsed.meta || {})},
    };
  } catch {
    return createEmptyDatabase();
  }
}

export function saveDatabase(db: AppDatabase): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (err) {
    console.error('Falha ao salvar no navegador', err);
  }
}

export function clearDatabase(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function exportBackupJSON(db: AppDatabase): string {
  const safe = {
    ...db,
    config: {...db.config, iaKey: '', iaUltimoTeste: null},
  };
  return JSON.stringify(
    {
      ...safe,
      aviso: 'A chave da API não é exportada por segurança. Reconfigure o assistente após restaurar.',
      app: APP_SIGNATURE,
      versao: 1,
      exportadoEm: new Date().toISOString(),
    },
    null,
    2,
  );
}

export function createSampleData(): AppDatabase {
  const db = createEmptyDatabase();
  const hoje = hojeISO();
  const [ano, mes] = hoje.split('-');
  const maxDay = new Date().getDate();

  const l1 = {
    id: genId(),
    nome: 'Hospital São Lucas',
    tipo: 'Fixo',
    valor_hora: 32.5,
    limite_normal: 8,
    fds_percent: 20,
    cor: LOCAL_COLORS[0],
    raio: 300,
    lat: null,
    lng: null,
    obs: '',
  };
  const l2 = {
    id: genId(),
    nome: 'Clínica Vida',
    tipo: 'Fixo',
    valor_hora: 45,
    limite_normal: 6,
    fds_percent: 0,
    cor: LOCAL_COLORS[2],
    raio: 250,
    lat: null,
    lng: null,
    obs: '',
  };
  const l3 = {
    id: genId(),
    nome: 'Plantões eventuais',
    tipo: 'Eventual',
    valor_hora: 60,
    limite_normal: 12,
    fds_percent: 30,
    cor: LOCAL_COLORS[3],
    raio: 500,
    lat: null,
    lng: null,
    obs: '',
  };

  db.locais = [l1, l2, l3];
  db.config.nome = 'Exemplo';

  const regs = [];
  const dias = [2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20];
  dias.forEach((dia, idx) => {
    if (dia > maxDay) return;
    const data = `${ano}-${mes}-${String(dia).padStart(2, '0')}`;
    const local = idx % 3 === 0 ? l2 : l1;
    regs.push({
      id: genId(),
      localId: local.id,
      data,
      entrada: idx % 3 === 0 ? '08:00' : '07:00',
      saida: idx % 3 === 0 ? '14:00' : idx % 4 === 0 ? '19:30' : '17:00',
      pausa_min: idx % 3 === 0 ? 0 : 60,
      feriado: false,
      troca_plantao: '' as const,
      obs: '',
    });
  });

  regs.push({
    id: genId(),
    localId: l3.id,
    data: `${ano}-${mes}-${String(Math.min(14, maxDay)).padStart(2, '0')}`,
    entrada: '19:00',
    saida: '07:00',
    pausa_min: 60,
    feriado: true,
    troca_plantao: '' as const,
    obs: 'Plantão noturno',
  });

  db.registros = regs;
  db.pagamentos = [
    {
      id: genId(),
      localId: l1.id,
      valor: 500,
      data: hoje,
      de: `${ano}-${mes}-01`,
      ate: `${ano}-${mes}-15`,
      obs: 'Adiantamento',
    },
  ];
  db.trocas = [
    {
      id: genId(),
      direcao: 'eu_trabalhei',
      paraQuem: 'Dr. Carlos',
      dataTrabalho: `${ano}-${mes}-${String(Math.min(10, maxDay)).padStart(2, '0')}`,
      horasTrabalhadas: 12,
      horasRessarcidas: 6,
      dataRessarcimento: `${ano}-${mes}-${String(Math.min(14, maxDay)).padStart(2, '0')}`,
      historicoRessarcimentos: [
        {
          id: genId(),
          data: `${ano}-${mes}-${String(Math.min(14, maxDay)).padStart(2, '0')}`,
          horas: 6,
          obs: 'Primeira metade paga',
        },
      ],
      obs: 'Plantão diurno — faltam 6h a devolver',
    },
  ];
  return db;
}

export function loadBackgroundSettings(): BackgroundSettings | null {
  try {
    const raw = localStorage.getItem(WALLPAPER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.imagem ? parsed : null;
  } catch {
    return null;
  }
}

export function saveBackgroundSettings(settings: BackgroundSettings): void {
  try {
    localStorage.setItem(WALLPAPER_KEY, JSON.stringify(settings));
  } catch {
    throw new Error('Imagem grande demais para este navegador. Tente outra foto.');
  }
  applyBackgroundVars(settings);
}

export function clearBackgroundSettings(): void {
  try {
    localStorage.removeItem(WALLPAPER_KEY);
  } catch {
    // ignore
  }
  applyBackgroundVars(null);
}

export function applyBackgroundVars(settings: BackgroundSettings | null): void {
  const root = document.documentElement;
  if (!settings || !settings.imagem) {
    root.style.setProperty('--bg-image', 'none');
    root.style.setProperty('--bg-image-opacity', '0');
    root.style.setProperty('--bg-dim', 'transparent');
    root.style.setProperty('--bg-image-blur', '0px');
    return;
  }
  root.style.setProperty('--bg-image', `url("${settings.imagem}")`);
  root.style.setProperty('--bg-image-opacity', String((Number(settings.opacidade) || 0) / 100));
  root.style.setProperty('--bg-image-blur', `${Number(settings.blur) || 0}px`);
  const dark = root.classList.contains('dark');
  const dimAlpha = (Number(settings.dim) || 0) / 100;
  root.style.setProperty('--bg-dim', dark ? `rgba(0,0,0,${dimAlpha})` : `rgba(255,255,255,${dimAlpha})`);
}

export function compressBackgroundImage(
  file: File,
  maxSide = 1600,
  quality = 0.82,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('Nenhuma imagem escolhida.'));
    if (!/^image\//.test(file.type)) {
      return reject(new Error('Escolha um arquivo de imagem (PNG, JPG, WEBP).'));
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não consegui ler a imagem.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Arquivo de imagem inválido.'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Navegador sem suporte a canvas.'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
