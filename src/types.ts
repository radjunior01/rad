export type ThemeMode = 'claro' | 'escuro' | 'sistema';
export type AccentKey = 'indigo' | 'sky' | 'emerald' | 'amber' | 'rose' | 'violet';
export type TipoLocal = 'Fixo' | 'Freelance' | 'Troca de plantão' | 'Eventual' | string;
export type TrocaPlantaoStatus = '' | 'compensado' | 'nao_compensado';

export interface IATestResult {
  ok: boolean;
  em: string;
  msg: string;
}

export interface AppConfig {
  nome: string;
  tema: ThemeMode;
  accent: AccentKey;
  metaMensal: number;
  extraPercent: number;
  feriadoMult: number;
  valorHoraPadrao: number;
  iaAtiva: boolean;
  iaProvedor: string;
  iaBaseUrl: string;
  iaModel: string;
  iaKey: string;
  iaUltimoTeste: IATestResult | null;
  syncAtiva: boolean;
  syncUrl: string;
  syncKey: string;
  syncCode: string;
  syncUltimoEnvio: string | null;
  onboardingFeito: boolean;
  documento?: string;
  registroProfissional?: string;
  chavePix?: string;
  assinatura?: string;
}

export interface LocalTrabalho {
  id: string;
  nome: string;
  tipo: TipoLocal;
  valor_hora: number;
  limite_normal: number;
  fds_percent: number;
  cor: string;
  raio: number;
  lat: number | null;
  lng: number | null;
  obs: string;
}

export interface RegistroPonto {
  id: string;
  localId: string;
  data: string; // YYYY-MM-DD
  entrada: string; // HH:MM
  saida: string; // HH:MM or ""
  pausa_min: number;
  feriado: boolean;
  troca_plantao: TrocaPlantaoStatus;
  horas_trabalhadas?: number | '';
  horas_ressarcidas?: number | '';
  valor_hora?: number | '';
  agendado?: boolean;
  googleEventId?: string;
  googleEventLink?: string;
  obs: string;
  lat?: number;
  lng?: number;
  precisao?: number;
}

export type TrocaDirecao = 'eu_trabalhei' | 'cobriu_para_mim';

export interface TrocaRessarcimentoItem {
  id: string;
  data: string; // YYYY-MM-DD
  horas: number;
  obs?: string;
}

export interface TrocaPlantao {
  id: string;
  direcao?: TrocaDirecao;
  paraQuem: string;
  dataTrabalho: string; // YYYY-MM-DD
  horasTrabalhadas: number;
  horasRessarcidas: number;
  dataRessarcimento?: string; // YYYY-MM-DD
  historicoRessarcimentos?: TrocaRessarcimentoItem[];
  obs: string;
}

export interface Pagamento {
  id: string;
  localId: string;
  valor: number;
  data: string; // YYYY-MM-DD
  de?: string;
  ate?: string;
  obs: string;
}

export interface AppDatabase {
  versao: number;
  config: AppConfig;
  locais: LocalTrabalho[];
  registros: RegistroPonto[];
  pagamentos: Pagamento[];
  trocas: TrocaPlantao[];
  meta: {
    atualizadoEm: string | null;
  };
}

export interface BackgroundSettings {
  imagem: string;
  opacidade: number;
  blur: number;
  dim: number;
}

export interface CalculoRegistro {
  horas: number;
  normais: number;
  extras: number;
  multDia: number;
  valorHora: number;
  valor: number;
  rende: boolean;
  aberto: boolean;
  agendado: boolean;
  troca: boolean;
  feriado: boolean;
  fimDeSemana: boolean;
}

export interface ResumoHoras {
  horas: number;
  normais: number;
  extras: number;
  valor: number;
  quantidade: number;
}

export interface ResumoLocal extends ResumoHoras {
  local: LocalTrabalho;
  pago: number;
  aReceber: number;
}

export interface ResumoTrocaPorLocal {
  local: LocalTrabalho;
  registros: number;
  trabalhadas: number;
  ressarcidas: number;
  saldo: number;
}

export interface SyncState {
  estado: 'idle' | 'enviando' | 'baixando' | 'ok' | 'erro' | 'vazio' | 'local-mais-novo';
  ultimo: string | null;
  erro: string;
  puxadoEm: string | null;
}

export interface ToastMessage {
  id: string;
  msg: string;
  tipo: 'ok' | 'erro';
}

export interface ChatMessage {
  id: string;
  papel: 'user' | 'assistente';
  texto: string;
  arquivos?: string[];
  aviso?: string;
  erro?: boolean;
}
