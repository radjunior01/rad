import {useCallback, useEffect, useRef, useState} from 'react';
import {registerSW} from 'virtual:pwa-register';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{outcome: 'accepted' | 'dismissed'; platform: string}>;
}

function checkStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.matchMedia?.('(display-mode: fullscreen)').matches === true ||
    (window.navigator as Navigator & {standalone?: boolean}).standalone === true
  );
}

function checkIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [instalado, setInstalado] = useState<boolean>(checkStandalone);
  const [ios] = useState<boolean>(checkIOS);
  const [offlinePronto, setOfflinePronto] = useState(false);
  const [temAtualizacao, setTemAtualizacao] = useState(false);
  const [verificandoAtualizacao, setVerificandoAtualizacao] = useState(false);
  const [updateSWFn, setUpdateSWFn] = useState<((reload?: boolean) => Promise<void>) | null>(null);

  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const lastCheckRef = useRef<number>(0);
  const reloadingRef = useRef<boolean>(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalado(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (!window.location.protocol.startsWith('http')) return;

    let hadController = !!navigator.serviceWorker.controller;

    const onControllerChange = () => {
      if (!hadController) {
        hadController = true;
        return;
      }
      if (reloadingRef.current) return;
      reloadingRef.current = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const updateSW = registerSW({
      immediate: true,
      onOfflineReady() {
        setOfflinePronto(true);
      },
      onNeedRefresh() {
        setTemAtualizacao(true);
      },
      onRegisteredSW(_swUrl, registration) {
        if (registration) {
          registrationRef.current = registration;
        }
        if (registration?.active || navigator.serviceWorker.controller) {
          setOfflinePronto(true);
        }
      },
    });
    setUpdateSWFn(() => updateSW);

    navigator.serviceWorker.ready
      .then((reg) => {
        registrationRef.current = reg;
        if (reg.active || navigator.serviceWorker.controller) {
          setOfflinePronto(true);
        }
      })
      .catch(() => {});

    const checkOnResume = () => {
      if (document.visibilityState === 'hidden') return;
      if (navigator.onLine === false) return;
      const now = Date.now();
      if (now - lastCheckRef.current < 30_000) return;
      lastCheckRef.current = now;
      registrationRef.current?.update().catch(() => {});
    };

    document.addEventListener('visibilitychange', checkOnResume);
    window.addEventListener('focus', checkOnResume);
    window.addEventListener('online', checkOnResume);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', checkOnResume);
      window.removeEventListener('focus', checkOnResume);
      window.removeEventListener('online', checkOnResume);
    };
  }, []);

  const instalar = useCallback(async (): Promise<{ok: boolean; motivo?: string}> => {
    if (!deferredPrompt) return {ok: false, motivo: 'sem-prompt'};
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (choice.outcome === 'accepted') {
      setInstalado(true);
      return {ok: true};
    }
    return {ok: false, motivo: 'recusado'};
  }, [deferredPrompt]);

  const aplicarAtualizacao = useCallback(() => {
    if (updateSWFn) {
      updateSWFn(true);
    } else {
      window.location.reload();
    }
  }, [updateSWFn]);

  const verificarAtualizacao = useCallback(async (): Promise<{
    status: 'atualizando' | 'atualizado' | 'indisponivel' | 'erro';
  }> => {
    if (
      typeof navigator === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !window.location.protocol.startsWith('http')
    ) {
      return {status: 'indisponivel'};
    }
    if (navigator.onLine === false) {
      return {status: 'erro'};
    }

    setVerificandoAtualizacao(true);
    try {
      const reg = registrationRef.current ?? (await navigator.serviceWorker.getRegistration());
      if (!reg) {
        return {status: 'indisponivel'};
      }
      registrationRef.current = reg;
      lastCheckRef.current = Date.now();
      await reg.update();

      if (reg.waiting) {
        setTemAtualizacao(true);
        if (updateSWFn) {
          await updateSWFn(true);
        } else {
          reg.waiting.postMessage({type: 'SKIP_WAITING'});
        }
        return {status: 'atualizando'};
      }

      if (reg.installing) {
        const sw = reg.installing;
        const foundUpdate = await new Promise<boolean>((resolve) => {
          const timer = window.setTimeout(() => resolve(true), 4000);
          const onState = () => {
            if (sw.state === 'installed' || sw.state === 'activated') {
              window.clearTimeout(timer);
              sw.removeEventListener('statechange', onState);
              resolve(true);
            } else if (sw.state === 'redundant') {
              window.clearTimeout(timer);
              sw.removeEventListener('statechange', onState);
              resolve(false);
            }
          };
          sw.addEventListener('statechange', onState);
        });
        if (foundUpdate) {
          setTemAtualizacao(true);
          return {status: 'atualizando'};
        }
      }

      return {status: 'atualizado'};
    } catch {
      return {status: 'erro'};
    } finally {
      setVerificandoAtualizacao(false);
    }
  }, [updateSWFn]);

  const forcarRecarregamento = useCallback(async () => {
    if (navigator.onLine === false) {
      window.location.reload();
      return;
    }
    try {
      if ('caches' in window) {
        const keys = await window.caches.keys();
        await Promise.all(keys.map((k) => window.caches.delete(k)));
      }
      const reg = registrationRef.current ?? (await navigator.serviceWorker?.getRegistration?.());
      await reg?.update();
    } catch {
      // ignora erros ao limpar caches e segue para reload
    }
    window.location.reload();
  }, []);

  return {
    instalado,
    podeInstalar: !!deferredPrompt,
    ios,
    offlinePronto,
    temAtualizacao,
    verificandoAtualizacao,
    instalar,
    aplicarAtualizacao,
    verificarAtualizacao,
    forcarRecarregamento,
  };
}
