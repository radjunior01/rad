import React, {useState} from 'react';
import {Link} from 'react-router-dom';
import {Image as ImageIcon, Palette, SlidersHorizontal, Trash2} from 'lucide-react';
import {Field} from '../components/UI';
import {useStore} from '../context/StoreContext';
import {AccentKey, BackgroundSettings, ThemeMode} from '../types';
import {
  ACCENT_PALETTES,
  clearBackgroundSettings,
  compressBackgroundImage,
  loadBackgroundSettings,
  saveBackgroundSettings,
  WALLPAPER_DEFAULTS,
} from '../utils/storage';

export const Aparencia: React.FC = () => {
  const {config, patchConfig, toast} = useStore();
  const [bg, setBg] = useState<BackgroundSettings | null>(loadBackgroundSettings);

  const updateBg = (next: BackgroundSettings | null) => {
    try {
      if (!next) {
        clearBackgroundSettings();
        setBg(null);
      } else {
        saveBackgroundSettings(next);
        setBg(next);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao salvar imagem.', 'erro');
    }
  };

  const handleUploadWallpaper = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await compressBackgroundImage(file);
      updateBg({
        imagem: dataUrl,
        opacidade: bg?.opacidade ?? WALLPAPER_DEFAULTS.opacidade,
        blur: bg?.blur ?? WALLPAPER_DEFAULTS.blur,
        dim: bg?.dim ?? WALLPAPER_DEFAULTS.dim,
      });
      toast('Papel de parede atualizado.');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Imagem inválida.', 'erro');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Palette className="h-5 w-5 text-[var(--accent)]" />
            Tema e aparência
          </h2>
          <p className="text-xs text-[var(--muted)]">
            Personalize seu nome, esquema de cores e imagem de fundo.
          </p>
        </div>

        <Link to="/configuracoes" className="btn btn-soft min-h-[40px] text-xs">
          <SlidersHorizontal className="h-4 w-4" />
          Configurações de funções
        </Link>
      </div>

      {/* Perfil e Tema */}
      <section className="card card-pad space-y-4">
        <h3 className="text-base font-bold">Perfil e tema</h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Seu nome (aparece nos relatórios PDF)">
            <input
              type="text"
              className="input"
              value={config.nome}
              onChange={(e) => patchConfig({nome: e.target.value})}
              placeholder="Ex.: Maria Silva"
            />
          </Field>

          <Field label="Tema">
            <div className="grid grid-cols-3 gap-2">
              {(['claro', 'escuro', 'sistema'] as ThemeMode[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => patchConfig({tema: t})}
                  className={`btn min-h-[42px] capitalize ${
                    config.tema === t ? 'btn-primary' : 'btn-ghost'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <Field label="Cor de destaque">
          <div className="flex flex-wrap gap-2.5">
            {(Object.keys(ACCENT_PALETTES) as AccentKey[]).map((key) => {
              const p = ACCENT_PALETTES[key];
              const active = config.accent === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => patchConfig({accent: key})}
                  className={`flex min-h-[40px] items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                    active
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'border-[var(--border)] bg-[var(--surface-2)]'
                  }`}
                >
                  <span className="h-3.5 w-3.5 rounded-full" style={{background: p.hex}} />
                  {p.nome}
                </button>
              );
            })}
          </div>
        </Field>
      </section>

      {/* Papel de parede */}
      <section className="card card-pad space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold">Imagem de fundo</h3>
            <p className="text-xs text-[var(--muted)]">
              Fica salva apenas neste aparelho.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="btn btn-soft cursor-pointer text-xs">
              <ImageIcon className="h-4 w-4" />
              Escolher foto
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleUploadWallpaper}
              />
            </label>
            {bg && (
              <button
                type="button"
                className="btn btn-danger text-xs"
                onClick={() => {
                  updateBg(null);
                  toast('Imagem removida.');
                }}
              >
                <Trash2 className="h-4 w-4" />
                Remover
              </button>
            )}
          </div>
        </div>

        {bg && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label={`Opacidade (${bg.opacidade}%)`}>
              <input
                type="range"
                min="10"
                max="100"
                value={bg.opacidade}
                onChange={(e) => updateBg({...bg, opacidade: Number(e.target.value)})}
                className="w-full accent-[var(--accent)]"
              />
            </Field>
            <Field label={`Desfoque (${bg.blur}px)`}>
              <input
                type="range"
                min="0"
                max="20"
                value={bg.blur}
                onChange={(e) => updateBg({...bg, blur: Number(e.target.value)})}
                className="w-full accent-[var(--accent)]"
              />
            </Field>
            <Field label={`Contraste (${bg.dim}%)`}>
              <input
                type="range"
                min="0"
                max="80"
                value={bg.dim}
                onChange={(e) => updateBg({...bg, dim: Number(e.target.value)})}
                className="w-full accent-[var(--accent)]"
              />
            </Field>
          </div>
        )}
      </section>
    </div>
  );
};
