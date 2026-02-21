import React, { useEffect, useState } from 'react';
import { Download, X, Monitor } from 'lucide-react';

/**
 * Shown only in browser mode (not inside Electron).
 * Offers PWA install prompt or a link to download the desktop app.
 */

const isElectron = () =>
  typeof navigator !== 'undefined' &&
  navigator.userAgent.toLowerCase().includes('electron');

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('sak_install_dismissed') === '1'
  );
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Track PWA "Add to Home Screen" prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler as EventListener);

    // Hide banner if already installed as PWA
    window.addEventListener('appinstalled', () => setInstalled(true));

    return () => {
      window.removeEventListener('beforeinstallprompt', handler as EventListener);
    };
  }, []);

  // Don't render inside Electron, after PWA install, or if dismissed
  if (isElectron() || installed || dismissed) return null;

  const handleInstallPWA = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setInstalled(true);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('sak_install_dismissed', '1');
    setDismissed(true);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm w-full">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Top stripe */}
        <div className="h-1 bg-gradient-to-r from-brand-600 to-brand-400" />

        <div className="p-4">
          <div className="flex items-start gap-3">
            <img src="/sak.jpg" alt="SAK" className="w-12 h-12 rounded-xl flex-shrink-0 object-cover" />

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white leading-tight">
                Get the Desktop App
              </p>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                Install SAK Staff on your computer for full offline support, faster access and automatic sync.
              </p>

              <div className="flex items-center gap-2 mt-3">
                {deferredPrompt ? (
                  <button
                    onClick={handleInstallPWA}
                    className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Download size={12} />
                    Install App
                  </button>
                ) : (
                  <a
                    href="https://github.com/sakschools/sak-staff/releases/latest"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Monitor size={12} />
                    Download Desktop App
                  </a>
                )}
                <button
                  onClick={handleDismiss}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Not now
                </button>
              </div>
            </div>

            <button
              onClick={handleDismiss}
              className="text-slate-600 hover:text-slate-400 transition-colors flex-shrink-0 -mt-1 -mr-1"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
