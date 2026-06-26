/**
 * Label printing utilities for StockDesk Pro.
 * Supports real Code 128 barcodes via JsBarcode (loaded from cdnjs in print window).
 * Compatible with Zebra / ZDesigner printers when driver scaling = 100%.
 */
import type { LabelProfile } from './demoData';

export interface LabelData {
  productName: string;
  variantLabel: string;
  ourColorNumber?: string;
  barcode?: string;
  shopName?: string;
  qty?: number;
  uom?: string;
  price?: number;      // only rendered if profile.showPrice && showPriceAllowed
  currency?: string;
}

// ── Unit helpers ───────────────────────────────────────────────────────────────
function mm(v: number, unit: 'mm' | 'in'): string {
  return unit === 'mm' ? `${v}mm` : `${(v / 25.4).toFixed(4)}in`;
}

// ── Generate a real Code 128 SVG barcode string using JsBarcode in-browser ───
// This is called from inside the React component for the live preview.
// JsBarcode writes into a DOM SVG element — we extract the outerHTML.
export function generateBarcodeSvg(
  code: string,
  heightMm: number,
  widthScale: number,
  showText: boolean,
): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const JsBarcode = (window as any).JsBarcode;
    if (!JsBarcode) return _fallbackBarcode(code, heightMm, showText);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, code, {
      format: 'CODE128',
      width: Math.max(1, Math.round(widthScale)),
      height: Math.round(heightMm * 3.7795), // mm → px @ 96dpi
      displayValue: showText,
      fontOptions: 'bold',
      fontSize: 10,
      margin: 0,
      background: 'transparent',
    });
    svg.setAttribute('style', `width:100%;height:${heightMm}mm;display:block;`);
    return svg.outerHTML;
  } catch {
    return _fallbackBarcode(code, heightMm, showText);
  }
}

function _fallbackBarcode(code: string, heightMm: number, showText: boolean): string {
  return `<div style="font-family:monospace;font-size:10px;height:${heightMm}mm;display:flex;align-items:center;justify-content:center;border:1px solid #ccc;padding:2px;">
    <span style="letter-spacing:3px;font-weight:bold;">${code}</span>
  </div>${showText ? `<div style="font-size:8px;text-align:center;letter-spacing:1px;">${code}</div>` : ''}`;
}

// ── Build the print-window HTML ───────────────────────────────────────────────
// JsBarcode is loaded from cdnjs (allowed domain) and runs on the print
// window's DOM — generating real Code 128 barcodes on <svg id="bc-N"> elements.
export function buildLabelHtml(
  data: LabelData,
  profile: LabelProfile,
  copies: number,
  showPriceAllowed: boolean,
): string {
  const W = mm(profile.widthMm,     profile.unit);
  const H = mm(profile.heightMm,    profile.unit);
  const BH = mm(profile.barcodeHeightMm, profile.unit);
  const ML = mm(profile.leftMarginMm + profile.xOffsetMm, profile.unit);
  const MT = mm(profile.topMarginMm + profile.yOffsetMm, profile.unit);
  const GAP_V = mm(profile.vGapMm, profile.unit);
  const showPrice = profile.showPrice && showPriceAllowed && data.price != null;
  const rotateCss = profile.rotation ? `transform:rotate(${profile.rotation}deg);transform-origin:center;` : '';
  const borderCss = profile.showBorder ? 'border:1px solid #000;' : '';

  // Each label gets a unique barcode SVG id
  const barcodeIds = Array.from({ length: copies }, (_, i) => `bc-${i}`);

  const singleLabel = (bcId: string) => `
<div class="label" style="
  width:${W}; height:${H};
  padding:${MT} ${ML};
  box-sizing:border-box;
  display:flex; flex-direction:column; justify-content:flex-start; gap:0.3mm;
  overflow:hidden; page-break-inside:avoid; break-inside:avoid;
  margin-bottom:${GAP_V};
  ${rotateCss}${borderCss}
">
  ${profile.showProductName ? `<div style="font-size:${profile.fontSizePt}pt;font-weight:bold;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${data.productName}</div>` : ''}
  ${profile.showVariant ? `<div style="font-size:${profile.variantFontSizePt}pt;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${data.variantLabel}${data.ourColorNumber ? ' · #' + data.ourColorNumber : ''}</div>` : ''}
  ${profile.showQtyUom && data.qty != null ? `<div style="font-size:${profile.barcodeFontSizePt}pt;color:#555;">${data.qty} ${data.uom ?? ''}</div>` : ''}
  ${showPrice ? `<div style="font-size:${profile.priceFontSizePt}pt;font-weight:bold;">${data.currency ?? 'MVR'} ${data.price!.toFixed(2)}</div>` : ''}
  ${profile.showBarcode && data.barcode ? `<svg id="${bcId}" style="width:100%;height:${BH};display:block;flex-shrink:0;"></svg>` : ''}
</div>`;

  const labelHtml = barcodeIds.map(singleLabel).join('');

  // JsBarcode init script — runs after DOM is ready in the print window
  const barcodeInit = (profile.showBarcode && data.barcode) ? `
<script>
window.addEventListener('DOMContentLoaded', function() {
  var code = ${JSON.stringify(data.barcode)};
  ${barcodeIds.map((id) => `
  try {
    JsBarcode(document.getElementById(${JSON.stringify(id)}), code, {
      format: 'CODE128',
      width: ${Math.max(1, Math.round(profile.barcodeWidthScale))},
      height: ${Math.round(profile.barcodeHeightMm * 3.7795)},
      displayValue: ${profile.showBarcodeText},
      fontSize: ${Math.round(profile.barcodeFontSizePt * 1.33)},
      margin: 0,
      background: 'transparent',
    });
  } catch(e) { console.warn('JsBarcode error:', e); }
  `).join('')}
});
</script>` : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js"></script>
<style>
@page {
  size: ${W} ${H};
  margin: 0;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${W}; }
body {
  font-family: Arial, Helvetica, sans-serif;
  font-size: ${profile.fontSizePt}pt;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.label { background: #fff; }
.no-print { display: block; }
@media print {
  .no-print { display: none !important; }
  body { margin: 0; padding: 0; }
}
</style>
</head>
<body>
<div class="no-print" style="
  padding:8px 12px; background:#fefce8; border-bottom:1px solid #fbbf24;
  font:12px/1.5 sans-serif; color:#92400e; margin-bottom:4px;
">
  ⚠ <strong>Set printer driver scaling to 100%</strong> and label size to match selected profile:
  <strong>${profile.name}</strong> (${profile.widthMm}×${profile.heightMm} ${profile.unit}).
  Disable browser page scaling in Print dialog.
</div>
${labelHtml}
${barcodeInit}
</body>
</html>`;
}

