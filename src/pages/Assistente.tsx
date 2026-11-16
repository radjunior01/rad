import React, {useMemo, useRef, useState} from 'react';
import {FileText, Send, Sparkles} from 'lucide-react';
import {useStore} from '../context/StoreContext';
import {ChatMessage} from '../types';
import {
  answerLocally,
  askExternalAI,
  getAIStatus,
  isAIConfigured,
} from '../utils/assistant';
import {
  filterByMonth,
  genId,
  isTrocaLocal,
  sumPagamentos,
  summarizeRegistros,
} from '../utils/calc';
import {
  formatMesRefLabel,
  hojeISO,
  mesAtualRef,
  monthEnd,
  monthStart,
  normalizeText,
} from '../utils/format';
import {buildHoursOnlyPDF, buildReceiptPDF} from '../utils/pdf';

const renderFormattedText = (text: string) => {
  const lines = String(text || '').split('\n');
  return lines.map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return (
      <p key={i} className={i > 0 ? 'mt-1.5' : ''}>
        {parts.map((part, j) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={j}>{part.slice(2, -2)}</strong>;
          }
          if (part.startsWith('`') && part.endsWith('`')) {
            return (
              <code
                key={j}
                className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-xs"
              >
                {part.slice(1, -1)}
              </code>
            );
          }
          return <React.Fragment key={j}>{part}</React.Fragment>;
        })}
      </p>
    );
  });
};

