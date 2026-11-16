import {AppConfig, AppDatabase} from '../types';

export const SYNC_TABLE = 'horas_sync';

export const SUPABASE_SETUP_SQL = `-- 1) Tabela de sincronização
create table if not exists public.${SYNC_TABLE} (
  code       text primary key,
  payload    jsonb not null,
  updated_at timestamptz not null default now()
);

-- 2) RLS liberada (o segredo é o código de sincronização)
alter table public.${SYNC_TABLE} enable row level security;

drop policy if exists "sync_leitura" on public.${SYNC_TABLE};
create policy "sync_leitura" on public.${SYNC_TABLE}
  for select using (true);

drop policy if exists "sync_escrita" on public.${SYNC_TABLE};
create policy "sync_escrita" on public.${SYNC_TABLE}
  for insert with check (true);

drop policy if exists "sync_atualizacao" on public.${SYNC_TABLE};
create policy "sync_atualizacao" on public.${SYNC_TABLE}
  for update using (true) with check (true);`;

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateSyncCode(len = 12): string {
  let out = '';
  const arr = new Uint32Array(len);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(arr);
  }
  for (let i = 0; i < len; i++) {
    const idx = arr[i] ? arr[i] % CODE_CHARS.length : Math.floor(Math.random() * CODE_CHARS.length);
    out += CODE_CHARS[idx];
  }
  return out.match(/.{1,4}/g)?.join('-') || out;
}

export function cleanSyncCode(code?: string): string {
  return String(code || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function isSyncConfigured(cfg?: Partial<AppConfig> | null): boolean {
  return !!(
    cfg?.syncAtiva &&
    cfg?.syncUrl &&
    cfg?.syncKey &&
    cleanSyncCode(cfg?.syncCode).length >= 6
  );
}

function baseUrl(cfg: Partial<AppConfig>): string {
  return String(cfg.syncUrl || '').trim().replace(/\/+$/, '');
}

function headers(cfg: Partial<AppConfig>) {
  return {
    'Content-Type': 'application/json',
    apikey: cfg.syncKey || '',
    Authorization: `Bearer ${cfg.syncKey || ''}`,
  };
}

async function parseSupabaseError(res: Response): Promise<Error> {
  const txt = await res.text().catch(() => '');
  let detail = txt;
  try {
    const json = JSON.parse(txt);
    detail = json.message || json.hint || json.error_description || txt;
  } catch {
    // keep raw text
  }
  const extra =
    res.status === 401 || res.status === 403
      ? ' Chave (anon) inválida ou RLS bloqueando a tabela — rode o SQL de configuração.'
      : res.status === 404
        ? ' Tabela horas_sync não encontrada — rode o SQL de configuração.'
        : '';
  return new Error(`Supabase respondeu ${res.status}. ${detail}${extra}`);
}

export async function pushToCloud(
  cfg: Partial<AppConfig>,
  db: AppDatabase,
): Promise<{em: string; payload: unknown}> {
  const code = cleanSyncCode(cfg.syncCode);
  const em = new Date().toISOString();
  const payload = {
    locais: db.locais,
    registros: db.registros,
    pagamentos: db.pagamentos,
    trocas: db.trocas || [],
    config: {
      nome: db.config.nome,
      tema: db.config.tema,
      accent: db.config.accent,
      metaMensal: db.config.metaMensal,
      extraPercent: db.config.extraPercent,
      feriadoMult: db.config.feriadoMult,
      valorHoraPadrao: db.config.valorHoraPadrao,
      documento: db.config.documento || '',
      registroProfissional: db.config.registroProfissional || '',
      chavePix: db.config.chavePix || '',
      assinatura: db.config.assinatura || '',
    },
    meta: {...db.meta, atualizadoEm: em},
  };

  const url = `${baseUrl(cfg)}/rest/v1/${SYNC_TABLE}?on_conflict=code`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...headers(cfg),
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({code, payload, updated_at: em}),
  });
  if (!res.ok) throw await parseSupabaseError(res);
  return {em, payload};
}

export async function pullFromCloud(
  cfg: Partial<AppConfig>,
): Promise<{payload: Partial<AppDatabase>; em: string | null} | null> {
  const code = cleanSyncCode(cfg.syncCode);
  const url = `${baseUrl(cfg)}/rest/v1/${SYNC_TABLE}?code=eq.${encodeURIComponent(code)}&select=payload,updated_at`;
  const res = await fetch(url, {headers: headers(cfg)});
  if (!res.ok) throw await parseSupabaseError(res);
  const data = await res.json().catch(() => []);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.payload) return null;
  return {
    payload: row.payload,
    em: row.updated_at || row.payload?.meta?.atualizadoEm || null,
  };
}
