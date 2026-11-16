import React from 'react';
import {NavLink, useLocation} from 'react-router-dom';
import {
  ArrowLeftRight,
  BarChart3,
  Calendar,
  Clock,
  MapPin,
  Moon,
  Palette,
  SlidersHorizontal,
  Sparkles,
  Sun,
} from 'lucide-react';
import {useStore} from '../context/StoreContext';
import {OfflineIndicator, PWAInstallButton} from './PWAInstallPrompt';

const NAV_ITEMS = [
  {to: '/dashboard', label: 'Ponto', mobileLabel: 'Ponto', icon: Clock},
  {to: '/locais', label: 'Locais', mobileLabel: 'Locais', icon: MapPin},
  {to: '/calendario', label: 'Calendário', mobileLabel: 'Agenda', icon: Calendar},
  {to: '/trocas', label: 'Trocas de plantão', mobileLabel: 'Trocas', icon: ArrowLeftRight},
  {to: '/totais', label: 'Totais', mobileLabel: 'Totais', icon: BarChart3},
  {to: '/assistente', label: 'Assistente', mobileLabel: 'Assist.', icon: Sparkles},
  {to: '/aparencia', label: 'Tema e aparência', mobileLabel: 'Tema', icon: Palette},
  {to: '/configuracoes', label: 'Configurações', mobileLabel: 'Config.', icon: SlidersHorizontal},
];

export const Layout: React.FC<{children: React.ReactNode}> = ({children}) => {
  const {config, patchConfig} = useStore();
  const location = useLocation();

  const isDark =
    config.tema === 'escuro' ||
    (config.tema === 'sistema' &&
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  const toggleTheme = () => {
    patchConfig({tema: isDark ? 'claro' : 'escuro'});
  };

  const todayFormatted = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  const currentNav = NAV_ITEMS.find((item) => location.pathname.startsWith(item.to));

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[248px_1fr]">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:flex-col md:justify-between md:border-r md:border-[var(--border)] md:bg-[var(--surface)]/95 md:px-4 md:py-5 md:sticky md:top-0 md:h-dvh">
        <div>
          <div className="mb-6 flex items-center gap-3 px-2">
            <img
              src="./pwa-192x192.png"
              alt="rad TunoPay"
              className="h-10 w-10 shrink-0 rounded-xl border border-[var(--border)] object-cover shadow-sm"
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold leading-tight">rad TunoPay</div>
              <div className="truncate text-xs text-[var(--muted)]">
                {config.nome ? config.nome : 'Ponto & ganhos'}
              </div>
            </div>
          </div>

          <nav className="space-y-1" aria-label="Navegação principal">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3.5 text-xs leading-relaxed text-[var(--muted)]">
          Seus dados ficam salvos offline neste dispositivo. Faça backup em{' '}
          <strong className="text-[var(--text)]">Configurações</strong> sempre que quiser.
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-3 px-4 py-3 md:px-7">
            <div className="flex min-w-0 items-center gap-2.5">
              <img
                src="./pwa-192x192.png"
                alt="rad TunoPay"
                className="h-9 w-9 shrink-0 rounded-xl border border-[var(--border)] object-cover md:hidden"
              />
              <div className="min-w-0">
                <h1 className="truncate text-sm font-bold md:text-base">
                  {currentNav?.label || 'rad TunoPay'}
                </h1>
                <p className="truncate text-xs capitalize text-[var(--muted)]">
                  {config.nome ? `${config.nome} · ${todayFormatted}` : todayFormatted}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <PWAInstallButton />
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={isDark ? 'Usar tema claro' : 'Usar tema escuro'}
                title={isDark ? 'Tema claro' : 'Tema escuro'}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--accent)]"
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <NavLink
                to="/aparencia"
                aria-label="Tema e aparência"
                title="Tema e aparência"
                className={({isActive}) =>
                  `flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border md:hidden ${
                    isActive
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]'
                  }`
                }
              >
                <Palette className="h-4 w-4" />
              </NavLink>
              <NavLink
                to="/configuracoes"
                aria-label="Configurações de funções"
                title="Configurações de funções"
                className={({isActive}) =>
                  `flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border md:hidden ${
                    isActive
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]'
                  }`
                }
              >
                <SlidersHorizontal className="h-4 w-4" />
              </NavLink>
            </div>
          </div>
        </header>

        <OfflineIndicator />

        <main className="page w-full flex-1">{children}</main>

        {/* Mobile Bottom Navigation */}
        <nav
          aria-label="Menu rápido"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--surface)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
        >
          <div className="grid grid-cols-6">
            {NAV_ITEMS.slice(0, 6).map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({isActive}) =>
                    `flex min-h-[54px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-semibold whitespace-nowrap ${
                      isActive ? 'text-[var(--accent)]' : 'text-[var(--muted)]'
                    }`
                  }
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  <span className="truncate">{item.mobileLabel}</span>
                </NavLink>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
};
