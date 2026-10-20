/**
 * Helpers for the print/report pop-ups that are built as HTML strings.
 *
 * Those pop-ups share this app's origin, so a script smuggled into staff data
 * (names, addresses… some of which arrive through the public onboarding form)
 * would run with the signed-in user's session. Two layers stop that:
 *   1. escapeHtml() on interpolated values;
 *   2. writePrintDocument() injects a Content-Security-Policy that forbids all
 *      scripts and inline event handlers in the pop-up, whatever slips through.
 */

export function escapeHtml(val: unknown): string {
  if (val == null) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function printCsp(): string {
  const origin = window.location.origin && window.location.origin !== 'null' ? ` ${window.location.origin}` : '';
  return [
    "default-src 'none'",
    "script-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com data:',
    `img-src 'self'${origin} data: blob: file:`,
  ].join('; ');
}

/**
 * Write a complete HTML document into a pop-up with the CSP above injected as
 * the first thing in <head>. Elements marked `data-print-button` get a click
 * handler from here, since inline onclick attributes are blocked.
 */
export function writePrintDocument(win: Window, html: string): void {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${printCsp()}">`;
  const headTag = /<head(\s[^>]*)?>/i;
  const safe = headTag.test(html) ? html.replace(headTag, (m) => m + meta) : meta + html;

  // Sever the back-reference so the pop-up can never drive this window.
  try { win.opener = null; } catch { /* ignore */ }
  win.document.open();
  win.document.write(safe);
  win.document.close();
  win.document.querySelectorAll('[data-print-button]').forEach((btn) => {
    btn.addEventListener('click', () => win.print());
  });
}
