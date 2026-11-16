import {getApp, getApps, initializeApp} from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import {AppConfig, LocalTrabalho, RegistroPonto} from '../types';
import {calcRegistro} from './calc';
import {formatCurrencyBRL, formatHours} from './format';

export const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  provider.addScope(scope);
}

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export class GoogleAuthExpiredError extends Error {
  constructor(message = 'Sessão do Google expirada. Conecte novamente para continuar.') {
    super(message);
    this.name = 'GoogleAuthExpiredError';
  }
}

export function initGoogleAuth(
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: (user: User | null) => void,
) {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user && cachedAccessToken) {
      onAuthSuccess?.(user, cachedAccessToken);
    } else if (!isSigningIn) {
      if (!user) cachedAccessToken = null;
      onAuthFailure?.(user);
    }
  });
}

export async function googleSignIn(): Promise<{user: User; accessToken: string}> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Não foi possível obter a permissão de acesso ao Google Calendar.');
    }
    cachedAccessToken = credential.accessToken;
    return {user: result.user, accessToken: cachedAccessToken};
  } finally {
    isSigningIn = false;
  }
}

export async function getGoogleAccessToken(): Promise<string | null> {
  return cachedAccessToken;
}

export async function googleSignOut(): Promise<void> {
  cachedAccessToken = null;
  await auth.signOut();
}

export function clearCachedGoogleToken(): void {
  cachedAccessToken = null;
}

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

export interface CalendarEventPayload {
  summary: string;
  description: string;
  start: {dateTime: string; timeZone: string};
  end: {dateTime: string; timeZone: string};
  reminders: {useDefault: boolean};
  extendedProperties: {
    private: {
      radTunopayId: string;
    };
  };
}

export function buildCalendarEventPayload(
  reg: RegistroPonto,
  local: LocalTrabalho | null,
  config: AppConfig,
): CalendarEventPayload {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
  const startTime = reg.entrada || '08:00';
  let endDate = reg.data;
  let endTime = reg.saida;

  if (!endTime) {
    const plus1h = addMinutesToHHMM(startTime, 60);
    endTime = plus1h.hhmm;
    if (plus1h.dayOffset > 0) {
      endDate = addDaysISO(reg.data, plus1h.dayOffset);
    }
  } else if (endTime <= startTime) {
    endDate = addDaysISO(reg.data, 1);
  }

  const calc = calcRegistro(reg, local, config);
  const lines: string[] = [
    `Local: ${local?.nome || 'Local não informado'}`,
    `Horário: ${startTime} às ${reg.saida || endTime}`,
  ];
  if (calc.horas > 0) {
    lines.push(`Duração prevista: ${formatHours(calc.horas)}`);
  }
  if (reg.pausa_min > 0) {
    lines.push(`Pausa: ${reg.pausa_min} min`);
  }
  if (reg.feriado) {
    lines.push('Feriado: Sim');
  }
  if (calc.valor > 0) {
    lines.push(`Previsão: ${formatCurrencyBRL(calc.valor)}`);
  }
  if (reg.obs) {
    lines.push(`Observações: ${reg.obs}`);
  }
  lines.push('', 'Sincronizado via rad TunoPay');

  return {
    summary: `[Plantão] ${local?.nome || 'Turno agendado'}`,
    description: lines.join('\n'),
    start: {
      dateTime: `${reg.data}T${startTime}:00`,
      timeZone,
    },
    end: {
      dateTime: `${endDate}T${endTime}:00`,
      timeZone,
    },
    reminders: {useDefault: true},
    extendedProperties: {
      private: {
        radTunopayId: reg.id,
      },
    },
  };
}

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

async function parseCalendarError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as {error?: {message?: string}};
    return body?.error?.message || `Erro ${res.status} no Google Calendar.`;
  } catch {
    return `Erro ${res.status} no Google Calendar.`;
  }
}

export async function createCalendarEvent(
  accessToken: string,
  reg: RegistroPonto,
  local: LocalTrabalho | null,
  config: AppConfig,
): Promise<{id: string; htmlLink?: string}> {
  const payload = buildCalendarEventPayload(reg, local, config);
  const res = await fetch(CALENDAR_API_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) {
    clearCachedGoogleToken();
    throw new GoogleAuthExpiredError();
  }
  if (!res.ok) {
    throw new Error(await parseCalendarError(res));
  }
  const data = (await res.json()) as {id: string; htmlLink?: string};
  return {id: data.id, htmlLink: data.htmlLink};
}

export async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  reg: RegistroPonto,
  local: LocalTrabalho | null,
  config: AppConfig,
): Promise<{id: string; htmlLink?: string}> {
  const payload = buildCalendarEventPayload(reg, local, config);
  const res = await fetch(`${CALENDAR_API_BASE}/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) {
    clearCachedGoogleToken();
    throw new GoogleAuthExpiredError();
  }
  if (res.status === 404 || res.status === 410) {
    return createCalendarEvent(accessToken, reg, local, config);
  }
  if (!res.ok) {
    throw new Error(await parseCalendarError(res));
  }
  const data = (await res.json()) as {id: string; htmlLink?: string};
  return {id: data.id, htmlLink: data.htmlLink};
}

export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string,
): Promise<void> {
  const res = await fetch(`${CALENDAR_API_BASE}/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (res.status === 401) {
    clearCachedGoogleToken();
    throw new GoogleAuthExpiredError();
  }
  if (res.status === 404 || res.status === 410 || res.status === 204 || res.ok) {
    return;
  }
  throw new Error(await parseCalendarError(res));
}
