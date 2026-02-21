import { useEffect, useState } from 'react';
import { Download, X, Monitor, HardDrive } from 'lucide-react';

/**
 * Shown only in browser mode (not inside Electron).
 * Offers:
 *  1. PWA "Add to Home Screen" prompt (if browser supports it)
 *  2. Direct download from backend /downloads/ (if an installer has been placed there)
 *  3. GitHub Releases fallback (if no local installer found)
 */

const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string) ?? 'http://localhost:4000';
const API_ROOT = import.meta.env.DEV ? '' : SERVER_URL;

const isElectron = () =>
  typeof navigator !== 'undefined' &&
  navigator.userAgent.toLowerCase().includes('electron');

type InstallerFile = { name: string; url: string; sizeMB: number; ext: string };

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('sak_install_dismissed') === '1'
  );
  const [installed, setInstalled] = useState(false);
  const [installers, setInstallers] = useState<InstallerFile[]>([]);
  const [loadedInfo, setLoadedInfo] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler as EventListener);
    window.addEventListener('appinstalled', () => setInstalled(true));

    // Check if the backend has a local installer available
    fetch(`${API_ROOT}/api/downloads/info`)
      .then((r) => r.ok ? r.json() : { files: [] })
      .then((data) => {
        setInstallers(data.files ?? []);
        setLoadedInfo(true);
      })
      .catch(() => setLoadedInfo(true));

    return () => {
      window.removeEventListener('beforeinstallprompt', handler as EventListener);
    };
  }, []);

  if (isElectron() || installed || dismissed || !loadedInfo) return null;

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

  // Pick the best installer for the user's OS
  const ua = navigator.userAgent.toLowerCase();
  const preferred = (
    ua.includes('win')   ? installers.find(f => f.ext === '.exe') :
    ua.includes('linux') ? (installers.find(f => f.ext === '.deb') ?? installers.find(f => f.ext === '.AppImage')) :
    ua.includes('mac')   ? installers.find(f => f.ext === '.dmg') : null
  ) ?? installers[0] ?? null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm w-full">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
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

              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {/* 1. PWA install */}
                {deferredPrompt && (
                  <button
                    onClick={handleInstallPWA}
                    className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Download size={12} />
                    Install as Web App
                  </button>
                )}

                {/* 2. Direct download from backend server */}
                {preferred ? (
                  <a
                    href={`${API_ROOT}${preferred.url}`}
                    download={preferred.name}
                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <HardDrive size={12} />
                    Download Desktop ({preferred.sizeMB} MB)
                  </a>
                ) : (
                  /* 3. Fallback: GitHub Releases */
                  !deferredPrompt && (
                    <a
                      href="https://github.com/mayegamustafa/sak-staff/releases/latest"
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 bg-slate-600 hover:bg-slate-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Monitor size={12} />
                      Download Desktop App
                    </a>
                  )
                )}

                <button
                  onClick={handleDismiss}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Not now
                </button>
              </div>

              {preferred && (
                <p className="text-xs text-slate-500 mt-1.5">
                  {preferred.name} · served from this server
                </p>
              )}
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
