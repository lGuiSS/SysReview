// ─── StatisticsSection ───────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback, forwardRef, useMemo, useImperativeHandle } from "react";
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import { ChartArea, Download, X, Map, Earth, Network, BarChart3, HelpCircle, Info } from 'lucide-react';
import {
  Line, Bar, Cell, Pie, PieChart, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ComposedChart, BarChart,
  ResponsiveContainer,
} from 'recharts';
import { feature } from 'topojson-client';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import worldTopology from 'world-atlas/countries-110m.json';
import FileSaver from 'file-saver';
import ExcelJS from "exceljs";
import countryPatternsData from '../countryPatterns/countryPatterns_v3.json';
import {
  buildAuthorshipData,
  buildCoAuthorshipNetwork,
  buildKeywordCoOccurrenceData,
  buildKeywordNetwork,
  detectCommunities,
} from '../bibliometrics';
import NetworkVisualization from '../bibliometrics/NetworkVisualization';
import DensityVisualization from '../bibliometrics/DensityVisualization';

// ─────────────────────────────────────────────────────────────────────────────
// PRISMA
// ─────────────────────────────────────────────────────────────────────────────
const PrismaFlowchart = forwardRef(({ statistics, databases = [], totalCount, isDark }, ref) => {
  const { t } = useTranslation();
  const nodeBg = isDark ? '#374151' : '#ffffff';
  const border = '#a8a29e';
  const txt = isDark ? '#f3f4f6' : '#111827';
  const numTxt = isDark ? '#d1d5db' : '#6b7280';
  const line = isDark ? '#6b7280' : '#9ca3af';
  const mainX = 280, sideX = 490, nW = 200, sW = 180, nH = 56, r = 6;
  const rows = { n1: 50, n2: 50, n3: 150, n4: 200, n5: 250, n6: 300, n7: 350, n8: 400, n9: 450, n10: 500, n11: 550 };

  // Caixas das bases distribuídas horizontalmente e centradas em mainX
  const dbBoxes = databases.map((db, i) => {
    const n = databases.length;
    const cx = mainX + (i - (n - 1) / 2) * 200;
    return { label: db.label, count: db.count, cx };
  });

  const Box = ({ cx, cy, w, h = nH, label, count }) => {
    const lns = label.includes('\n') ? label.split('\n') : label.length > 24 ? [label.slice(0, 24), label.slice(24)] : [label];
    const lineH = 15;
    const totalTextH = lns.length * lineH + 10;
    const startY = cy - totalTextH / 2 + lineH / 2;
    return (
      <g>
        <rect x={cx - w / 2 + 2} y={cy - h / 2 + 3} width={w} height={h} rx={r} ry={r} fill="rgba(0,0,0,0.12)" />
        <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={r} ry={r} fill={nodeBg} stroke={border} strokeWidth={2} />
        {lns.map((ln, i) => (
          <text key={i} x={cx} y={startY + i * lineH} textAnchor="middle" fill={txt}
            fontSize={14} fontWeight="700" fontFamily="-apple-system, BlinkMacSystemFont, sans-serif">{ln}</text>
        ))}
        <text x={cx} y={startY + lns.length * lineH + 4} textAnchor="middle" fill={numTxt}
          fontSize={13} fontFamily="-apple-system, BlinkMacSystemFont, sans-serif">{count}</text>
      </g>
    );
  };
  const Arrow = ({ x1, y1, x2, y2 }) => (
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={line} strokeWidth={1.5} markerEnd="url(#prisma-arrow)" />
  );

  return (
    <svg ref={ref} viewBox="0 0 680 640" width="100%" style={{ maxHeight: '70vh' }} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="prisma-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill={line} />
        </marker>
      </defs>
      <Arrow x1={mainX} y1={rows.n3 + nH / 2} x2={mainX} y2={rows.n5 - nH / 2} />
      <Arrow x1={mainX} y1={rows.n5 + nH / 2} x2={mainX} y2={rows.n7 - nH / 2} />
      <Arrow x1={mainX} y1={rows.n6} x2={sideX - sW / 2} y2={rows.n6} />
      <Arrow x1={mainX} y1={rows.n7 + nH / 2} x2={mainX} y2={rows.n9 - nH / 2} />
      <Arrow x1={mainX} y1={rows.n8} x2={sideX - sW / 2} y2={rows.n8} />
      <Arrow x1={mainX} y1={rows.n9 + nH / 2} x2={mainX} y2={rows.n11 - nH / 2} />
      <Arrow x1={mainX} y1={rows.n10} x2={sideX - sW / 2} y2={rows.n10} />
      <Arrow x1={mainX} y1={rows.n4} x2={sideX - sW / 2} y2={rows.n4} />
      {dbBoxes.map(db => (
        <g key={db.label}>
          <Arrow x1={db.cx} y1={rows.n1 + nH / 2} x2={mainX} y2={rows.n3 - nH / 2} />
          <Box cx={db.cx} cy={rows.n1} w={160} label={db.label} count={db.count} />
        </g>
      ))}
      <Box cx={mainX} cy={rows.n3} w={nW} label={t('stats.prismaIdentified')} count={totalCount} />
      <Box cx={sideX} cy={rows.n4} w={sW} label={t('stats.prismaDuplicates')} count={statistics.dataProcessing.duplicate} />
      <Box cx={mainX} cy={rows.n5} w={nW} label={t('stats.prismaAfterDedup')} count={statistics.dataProcessing.included} />
      <Box cx={sideX} cy={rows.n6} w={sW} label={t('stats.prismaExcludedFilter', { n: 1 })} count={statistics.filter1.excluded} />
      <Box cx={mainX} cy={rows.n7} w={nW} label={t('stats.prismaIncludedFilter', { n: 1 })} count={statistics.filter1.included} />
      <Box cx={sideX} cy={rows.n8} w={sW} label={t('stats.prismaExcludedFilter', { n: 2 })} count={statistics.filter2.excluded} />
      <Box cx={mainX} cy={rows.n9} w={nW} label={t('stats.prismaIncludedFilter', { n: 2 })} count={statistics.filter2.included} />
      <Box cx={sideX} cy={rows.n10} w={sW} label={t('stats.prismaExcludedFilter', { n: 3 })} count={statistics.filter3.excluded} />
      <Box cx={mainX} cy={rows.n11} w={nW} label={t('stats.prismaIncludedFilter', { n: 3 })} count={statistics.filter3.included} />
    </svg>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Exportação
// ─────────────────────────────────────────────────────────────────────────────
const SVG_NS = 'http://www.w3.org/2000/svg';
const EXPORT_FONT_FAMILY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const changeColors = (svgClone) => {
  const fix = (sel, attr, val, useChild = false) =>
    svgClone.querySelectorAll(sel).forEach(el => {
      if (useChild) el.children[0]?.setAttribute(attr, val);
      else el.setAttribute(attr, val);
    });
  fix("g > g > g.recharts-cartesian-grid-horizontal > line", 'stroke', '#000');
  fix("g > g > g.recharts-cartesian-grid-vertical > line", 'stroke', '#000');
  fix("g > g.recharts-cartesian-axis-tick-labels.recharts-xAxis-tick-labels > g", 'fill', '#000', true);
  fix("g > g.recharts-cartesian-axis-tick-labels.recharts-yAxis-tick-labels > g", 'fill', '#000', true);
  fix("g > g.recharts-layer.recharts-cartesian-axis.recharts-xAxis.xAxis > line", 'stroke', '#000');
  fix("g > g.recharts-layer.recharts-cartesian-axis.recharts-yAxis.yAxis > line", 'stroke', '#000');
  fix("g > g.recharts-layer.recharts-cartesian-axis.recharts-xAxis.xAxis > g > g > g", 'stroke', '#000', true);
  fix("g > g.recharts-layer.recharts-cartesian-axis.recharts-yAxis.yAxis > g > g > g", 'stroke', '#000', true);
};

const mmToPx = (mm, dpi) => Math.round(mm * dpi / 25.4);
const ptToPx = (pt, dpi) => Math.round(pt * dpi / 72);

let _measureCtx = null;
const getMeasureCtx = () => {
  if (!_measureCtx) _measureCtx = document.createElement('canvas').getContext('2d');
  return _measureCtx;
};

const svgToDataUrl = (svgEl) => {
  const clone = svgEl.cloneNode(true);
  clone.setAttribute('xmlns', SVG_NS);
  const style = document.createElement('style');
  style.textContent = `* { font-family: ${EXPORT_FONT_FAMILY}; }`;
  clone.insertBefore(style, clone.firstChild);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
};

const injectExportStyle = (clone) => {
  clone.setAttribute('xmlns', SVG_NS);
  const style = document.createElement('style');
  style.textContent = `* { font-family: ${EXPORT_FONT_FAMILY}; }`;
  clone.insertBefore(style, clone.firstChild);
  return clone;
};

// Layout da legenda (SVG) — mede os textos e quebra em linhas sem sobreposição
const computeLegendLayout = (items, fontPx, width) => {
  if (!items?.length) return null;
  const ctx = getMeasureCtx();
  ctx.font = `${fontPx}px sans-serif`;
  const pad = fontPx * 0.8;
  const swatch = fontPx * 0.9;
  const gap = fontPx * 0.55;
  const rowH = fontPx * 1.55;
  const maxW = Math.max(width - pad * 2, 1);
  const rows = [];
  let cur = [], curW = 0;
  items.forEach(it => {
    const textW = ctx.measureText(it.text).width;
    const w = swatch + gap + textW + gap;
    if (cur.length && curW + w > maxW) { rows.push({ items: cur, width: curW }); cur = []; curW = 0; }
    cur.push({ ...it, w, textW });
    curW += w;
  });
  if (cur.length) rows.push({ items: cur, width: curW });
  return { rows, height: rows.length * rowH, rowH, swatch, gap, pad, fontPx };
};

const appendLegend = (svg, layout, width, height) => {
  if (!layout) return;
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'export-legend');
  const startY = Math.max(layout.rowH / 2, height - layout.height - layout.pad / 2);
  layout.rows.forEach((row, r) => {
    const rowCenterY = startY + r * layout.rowH;
    let x = (width - row.width) / 2;
    row.items.forEach(it => {
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', x);
      rect.setAttribute('y', rowCenterY - layout.swatch / 2);
      rect.setAttribute('width', layout.swatch);
      rect.setAttribute('height', layout.swatch);
      rect.setAttribute('rx', Math.max(1, layout.swatch * 0.25));
      rect.setAttribute('fill', it.color);
      g.appendChild(rect);
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', x + layout.swatch + layout.gap);
      text.setAttribute('y', rowCenterY);
      text.setAttribute('font-size', layout.fontPx);
      text.setAttribute('fill', '#111827');
      text.setAttribute('dominant-baseline', 'central');
      text.textContent = it.text;
      g.appendChild(text);
      x += it.w;
    });
  });
  svg.appendChild(g);
};

// Prepara o clone para exportação: cores, viewBox, fonte uniforme (pt exato) e legenda
const postProcessExportSvg = (clone, { renderedW, renderedH, fontPx, legendLayout }) => {
  changeColors(clone);
  const svg = clone;
  const vb = svg.viewBox;
  const hasViewBox = vb && vb.baseVal && vb.baseVal.width > 0;
  const vbW = hasViewBox ? vb.baseVal.width : (renderedW || 100);
  const vbH = hasViewBox ? vb.baseVal.height : (renderedH || 100);
  const w = Math.round(renderedW || vbW);
  const h = Math.round(renderedH || vbH);
  if (!hasViewBox) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  // dimensões explícitas em px — necessárias para o <img> da pré-visualização
  // e para SVGs com width="100%" (ex.: fluxograma PRISMA) ganharem tamanho fixo
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  // fonte em unidades do viewBox → equivale a fontPx px no render (pt exato no mm alvo)
  const fontUnits = Math.round((fontPx * (vbW / (renderedW || vbW))) * 100) / 100;
  svg.querySelectorAll('text').forEach(t => t.setAttribute('font-size', fontUnits));
  if (legendLayout) appendLegend(svg, legendLayout, w, h);
  return svg;
};

const waitForSvg = (host, timeout = 4000) => new Promise(resolve => {
  const start = Date.now();
  const tick = () => {
    const svg = host.querySelector('svg');
    if (svg) { resolve(svg); return; }
    if (Date.now() - start > timeout) { resolve(null); return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

const exportSvgElement = async (svgEl, filename, settings) => {
  const clone = svgEl.cloneNode(true);
  if (settings?.widthMm) clone.setAttribute('width', `${settings.widthMm}mm`);
  if (settings?.heightMm) clone.setAttribute('height', `${settings.heightMm}mm`);
  injectExportStyle(clone);
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.download = filename; a.href = url; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const exportSvgToPng = async (svgEl, filename, settings) => {
  const clone = svgEl.cloneNode(true);
  clone.setAttribute('width', settings.widthPx);
  clone.setAttribute('height', settings.heightPx);
  injectExportStyle(clone);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' }));
  const canvas = document.createElement('canvas');
  canvas.width = settings.widthPx; canvas.height = settings.heightPx;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const img = new Image(); img.crossOrigin = 'anonymous';
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  await new Promise(res => canvas.toBlob(blob => { FileSaver.saveAs(blob, filename); URL.revokeObjectURL(url); res(); }, 'image/png', 1));
};

const exportToXLSX = async (data, filename) => {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Data');
  if (data?.length) {
    ws.columns = Object.keys(data[0]).map(k => ({ header: k, key: k, width: 20 }));
    data.forEach(row => ws.addRow(row));
  }
  const buf = await workbook.xlsx.writeBuffer();
  FileSaver.saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
};

// ─────────────────────────────────────────────────────────────────────────────
// ExportableChart — renderiza o gráfico na tela e, sob demanda, re-renderiza
// em tamanho oculto no tamanho-alvo de exportação (px = mm × 96/25,4) para que
// o recharts recalcule ticks/labels para aquele tamanho e a fonte saia em pt exato.
// ─────────────────────────────────────────────────────────────────────────────
const ExportableChart = forwardRef(({ children, style, legend }, ref) => {
  const screenHostRef = useRef(null);

  const renderForExport = useCallback(async ({ width, height, fontPx, legendBottom }) => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-100000px;top:0;width:0;height:0;overflow:hidden;pointer-events:none;';
    document.body.appendChild(host);
    const root = createRoot(host);
    const legendLayout = legend ? computeLegendLayout(legend, fontPx, width) : null;
    try {
      root.render(children({
        export: true,
        width,
        height,
        fontPx,
        isDark: false,
        legendBottom: legendLayout ? legendLayout.height + legendLayout.pad : 0,
      }));
      const svg = await waitForSvg(host);
      if (!svg) throw new Error('No svg rendered');
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const renderedW = svg.getBoundingClientRect().width || width;
      const renderedH = svg.getBoundingClientRect().height || height;
      const clone = svg.cloneNode(true);
      return postProcessExportSvg(clone, { renderedW, renderedH, fontPx, legendLayout });
    } finally {
      root.unmount();
      host.remove();
    }
  }, [children, legend]);

  useImperativeHandle(ref, () => ({
    renderForExport,
    getScreenSvg: () => screenHostRef.current?.querySelector('svg') ?? null,
  }), [renderForExport]);

  return <div ref={screenHostRef} style={style}>{children({ screen: true })}</div>;
});

// ─────────────────────────────────────────────────────────────────────────────
// ExportConfigModal — modal de configuração para exportação de imagens
// ─────────────────────────────────────────────────────────────────────────────
const EXPORT_SETTINGS_KEY = 'sysreview-export-settings';

const loadExportSettings = () => {
  try {
    const saved = localStorage.getItem(EXPORT_SETTINGS_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
};

const saveExportSettings = (settings) => {
  try { localStorage.setItem(EXPORT_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* localStorage unavailable */ }
};

const RulerBar = ({ displayWidth, totalMm, dark }) => {
  if (!displayWidth || !totalMm) return null;
  const mmPerPx = totalMm / displayWidth;
  const step = totalMm <= 80 ? 10 : 20;
  const ticks = [];
  for (let mm = 0; mm <= totalMm; mm += step) ticks.push({ mm, x: mm / mmPerPx });
  const tickColor = dark ? '#9ca3af' : '#6b7280';
  return (
    <div className="relative w-full" style={{ height: 18 }}>
      {ticks.map(tk => (
        <div key={tk.mm} className="absolute bottom-0 flex flex-col items-center" style={{ left: tk.x, transform: 'translateX(-50%)' }}>
          <div className="w-px" style={{ height: tk.mm === 0 ? 0 : 7, background: tickColor }} />
          <span className="text-[8px] leading-tight" style={{ color: tickColor }}>{tk.mm}</span>
        </div>
      ))}
    </div>
  );
};

const ExportConfigModal = ({ isOpen, onClose, onExport, format = 'png', svgElement, sourceAspectRatio, getSvg, svgOnly = false }) => {
  const { t } = useTranslation();
  const saved = loadExportSettings();
  const [widthMm, setWidthMm] = useState(saved?.widthMm ?? 150);
  const [heightMm, setHeightMm] = useState(saved?.heightMm ?? 100);
  const [keepRatio, setKeepRatio] = useState(saved?.keepRatio ?? true);
  const [fontPt, setFontPt] = useState(saved?.fontPt ?? 10);
  const [exportWarning, setExportWarning] = useState(null);
  const dpi = 1200;
  const aspectRatio = useRef(null);
  const imgRef = useRef(null);
  const [imgWidth, setImgWidth] = useState(0);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewTimer = useRef(null);
  const previewSeq = useRef(0);
  const getSvgRef = useRef(null);
  getSvgRef.current = getSvg;

  const lockedAspect = useMemo(() => {
    if (!svgOnly || !svgElement) return null;
    const vb = svgElement.viewBox;
    if (vb && vb.baseVal && vb.baseVal.width > 0 && vb.baseVal.height > 0) {
      return vb.baseVal.width / vb.baseVal.height;
    }
    return null;
  }, [svgOnly, svgElement]);

  const toFinite = (val, fallback) => {
    const n = Number(val);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  const buildSettings = () => {
    const w = toFinite(widthMm, 150);
    const h = toFinite(heightMm, 100);
    const f = toFinite(fontPt, 10);
    const widthPx = mmToPx(w, dpi);
    const heightPx = mmToPx(h, dpi);
    return { widthPx, heightPx, widthMm: w, heightMm: h, dpi, fontPt: f };
  };

  useEffect(() => {
    if (isOpen) {
      const el = svgElement;
      const elAspect = el
        ? el.getBoundingClientRect().width / el.getBoundingClientRect().height
        : (typeof sourceAspectRatio === 'number' && sourceAspectRatio > 0 ? sourceAspectRatio : null);
      const effectiveAspect = lockedAspect || elAspect;
      if (effectiveAspect) {
        aspectRatio.current = effectiveAspect;
        if (!saved) {
          if (el) {
            const { width, height } = el.getBoundingClientRect();
            const wMm = Math.max(1, width * 25.4 / 96);
            const hMm = Math.max(1, height * 25.4 / 96);
            const scale = Math.min(1, MAX_MM / Math.max(wMm, 1));
            setWidthMm(Math.max(MIN_MM, Math.round(wMm * scale)));
            setHeightMm(Math.max(MIN_MM, Math.round(hMm * scale)));
          } else {
            setWidthMm(150);
            setHeightMm(Math.round(150 / effectiveAspect));
          }
        }
        if (lockedAspect) {
          setKeepRatio(true);
          const w = toFinite(saved?.widthMm ?? widthMm, 150);
          setWidthMm(Math.max(MIN_MM, Math.round(w)));
          setHeightMm(Math.max(MIN_MM, Math.round(w / lockedAspect)));
        }
      }
    }
  }, [isOpen, svgElement, saved, sourceAspectRatio, svgOnly, lockedAspect]);

  // Pré-visualização (debounced) — renderiza exatamente o SVG que será exportado
  useEffect(() => {
    if (!isOpen || !getSvgRef.current) return;
    setPreviewLoading(true);
    clearTimeout(previewTimer.current);
    const settings = buildSettings();
    previewTimer.current = setTimeout(async () => {
      const seq = ++previewSeq.current;
      try {
        const svg = await getSvgRef.current(settings);
        if (seq !== previewSeq.current) return;
        setPreviewUrl(svg ? svgToDataUrl(svg) : null);
      } catch (e) {
        console.error('Preview error:', e);
        if (seq === previewSeq.current) setPreviewUrl(null);
      } finally {
        if (seq === previewSeq.current) setPreviewLoading(false);
      }
    }, 250);
    return () => clearTimeout(previewTimer.current);
  }, [isOpen, widthMm, heightMm, keepRatio, fontPt]);

  const MIN_MM = 10, MAX_MM = 150, MIN_PT = 6, MAX_PT = 24;

  const validateSettings = () => {
    const issues = [];
    const w = Number(widthMm), h = Number(heightMm), f = Number(fontPt);
    if (!Number.isFinite(w) || w < MIN_MM || w > MAX_MM)
      issues.push(t('stats.exportWarningMm', 'Largura e altura devem estar entre 10 e 150 mm.'));
    if (!Number.isFinite(h) || h < MIN_MM || h > MAX_MM)
      issues.push(t('stats.exportWarningMm', 'Largura e altura devem estar entre 10 e 150 mm.'));
    if (!Number.isFinite(f) || f < MIN_PT || f > MAX_PT)
      issues.push(t('stats.exportWarningFont', 'A fonte deve estar entre 6 e 24 pt.'));
    return [...new Set(issues)];
  };

  const handleWidthChange = (val) => {
    setExportWarning(null);
    setWidthMm(val);
    const aspect = lockedAspect || aspectRatio.current;
    if ((keepRatio || lockedAspect) && aspect) {
      const n = Number(val);
      if (Number.isFinite(n) && n > 0) setHeightMm(Math.round(n / aspect));
    }
  };

  const handleHeightChange = (val) => {
    setExportWarning(null);
    setHeightMm(val);
    const aspect = lockedAspect || aspectRatio.current;
    if ((keepRatio || lockedAspect) && aspect) {
      const n = Number(val);
      if (Number.isFinite(n) && n > 0) setWidthMm(Math.round(n * aspect));
    }
  };

  const handleKeepRatioChange = (checked) => {
    setExportWarning(null);
    setKeepRatio(checked);
    if (checked && aspectRatio.current) {
      const w = Number(widthMm);
      if (Number.isFinite(w) && w > 0) setHeightMm(Math.round(w / aspectRatio.current));
    }
  };

  const handleExport = async () => {
    const issues = validateSettings();
    if (issues.length) {
      setExportWarning(issues.join(' '));
      return;
    }
    setExportWarning(null);
    const settings = buildSettings();
    saveExportSettings({ widthMm, heightMm, keepRatio, dpi, fontPt });
    let svg = null;
    try {
      if (getSvgRef.current) {
        setPreviewLoading(true);
        svg = await getSvgRef.current(settings);
      }
    } catch (e) {
      console.error('Export error:', e);
    }
    onExport(settings, svg);
    onClose();
  };

  if (!isOpen) return null;

  const resultW = mmToPx(widthMm, dpi);
  const resultH = mmToPx(heightMm, dpi);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50 p-4">
      <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 sm:gap-3">
            <Download className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600 dark:text-indigo-400" />
            <p className="text-sm sm:text-base font-semibold text-gray-800 dark:text-white">
              {t('stats.exportConfigTitle', 'Configurar Exportação')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 sm:p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-3 sm:space-y-4 overflow-y-auto">
          <div className="flex gap-2 sm:gap-3">
            <div className="flex-1">
              <label className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1.5 sm:mb-2 block">{t('stats.widthMm', 'Largura (mm)')}</label>
              <input type="number" value={widthMm} min={10} max={150} onChange={e => handleWidthChange(e.target.value)}
                className="w-full px-3 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg border transition-colors bg-white dark:bg-gray-700 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 border-gray-200 dark:border-gray-600" />
            </div>
            <div className="flex-1">
              <label className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1.5 sm:mb-2 block">{t('stats.heightMm', 'Altura (mm)')}</label>
              <input type="number" value={heightMm} min={10} max={150} onChange={e => handleHeightChange(e.target.value)} disabled={keepRatio && !lockedAspect}
                className={`w-full px-3 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg border transition-colors bg-white dark:bg-gray-700 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 border-gray-200 dark:border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed`} />
            </div>
            <div className="w-24">
              <label className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1.5 sm:mb-2 block">{t('stats.fontPt', 'Fonte (pt)')}</label>
              <input type="number" min={6} max={24} value={fontPt} onChange={e => { setExportWarning(null); setFontPt(e.target.value); }}
                className="w-full px-3 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg border transition-colors bg-white dark:bg-gray-700 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 border-gray-200 dark:border-gray-600" />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            {!lockedAspect && (
              <label className="flex items-center gap-2 text-xs sm:text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
                <input type="checkbox" checked={keepRatio} onChange={e => handleKeepRatioChange(e.target.checked)}
                  className="accent-indigo-500" />
                {t('stats.keepRatio', 'Manter proporção')}
              </label>
            )}
            {lockedAspect && <div />}
            {format === 'png' && (
              <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('stats.dpi', 'Resolução (DPI)')}: <span className="text-gray-800 dark:text-gray-200">{dpi}</span></div>
            )}
          </div>

          {getSvg && (
            <div>
              <label className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1.5 block">
                {t('stats.preview', 'Pré-visualização')}
              </label>
              <div className="rounded-lg border border-gray-200 dark:border-gray-600 p-2 bg-white overflow-hidden">
                {previewLoading && (
                  <div className="flex items-center justify-center py-8 text-xs text-gray-400 gap-2">
                    <div className="animate-spin inline-block h-4 w-4 border-2 border-indigo-600 border-t-transparent rounded-full"></div>
                    {t('stats.generatingPreview', 'Gerando pré-visualização...')}
                  </div>
                )}
                {!previewLoading && previewUrl && (
                  <div className="mx-auto" style={{ width: 'fit-content' }}>
                    <img ref={imgRef} src={previewUrl} alt={t('stats.preview')} className="max-w-full h-auto block"
                      style={{ background: '#fff' }} onLoad={e => setImgWidth(e.currentTarget.clientWidth)} />
                    <div className="mx-auto" style={{ width: imgWidth || '100%' }}>
                      <RulerBar displayWidth={imgWidth || widthMm * (96 / 25.4)} totalMm={widthMm} dark={false} />
                    </div>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5 leading-snug">
                {t('stats.previewHint', 'O conteúdo exibido é exatamente o arquivo exportado (texto em fonte uniforme de {pt} pt, legenda e cores ajustadas para fundo branco). A régua é aproximada (96 dpi).', { pt: fontPt })}
              </p>
            </div>
          )}

          <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-3">
            {t('stats.resultSize', 'Tamanho resultante')}: <span className="text-gray-800 dark:text-gray-200">{resultW} × {resultH} px</span>
          </div>
        </div>

        {/* Footer */}
        {exportWarning && (
          <div className="px-4 sm:px-6 pb-2">
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-2">
              {exportWarning}
            </p>
          </div>
        )}
        <div className="flex gap-2 sm:gap-3 px-4 sm:px-6 pb-4 sm:pb-6">
          <button onClick={onClose}
            className="flex-1 px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg
              bg-gray-100 hover:bg-gray-200 text-gray-700
              dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300
              transition-colors duration-150">
            {t('common.cancel', 'Cancelar')}
          </button>
          <button onClick={handleExport}
            className="flex-1 px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg
              bg-indigo-600 hover:bg-indigo-700 text-white
              dark:bg-indigo-500 dark:hover:bg-indigo-600
              transition-colors duration-150">
            {t('stats.exportButton', 'Exportar')}
          </button>
        </div>
      </div>
    </div>
  );
};

// NetworkHelpModal — modal de ajuda explicando o funcionamento da rede
// ─────────────────────────────────────────────────────────────────────────────
const NetworkHelpModal = ({ isOpen, onClose }) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const sections = [
    { title: t('stats.networkHelpAlgorithmTitle'), text: t('stats.networkHelpAlgorithmText') },
    { title: t('stats.networkHelpNodeTitle'), text: t('stats.networkHelpNodeText') },
    { title: t('stats.networkHelpEdgeTitle'), text: t('stats.networkHelpEdgeText') },
    { title: t('stats.networkHelpCountingTitle'), text: t('stats.networkHelpCountingText') }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50 p-4">
      <div className="w-full sm:w-[26rem] md:w-[30rem] bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700">

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 sm:gap-3">
            <HelpCircle className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600 dark:text-indigo-400" />
            <p className="text-sm sm:text-base font-semibold text-gray-800 dark:text-white">
              {t('stats.networkHelpTitle')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 sm:p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 max-h-[60vh] overflow-y-auto">
          {sections.map(section => (
            <div key={section.title}>
              <h4 className="text-sm sm:text-base font-semibold text-gray-800 dark:text-white mb-1 sm:mb-1.5">
                {section.title}
              </h4>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                {section.text}
              </p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-4 sm:px-6 pb-4 sm:pb-6">
          <button
            onClick={onClose}
            className="px-4 sm:px-5 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg
              bg-indigo-600 hover:bg-indigo-700 text-white
              dark:bg-indigo-500 dark:hover:bg-indigo-600
              transition-colors duration-150"
          >
            {t('modals.alert.ok')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// WorldHeatmap — mapa de calor usando dados de countriesCount
// ─────────────────────────────────────────────────────────────────────────────
// ── Lookups derivados do JSON de países ───────────────────────────────────────

const COUNTRY_NAMES_MAP = Object.fromEntries(
  countryPatternsData.map(c => [c.cca3, c.name])
);

const NUMERIC_TO_ISO_MAP = Object.fromEntries(
  countryPatternsData.map(c => [c.ccn3, c.cca3])
);

// Lookup nome → ISO gerado a partir do JSON (name, officialName, nativeName → cca3)
const normalizeStr = (s) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const CTRY_TO_ISO = (() => {
  const map = {};
  countryPatternsData.forEach(({ cca3, name, officialName, nativeName }) => {
    if (name) map[normalizeStr(name)] = cca3;
    if (officialName) map[normalizeStr(officialName)] = cca3;
    if (nativeName) map[normalizeStr(nativeName)] = cca3;
  });
  return map;
})();

const resolveCountryISO = (str) => {
  if (!str) return null;
  const nkey = normalizeStr(str);
  if (CTRY_TO_ISO[nkey]) return CTRY_TO_ISO[nkey];
  // fallback parcial — prefere match mais curto
  const found = Object.keys(CTRY_TO_ISO)
    .filter(k => k.includes(nkey) || nkey.includes(k))
    .sort((a, b) => a.length - b.length)[0];
  return found ? CTRY_TO_ISO[found] : null;
};

const getHeatColor = (count, maxCount, isDark) => {
  if (!count || maxCount === 0) return isDark ? '#2d3748' : '#d1d5db';
  const t = Math.pow(count / maxCount, 0.5);
  const lo = isDark ? 80 : 200;
  const hi = isDark ? 240 : 30;
  const v = Math.round(lo + (hi - lo) * t);
  return `rgb(${v},${v},${v})`;
};

const WorldHeatmap = forwardRef(({ countriesCount, isDark }, svgExportRef) => {
  const { t } = useTranslation();
  const [svgPaths, setSvgPaths] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [hoveredISO, setHoveredISO] = useState(null);
  const containerRef = useRef(null);

  const isoCountMap = {};
  const maxCount = (countriesCount || []).reduce((m, d) => Math.max(m, d.count), 0);
  (countriesCount || []).forEach(({ country, count }) => {
    const iso = resolveCountryISO(country);
    if (iso) isoCountMap[iso] = (isoCountMap[iso] || 0) + count;
  });

  useEffect(() => {
    const countries = feature(worldTopology, worldTopology.objects.countries);
    const proj = geoNaturalEarth1().scale(180).translate([470, 260]);
    const path = geoPath().projection(proj);
    const paths = countries.features.map(f => {
      const iso = NUMERIC_TO_ISO_MAP[parseInt(f.id, 10)];
      // VERIFICAÇÃO AQUI:
      if (!iso) {
        console.warn(`ID numérico ${f.id} não mapeado para ISO. Verifique countryPatternsData.`);
      }
      const d = path(f);
      if (!d) return null;
      return { d, iso, id: f.id };
    }).filter(Boolean);
    setSvgPaths(paths);
  }, []);

  const oceanColor = isDark ? '#0c1829' : '#ffffff';
  const strokeColor = isDark ? '#0f172a' : '#ffffff';

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>

      {svgPaths === null ? (
        <div className="flex items-center justify-center h-48 text-sm text-gray-400">{t('stats.loadingMap')}</div>
      ) : svgPaths === 'error' ? (
        <div className="flex items-center justify-center h-48 text-sm text-red-400">{t('stats.mapError')}</div>
      ) : (
        <svg ref={svgExportRef} viewBox="0 0 1010 580" style={{ width: '100%', height: 'auto', display: 'block' }} xmlns="http://www.w3.org/2000/svg">
          <rect width="1010" height="580" fill={oceanColor} rx="8" />
          <g opacity={isDark ? 0.06 : 0.12} stroke="#94a3b8" strokeWidth="0.5" fill="none">
            {[-60, -30, 0, 30, 60].map(lat => (
              <line key={lat} x1="20" y1={340 - lat * 3.3} x2="990" y2={340 - lat * 3.3} />
            ))}
            {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map(lon => (
              <line key={lon} x1={490 + lon * 2.6} y1="30" x2={490 + lon * 2.6} y2="630" />
            ))}
          </g>
          {svgPaths.map((c, i) => {
            const count = isoCountMap[c.iso] || 0;
            const fill = c.iso === hoveredISO
              // ↓ COR DE SELEÇÃO (hover) — altere aqui
              ? (isDark ? '#4f46e5' : '#4f46e5')
              : getHeatColor(count, maxCount, isDark);
            return (
              <path key={i} d={c.d} fill={fill} stroke={strokeColor} strokeWidth="0.5"
                style={{ cursor: count > 0 ? 'pointer' : 'default', transition: 'fill 0.12s' }}
                onMouseMove={e => {
                  const rect = containerRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, iso: c.iso, count });
                  setHoveredISO(c.iso);
                }}
                onMouseLeave={() => { setTooltip(null); setHoveredISO(null); }}
              />
            );
          })}
          {/* ── Escala de cores (embutida no SVG para exportação) ── */}
          <defs>
            <linearGradient id="heatScaleGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={isDark ? '#2d3748' : '#d1d5db'} />
              <stop offset="100%" stopColor={isDark ? 'rgb(240,240,240)' : 'rgb(30,30,30)'} />
            </linearGradient>
          </defs>
          <rect x="20" y="540" width="300" height="10" rx="5" fill="url(#heatScaleGrad)" />
          <text x="20" y="560" fill={isDark ? '#9ca3af' : '#6b7280'} fontSize="11" fontFamily="sans-serif">0</text>
          <text x="322" y="560" fill={isDark ? '#9ca3af' : '#6b7280'} fontSize="11" fontFamily="sans-serif" textAnchor="end">{maxCount} pub.</text>
        </svg>
      )}

      {tooltip && (
        <div style={{ position: 'absolute', left: tooltip.x + 14, top: tooltip.y - 12, pointerEvents: 'none', zIndex: 20 }}
          className="bg-gray-900 border border-indigo-500/40 rounded-lg px-3 py-2 shadow-xl text-white text-xs">
          <div className="font-semibold text-sm mb-0.5">
            {COUNTRY_NAMES_MAP[tooltip.iso] || tooltip.iso || t('stats.unknown')}
          </div>
          <div className="text-indigo-300 font-medium">
            {tooltip.count > 0 ? t('stats.publicationsCount', { count: tooltip.count }) : t('stats.noData')}
          </div>
        </div>
      )}
    </div>
  );
});
WorldHeatmap.displayName = 'WorldHeatmap';

// ─────────────────────────────────────────────────────────────────────────────
// ContinentHeatmap
// ─────────────────────────────────────────────────────────────────────────────

const ISO_TO_CONTINENT = Object.fromEntries(
  countryPatternsData.map(c => [c.cca3, c.continentName])
);
const CONTINENT_LABELS = [
  "North America", "South America", "Europe", "Asia", "Africa", "Oceania",
];

const ContinentHeatmap = forwardRef(({ countriesCount, isDark }, svgExportRef) => {
  const { t } = useTranslation();
  const [svgPaths, setSvgPaths] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [hoveredCont, setHoveredCont] = useState(null);
  const containerRef = useRef(null);

  // Agrupa contagens por continente
  const contCount = {};
  (countriesCount || []).forEach(({ country, count }) => {
    const iso = resolveCountryISO(country);
    const cont = iso ? ISO_TO_CONTINENT[iso] : null;
    if (!cont) return;
    contCount[cont] = (contCount[cont] || 0) + count;
  });
  const maxCount = Math.max(...Object.values(contCount), 0);

  useEffect(() => {
    const countries = feature(worldTopology, worldTopology.objects.countries);
    const proj = geoNaturalEarth1().scale(180).translate([470, 260]);
    const path = geoPath().projection(proj);
    const paths = countries.features.map(f => {
      const iso = NUMERIC_TO_ISO_MAP[parseInt(f.id, 10)];
      const cont = iso ? ISO_TO_CONTINENT[iso] : null;
      const d = path(f);
      if (!d) return null;
      return { d, iso, cont, id: f.id };
    }).filter(Boolean);
    setSvgPaths(paths);
  }, []);

  const oceanColor = isDark ? '#0c1829' : '#ffffff';
  const strokeColor = isDark ? '#0f172a' : '#ffffff';

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {svgPaths === null ? (
        <div className="flex items-center justify-center h-48 text-sm text-gray-400">{t('stats.loadingMap')}</div>
      ) : svgPaths === 'error' ? (
        <div className="flex items-center justify-center h-48 text-sm text-red-400">{t('stats.mapError')}</div>
      ) : (
        <svg ref={svgExportRef} viewBox="0 0 1010 580" style={{ width: '100%', height: 'auto', display: 'block' }} xmlns="http://www.w3.org/2000/svg">
          <rect width="1010" height="580" fill={oceanColor} rx="8" />
          <g opacity={isDark ? 0.06 : 0.12} stroke="#94a3b8" strokeWidth="0.5" fill="none">
            {[-60, -30, 0, 30, 60].map(lat => (
              <line key={lat} x1="20" y1={340 - lat * 3.3} x2="990" y2={340 - lat * 3.3} />
            ))}
            {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map(lon => (
              <line key={lon} x1={490 + lon * 2.6} y1="30" x2={490 + lon * 2.6} y2="630" />
            ))}
          </g>
          {svgPaths.map((c, i) => {
            const count = c.cont ? (contCount[c.cont] || 0) : 0;
            const isHov = c.cont && c.cont === hoveredCont;
            const fill = isHov
              // ↓ COR DE SELEÇÃO (hover) — altere aqui
              ? (isDark ? '#4f46e5' : '#4f46e5')
              : getHeatColor(count, maxCount, isDark);
            return (
              <path key={i} d={c.d} fill={fill} stroke={strokeColor} strokeWidth="0.5"
                style={{ cursor: count > 0 ? 'pointer' : 'default', transition: 'fill 0.12s' }}
                onMouseMove={e => {
                  const rect = containerRef.current?.getBoundingClientRect();
                  if (!rect || !c.cont) return;
                  setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, cont: c.cont, count });
                  setHoveredCont(c.cont);
                }}
                onMouseLeave={() => { setTooltip(null); setHoveredCont(null); }}
              />
            );
          })}
          {/* ── Legenda de continentes ── */}
          {CONTINENT_LABELS.map((cont, i) => {
            const count = contCount[cont] || 0;
            const col = getHeatColor(count, maxCount, isDark);
            const x = 70
            const y = 280 + i * 30;
            return (
              <g key={cont}>
                <rect x={x} y={y - 11} width={14} height={14} rx={3} fill={col} />
                <text x={x + 18} y={y} fill={isDark ? '#9ca3af' : '#4b5563'} fontSize={11} fontFamily="sans-serif">
                  {cont} {count > 0 ? `(${count})` : ''}
                </text>
              </g>
            );
          })}
          {/* ── Escala de cores ── */}
          <defs>
            <linearGradient id="contScaleGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={isDark ? '#2d3748' : '#d1d5db'} />
              <stop offset="100%" stopColor={isDark ? 'rgb(240,240,240)' : 'rgb(30,30,30)'} />
            </linearGradient>
          </defs>
          <rect x="20" y="540" width="300" height="8" rx="4" fill="url(#contScaleGrad)" />
          <text x="20" y="560" fill={isDark ? '#6b7280' : '#9ca3af'} fontSize={10} fontFamily="sans-serif">0</text>
          <text x="280" y="560" fill={isDark ? '#6b7280' : '#9ca3af'} fontSize={10} fontFamily="sans-serif">{maxCount} pub.</text>
        </svg>
      )}

      {tooltip && (
        <div style={{ position: 'absolute', left: tooltip.x + 14, top: tooltip.y - 12, pointerEvents: 'none', zIndex: 20 }}
          className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 shadow-xl text-white text-xs">
          <div className="font-semibold text-sm mb-0.5">{tooltip.cont}</div>
          <div className="text-gray-300">
            {tooltip.count > 0 ? t('stats.publicationsCount', { count: tooltip.count }) : t('stats.noData')}
          </div>
        </div>
      )}
    </div>
  );
});
ContinentHeatmap.displayName = 'ContinentHeatmap';
// ─────────────────────────────────────────────────────────────────────────────
const ChartExport = ({ id, isOpen, onToggle, chartRef, data, svgOnly = false }) => {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalFormat, setModalFormat] = useState('png');
  const getSvgEl = () => {
    const handle = chartRef?.current;
    if (handle?.getScreenSvg) return handle.getScreenSvg();
    if (handle?.tagName === 'svg') return handle;
    return handle?.querySelector?.('svg') ?? null;
  };

  const getExportSvg = useCallback(async (settings) => {
    const handle = chartRef?.current;
    if (handle?.renderForExport) {
      const width = mmToPx(settings.widthMm, 96);
      const height = mmToPx(settings.heightMm, 96);
      const fontPx = ptToPx(settings.fontPt ?? 10, 96);
      return await handle.renderForExport({ width, height, fontPx });
    }
    // Fallback: clone do SVG renderizado na tela (sem re-layout no tamanho-alvo),
    // dimensionado pela configuração de exportação (mm → px a 96 dpi)
    const el = getSvgEl();
    if (!el) return null;
    const clone = el.cloneNode(true);
    const renderedW = mmToPx(settings.widthMm, 96);
    const renderedH = mmToPx(settings.heightMm, 96);
    return postProcessExportSvg(clone, { renderedW, renderedH, fontPx: (settings.fontPt ?? 10) * 96 / 72 });
  }, [chartRef]);

  const openModal = (format) => {
    setModalFormat(format);
    setModalOpen(true);
    onToggle(id);
  };

  const handlePNG = () => openModal('png');
  const handleSVG = () => openModal('svg');
  const handleXLSX = async () => { await exportToXLSX(data, `${id}.xlsx`); onToggle(id); };

  const handleExport = async (settings, svg) => {
    try {
      const el = svg || await getExportSvg(settings);
      if (!el) return;
      if (modalFormat === 'png') await exportSvgToPng(el, `${id}.png`, settings);
      else await exportSvgElement(el, `${id}.svg`, settings);
    } catch (e) {
      console.error('Export error:', e);
    }
  };

  return (
    <div className="relative">
      <button onClick={() => onToggle(id)} title={t('stats.exportChart')}
        className="bg-gray-800 dark:bg-gray-600 border-none rounded-full p-1.5 cursor-pointer transition-all duration-200 hover:scale-110 flex items-center justify-center"
        style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
        {isOpen ? <X size={12} color="white" /> : <Download size={12} color="white" />}
      </button>
      {isOpen && (
        <div className="absolute top-8 right-0 bg-zinc-800 rounded-lg p-1.5 min-w-[190px] z-50 shadow-xl">
          {!svgOnly && <button onClick={handlePNG} className="w-full text-left px-4 py-2 text-sm text-white bg-transparent hover:bg-zinc-700 rounded cursor-pointer border-none">{t('stats.exportPNG')}</button>}
          <button onClick={handleSVG} className="w-full text-left px-4 py-2 text-sm text-white bg-transparent hover:bg-zinc-700 rounded cursor-pointer border-none">{t('stats.exportSVG')}</button>
          {!svgOnly && <button onClick={handleXLSX} className="w-full text-left px-4 py-2 text-sm text-white bg-transparent hover:bg-zinc-700 rounded cursor-pointer border-none">{t('stats.exportXLSX')}</button>}
        </div>
      )}
      <ExportConfigModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onExport={handleExport} format={modalFormat} svgElement={getSvgEl()} getSvg={getExportSvg} svgOnly={svgOnly} />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SourcePicker — troca a importação exibida naquele slot
// Recebe `sources` como array de strings (labels das importações + "Total")
// e `usedSources` como Set para marcar as já ocupadas em outros slots
// ─────────────────────────────────────────────────────────────────────────────
const SourcePicker = ({ slotId, currentSource, sources, usedSources, isOpen, onToggle, onChange }) => {
  const { t } = useTranslation();
  const pickerId = `${slotId}-src`;

  return (
    <div className="relative">
      <button
        onClick={() => onToggle(pickerId)}
        title={t('stats.changeSource')}
        className="bg-indigo-600 dark:bg-indigo-500 border-none rounded-full px-2.5 py-1 cursor-pointer
                   transition-all duration-200 hover:scale-110 hover:bg-indigo-500 flex items-center"
      >
        <span className="text-[11px] text-white font-semibold leading-none">{displaySource(currentSource)}</span>
      </button>
      {isOpen && (
        <div className="absolute top-8 right-0 bg-zinc-800 rounded-lg p-1.5 min-w-[170px] z-50 shadow-xl">
          {sources.map(src => {
            const isActive = src === currentSource;
            const isOccupied = !isActive && usedSources.has(src);
            return (
              <button
                key={src}
                disabled={isOccupied}
                onClick={() => { if (!isOccupied) { onChange(src); onToggle(pickerId); } }}
                className={`w-full text-left px-4 py-2 text-sm rounded border-none
                  ${isActive ? 'text-indigo-400 bg-zinc-700 font-semibold cursor-default' : ''}
                  ${isOccupied ? 'text-zinc-500 bg-transparent cursor-not-allowed' : ''}
                  ${!isActive && !isOccupied ? 'text-white bg-transparent hover:bg-zinc-700 cursor-pointer' : ''}`}
              >
                {displaySource(src)}
                {isActive && <span className="ml-1 text-xs">✓</span>}
                {isOccupied && <span className="ml-1 text-xs opacity-50">{t('stats.inUse')}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MultiToggle / SectionWrapper / ChartInstance
// ─────────────────────────────────────────────────────────────────────────────
const MultiToggle = ({ options, selected, onToggle, label }) => (
  <div className="flex flex-wrap gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
    {options.map(opt => {
      const active = selected.has(opt);
      const renderLabel = label ? label(opt) : opt;
      return (
        <button key={opt} onClick={() => onToggle(opt)}
          className={`px-3 py-1 text-xs sm:text-sm rounded-md font-medium transition-all duration-150 cursor-pointer border-none
            ${active
              ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 bg-transparent hover:text-gray-700 dark:hover:text-gray-200'}`}
        >{renderLabel}</button>
      );
    })}
  </div>
);

const SectionWrapper = ({ title, controls, children }) => (
  <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700 mb-6">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300">{title}</h3>
      {controls}
    </div>
    {children}
  </div>
);

const ChartInstance = ({ id, label, chartRef, data, openMenuId, onToggle, svgOnly, sourcePicker, children }) => (
  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 flex flex-col gap-2">
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}</span>
      <div className="flex items-center gap-1.5">
        {sourcePicker}
        <ChartExport id={id} isOpen={openMenuId === id} onToggle={onToggle} chartRef={chartRef} data={data} svgOnly={svgOnly} />
      </div>
    </div>
    {children}
  </div>
);


// ─────────────────────────────────────────────────────────────────────────────
// Cores por database
// ─────────────────────────────────────────────────────────────────────────────
const DB_LINE_COLOR = { 'Scopus': '#fb923c', 'Web of Science': '#d4d0e3', 'ScienceDirect': '#fb923c' };
const DB_BAR_COLOR = { 'Scopus': '#3b2b2b', 'Web of Science': '#592aaa', 'ScienceDirect': '#3b2b2b' };
const TOTAL_LINE = '#646464';
const TOTAL_BAR = '#3f3f3f';
const getLineColor = (db) => DB_LINE_COLOR[db] ?? TOTAL_LINE;
const getBarColor = (db) => DB_BAR_COLOR[db] ?? TOTAL_BAR;

const displaySource = (source) =>
  source.startsWith('Total:') ? `Total (${source.split(':')[1]})` : source;

// ─────────────────────────────────────────────────────────────────────────────
// TF-IDF + K-Means Clustering (OTIMIZADO)
// ─────────────────────────────────────────────────────────────────────────────
const STOPWORDS = new Set([
  // English
  'the', 'and', 'for', 'that', 'with', 'this', 'from', 'are', 'was', 'were', 'been', 'being',
  'have', 'has', 'had', 'having', 'does', 'did', 'doing', 'will', 'would', 'could', 'should',
  'may', 'might', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'must', 'not', 'but',
  'what', 'which', 'who', 'whom', 'where', 'when', 'why', 'how', 'all', 'each', 'every',
  'both', 'few', 'more', 'most', 'other', 'some', 'such', 'than', 'too', 'very', 'just',
  'about', 'above', 'after', 'again', 'also', 'am', 'an', 'any', 'as', 'at', 'before',
  'between', 'by', 'during', 'into', 'of', 'on', 'only', 'or', 'other', 'our', 'out',
  'over', 'own', 'same', 'so', 'still', 'then', 'there', 'these', 'they', 'those',
  'through', 'under', 'until', 'up', 'we', 'you', 'your', 'its', 'his', 'her', 'him',
  'my', 'me', 'she', 'he', 'it', 'they', 'them', 'their', 'theirs', 'ours', 'mine',
  'is', 'be', 'if', 'in', 'it', 'no', 'so', 'to', 'do', 'is', 'it', 'of', 'in', 'to',
  // Portuguese
  'para', 'com', 'uma', 'por', 'não', 'mais', 'dos', 'como', 'mas', 'foi', 'são', 'tem',
  'sua', 'seu', 'ou', 'ser', 'está', 'isso', 'este', 'esta', 'isso', 'muito', 'também',
  'já', 'era', 'desde', 'até', 'sobre', 'entre', 'quando', 'onde', 'estão', 'isso',
  // Comum em títulos
  'using', 'based', 'approach', 'study', 'analysis', 'effect', 'effects', 'results',
  'method', 'methods', 'model', 'models', 'data', 'paper', 'review', 'use', 'used',
  'new', 'one', 'two', 'first', 'second', 'different', 'higher', 'lower', 'increased',
  'decreased', 'compared', 'associated', 'significant', 'significantly',
]);

const tokenize = (text) => {
  if (!text) return [];
  return text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
};

const buildVocabulary = (documents, maxVocab = 150) => {
  const freq = {};
  documents.forEach(doc => {
    const tokens = new Set(tokenize(doc));
    tokens.forEach(t => { freq[t] = (freq[t] || 0) + 1; });
  });
  return Object.entries(freq)
    .filter(([w, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxVocab)
    .map(([w]) => w);
};

const computeTFIDFMatrix = (documents, vocab) => {
  const N = documents.length;
  const df = new Array(vocab.length).fill(0);
  const tokenSets = documents.map(doc => {
    const counts = {};
    const tokens = tokenize(doc);
    tokens.forEach(t => { counts[t] = (counts[t] || 0) + 1; });
    const inDoc = new Set();
    vocab.forEach((w, i) => {
      if (counts[w]) { df[i]++; inDoc.add(i); }
    });
    return { counts, len: tokens.length, inDoc };
  });

  const idf = df.map(d => Math.log((N + 1) / (d + 1)) + 1);

  return tokenSets.map(({ counts, len }) =>
    vocab.map((w, i) => ((counts[w] || 0) / (len || 1)) * idf[i])
  );
};

const cosineSimilarity = (a, b) => {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
};

const kMeans = (vectors, k, maxIter = 30) => {
  const n = vectors.length;
  if (n === 0) return { clusters: [], centroids: [] };
  const dim = vectors[0].length;

  // k-means++ init
  let centroids = [vectors[Math.floor(Math.random() * n)]];
  for (let c = 1; c < k; c++) {
    const dists = vectors.map(v => {
      let min = Infinity;
      centroids.forEach(cent => {
        const d = 1 - cosineSimilarity(v, cent);
        if (d < min) min = d;
      });
      return min;
    });
    const total = dists.reduce((s, d) => s + d, 0);
    let r = Math.random() * total;
    for (let i = 0; i < dists.length; i++) {
      r -= dists[i];
      if (r <= 0) { centroids.push([...vectors[i]]); break; }
    }
    if (centroids.length <= c) centroids.push([...vectors[Math.floor(Math.random() * n)]]);
  }

  let assignments = new Array(n).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    const newAssignments = vectors.map(v => {
      let best = 0, bestSim = -1;
      centroids.forEach((c, i) => {
        const sim = cosineSimilarity(v, c);
        if (sim > bestSim) { bestSim = sim; best = i; }
      });
      return best;
    });

    if (JSON.stringify(newAssignments) === JSON.stringify(assignments)) break;
    assignments = newAssignments;

    centroids = centroids.map((_, i) => {
      const members = vectors.filter((_, j) => assignments[j] === i);
      if (members.length === 0) return centroids[i];
      const newCent = new Array(dim).fill(0);
      members.forEach(m => m.forEach((v, d) => { newCent[d] += v; }));
      return newCent.map(v => v / members.length);
    });
  }

  return { clusters: assignments, centroids };
};

const extractTopKeywords = (docs, vocab, vectors, n = 5) => {
  const wordScores = vocab.map((w, i) => {
    const score = vectors.reduce((sum, vec) => sum + vec[i], 0) / (vectors.length || 1);
    return { word: w, score };
  });
  return wordScores.sort((a, b) => b.score - a.score).slice(0, n).map(({ word }) => word);
};

const CLUSTER_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#3b82f6', '#84cc16',
];

// ─────────────────────────────────────────────────────────────────────────────
// Cluster Visualization: Bar Chart
// ─────────────────────────────────────────────────────────────────────────────
const ClusterBarChart = ({ clusterData, theme }) => {
  const stroke = theme === 'dark' ? '#9ca3af' : '#374151';
  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={clusterData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={stroke} strokeWidth={0.5} />
        <XAxis
          dataKey="name"
          stroke={stroke}
          tick={{ fontSize: 11, fill: stroke }}
          angle={-45}
          textAnchor="end"
          interval={0}
        />
        <YAxis stroke={stroke} tick={{ fontSize: 12, fill: stroke }} />
        <Tooltip
          contentStyle={{
            backgroundColor: theme === 'dark' ? '#1f2937' : '#fff',
            border: `1px solid ${theme === 'dark' ? '#374151' : '#e5e7eb'}`,
            borderRadius: '8px',
            color: theme === 'dark' ? '#f3f4f6' : '#111827'
          }}
          formatter={(value) => [`${value} artigos`, 'Quantidade']}
        />
        <Bar dataKey="count" name="Artigos">
          {clusterData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={CLUSTER_COLORS[index % CLUSTER_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Cluster Visualization: Heatmap
// ─────────────────────────────────────────────────────────────────────────────
const ClusterHeatmap = ({ similarityMatrix, clusterNames, theme }) => {
  const [hoveredCell, setHoveredCell] = useState(null);
  const size = clusterNames.length;
  const cellSize = Math.min(60, Math.floor(500 / size));

  const getColor = (value) => {
    if (theme === 'dark') {
      const r = Math.round(30 + value * 80);
      const g = Math.round(40 + value * 60);
      const b = Math.round(100 + value * 155);
      return `rgb(${r},${g},${b})`;
    }
    const r = Math.round(255 - value * 200);
    const g = Math.round(255 - value * 150);
    const b = Math.round(255 - value * 50);
    return `rgb(${r},${g},${b})`;
  };

  return (
    <div className="overflow-auto">
      <svg width={size * cellSize + 120} height={size * cellSize + 80}>
        {/* Column headers */}
        {clusterNames.map((name, i) => (
          <text
            key={`col-${i}`}
            x={120 + i * cellSize + cellSize / 2}
            y={size * cellSize + 20}
            textAnchor="middle"
            fontSize={10}
            fill={theme === 'dark' ? '#9ca3af' : '#374151'}
            transform={`rotate(-45, ${120 + i * cellSize + cellSize / 2}, ${size * cellSize + 20})`}
          >
            {name.length > 10 ? name.slice(0, 10) + '...' : name}
          </text>
        ))}
        {/* Row headers */}
        {clusterNames.map((name, i) => (
          <text
            key={`row-${i}`}
            x={115}
            y={i * cellSize + cellSize / 2 + 4}
            textAnchor="end"
            fontSize={10}
            fill={theme === 'dark' ? '#9ca3af' : '#374151'}
          >
            {name.length > 12 ? name.slice(0, 12) + '...' : name}
          </text>
        ))}
        {/* Cells */}
        {similarityMatrix.map((row, i) =>
          row.map((val, j) => (
            <g key={`cell-${i}-${j}`}>
              <rect
                x={120 + j * cellSize}
                y={i * cellSize}
                width={cellSize - 2}
                height={cellSize - 2}
                fill={getColor(val)}
                rx={3}
                onMouseEnter={() => setHoveredCell({ i, j, val })}
                onMouseLeave={() => setHoveredCell(null)}
                stroke={theme === 'dark' ? '#1f2937' : '#fff'}
                strokeWidth={1}
              />
              {cellSize > 35 && (
                <text
                  x={120 + j * cellSize + cellSize / 2 - 1}
                  y={i * cellSize + cellSize / 2 + 4}
                  textAnchor="middle"
                  fontSize={9}
                  fill={val > 0.5 ? '#fff' : theme === 'dark' ? '#d1d5db' : '#374151'}
                >
                  {val.toFixed(2)}
                </text>
              )}
            </g>
          ))
        )}
      </svg>
      {hoveredCell && (
        <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          {clusterNames[hoveredCell.i]} × {clusterNames[hoveredCell.j]}: {hoveredCell.val.toFixed(3)}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Cluster Visualization: Network Graph
// ─────────────────────────────────────────────────────────────────────────────
const ClusterNetwork = ({ clusterData, similarityMatrix, theme }) => {
  const svgRef = useRef(null);
  const [positions, setPositions] = useState([]);
  const [dragging, setDragging] = useState(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [simThreshold, setSimThreshold] = useState(0.1);

  const stroke = theme === 'dark' ? '#9ca3af' : '#374151';
  const textColor = theme === 'dark' ? '#e5e7eb' : '#1f2937';
  const bgColor = theme === 'dark' ? '#111827' : '#f9fafb';
  const nodeBg = theme === 'dark' ? '#374151' : '#ffffff';

  // Initialize positions in a circle
  useEffect(() => {
    if (clusterData.length === 0) return;
    const cx = 300, cy = 220, radius = 150;
    const newPositions = clusterData.map((_, i) => {
      const angle = (2 * Math.PI * i) / clusterData.length - Math.PI / 2;
      return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
    });
    setPositions(newPositions);
  }, [clusterData.length]);

  // Force simulation
  useEffect(() => {
    if (positions.length === 0) return;

    const simulate = () => {
      setPositions(prev => {
        if (prev.length === 0) return prev;
        const next = prev.map(p => ({ ...p }));
        const n = next.length;

        // Repulsion between all nodes
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const dx = next[j].x - next[i].x;
            const dy = next[j].y - next[i].y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = 2000 / (dist * dist);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            next[i].x -= fx;
            next[i].y -= fy;
            next[j].x += fx;
            next[j].y += fy;
          }
        }

        // Attraction along edges (similar nodes)
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            if (similarityMatrix[i]?.[j] > simThreshold) {
              const dx = next[j].x - next[i].x;
              const dy = next[j].y - next[i].y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const force = (dist - 120) * 0.01 * similarityMatrix[i][j];
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;
              next[i].x += fx;
              next[i].y += fy;
              next[j].x -= fx;
              next[j].y -= fy;
            }
          }
        }

        // Center gravity
        next.forEach(p => {
          p.x += (300 - p.x) * 0.01;
          p.y += (220 - p.y) * 0.01;
          // Bounds
          p.x = Math.max(60, Math.min(540, p.x));
          p.y = Math.max(50, Math.min(390, p.y));
        });

        return next;
      });
    };

    const interval = setInterval(simulate, 50);
    return () => clearInterval(interval);
  }, [positions.length, similarityMatrix, simThreshold]);

  const handleMouseDown = (i, e) => {
    setDragging(i);
    const rect = svgRef.current.getBoundingClientRect();
    setOffset({ x: e.clientX - rect.left - positions[i].x, y: e.clientY - rect.top - positions[i].y });
  };

  const handleMouseMove = (e) => {
    if (dragging === null) return;
    const rect = svgRef.current.getBoundingClientRect();
    setPositions(prev => {
      const next = [...prev];
      next[dragging] = { x: e.clientX - rect.left - offset.x, y: e.clientY - rect.top - offset.y };
      return next;
    });
  };

  const handleMouseUp = () => setDragging(null);

  const maxCount = Math.max(...clusterData.map(c => c.count), 1);

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <label className="text-sm text-gray-600 dark:text-gray-400">
          Limiar de similaridade: {simThreshold.toFixed(2)}
        </label>
        <input
          type="range"
          min="0"
          max="0.8"
          step="0.05"
          value={simThreshold}
          onChange={(e) => setSimThreshold(parseFloat(e.target.value))}
          className="w-32"
        />
      </div>
      <svg
        ref={svgRef}
        width="100%"
        height="440"
        viewBox="0 0 600 440"
        style={{ backgroundColor: bgColor, borderRadius: '8px' }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Edges */}
        {clusterData.map((_, i) =>
          clusterData.map((_, j) => {
            if (i >= j) return null;
            const sim = similarityMatrix[i]?.[j] || 0;
            if (sim <= simThreshold) return null;
            return (
              <line
                key={`edge-${i}-${j}`}
                x1={positions[i]?.x || 0}
                y1={positions[i]?.y || 0}
                x2={positions[j]?.x || 0}
                y2={positions[j]?.y || 0}
                stroke={stroke}
                strokeWidth={sim * 4}
                opacity={sim * 0.8}
              />
            );
          })
        )}
        {/* Nodes */}
        {clusterData.map((cluster, i) => {
          const pos = positions[i] || { x: 300, y: 220 };
          const radius = 20 + (cluster.count / maxCount) * 30;
          return (
            <g
              key={`node-${i}`}
              onMouseDown={(e) => handleMouseDown(i, e)}
              style={{ cursor: dragging === i ? 'grabbing' : 'grab' }}
            >
              <circle
                cx={pos.x}
                cy={pos.y}
                r={radius}
                fill={CLUSTER_COLORS[i % CLUSTER_COLORS.length]}
                stroke={nodeBg}
                strokeWidth={3}
                opacity={0.9}
              />
              <text
                x={pos.x}
                y={pos.y + 4}
                textAnchor="middle"
                fontSize={12}
                fontWeight="bold"
                fill="#fff"
                pointerEvents="none"
              >
                {cluster.count}
              </text>
              <text
                x={pos.x}
                y={pos.y + radius + 14}
                textAnchor="middle"
                fontSize={10}
                fill={textColor}
              >
                {cluster.name.length > 15 ? cluster.name.slice(0, 15) + '...' : cluster.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// StatisticsSection
// ─────────────────────────────────────────────────────────────────────────────
const StatisticsSection = ({ articles, onUpdateStatus, inclusionCriteria, exclusionCriteria, statistics, theme, importedData = [], }) => {
  const { t } = useTranslation();

  const criterionDisplay = (ctr) =>
    ctr === 'Exclusão' ? t('stats.exclusion') : ctr === 'Inclusão' ? t('stats.inclusion') : t('stats.total');
  const filterTabLabel = (k) => t('stats.filterLabel', { n: k.replace('filter', '') });

  // ── importOptions ─────────────────────────────────────────────────────────
  // Cada entrada de importedData vira uma opção de fonte nos pickers.
  // Label: "Scopus #1", "WoS #2", etc.
  const importOptions = importedData.map(imp => ({
    id: imp.id,
    database: imp.database,
    label: `${imp.database === 'Web of Science' ? 'WoS' : imp.database} #${imp.id}`,
  }));

  // Lista de fontes disponíveis no MultiToggle e SourcePicker.
  // "Total" agrega todos os artigos (sem duplicatas) e aparece ao final.
  const availableDatabases = [
    ...Array.from(new Set(importOptions.map(o => o.database))),
    ...(importOptions.length > 0 ? ['Total'] : []),
  ];
  // ── sourcesForDatabase ────────────────────────────────────────────────────
  // Retorna os labels de importação disponíveis para uma base específica.
  const sourcesForDatabase = useCallback((database) => {
    if (database === 'Total') return ['Total'];
    return [
      ...importOptions.filter(o => o.database === database).map(o => o.label),
      `Total:${database}`,  // ← "Total:Scopus", "Total:Web of Science"
    ];
  }, [importOptions]);

  const defaultSourceForDatabase = useCallback((database) => {
    if (database === 'Total') return 'Total';
    return importOptions.find(o => o.database === database)?.label ?? 'Total';
  }, [importOptions]);
  // ── tabs ──────────────────────────────────────────────────────────────────
  const TABS = [
    { id: 'bibliometria', label: t('stats.tabOverview') },
    { id: 'processo', label: t('stats.tabProcess') },
    { id: 'network', label: t('stats.tabNetwork', 'Redes Bibliométricas') },
  ];
  const [activeTab, setActiveTab] = useState('bibliometria');
  const TabNav = () => (
    <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-xl mb-6 w-fit">
      {TABS.map(tab => (
        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-150 cursor-pointer border-none
            ${activeTab === tab.id
              ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 bg-transparent hover:text-gray-700 dark:hover:text-gray-200'}`}
        >{tab.label}</button>
      ))}
    </div>
  );

  // ── refs dinâmicos ────────────────────────────────────────────────────────
  // Usamos mapas de refs chaveados pelo label da fonte ("Scopus #1", "Total", etc.)
  // para suportar qualquer quantidade de importações sem declarar refs estáticos.
  const pubYearRefsMap = useRef({});
  const pubScoreRefsMap = useRef({});

  // Retorna (criando se necessário) o ref para uma chave num mapa dinâmico
  const getDynRef = (map, key) => {
    if (!map.current[key]) map.current[key] = { current: null };
    return map.current[key];
  };

  // Refs estáticos (seções sem slots)
  const filterRefs = { filter1: useRef(null), filter2: useRef(null), filter3: useRef(null) };
  const filterOriginRef = { filter1: useRef(null), filter2: useRef(null), filter3: useRef(null) };
  const prismaRef = useRef(null);
  const countriesRef = useRef(null);
  const countriesMapRef = useRef(null);
  const continentMapRef = useRef(null);
  const pubJournalRefs = useRef(null);
  const criterionChartRefs = { Exclusão: useRef(null), Inclusão: useRef(null), Total: useRef(null) };

  // ── ui state ──────────────────────────────────────────────────────────────
  const [openMenuId, setOpenMenuId] = useState(null);
  const [stroke, setStroke] = useState('#000');
  const [topNCountries, setTopNCountries] = useState(10);
  const [countryView, setCountryView] = useState('bar'); // 'bar' | 'map' | 'continent'
  const [topNJournals, setTopNJournals] = useState(5);
  const [scoreBinSize, setScoreBinSize] = useState(5);

  // ── slots ─────────────────────────────────────────────────────────────────
  // Cada slot: { id: string, source: label da importação ou "Total" }
  // O slot inicial exibe "Total". O usuário pode adicionar/remover via MultiToggle
  // e trocar a fonte individual via SourcePicker.
  const [pubYearSlots, setPubYearSlots] = useState([
    { id: 'py-0', database: 'Total', source: 'Total' }
  ]);
  const [pubScoreSlots, setPubScoreSlots] = useState([
    { id: 'ps-0', database: 'Total', source: 'Total' }
  ]);

  // ── estados simples (sem slots) ───────────────────────────────────────────
  const [filterSelected, setFilterSelected] = useState(new Set(['filter1']));
  const [filterOriginSelected, setFilterOriginSelected] = useState(new Set(['filter1']));
  const [criterionSelected, setCriterionSelected] = useState(new Set(['Exclusão', 'Inclusão', 'Total']));
  const [criterionsCount, setCriterionsCount] = useState({
    dataProcessing: [{ name: 'included', value: 0 }, { name: 'excluded', value: 0 }, { name: 'unclassified', value: 0 }],
    filter1: [{ name: 'included', value: 0 }, { name: 'excluded', value: 0 }, { name: 'unclassified', value: 0 }],
    filter2: [{ name: 'included', value: 0 }, { name: 'excluded', value: 0 }, { name: 'unclassified', value: 0 }],
    filter3: [{ name: 'included', value: 0 }, { name: 'excluded', value: 0 }, { name: 'unclassified', value: 0 }],
  });
  const [originCount, setOriginCount] = useState({ filter1: [], filter2: [], filter3: [] });


  // ── dados derivados ───────────────────────────────────────────────────────
  // Dicionários chaveados pelo label da fonte: { 'Scopus #1': [...], 'Total': [...] }
  const [pubYearData, setPubYearData] = useState({});
  const [pubScoreData, setPubScoreData] = useState({});
  const [countriesCount, setCountriesCount] = useState([]);
  const [journalCount, setJournalCount] = useState([]);
  const [criterionChartData, setCriterionChartData] = useState({ Exclusão: [], Inclusão: [], Total: [] });


  // ── handleSource ──────────────────────────────────────────────────────────
  // "Total" → todos os artigos (sem duplicatas se deduplicate=true)
  // label de importação → artigos onde article.idData === importOption.id
  const handleSource = useCallback((sourceLabel, deduplicate = false, database = null) => {
    const ar = deduplicate ? articles.filter(a => !a.isDuplicate) : articles;
    if (sourceLabel === 'Total') {
      // "Total" global → todos
      if (!database) return ar;
      // "Total" de uma base → só artigos daquela base
      return ar.filter(a => a.source === database);
    }

    const opt = importOptions.find(o => o.label === sourceLabel);
    if (!opt) return [];
    return ar.filter(a => a.idData === opt.id);
  }, [articles, importedData]);

  // ── helpers de processamento ──────────────────────────────────────────────
  const publicationsByYear = (arts) =>
    Object.entries(arts.reduce((acc, a) => { acc[a.year] = (acc[a.year] || 0) + 1; return acc; }, {}))
      .map(([year, count]) => ({ year, count }));

  const publicationsBySource = (arts) =>
    Object.entries(arts.reduce((acc, a) => { acc[a.source] = (acc[a.source] || 0) + 1; return acc; }, {}))
      .map(([source, count]) => ({ source, count }));

  const publicationsByScore = (arts, binSize = 1) => {
    const total = arts.length;
    if (total === 0) return [];
    const scores = arts.map(a => Number(a.score));
    const mean = scores.reduce((s, v) => s + v, 0) / total;
    const std = Math.sqrt(scores.reduce((s, v) => s + (v - mean) ** 2, 0) / total);
    const binMap = {};
    arts.forEach(a => { const b = Math.floor(Number(a.score) / binSize) * binSize; binMap[b] = (binMap[b] || 0) + 1; });
    const minBin = Math.floor(Math.min(...scores) / binSize) * binSize;
    const maxBin = Math.floor(Math.max(...scores) / binSize) * binSize;
    const allBins = [];
    for (let b = minBin; b <= maxBin; b += binSize) allBins.push({ binStart: b, count: binMap[b] || 0 });
    let acc = 0;
    return allBins.map(({ binStart, count }) => {
      acc += count;
      const mid = binStart + binSize / 2;
      const label = binSize === 1 ? String(binStart) : `${binStart}-${binStart + binSize - 1}`;
      const gaussian = std > 0 ? total * binSize * (1 / (std * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((mid - mean) / std) ** 2) : 0;
      return { score: label, count, pct: Math.round((count / total) * 100), cumulative: Math.round((acc / total) * 100), gaussian };
    });
  };

  const publicationsByJournal = (array) => {
    const c = {};
    array.filter(a => a.journal?.length && !a.journal.includes('Revista não informada'))
      .forEach(a => { const k = a.journal.trim().toLowerCase(); c[k] = (c[k] || 0) + 1; });
    return Object.entries(c).map(([journal, count]) => ({ journal, count })).sort((a, b) => b.count - a.count);
  };

  const contarCountries = (array) => {
    const all = array.filter(a => a.countries?.length && !a.countries.includes('País não informado')).flatMap(a => a.countries);
    return Object.entries(all.reduce((acc, c) => { acc[c] = (acc[c] || 0) + 1; return acc; }, {}))
      .map(([country, count]) => ({ country, count })).sort((a, b) => b.count - a.count);
  };

  // ── effects ───────────────────────────────────────────────────────────────
  // pubYearData
  useEffect(() => {
    const yearData = { Total: publicationsByYear(handleSource('Total', true)) };

    importOptions.forEach(opt => {
      yearData[opt.label] = publicationsByYear(handleSource(opt.label));
    });

    // "Total por base" — ex: chave "Total:Scopus", "Total:Web of Science"
    Array.from(new Set(importOptions.map(o => o.database))).forEach(db => {
      yearData[`Total:${db}`] = publicationsByYear(handleSource('Total', false, db));
    });

    setPubYearData(yearData);
    setCountriesCount(contarCountries(handleSource('Total', true)));
    setJournalCount(publicationsByJournal(handleSource('Total')));
  }, [articles, importedData]);

  // pubScoreData — idem
  useEffect(() => {
    const scoreData = { Total: publicationsByScore(handleSource('Total', true), scoreBinSize) };

    importOptions.forEach(opt => {
      scoreData[opt.label] = publicationsByScore(handleSource(opt.label), scoreBinSize);
    });

    Array.from(new Set(importOptions.map(o => o.database))).forEach(db => {
      scoreData[`Total:${db}`] = publicationsByScore(handleSource('Total', true, db), scoreBinSize);
    });

    setPubScoreData(scoreData);
  }, [articles, importedData, scoreBinSize]);

  useEffect(() => { setStroke(theme === 'dark' ? '#fff' : '#000'); }, [theme]);

  useEffect(() => {

    // 1. Converter HEX para HSL
    const hexToHSL = (hex) => {
      let r = parseInt(hex.slice(1, 3), 16) / 255;
      let g = parseInt(hex.slice(3, 5), 16) / 255;
      let b = parseInt(hex.slice(5, 7), 16) / 255;

      let max = Math.max(r, g, b), min = Math.min(r, g, b);
      let h, s, l = (max + min) / 2;

      if (max === min) {
        h = s = 0;
      } else {
        let d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
      }
      return { h, s, l };
    };

    // 2. Converter HSL de volta para HEX
    const hslToHex = (h, s, l) => {
      let r, g, b;
      if (s === 0) {
        r = g = b = l;
      } else {
        const hue2rgb = (p, q, t) => {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1 / 6) return p + (q - p) * 6 * t;
          if (t < 1 / 2) return q;
          if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
          return p;
        };
        let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        let p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
      }
      const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    };

    // 3. Função para gerar o Array de tonalidades
    const generatePalette = (hex, steps = 5) => {
      const { h, s, l } = hexToHSL(hex);
      const palette = [];

      for (let i = 1; i <= steps; i++) {
        // Espalha a luminosidade de 10% a 90%
        const newL = i / (steps + 1);
        palette.push(hslToHex(h, s, newL));
      }
      return palette;
    };

    const variationsScopus = generatePalette(DB_LINE_COLOR['Scopus'], importOptions.map(opt => opt.database == 'Scopus').length);
    const variationsWOS = generatePalette(DB_BAR_COLOR['Web of Science'], importOptions.map(opt => opt.database == 'Web of Science').length);
    const variationsScienceDirect = generatePalette(DB_LINE_COLOR['ScienceDirect'], importOptions.map(opt => opt.database == 'ScienceDirect').length);

    setOriginColorsScopus(variationsScopus)
    setOriginColorsWos(variationsWOS)
    setOriginColorsScienceDirect(variationsScienceDirect)
  }, [importedData]);

  useEffect(() => {
    const mk = (key) => [
      { name: 'included', value: statistics[key].included },
      { name: 'excluded', value: statistics[key].excluded },
      { name: 'unclassified', value: statistics[key].pending },
    ];
    setCriterionsCount({ dataProcessing: mk('dataProcessing'), filter1: mk('filter1'), filter2: mk('filter2'), filter3: mk('filter3') });
  }, [statistics]);

  useEffect(() => {
    const filters = Object.entries(statistics).filter(([key, value]) => key.includes('filter') && (value.included > 0 || value.excluded > 0)).map(fk => fk[0])
    filters.map(fk => {
      setFilterSelected(prev => {
        const next = new Set(prev);
        next.has(fk) ? next : next.add(fk); return next;
      });
      setFilterOriginSelected(prev => {
        const next = new Set(prev);
        next.has(fk) ? next : next.add(fk); return next;
      });
    })
  }, [statistics]);



  useEffect(() => {
    // Para cada filtro, conta os artigos incluídos agrupados por importOption.label
    const buildOriginData = (filterKey) => {
      // articles.filter1 === 'included' (ajuste o campo conforme seu modelo)
      const included = articles.filter(a => a[filterKey] === 'included');

      return importOptions.map(opt => ({
        id: opt.label,           // "Scopus #1", "WoS #2", etc.
        name: opt.label,
        value: included.filter(a => a.idData === opt.id).length,
      })).filter(d => d.value > 0); // omite fontes com zero
    };

    setOriginCount({
      filter1: buildOriginData('filter1Status'),
      filter2: buildOriginData('filter2Status'),
      filter3: buildOriginData('filter3Status'),
    });
  }, [articles, importedData]);

  const buildCriterionChartData = useCallback((category) => {
    const countMap = {}, labelMap = {};
    const tally = (field) => articles.forEach(article => (article[field] ?? []).filter(c => c != null).forEach(c => {
      countMap[c.id] = (countMap[c.id] || 0) + 1;
      labelMap[c.id] = (c.label && c.label !== 'undefined') ? c.label : 'Outros';
    }));
    if (category !== 'inclusion') tally('exclusionCriterion');
    if (category !== 'exclusion') tally('inclusionCriterion');
    return Object.entries(countMap).map(([id, value]) => ({ id, name: labelMap[id], value })).sort((a, b) => b.value - a.value);
  }, [articles]);

  useEffect(() => {
    setCriterionChartData({
      Exclusão: buildCriterionChartData('exclusion'),
      Inclusão: buildCriterionChartData('inclusion'),
      Total: buildCriterionChartData('total'),
    });
  }, [articles, buildCriterionChartData]);

  // ── toggle helpers para slots ─────────────────────────────────────────────
  // ── makeSlotToggle atualizado ─────────────────────────────────────────────
  // Ordem canônica das bases
  const DB_ORDER = ['Scopus', 'Web of Science', 'ScienceDirect', 'Total'];
  const makeSlotToggle = (setSlots, prefix) => (database) =>
    setSlots(prev => {
      const exists = prev.find(s => s.database === database);
      if (exists) return prev.length === 1 ? prev : prev.filter(s => s.database !== database);
      const next = [...prev, {
        id: `${prefix}-${Date.now()}`,
        database,
        source: defaultSourceForDatabase(database),
      }];
      // ← ordena pelo índice canônico
      return next.sort((a, b) => DB_ORDER.indexOf(a.database) - DB_ORDER.indexOf(b.database));
    });
  const togglePubYear = makeSlotToggle(setPubYearSlots, 'py');
  const togglePubScore = makeSlotToggle(setPubScoreSlots, 'ps');

  // SourcePicker: troca a source de um slot específico sem afetar os outros
  const makeSourceChanger = (setSlots) => (slotId, newSource) =>
    setSlots(prev => prev.map(s => s.id === slotId ? { ...s, source: newSource } : s));
  const changePubYearSource = makeSourceChanger(setPubYearSlots);
  const changePubScoreSource = makeSourceChanger(setPubScoreSlots);

  // Toggles sem slots
  const toggleFilter = (fk) => setFilterSelected(prev => {
    const next = new Set(prev);
    if (next.has(fk) && next.size === 1) return next;
    next.has(fk) ? next.delete(fk) : next.add(fk); return next;
  });
  const toggleCriterion = (ctr) => setCriterionSelected(prev => {
    const next = new Set(prev); if (next.has(ctr) && next.size === 1) return next;
    next.has(ctr) ? next.delete(ctr) : next.add(ctr); return next;
  });
  const toggleMenu = (id) => setOpenMenuId(prev => prev === id ? null : id);
  const toggleFilterOrigin = (fk) =>
    setFilterOriginSelected(prev => {
      const next = new Set(prev);
      if (next.has(fk) && next.size === 1) return next; // mínimo 1
      next.has(fk) ? next.delete(fk) : next.add(fk);
      return next;
    });

  // ── derived ───────────────────────────────────────────────────────────────
  const hasAny = importedData.length > 0 && articles.length > 0;
  const filterTabs = ['filter1', 'filter2', 'filter3'].filter(k => criterionsCount[k].some(e => e.value !== 0));
  const hasExclusion = (a) => Array.isArray(a.exclusionCriterion) && a.exclusionCriterion.some(c => c != null);
  const hasInclusionFn = (a) => Array.isArray(a.inclusionCriterion) && a.inclusionCriterion.some(c => c != null);
  const hasAnyCriterion = articles.some(a => hasExclusion(a) || hasInclusionFn(a));
  const availableCriterions = [
    articles.some(hasExclusion) && 'Exclusão',
    articles.some(hasInclusionFn) && 'Inclusão',
    hasAnyCriterion && 'Total',
  ].filter(Boolean);

  const visibleCountries = countriesCount.slice(0, topNCountries);
  const visibleJournals = journalCount.slice(0, topNJournals);

  const gridClass = (count) =>
    count === 1 ? 'grid grid-cols-1' :
      count === 2 ? 'grid grid-cols-1 md:grid-cols-2 gap-4' :
        'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4';

  // ── paletas / helpers visuais ─────────────────────────────────────────────
  const pieColors = { included: '#4ade80', excluded: '#f87171', unclassified: '#94a3b8' };
  const pieLabels = { included: t('stats.included'), excluded: t('stats.excluded'), unclassified: t('stats.unclassified') };
  const EXCLUSION_COLORS = ['#f87171', '#ef4444', '#dc2626', '#fca5a5', '#fb7185', '#f43f5e', '#e11d48', '#fda4af', '#b91c1c', '#ff6b6b'];
  const INCLUSION_COLORS = ['#4ade80', '#22c55e', '#16a34a', '#86efac', '#34d399', '#10b981', '#059669', '#6ee7b7', '#15803d', '#a7f3d0'];
  const TOTAL_COLORS = ['#6366f1', '#f59e0b', '#06b6d4', '#8b5cf6', '#14b8a6', '#f97316', '#ec4899', '#3b82f6', '#a855f7', '#0ea5e9'];
  const ORIGIN_COLORS = ['#6366f1', '#f59e0b', '#06b6d4', '#8b5cf6', '#14b8a6', '#f97316', '#ec4899', '#3b82f6'];


  const [originColorsScopus, setOriginColorsScopus] = useState(['#6366f1'])
  const [originColorsWOS, setOriginColorsWos] = useState(['#6366f1'])
  const [originColorsScienceDirect, setOriginColorsScienceDirect] = useState(['#6366f1'])

  const getOriginColors = (or) => or.includes('Scop') ? originColorsScopus : or.includes('WoS') ? originColorsWOS : or.includes('ScienceDirect') ? originColorsScienceDirect : TOTAL_COLORS;

  const getCriterionColors = (ctr) => ctr.includes('Exclus') ? EXCLUSION_COLORS : ctr.includes('Inclus') ? INCLUSION_COLORS : TOTAL_COLORS;

  const toTitleCase = (str) => String(str).replace(/\b\w/g, c => c.toUpperCase());
  const formatVehicle = (str, max = 20) => {
    if (str.length <= max) return toTitleCase(str);
    const m = str.match(/\b([A-Z]{2,})\s*(\d{4})\b/); if (m) return `${m[1]} ${m[2]}`;
    const s = str.match(/\b([A-Z]{3,})\b/); if (s) return s[1];
    return toTitleCase(str.slice(0, max).trimEnd()) + '...';
  };

  const toExportId = (title, source) =>
    `${title}-${displaySource(source)}`
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
      .replace(/\s+/g, '_')
      .replace(/[()]/g, '')
      .replace(/_+/g, '_');

  const sharedTooltip = (labelKey, color) => ({
    content: ({ active, payload }) => {
      if (!active || !payload?.length) return null;
      const d = payload[0].payload;
      return (
        <div style={{ background: '#1a1a1a', padding: '10px', border: '1px solid #444', borderRadius: '8px' }}>
          <p style={{ margin: 0, fontWeight: 'bold', color: '#fff' }}>{toTitleCase(d[labelKey])}</p>
          <p style={{ margin: '5px 0 0', color }}>{t('stats.qty', { count: d.count })}</p>
        </div>
      );
    },
  });
  const criterionTooltip = {
    content: ({ active, payload }) => {
      if (!active || !payload?.length) return null; const d = payload[0].payload;
      return (
        <div style={{ background: '#1a1a1a', padding: '10px', border: '1px solid #444', borderRadius: '8px' }}>
          <p style={{ margin: 0, fontWeight: 'bold', color: '#fff', maxWidth: 220, fontSize: 12 }}>{d.name}</p>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 12 }}>{t('stats.articlesCount', { count: d.value })}</p>
        </div>
      );
    },
  };

  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, value }) => {
    if (!value || !percent) return null;
    const R = Math.PI / 180, radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    return <text x={cx + radius * Math.cos(-midAngle * R)} y={cy + radius * Math.sin(-midAngle * R)}
      fill="white" textAnchor="middle" dominantBaseline="central" fontSize={14} fontWeight="600">
      {`${(percent * 100).toFixed(0)}%`}</text>;
  };
  const renderCriterionLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, value }) => {
    if (!value || !percent || percent < 0.03) return null; const R = Math.PI / 180;
    if (percent < 0.07) {
      const radius = outerRadius + 18, x = cx + radius * Math.cos(-midAngle * R), y = cy + radius * Math.sin(-midAngle * R);
      return <text x={x} y={y} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={11} fill="#9ca3af">{`${(percent * 100).toFixed(0)}%`}</text>;
    }
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    return <text x={cx + radius * Math.cos(-midAngle * R)} y={cy + radius * Math.sin(-midAngle * R)}
      fill="white" textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight="600">
      {`${(percent * 100).toFixed(0)}%`}</text>;
  };
  const CustomLegend = ({ data }) => (
    <div className="flex justify-center flex-wrap gap-3 mt-2">
      {data.filter(i => i.value > 0).map((entry, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: pieColors[entry.name] }} />
          <span className="text-xs text-gray-700 dark:text-gray-300">{pieLabels[entry.name]}: {entry.value}</span>
        </div>
      ))}
    </div>
  );
  const CriterionLegend = ({ data, ctr }) => {
    const cols = getCriterionColors(ctr);
    return (
      <div className={data.length <= 3 ? `flex justify-center flex-wrap gap-3 mt-2` : `grid gap-x-8 gap-y-1 mt-2 max-h-36 pr-1 mx-auto w-fit grid-cols-2`}>
        {data.map((entry, i) => (
          <div key={entry.id} className="flex items-start gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: cols[i % cols.length] }} />
            <span className="text-xs text-gray-700 dark:text-gray-300 leading-tight">
              <span className="font-semibold">{entry.id}:</span>
              <span className="text-gray-300"> ({entry.value})</span>
            </span>
          </div>
        ))}
      </div>
    );
  };
  const OriginLegend = ({ data, or }) => {
    return (
      <div className={data.length <= 3 ? `flex justify-center flex-wrap gap-3 mt-2` : `grid gap-x-8 gap-y-1 mt-2 max-h-36 pr-1 mx-auto w-fit grid-cols-2`}>
        {data.map((entry, i) => (
          <div key={entry.id} className="flex items-start gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: getOriginColors(entry.id)[i % getOriginColors(entry.id).length] }} />
            <span className="text-xs text-gray-700 dark:text-gray-300 leading-tight">
              <span className="font-semibold">{entry.id}:</span>
              <span className="text-gray-300"> ({entry.value})</span>
            </span>
          </div>
        ))}
      </div>
    );
  };

  // ── renderSlotSection ─────────────────────────────────────────────────────
  // Helper que renderiza uma SectionWrapper com slots e SourcePicker integrado.
  //
  // Props:
  //   title          — título da seção
  //   slots          — array de { id, source }
  //   toggleSlot     — fn chamada pelo MultiToggle
  //   changeSource   — fn(slotId, newSource) chamada pelo SourcePicker
  //   getRef         — fn(sourceLabel) => ref dinâmico
  //   data           — { [sourceLabel]: dataArray }
  //   extraControls  — JSX extra ao lado do MultiToggle (ex: range de binSize)
  //   renderChart    — fn(slot, chartRef) => JSX do gráfico interno
  // ── renderSlotSection: usedDatabases para o MultiToggle ──────────────────
  const renderSlotSection = ({ title, slots, toggleSlot, changeSource, getRef, data, extraControls, renderChart }) => {
    const usedDatabases = new Set(slots.map(s => s.database));  // ← bases, não sources
    const usedSources = new Set(slots.map(s => s.source));    // ← para o SourcePicker

    return (
      <SectionWrapper
        title={title}
        controls={
          <div className="flex flex-wrap items-center gap-2">
            <MultiToggle
              options={availableDatabases}     // ← bases únicas
              selected={usedDatabases}          // ← bases ativas
              onToggle={toggleSlot}
            />
            {extraControls}
          </div>
        }
      >
        <div className={gridClass(slots.length)}>
          {slots.map(slot => {
            const chartRef = getRef(slot.source);
            const slotSources = sourcesForDatabase(slot.database);  // ← filtrado pela base
            const slotUsedSources = new Set(
              slots.filter(s => s.id !== slot.id).map(s => s.source)   // ← outros slots bloqueados
            );

            return (
              <ChartInstance
                key={slot.id}
                id={`${title}-${displaySource(slot.source)}`
                  .toLowerCase()
                  .replace(/\s+/g, '_')
                  .replace(/[()]/g, '')
                }
                label={displaySource(slot.source)}   // ← era: label={slot.source}
                chartRef={chartRef}
                data={data[slot.source] ?? []}
                openMenuId={openMenuId}
                onToggle={toggleMenu}
                sourcePicker={
                  <SourcePicker
                    slotId={slot.id}
                    currentSource={slot.source}
                    sources={slotSources}         // ← só importações da base deste slot
                    usedSources={slotUsedSources} // ← bloqueia só o que outros slots já usam
                    isOpen={openMenuId === `${slot.id}-src`}
                    onToggle={toggleMenu}
                    onChange={(src) => changeSource(slot.id, src)}
                  />
                }
              >
                {renderChart(slot, chartRef)}
              </ChartInstance>
            );
          })}
        </div>
      </SectionWrapper>
    );
  };

  // Retorna o database de uma fonte (null para "Total")
  const slotDatabase = (sourceLabel) => {
    if (sourceLabel === 'Total') return null;

    const db = sourceLabel.includes(':') ? sourceLabel.includes(':') ? sourceLabel.split(":")[1] : sourceLabel : importOptions.find(o => o.label === sourceLabel)?.database ?? null

    return db;
  };

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6 mb-6 transition-colors duration-200">
      <div data-tour="section-statistics">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
          <ChartArea className="h-6 w-6 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
          {t('stats.sectionTitle')}
        </h2>

        <TabNav />
      </div>

      {/* ═══ ABA BIBLIOMETRIA ════════════════════════════════════════════════ */}
      {activeTab === 'bibliometria' && (
        <>
          {/* Publicações por ano */}
          {hasAny && renderSlotSection({
            title: t('stats.pubByYear'),
            slots: pubYearSlots,
            toggleSlot: togglePubYear,
            changeSource: changePubYearSource,
            getRef: (src) => getDynRef(pubYearRefsMap, src),
            data: pubYearData,
            renderChart: (slot, chartRef) => {
              const db = slotDatabase(slot.source);
              const lineColor = db ? getLineColor(db) : TOTAL_LINE;
              const barColor = db ? getBarColor(db) : TOTAL_BAR;
              return (
                <>
                  <ExportableChart ref={chartRef}>
                    {(cfg) => (
                      <ComposedChart
                        width={cfg.width}
                        height={cfg.height}
                        responsive={!cfg.export}
                        style={cfg.export ? undefined : { width: '100%', aspectRatio: 1, maxHeight: '60vh' }}
                        data={pubYearData[slot.source] ?? []} margin={{ top: 5, right: 4, left: 0, bottom: 5 }}
                      >
                        <CartesianGrid stroke={stroke} strokeWidth={0.5} />
                        <XAxis dataKey="year" stroke={stroke} tick={{ fontSize: cfg.fontPx }} />
                        <YAxis dataKey="count" stroke={stroke} width={40} tick={{ fontSize: cfg.fontPx }} />
                        <Tooltip {...sharedTooltip('year', lineColor)} />
                        <Bar dataKey="count" fill={barColor} strokeWidth={2} name="Quant." isAnimationActive={false} />
                        <Line dataKey="count" stroke={lineColor} strokeWidth={2} type="monotone" name="Quant." dot={false} isAnimationActive={false} />
                      </ComposedChart>
                    )}
                  </ExportableChart>
                  {slot.source === 'Total' && <p className="text-xs text-gray-400 mt-1">* {t('stats.duplicatesNotCounted')}</p>}
                </>
              );
            },
          })}

          {/* Países */}
          {hasAny && (
            <SectionWrapper
              title={
                countryView === 'bar' ? t('stats.pubByCountryTop', { n: topNCountries }) :
                  countryView === 'map' ? t('stats.pubByCountryMap') :
                    t('stats.pubByContinentMap')
              }
              controls={
                <div className="flex items-center gap-2">
                  {/* Botão: mapa de países */}
                  <button
                    onClick={() => setCountryView(countryView === 'map' ? 'bar' : 'map')}
                    title={countryView === 'map' ? t('stats.backToChart') : t('stats.mapByCountry')}
                    className={`rounded-full p-1.5 cursor-pointer transition-all duration-200 hover:scale-110 flex items-center justify-center border-none
                      ${countryView === 'map' ? 'bg-indigo-600 dark:bg-indigo-500' : 'bg-gray-800 dark:bg-gray-600'}`}
                  >
                    <Map size={12} color="white" />
                  </button>
                  {/* Botão: mapa de continentes */}
                  <button
                    onClick={() => setCountryView(countryView === 'continent' ? 'bar' : 'continent')}
                    title={countryView === 'continent' ? t('stats.backToChart') : t('stats.mapByContinent')}
                    className={`rounded-full p-1.5 cursor-pointer transition-all duration-200 hover:scale-110 flex items-center justify-center border-none
                      ${countryView === 'continent' ? 'bg-indigo-600 dark:bg-indigo-500' : 'bg-gray-800 dark:bg-gray-600'}`}
                    style={{ width: 24, height: 24, fontSize: 11 }}
                  >
                    <Earth size={12} color="white" />
                  </button>
                  {/* Controle Top N (só visível no modo gráfico) */}
                  {countryView === 'bar' && (
                    <>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{t('stats.top')}</span>
                      <input type="range" min={1} max={Math.max(1, countriesCount.length)} value={topNCountries}
                        onChange={e => setTopNCountries(Number(e.target.value))} className="w-32 accent-indigo-600 cursor-pointer" />
                      <input type="number" min={1} max={Math.max(1, countriesCount.length)} value={topNCountries}
                        onChange={e => setTopNCountries(Math.min(Math.max(Number(e.target.value), 1), Math.max(1, countriesCount.length)))}
                        className="w-14 text-center text-xs rounded-md border border-gray-300 dark:border-gray-600
                                   bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300
                                   focus:outline-none focus:ring-2 focus:ring-indigo-500 px-1 py-1" />
                    </>
                  )}
                </div>
              }
            >
              {countryView === 'map' ? (
                <ChartInstance id="countries-map" label="" chartRef={countriesMapRef} data={countriesCount} openMenuId={openMenuId} onToggle={toggleMenu} >
                  <WorldHeatmap ref={countriesMapRef} countriesCount={countriesCount} isDark={theme === 'dark'} />
                </ChartInstance>
              ) : countryView === 'continent' ? (
                <ChartInstance id="continents-map" label="" chartRef={continentMapRef} data={null} openMenuId={openMenuId} onToggle={toggleMenu} svgOnly>
                  <ContinentHeatmap ref={continentMapRef} countriesCount={countriesCount} isDark={theme === 'dark'} />
                </ChartInstance>
              ) : (
                <ChartInstance id="countries" label="" chartRef={countriesRef} data={visibleCountries} openMenuId={openMenuId} onToggle={toggleMenu}>
                  <ExportableChart ref={countriesRef}>
                    {(cfg) => (
                      <BarChart layout="vertical"
                        width={cfg.width}
                        height={cfg.height}
                        responsive={!cfg.export}
                        style={cfg.export ? undefined : { width: '100%', aspectRatio: 1.618, maxHeight: '70vh' }}
                        data={visibleCountries} margin={{ top: 5, right: 4, left: 0, bottom: 5 }}>
                        <CartesianGrid stroke={stroke} strokeWidth={0.5} />
                        <XAxis type="number" dataKey="count" stroke={stroke} tick={{ fontSize: cfg.fontPx }} />
                        <YAxis type="category" dataKey="country" stroke={stroke} width={90} tick={{ fontSize: cfg.fontPx }} />
                        <Tooltip {...sharedTooltip('country', '#94a3b8')} />
                        <Bar dataKey="count" fill="#646464" strokeWidth={2} name="Quant." isAnimationActive={false} />
                      </BarChart>
                    )}
                  </ExportableChart>
                </ChartInstance>
              )}
            </SectionWrapper>
          )}

          {/* Veículos */}
          {hasAny && (
            <SectionWrapper
              title={t('stats.pubByVehicle', { n: topNJournals })}
              controls={
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400">{t('stats.top')}</span>
                  <input type="range" min={1} max={Math.max(1, journalCount.length)} value={topNJournals}
                    onChange={e => setTopNJournals(Number(e.target.value))} className="w-32 accent-indigo-600 cursor-pointer" />
                  <input type="number" min={1} max={Math.max(1, journalCount.length)} value={topNJournals}
                    onChange={e => setTopNJournals(Math.min(Math.max(Number(e.target.value), 1), Math.max(1, journalCount.length)))}
                    className="w-14 text-center text-xs rounded-md border border-gray-300 dark:border-gray-600
                               bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300
                               focus:outline-none focus:ring-2 focus:ring-indigo-500 px-1 py-1" />
                </div>
              }
            >
              <ChartInstance id="journals" label="" chartRef={pubJournalRefs} data={visibleJournals} openMenuId={openMenuId} onToggle={toggleMenu}>
                <ExportableChart ref={pubJournalRefs}>
                  {(cfg) => (
                    <BarChart layout="vertical"
                      width={cfg.width}
                      height={cfg.height}
                      responsive={!cfg.export}
                      style={cfg.export ? undefined : { width: '100%', aspectRatio: 1.618, maxHeight: '70vh' }}
                      data={visibleJournals} margin={{ top: 5, right: 4, left: 0, bottom: 5 }}>
                      <CartesianGrid stroke={stroke} strokeWidth={0.5} />
                      <XAxis type="number" dataKey="count" stroke={stroke} tick={{ fontSize: cfg.fontPx }} />
                      <YAxis type="category" dataKey="journal" stroke={stroke} width={90} tick={{ fontSize: cfg.fontPx }}
                        tickFormatter={v => formatVehicle(v, 25)} />
                      <Tooltip {...sharedTooltip('journal', '#94a3b8')} />
                      <Bar dataKey="count" fill="#646464" strokeWidth={2} name="Quant." isAnimationActive={false} />
                    </BarChart>
                  )}
                </ExportableChart>
              </ChartInstance>
            </SectionWrapper>
          )}
          {/* Histograma do score */}
          {hasAny && renderSlotSection({
            title: t('stats.scoreHistogram'),
            slots: pubScoreSlots,
            toggleSlot: togglePubScore,
            changeSource: changePubScoreSource,
            getRef: (src) => getDynRef(pubScoreRefsMap, src),
            data: pubScoreData,
            extraControls: (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('stats.interval')}</span>
                <input type="range" min={1} max={5} value={scoreBinSize}
                  onChange={e => setScoreBinSize(Number(e.target.value))} className="w-32 accent-indigo-600 cursor-pointer" />
                <input type="number" min={1} max={5} value={scoreBinSize}
                  onChange={e => setScoreBinSize(Math.min(Math.max(Number(e.target.value), 1), 5))}
                  className="w-14 text-center text-xs rounded-md border border-gray-300 dark:border-gray-600
                             bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300
                             focus:outline-none focus:ring-2 focus:ring-indigo-500 px-1 py-1" />
              </div>
            ),
            renderChart: (slot, chartRef) => {
              const db = slotDatabase(slot.source);
              const lineColor = db ? getLineColor(db) : TOTAL_LINE;
              const barColor = db ? getBarColor(db) : TOTAL_BAR;
              return (
                <>
                  <ExportableChart ref={chartRef}>
                    {(cfg) => (
                      <ComposedChart
                        width={cfg.width}
                        height={cfg.height}
                        responsive={!cfg.export}
                        style={cfg.export ? undefined : { width: '100%', aspectRatio: pubScoreSlots.length > 1 ? 1 : 1.618, maxHeight: '60vh' }}
                        data={pubScoreData[slot.source] ?? []} margin={{ top: 5, right: 4, left: 0, bottom: 5 }} barCategoryGap={2}
                      >
                        <CartesianGrid stroke={stroke} strokeWidth={0.5} />
                        <XAxis dataKey="score" stroke={stroke} tick={{ fontSize: cfg.fontPx }} />
                        <YAxis dataKey="count" stroke={stroke} width={40} tick={{ fontSize: cfg.fontPx }} />
                        <Tooltip {...sharedTooltip('score', lineColor)} />
                        <Bar dataKey="count" fill={barColor} strokeWidth={1} name="Quant." isAnimationActive={false} />
                        <Line dataKey="gaussian" stroke={lineColor} strokeWidth={2} type="natural" name="Gauss" dot={false} isAnimationActive={false} />
                      </ComposedChart>
                    )}
                  </ExportableChart>
                  {slot.source === 'Total' && <p className="text-xs text-gray-400 mt-1">* {t('stats.duplicatesNotCounted')}</p>}
                </>
              );
            },
          })}
        </>
      )}

      {/* ═══ ABA PROCESSO DE SELEÇÃO ═════════════════════════════════════════ */}
      {activeTab === 'processo' && (
        <>
          {/* Fluxograma PRISMA */}
          <SectionWrapper
            title={t('stats.prismaTitle')}
            controls={<ChartExport id="prisma" isOpen={openMenuId === 'prisma'} onToggle={toggleMenu} chartRef={prismaRef} data={null} svgOnly />}
          >
            <PrismaFlowchart
              ref={prismaRef} statistics={statistics}
              databases={availableDatabases.filter(db => db !== 'Total').map(db => ({
                label: db,
                count: articles.filter(a => a.source === db).length,
              }))}
              totalCount={articles.length}
              isDark={theme === 'dark'}
            />
          </SectionWrapper>
          {/* Panorama de Classificação */}
          {filterTabs.length > 0 && (
            <SectionWrapper
              title={t('stats.classificationOverview')}
              controls={
                <MultiToggle
                  options={filterTabs.map(k => k.replace('filter', 'Filtro '))}
                  selected={new Set([...filterSelected].map(k => k.replace('filter', 'Filtro ')))}
                  onToggle={label => toggleFilter(label.replace('Filtro ', 'filter'))}
                  label={(o) => t('stats.filterLabel', { n: o.replace('Filtro ', '') })}
                />
              }
            >
              <div className={gridClass([...filterSelected].filter(fk => filterTabs.includes(fk)).length)}>
                {filterTabs.filter(fk => filterSelected.has(fk)).map(fk => (
                  <ChartInstance key={fk} id={`filter-${fk}`} label={filterTabLabel(fk)}
                    chartRef={filterRefs[fk]} data={criterionsCount[fk]} openMenuId={openMenuId} onToggle={toggleMenu}>
                    <ExportableChart ref={filterRefs[fk]}>
                      {(cfg) => (
                        <PieChart
                          width={cfg.width}
                          height={cfg.height}
                          responsive={!cfg.export}
                          style={cfg.export ? undefined : { width: '100%', aspectRatio: 1, maxHeight: '50vh' }}>
                          <Pie data={criterionsCount[fk]} dataKey="value" label={renderCustomizedLabel}
                            stroke="none" labelLine={false} isAnimationActive={false}>
                            {criterionsCount[fk].map((e, i) => <Cell key={i} fill={pieColors[e.name]} />)}
                          </Pie>
                          <Legend verticalAlign="bottom" content={<CustomLegend data={criterionsCount[fk]} />} />
                        </PieChart>
                      )}
                    </ExportableChart>
                  </ChartInstance>
                ))}
              </div>
            </SectionWrapper>
          )}

          {/* Panorama dos Critérios */}
          {availableCriterions.length > 0 && (
            <SectionWrapper
              title={t('stats.criteriaOverview')}
              controls={<MultiToggle options={availableCriterions} selected={criterionSelected} onToggle={toggleCriterion} label={criterionDisplay} />}
            >
              <div className={gridClass([...criterionSelected].filter(c => availableCriterions.includes(c)).length)}>
                {availableCriterions.filter(ctr => criterionSelected.has(ctr)).map(ctr => {
                  const data = criterionChartData[ctr] ?? [], cols = getCriterionColors(ctr);
                  return (
                    <ChartInstance key={ctr} id={`criterion-${ctr}`} label={criterionDisplay(ctr)}
                      chartRef={criterionChartRefs[ctr]} data={data} openMenuId={openMenuId} onToggle={toggleMenu}>
                      {data.length === 0
                        ? <p className="text-xs text-gray-400 text-center py-6">{t('stats.noCriteria')}</p>
                        : <ExportableChart ref={criterionChartRefs[ctr]}>
                          {(cfg) => (
                            <PieChart
                              width={cfg.width}
                              height={cfg.height}
                              responsive={!cfg.export}
                              style={cfg.export ? undefined : { width: '100%', aspectRatio: 1, maxHeight: '50vh' }}>
                              <Pie data={data} dataKey="value" label={renderCriterionLabel}
                                labelLine={false} stroke="none" isAnimationActive={false}>
                                {data.map((_, i) => <Cell key={i} fill={cols[i % cols.length]} />)}
                              </Pie>
                              <Tooltip {...criterionTooltip} />
                              <Legend verticalAlign="bottom" content={<CriterionLegend data={data} ctr={ctr} />} />
                            </PieChart>
                          )}
                        </ExportableChart>
                      }
                    </ChartInstance>
                  );
                })}
              </div>
            </SectionWrapper>
          )}
          {/* Origem dos incluídos por filtro */}
          {filterTabs.length > 0 && importOptions.length > 1 && (
            <SectionWrapper
              title={t('stats.originOfIncluded')}
              controls={
                <MultiToggle
                  options={filterTabs.map(k => k.replace('filter', 'Filtro '))}
                  selected={new Set([...filterOriginSelected].map(k => k.replace('filter', 'Filtro ')))}
                  onToggle={label => toggleFilterOrigin(label.replace('Filtro ', 'filter'))}
                  label={(o) => t('stats.filterLabel', { n: o.replace('Filtro ', '') })}
                />
              }
            >
              <div className={gridClass(
                [...filterOriginSelected].filter(fk => filterTabs.includes(fk)).length
              )}>
                {filterTabs
                  .filter(fk => filterOriginSelected.has(fk))
                  .map(fk => {
                    const data = originCount[fk] ?? [];
                    return (
                      <ChartInstance
                        key={fk}
                        id={`origin-${fk}`}
                        label={filterTabLabel(fk)}
                        chartRef={filterOriginRef[fk]}
                        data={data}
                        openMenuId={openMenuId}
                        onToggle={toggleMenu}
                      >
                        {data.length === 0
                          ? <p className="text-xs text-gray-400 text-center py-6">
                            {t('stats.noIncludedArticles')}
                          </p>
                          : <ExportableChart ref={filterOriginRef[fk]}>
                            {(cfg) => (
                              <PieChart
                                width={cfg.width}
                                height={cfg.height}
                                responsive={!cfg.export}
                                style={cfg.export ? undefined : { width: '100%', aspectRatio: 1, maxHeight: '50vh' }}
                              >
                                <Pie
                                  data={data}
                                  dataKey="value"
                                  label={renderCriterionLabel}
                                  labelLine={false}
                                  stroke="none"
                                  isAnimationActive={false}
                                >
                                  {data.map((or, i) => (
                                    <Cell
                                      key={i}
                                      fill={getOriginColors(or.id)[i % getOriginColors(or.id).length]}
                                    />
                                  ))}
                                </Pie>
                                <Tooltip {...criterionTooltip} />
                                <Legend
                                  verticalAlign="bottom"
                                  content={<OriginLegend data={data} or="Total" />}
                                />
                              </PieChart>
                            )}
                          </ExportableChart>
                        }
                      </ChartInstance>
                    );
                  })}
              </div>
            </SectionWrapper>
          )}
        </>
      )}

      {/* ═══ ABA REDE ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'network' && (
        <NetworkTab
          articles={articles}
          theme={theme}
        />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Network Tab (Coautoria / Palavras-chave)
// ─────────────────────────────────────────────────────────────────────────────
const NetworkTab = ({ articles, theme }) => {
  const { t } = useTranslation();
  const [networkType, setNetworkType] = useState('coauthorship');
  const [countingMethod, setCountingMethod] = useState('fractional');
  const [viewMode, setViewMode] = useState('network');
  const [networkData, setNetworkData] = useState(null);
  const [isComputing, setIsComputing] = useState(false);
  const [highlightedNode, setHighlightedNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [minOccurrences, setMinOccurrences] = useState(5);
  const [topN, setTopN] = useState(100);
  const [searchTerm, setSearchTerm] = useState('');
  const [labelPosition, setLabelPosition] = useState('below');
  const [labelOpacityThreshold, setLabelOpacityThreshold] = useState(0);
  const vizRef = useRef(null);
  const networkContainerRef = useRef(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [networkModalOpen, setNetworkModalOpen] = useState(false);
  const [networkHelpOpen, setNetworkHelpOpen] = useState(false);

  const validArticles = useMemo(() =>
    articles.filter(a => a.title && a.title.trim() && !a.title.startsWith('Título não encontrado')),
    [articles]
  );

  useEffect(() => {
    if (validArticles.length < 2) {
      setNetworkData(null);
      return;
    }

    setIsComputing(true);
    const scrollY = window.scrollY;

    setTimeout(() => {
      try {
        let rawNetwork;

        if (networkType === 'coauthorship') {
          const authorshipData = buildAuthorshipData(validArticles);
          if (authorshipData.authorList.length === 0) {
            setNetworkData(null);
            setIsComputing(false);
            return;
          }
          rawNetwork = buildCoAuthorshipNetwork(authorshipData, countingMethod);
        } else {
          const kwData = buildKeywordCoOccurrenceData(validArticles);
          if (kwData.keywordList.length === 0) {
            setNetworkData(null);
            setIsComputing(false);
            return;
          }
          rawNetwork = buildKeywordNetwork(kwData, countingMethod);
        }

        const networkWithCommunities = detectCommunities(rawNetwork);
        setNetworkData(networkWithCommunities);
      } catch (error) {
        console.error('Network computation error:', error);
        setNetworkData(null);
      }

      setIsComputing(false);
      window.scrollTo({ top: scrollY });
    });
  }, [validArticles, countingMethod, networkType]);

  const filteredData = useMemo(() => {
    if (!networkData || !networkData.stats) return null;

    const countKey = networkType === 'keywords' ? 'occurrenceCount' : 'publicationCount';

    let filteredNodes = networkData.nodes.filter(n => (n[countKey] || 0) >= minOccurrences);

    if (topN > 0 && filteredNodes.length > topN) {
      filteredNodes.sort((a, b) => (b[countKey] || 0) - (a[countKey] || 0));
      filteredNodes = filteredNodes.slice(0, topN);
    }

    const nodeIds = new Set(filteredNodes.map(n => n.id));

    let filteredEdges = networkData.edges.filter(e =>
      nodeIds.has(e.source) && nodeIds.has(e.target)
    );

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchingIds = new Set(
        filteredNodes
          .filter(n => n.label.toLowerCase().includes(term))
          .map(n => n.id)
      );
      const neighborIds = new Set();
      filteredEdges.forEach(e => {
        if (matchingIds.has(e.source)) neighborIds.add(e.target);
        if (matchingIds.has(e.target)) neighborIds.add(e.source);
      });
      const visibleIds = new Set([...matchingIds, ...neighborIds]);
      filteredNodes = filteredNodes.filter(n => visibleIds.has(n.id));
      filteredEdges = filteredEdges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target));
    }

    return {
      ...networkData,
      nodes: filteredNodes,
      edges: filteredEdges,
      stats: {
        ...networkData.stats,
        nodeCount: filteredNodes.length,
        edgeCount: filteredEdges.length
      }
    };
  }, [networkData, minOccurrences, topN, searchTerm, networkType]);

  const handleNodeClick = useCallback((node) => {
    setSelectedNode(node);
  }, []);

  const handleNodeHover = useCallback((node) => {
    setHighlightedNode(node?.id || null);
  }, []);

  const countLabel = networkType === 'keywords' ? t('stats.occurrences') : t('stats.publications');
  const countKey = networkType === 'keywords' ? 'occurrenceCount' : 'publicationCount';

  const handleExportPNG = useCallback((settings) => {
    if (!vizRef.current) return;
    const dataURL = vizRef.current.toDataURL(settings);
    if (!dataURL) return;
    const link = document.createElement('a');
    link.download = `rede-${networkType}-${viewMode}.png`;
    link.href = dataURL;
    link.click();
  }, [networkType, viewMode]);

  const handleExportXLSX = useCallback(async () => {
    if (!filteredData) return;
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SysReview';
    wb.created = new Date();

    const wsNodes = wb.addWorksheet('Nós');
    wsNodes.columns = [
      { header: 'ID', key: 'id', width: 40 },
      { header: 'Label', key: 'label', width: 40 },
      { header: countLabel, key: 'count', width: 15 },
      { header: 'Cluster', key: 'cluster', width: 10 },
    ];
    filteredData.nodes.forEach(n => {
      wsNodes.addRow({
        id: n.id,
        label: n.label,
        count: n[countKey] || 0,
        cluster: n.clusterId !== null ? n.clusterId + 1 : ''
      });
    });

    const wsEdges = wb.addWorksheet('Arestas');
    wsEdges.columns = [
      { header: 'Origem', key: 'source', width: 40 },
      { header: 'Destino', key: 'target', width: 40 },
      { header: 'Peso', key: 'weight', width: 15 },
    ];
    filteredData.edges.forEach(e => {
      wsEdges.addRow({ source: e.source, target: e.target, weight: e.weight });
    });

    const wsStats = wb.addWorksheet('Estatísticas');
    wsStats.columns = [
      { header: 'Métrica', key: 'metric', width: 30 },
      { header: 'Valor', key: 'value', width: 20 },
    ];
    wsStats.addRow({ metric: 'Tipo de rede', value: networkType === 'keywords' ? 'Palavras-chave' : 'Coautoria' });
    wsStats.addRow({ metric: 'Método de contagem', value: countingMethod === 'fractional' ? 'Fracionário' : 'Pleno' });
    wsStats.addRow({ metric: 'Nós', value: filteredData.stats.nodeCount });
    wsStats.addRow({ metric: 'Arestas', value: filteredData.stats.edgeCount });
    wsStats.addRow({ metric: 'Clusters', value: filteredData.communityCount });
    wsStats.addRow({ metric: 'Densidade', value: filteredData.stats?.density?.toFixed(6) ?? '0' });
    wsStats.addRow({ metric: 'Peso total', value: filteredData.stats?.totalWeight?.toFixed(2) ?? '0' });
    wsStats.addRow({ metric: 'Peso máximo', value: filteredData.stats?.maxWeight?.toFixed(2) ?? '0' });
    wsStats.addRow({ metric: 'Publicações', value: filteredData.stats?.publicationCount ?? 0 });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `rede-${networkType}.xlsx`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredData, networkType, countingMethod, countLabel, countKey]);

  if (validArticles.length < 2) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <Network className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>{t('stats.coauthorshipInsufficient', 'Necessário pelo menos 2 artigos válidos para construir a rede.')}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('stats.networkLabel')}</label>
          <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
            <button
              onClick={() => setNetworkType('coauthorship')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${networkType === 'coauthorship'
                ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
            >
              {t('stats.coauthorship')}
            </button>
            <button
              onClick={() => setNetworkType('keywords')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${networkType === 'keywords'
                ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
            >
              {t('stats.keywords')}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('stats.countingLabel')}</label>
          <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
            <button
              onClick={() => setCountingMethod('fractional')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${countingMethod === 'fractional'
                ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
            >
              {t('stats.fractional')}
            </button>
            <button
              onClick={() => setCountingMethod('full')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${countingMethod === 'full'
                ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
            >
              {t('stats.full')}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('stats.viewLabel')}</label>
          <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
            <button
              onClick={() => setViewMode('network')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'network'
                ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
            >
              {t('stats.viewNetwork')}
            </button>
            <button
              onClick={() => setViewMode('density')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'density'
                ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
            >
              {t('stats.density')}
            </button>
          </div>
        </div>

        <div className="ml-auto">
          <button
            onClick={() => setNetworkHelpOpen(true)}
            title={t('stats.networkHelp')}
            aria-label={t('stats.networkHelp')}
            className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-full p-1.5 cursor-pointer transition-all duration-200 flex items-center justify-center"
          >
            <HelpCircle size={16} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{countLabel} {t('stats.minCountSuffix')}</label>
          <input
            type="number"
            min="1"
            max="50"
            value={minOccurrences}
            onChange={(e) => setMinOccurrences(Math.max(1, parseInt(e.target.value) || 1))}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('stats.topNLabel')}</label>
          <input
            type="number"
            min="0"
            max="500"
            value={topN}
            onChange={(e) => setTopN(Math.max(0, parseInt(e.target.value) || 0))}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
          <span className="text-xs text-gray-500 dark:text-gray-400">{t('stats.topNHint')}</span>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('stats.labelPositionLabel')}</label>
          <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
            {[
              { value: 'above', label: t('stats.labelAbove') },
              { value: 'center', label: t('stats.labelCenter') },
              { value: 'below', label: t('stats.labelBelow') }
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setLabelPosition(opt.value)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${labelPosition === opt.value
                  ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {networkType === 'keywords' && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('stats.opacityLabel')}</label>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={labelOpacityThreshold}
              onChange={(e) => setLabelOpacityThreshold(parseInt(e.target.value) || 0)}
              className="w-32 accent-indigo-500 cursor-pointer"
              aria-label={t('stats.opacityLabel')}
            />
            <div className="relative">
              <input
                type="number"
                min="0"
                max="100"
                value={labelOpacityThreshold}
                onChange={(e) => setLabelOpacityThreshold(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                className="w-16 px-2 py-1.5 pr-5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500 pointer-events-none">%</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('stats.search')}</label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={networkType === 'keywords' ? t('stats.searchPlaceholderKeywords') : t('stats.searchPlaceholder')}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>


      </div>

      {filteredData && (
        <div className="mb-4 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-700 dark:text-gray-300">
              {networkType === 'keywords' ? t('stats.keywords') : t('stats.authors')}:
            </span>
            <span className="text-indigo-600 dark:text-indigo-400 font-bold">{filteredData.stats.nodeCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-700 dark:text-gray-300">{t('stats.connections')}:</span>
            <span className="text-indigo-600 dark:text-indigo-400 font-bold">{filteredData.stats.edgeCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-700 dark:text-gray-300">{t('stats.clusters')}:</span>
            <span className="text-indigo-600 dark:text-indigo-400 font-bold">
              {(() => {
                const cc = {};
                filteredData.nodes.forEach(n => {
                  if (n.clusterId !== null) cc[n.clusterId] = (cc[n.clusterId] || 0) + 1;
                });
                return Object.values(cc).filter(c => c > 1).length;
              })()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-700 dark:text-gray-300">{t('stats.density')}:</span>
            <span className="text-indigo-600 dark:text-indigo-400 font-bold">
              {filteredData.stats?.density?.toFixed(4) ?? '0.0000'}
            </span>
          </div>
        </div>
      )}

      {isComputing && (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 flex items-center justify-center" style={{ height: '550px' }}>
          <div className="flex items-center text-xs text-gray-400 gap-2">
            <div className="animate-spin inline-block h-4 w-4 border-2 border-indigo-600 border-t-transparent rounded-full"></div>
            {t('stats.calculatingNetworkShort')}
          </div>
        </div>
      )}

      {!isComputing && filteredData && filteredData.nodes.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
          <div className="flex justify-end mb-2">
            <div className="relative">
              <button
                onClick={() => setExportMenuOpen(v => !v)}
                title={t('stats.export')}
                className="bg-gray-800 dark:bg-gray-600 border-none rounded-full p-1.5 cursor-pointer transition-all duration-200 hover:scale-110 flex items-center justify-center"
                style={{ transform: exportMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                {exportMenuOpen ? <X size={12} color="white" /> : <Download size={12} color="white" />}
              </button>
              {exportMenuOpen && (
                <div className="absolute top-8 right-0 bg-zinc-800 rounded-lg p-1.5 min-w-[150px] z-50 shadow-xl">
                  <button
                    onClick={() => { setNetworkModalOpen(true); setExportMenuOpen(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-white bg-transparent hover:bg-zinc-700 rounded cursor-pointer border-none"
                  >
                    {t('stats.exportPNGLabel')}
                  </button>
                  <button
                    onClick={() => { handleExportXLSX(); setExportMenuOpen(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-white bg-transparent hover:bg-zinc-700 rounded cursor-pointer border-none"
                  >
                    {t('stats.exportXLSXLabel')}
                  </button>
                </div>
              )}
            </div>
          </div>
          <div ref={networkContainerRef} className="relative bg-white dark:bg-gray-800 rounded-lg" style={{ height: '550px' }}>
            {viewMode === 'network' ? (
              <NetworkVisualization
                ref={vizRef}
                nodes={filteredData.nodes}
                edges={filteredData.edges}
                stats={{ ...filteredData.stats, method: networkType === 'keywords' ? 'keywords' : countingMethod }}
                theme={theme}
                onNodeClick={handleNodeClick}
                onNodeHover={handleNodeHover}
                highlightedNode={highlightedNode}
                labelPosition={labelPosition}
                labelOpacityThreshold={labelOpacityThreshold}
              />
            ) : (
              <DensityVisualization
                ref={vizRef}
                nodes={filteredData.nodes}
                edges={filteredData.edges}
                stats={{ ...filteredData.stats, method: networkType === 'keywords' ? 'keywords' : countingMethod }}
                theme={theme}
                onNodeClick={handleNodeClick}
                onNodeHover={handleNodeHover}
                highlightedNode={highlightedNode}
                labelPosition={labelPosition}
                labelOpacityThreshold={labelOpacityThreshold}
              />
            )}
          </div>
        </div>
      )}

      {selectedNode && (
        <div className="mt-4 p-4 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">
          <div className="flex justify-between items-start mb-3">
            <h4 className="font-semibold text-gray-800 dark:text-gray-200">{selectedNode.label}</h4>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-gray-500 dark:text-gray-400">{countLabel}</span>
              <p className="font-bold text-indigo-600 dark:text-indigo-400">{selectedNode[countKey]}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">{t('stats.cluster')}</span>
              <p className="font-bold text-indigo-600 dark:text-indigo-400">
                {selectedNode.clusterId !== null ? selectedNode.clusterId + 1 : '-'}
              </p>
            </div>
          </div>
        </div>
      )}

      {!isComputing && (!filteredData || filteredData.nodes.length === 0) && (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 flex items-center justify-center" style={{ height: '550px' }}>
          <div className="flex items-center text-xs text-gray-400 gap-2">
            <Info className={`h-5 w-5 `} />
            <p>{t('stats.noNetworkHint')}</p>
          </div>
        </div>
      )}

      <NetworkHelpModal
        isOpen={networkHelpOpen}
        onClose={() => setNetworkHelpOpen(false)}
      />

      <ExportConfigModal
        isOpen={networkModalOpen}
        onClose={() => setNetworkModalOpen(false)}
        onExport={(settings) => handleExportPNG(settings)}
        format="png"
        svgElement={null}
        sourceAspectRatio={networkContainerRef.current
          ? networkContainerRef.current.getBoundingClientRect().width / networkContainerRef.current.getBoundingClientRect().height
          : null}
      />
    </div>
  );
};


export default StatisticsSection;