/** Build a test label HTML to verify calibration. */
export function buildTestLabelHtml(profile: LabelProfile): string {
  const W = mm(profile.widthMm, profile.unit);
  const H = mm(profile.heightMm, profile.unit);
  const BH = mm(profile.barcodeHeightMm, profile.unit);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js"></script>
<style>
@page { size: ${W} ${H}; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.no-print { display: block; }
@media print { .no-print { display: none !important; } }
</style>
</head>
<body>
<div class="no-print" style="padding:8px;background:#fefce8;font:11px sans-serif;color:#92400e;margin-bottom:4px;">
  TEST LABEL · <strong>${profile.name}</strong> · ${profile.widthMm}×${profile.heightMm}${profile.unit} · Set driver scaling = 100%
</div>
<div style="
  width:${W}; height:${H};
  border:1px solid #999; box-sizing:border-box; padding:${mm(profile.topMarginMm, profile.unit)} ${mm(profile.leftMarginMm, profile.unit)};
  display:flex; flex-direction:column; justify-content:space-between; overflow:hidden;
  position:relative;
">
  <!-- cross-hair guide -->
  <div style="position:absolute;top:50%;left:0;right:0;border-top:1px dashed #ddd;"></div>
  <div style="position:absolute;top:0;bottom:0;left:50%;border-left:1px dashed #ddd;"></div>
  <div style="font-size:${profile.fontSizePt}pt;font-weight:bold;line-height:1.2;">TEST LABEL</div>
  <div style="font-size:${profile.variantFontSizePt}pt;color:#555;">${profile.name} · ${profile.widthMm}×${profile.heightMm}${profile.unit}</div>
  <svg id="bc-test" style="width:100%;height:${BH};display:block;"></svg>
</div>
<script>
window.addEventListener('DOMContentLoaded', function() {
  try {
    JsBarcode(document.getElementById('bc-test'), 'TEST-LABEL', {
      format: 'CODE128', width: ${Math.max(1, Math.round(profile.barcodeWidthScale))},
      height: ${Math.round(profile.barcodeHeightMm * 3.7795)},
      displayValue: true, fontSize: 10, margin: 0, background: 'transparent',
    });
  } catch(e) {}
});
</script>
</body>
</html>`;
}

/** Open a print window. Returns false if popup was blocked. */
export function openPrintWindow(html: string): boolean {
  const win = window.open('', '_blank', 'width=520,height=480');
  if (!win || win.closed) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  // Trigger print after JsBarcode has had time to run (DOMContentLoaded fires first).
  win.addEventListener('load', () => { win.focus(); win.print(); });
  return true;
}

/** Resolve active profile from settings, falling back to the first built-in. */
export function activeProfile(
  settings: { activeProfileId: string; profiles: LabelProfile[] } | null | undefined,
  fallback: LabelProfile,
): LabelProfile {
  if (!settings?.profiles?.length) return fallback;
  return settings.profiles.find((p) => p.id === settings.activeProfileId) ?? settings.profiles[0];
}