export const Assistente: React.FC = () => {
  const {db, config, locais, registros, pagamentos, toast} = useStore();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [sugestoes, setSugestoes] = useState<string[]>(() => [
    'Quanto vou receber este mês?',
    'Tenho algo atrasado?',
    'Como estão minhas trocas?',
    'Quais foram meus melhores meses?',
    'Esqueci algum ponto aberto?',
  ]);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: genId(),
      papel: 'assistente',
      texto:
        'Pergunte sobre suas horas, valores a receber, atrasos ou peça um **recibo em PDF** ou **espelho de horas**. Funciona mesmo offline!',
    },
  ]);

  const listEndRef = useRef<HTMLDivElement | null>(null);
  const aiStatus = useMemo(() => getAIStatus(config), [config]);

  const scrollToBottom = () => {
    setTimeout(() => listEndRef.current?.scrollIntoView({behavior: 'smooth'}), 50);
  };

  const ask = async (questionText: string) => {
    const q = questionText.trim();
    if (!q || busy) return;

    const userMsg: ChatMessage = {id: genId(), papel: 'user', texto: q};
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setBusy(true);
    scrollToBottom();

    const downloadedFiles: string[] = [];

    try {
      if (isAIConfigured(config) && navigator.onLine) {
        try {
          const aiRes = await askExternalAI({pergunta: q, dados: db, config});
          let aviso = '';

          const locaisFaturaveis = locais.filter((l) => !isTrocaLocal(l));
          if (aiRes.recibo && locaisFaturaveis.length) {
            const targetMes = aiRes.recibo.mes || mesAtualRef();
            const normName = normalizeText(aiRes.recibo.local || '');
            const loc =
              (normName &&
                locaisFaturaveis.find((l) =>
                  normalizeText(l.nome).includes(normName),
                )) ||
              locaisFaturaveis[0];
            if (loc) {
              const de = monthStart(targetMes);
              const ate = monthEnd(targetMes);
              const list = filterByMonth(registros, targetMes).filter(
                (r) =>
                  r.localId === loc.id &&
                  !r.agendado &&
                  r.troca_plantao !== 'compensado',
              );
              const sum = summarizeRegistros(list, [loc], config);
              const pago = sumPagamentos(
                pagamentos.filter((p) => p.data >= de && p.data <= ate),
                loc.id,
              );
              const doc = buildReceiptPDF({
                config,
                local: loc,
                registros: list,
                de,
                ate,
                pago,
                total: sum.valor,
              });
              const filename = `recibo-${loc.nome.toLowerCase().replace(/\s+/g, '-')}-${targetMes}.pdf`;
              doc.save(filename);
              downloadedFiles.push(filename);
              toast(`Recibo ${filename} baixado.`);
            } else {
              aviso = 'Não encontrei o local pedido para gerar o recibo.';
            }
          }

          const textoFinal =
            aiRes.resposta?.trim() ||
            (downloadedFiles.length
              ? `Pronto! Gere${downloadedFiles.length > 1 ? 'i os arquivos' : 'i o arquivo'}: ${downloadedFiles.join(', ')}.`
              : '');

          if (!textoFinal) {
            throw new Error('O provedor devolveu uma resposta em branco.');
          }

          setMessages((prev) => [
            ...prev,
            {
              id: genId(),
              papel: 'assistente',
              texto: textoFinal,
              arquivos: downloadedFiles.length ? downloadedFiles : undefined,
              aviso: aviso || undefined,
            },
          ]);
          setBusy(false);
          scrollToBottom();
          return;
        } catch (err) {
          const fallback = answerLocally(q, db, hojeISO());
          const errMsg = err instanceof Error ? err.message : 'Erro na IA externa.';
          setMessages((prev) => [
            ...prev,
            {
              id: genId(),
              papel: 'assistente',
              texto:
                fallback.texto?.trim() ||
                'Não consegui obter resposta da IA externa nem gerar um resumo local.',
              aviso: `IA externa indisponível (${errMsg}) — resposta pelo motor local.`,
            },
          ]);
          if (fallback.sugestoes?.length) setSugestoes(fallback.sugestoes);
          setBusy(false);
          scrollToBottom();
          return;
        }
      }

      const localRes = answerLocally(q, db, hojeISO());
      if (localRes.recibos?.length) {
        for (const r of localRes.recibos) {
          const doc = buildReceiptPDF({
            config,
            local: r.local,
            registros: r.registros,
            de: r.de,
            ate: r.ate,
            pago: r.pago,
            total: r.total,
          });
          const filename = `recibo-${r.local.nome.toLowerCase().replace(/\s+/g, '-')}-${r.de}.pdf`;
          doc.save(filename);
          downloadedFiles.push(filename);
        }
        toast(`${downloadedFiles.length} recibo(s) baixado(s).`);
      }

      if (localRes.relatorios?.length) {
        for (const rel of localRes.relatorios) {
          const doc = buildHoursOnlyPDF({
            config,
            registros,
            locais,
            selecionados: rel.selecionados,
            de: rel.de,
            ate: rel.ate,
            incluirObs: true,
          });
          const filename = `espelho-horas-${rel.de}-a-${rel.ate}.pdf`;
          doc.save(filename);
          downloadedFiles.push(filename);
        }
        toast('Espelho de horas baixado.');
      }

      if (localRes.sugestoes?.length) {
        setSugestoes(localRes.sugestoes);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: genId(),
          papel: 'assistente',
          texto:
            localRes.texto?.trim() ||
            'Não encontrei informações suficientes para responder a essa pergunta.',
          arquivos: downloadedFiles.length ? downloadedFiles : undefined,
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado ao responder.';
      setMessages((prev) => [
        ...prev,
        {
          id: genId(),
          papel: 'assistente',
          texto: `Não consegui processar sua pergunta agora (${msg}).`,
          erro: true,
        },
      ]);
    } finally {
      setBusy(false);
      scrollToBottom();
    }
  };

  const locaisFaturaveis = useMemo(
    () => locais.filter((l) => !isTrocaLocal(l)),
    [locais],
  );

  const quickRecibo = locaisFaturaveis[0]
    ? `Recibo de ${locaisFaturaveis[0].nome} de ${formatMesRefLabel(mesAtualRef())}`
    : 'Quanto vou receber este mês?';

  return (
    <div className="space-y-4">
      {/* Header / Quick Actions */}
      <section className="card card-pad flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-base font-bold">
            <Sparkles className="h-5 w-5 text-[var(--accent)]" />
            <span>Assistente de horas</span>
          </div>
          <p className="text-xs text-[var(--muted)]">
            Modo atual:{' '}
            <strong
              className={
                aiStatus.nivel === 'ok'
                  ? 'text-[var(--ok)]'
                  : aiStatus.nivel === 'erro'
                    ? 'text-[var(--danger)]'
                    : 'text-[var(--text)]'
              }
            >
              {aiStatus.texto}
            </strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-soft min-h-[40px] px-3 text-xs"
            onClick={() => ask(quickRecibo)}
          >
            <FileText className="h-3.5 w-3.5" />
            Recibo do mês
          </button>
          <button
            type="button"
            className="btn btn-ghost min-h-[40px] px-3 text-xs"
            onClick={() => ask('Quanto vou receber este mês?')}
          >
            Resumo do mês
          </button>
        </div>
      </section>

      {/* Conversation */}
      <section className="card flex min-h-[380px] max-h-[60dvh] flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.papel === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[75%] ${
                  m.papel === 'user'
                    ? 'bg-[var(--accent)] text-[var(--accent-text)]'
                    : 'border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]'
                }`}
              >
                {renderFormattedText(m.texto)}
                {m.arquivos && m.arquivos.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-[var(--border)] pt-2 text-xs font-semibold text-[var(--ok)]">
                    {m.arquivos.map((f) => (
                      <span key={f} className="inline-flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" />
                        {f}
                      </span>
                    ))}
                  </div>
                )}
                {m.aviso && (
                  <div className="mt-2 text-xs text-[var(--warn)]">{m.aviso}</div>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 text-xs text-[var(--muted)]">
                Analisando seus registros...
              </div>
            </div>
          )}
          <div ref={listEndRef} />
        </div>

        {/* Suggestions */}
        {sugestoes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-[var(--border)] px-4 py-2.5">
            {sugestoes.map((s) => (
              <button
                key={s}
                type="button"
                className="btn btn-ghost min-h-[34px] px-3 py-1 text-xs"
                onClick={() => ask(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="flex items-center gap-2 border-t border-[var(--border)] p-3"
        >
          <input
            type="text"
            className="input flex-1"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='Ex.: "Gera o recibo deste mês" ou "Tenho algo atrasado?"'
          />
          <button
            type="submit"
            className="btn btn-primary min-h-[42px] px-4"
            disabled={busy || !input.trim()}
            aria-label="Enviar mensagem"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </section>
    </div>
  );
};
