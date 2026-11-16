import React, {useEffect} from 'react';
import {X} from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}

export const Modal: React.FC<ModalProps> = ({open, onClose, title, children, footer, wide}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`card pop relative z-10 flex max-h-[92dvh] w-full flex-col rounded-b-none sm:rounded-[20px] ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <h2 id="modal-title" className="text-base font-bold leading-snug">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-transparent text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3.5 pb-[calc(14px+env(safe-area-inset-bottom))] sm:pb-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

interface FieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export const Field: React.FC<FieldProps> = ({label, hint, children, className = ''}) => (
  <div className={className}>
    <label className="label">{label}</label>
    {children}
    {hint && <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">{hint}</p>}
  </div>
);

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = 'Confirmar',
  danger = true,
}) => (
  <Modal
    open={open}
    onClose={onClose}
    title={title}
    footer={
      <>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </>
    }
  >
    <p className="text-sm leading-relaxed text-[var(--text)]">{body}</p>
  </Modal>
);

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  tone?: 'default' | 'ok' | 'warn' | 'danger';
  icon?: React.ReactNode;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  sub,
  accent,
  tone = 'default',
  icon,
}) => {
  const toneColor =
    tone === 'ok'
      ? 'text-[var(--ok)]'
      : tone === 'warn'
        ? 'text-[var(--warn)]'
        : tone === 'danger'
          ? 'text-[var(--danger)]'
          : accent
            ? 'text-[var(--accent)]'
            : 'text-[var(--text)]';

  return (
    <div className="card card-pad flex flex-col justify-between gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[var(--muted)]">{label}</span>
        {icon && <span className="text-[var(--muted)]">{icon}</span>}
      </div>
      <div className={`font-mono text-2xl font-bold tracking-tight tabular-nums ${toneColor}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-[var(--muted)] tabular-nums">{sub}</div>}
    </div>
  );
};

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  desc?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({icon, title, desc, action}) => (
  <div className="card card-pad flex flex-col items-center justify-center py-10 text-center">
    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
      {icon}
    </div>
    <h3 className="text-base font-bold">{title}</h3>
    {desc && <p className="mt-1 max-w-sm text-sm text-[var(--muted)]">{desc}</p>}
    {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
  </div>
);

interface ProgressBarProps {
  value: number;
  max: number;
  color?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({value, max, color}) => {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)] border border-[var(--border)]">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{
          width: `${pct}%`,
          background: color || 'var(--accent)',
        }}
      />
    </div>
  );
};
