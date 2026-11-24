import React, { useRef, useEffect, useState, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';
import { scaleLinear } from 'd3-scale';
import { generateClusterColors } from './communityDetection';

const GRID_STEP = 8;
const SIGMA = 50;
const GAUSSIAN_RADIUS = Math.ceil((SIGMA * 3) / GRID_STEP);

function buildGaussianLUT() {
  const lut = new Float32Array((GAUSSIAN_RADIUS * 2 + 1) ** 2);
  let idx = 0;
  for (let dy = -GAUSSIAN_RADIUS; dy <= GAUSSIAN_RADIUS; dy++) {
    for (let dx = -GAUSSIAN_RADIUS; dx <= GAUSSIAN_RADIUS; dx++) {
      const d2 = (dx * GRID_STEP) ** 2 + (dy * GRID_STEP) ** 2;
      lut[idx++] = Math.exp(-d2 / (2 * SIGMA * SIGMA));
    }
  }
  return lut;
}
const GAUSSIAN_LUT = buildGaussianLUT();

function computeDensityGrid(simNodes, countKey, maxCount, bounds) {
  const { minX, maxX, minY, maxY } = bounds;
  const gridW = Math.ceil((maxX - minX) / GRID_STEP);
  const gridH = Math.ceil((maxY - minY) / GRID_STEP);
  if (gridW <= 0 || gridH <= 0 || gridW > 2000 || gridH > 2000) {
    return null;
  }

  const density = new Float32Array(gridW * gridH);

  simNodes.forEach(node => {
    const count = node[countKey] || 1;
    const weight = count / maxCount;
    const gx = Math.floor((node.x - minX) / GRID_STEP);
    const gy = Math.floor((node.y - minY) / GRID_STEP);
    let lutIdx = 0;
    for (let dy = -GAUSSIAN_RADIUS; dy <= GAUSSIAN_RADIUS; dy++) {
      const iy = gy + dy;
      if (iy < 0 || iy >= gridH) { lutIdx += GAUSSIAN_RADIUS * 2 + 1; continue; }
      for (let dx = -GAUSSIAN_RADIUS; dx <= GAUSSIAN_RADIUS; dx++) {
        const ix = gx + dx;
        if (ix >= 0 && ix < gridW) {
          density[iy * gridW + ix] += GAUSSIAN_LUT[lutIdx] * weight;
        }
        lutIdx++;
      }
    }
  });

  let maxDensity = 0;
  for (let i = 0; i < density.length; i++) {
    if (density[i] > maxDensity) maxDensity = density[i];
  }
  if (maxDensity === 0) maxDensity = 1;

  return { density, gridW, gridH, minX, minY, maxDensity };
}

function drawDensityLayer(ctx, grid, t) {
  if (!grid) return;
  const { density, gridW, gridH, minX, minY, maxDensity } = grid;
  for (let iy = 0; iy < gridH; iy++) {
    for (let ix = 0; ix < gridW; ix++) {
      const val = density[iy * gridW + ix] / maxDensity;
      if (val < 0.01) continue;
      const px = minX + ix * GRID_STEP;
      const py = minY + iy * GRID_STEP;
      const r = val < 0.5 ? 0 : Math.round(255 * ((val - 0.5) * 2));
      const g = val < 0.5 ? Math.round(255 * (val * 2)) : Math.round(255 * (1 - (val - 0.5) * 2));
      const b = val > 0.5 ? 0 : Math.round(255 * (1 - val * 2));
      const a = Math.min(0.65, val * 0.75);
      ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
      ctx.fillRect(px, py, GRID_STEP + 0.5, GRID_STEP + 0.5);
    }
  }
}

const DensityVisualization = forwardRef(({
  nodes,
  edges,
  stats,
  theme = 'light',
  onNodeClick,
  onNodeHover,
  highlightedNode,
  labelPosition = 'below',
  labelOpacityThreshold = 0
}, ref) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const simRef = useRef(null);
  const nodesRef = useRef([]);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const isDragging = useRef(false);
  const dragNodeRef = useRef(null);
  const densityCacheRef = useRef(null);
  const simPhaseRef = useRef('hot');

  const countKey = stats?.method === 'keywords' ? 'occurrenceCount' : 'publicationCount';

  const maxCount = useMemo(() => {
    if (!nodes || nodes.length === 0) return 1;
    return Math.max(...nodes.map(n => n[countKey] || 1));
  }, [nodes, countKey]);

  const nodeRadiusScale = useMemo(() =>
    scaleLinear().domain([0, maxCount]).range([3, 18]).clamp(true),
    [maxCount]
  );

  const clusterColors = useMemo(() => {
    if (!nodes || nodes.length === 0) return {};
    const ids = [...new Set(nodes.map(n => n.clusterId).filter(id => id !== null))];
    const colors = generateClusterColors(ids.length);
    const map = {};
    ids.forEach((id, i) => { map[id] = colors[i]; });
    return map;
  }, [nodes]);

  const getLabelOpacity = useCallback((simNodes, node) => {
    if (!simNodes || simNodes.length === 0 || labelOpacityThreshold <= 0) return 1;
    const cx = simNodes.reduce((s, n) => s + n.x, 0) / simNodes.length;
    const cy = simNodes.reduce((s, n) => s + n.y, 0) / simNodes.length;
    let maxDist = 0;
    for (const n of simNodes) {
      const d = Math.sqrt((n.x - cx) ** 2 + (n.y - cy) ** 2);
      if (d > maxDist) maxDist = d;
    }
    if (maxDist === 0) return 1;
    const minOpacity = 1 - (labelOpacityThreshold / 100) * 0.85;
    const d = Math.sqrt((node.x - cx) ** 2 + (node.y - cy) ** 2);
    const ratio = d / maxDist;
    return Math.max(minOpacity, 1 - ratio * (1 - minOpacity));
  }, [labelOpacityThreshold]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) setDimensions({ width, height });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nodes || nodes.length === 0 || !edges) {
      nodesRef.current = [];
      return;
    }

    const nodeMap = {};
    const simNodes = nodes.map((n, i) => {
      const node = {
        ...n,
        x: dimensions.width / 2 + (Math.random() - 0.5) * 300,
        y: dimensions.height / 2 + (Math.random() - 0.5) * 300,
        vx: 0,
        vy: 0,
        index: i
      };
      nodeMap[n.id] = node;
      return node;
    });

    const simLinks = edges
      .filter(e => nodeMap[e.source] && nodeMap[e.target])
      .map(e => ({
        source: nodeMap[e.source],
        target: nodeMap[e.target],
        weight: e.weight
      }));

    nodesRef.current = simNodes;
    densityCacheRef.current = null;
    simPhaseRef.current = 'hot';

    if (simRef.current) simRef.current.stop();

    const sim = forceSimulation(simNodes)
      .force('link', forceLink(simLinks).id(d => d.id).distance(50).strength(0.5))
      .force('charge', forceManyBody().strength(-60).distanceMax(300))
      .force('center', forceCenter(dimensions.width / 2, dimensions.height / 2))
      .force('collide', forceCollide().radius(d => nodeRadiusScale(d[countKey] || 1) + 2).strength(0.8))
      .alphaDecay(0.02)
      .velocityDecay(0.4)
      .on('tick', () => {
        if (sim.alpha() < 0.05 && simPhaseRef.current === 'hot') {
          simPhaseRef.current = 'settled';
          densityCacheRef.current = null;
        }
        if (simPhaseRef.current === 'settled') {
          densityCacheRef.current = null;
        }
        draw();
      });

    simRef.current = sim;
    return () => { sim.stop(); };
  }, [nodes, edges, dimensions, countKey]);

  useEffect(() => { draw(); }, [highlightedNode, transform, labelOpacityThreshold]);

  const paint = useCallback((ctx, cssWidth, cssHeight, pixelScale) => {
    const t = transformRef.current;
    ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    const isDark = theme === 'dark';
    ctx.fillStyle = isDark ? '#111827' : '#ffffff';
    ctx.fillRect(-t.x / t.k, -t.y / t.k, cssWidth / t.k, cssHeight / t.k);

    const simNodes = nodesRef.current;
    if (simNodes.length === 0) { ctx.restore(); return; }

    const padding = SIGMA * 3;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of simNodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }
    minX -= padding; maxX += padding;
    minY -= padding; maxY += padding;

    const bounds = { minX, maxX, minY, maxY };

    if (!densityCacheRef.current) {
      densityCacheRef.current = computeDensityGrid(simNodes, countKey, maxCount, bounds);
    }
    drawDensityLayer(ctx, densityCacheRef.current, t);

    simNodes.forEach(node => {
      const r = nodeRadiusScale(node[countKey] || 1);

      if (t.k > 0.3) {
        const fontSize = Math.max(8, Math.min(14, r * 0.9));
        ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = isDark ? '#E5E7EB' : '#1F2937';
        ctx.globalAlpha = getLabelOpacity(simNodes, node);
        let labelY;
        switch (labelPosition) {
          case 'above':
            ctx.textBaseline = 'bottom';
            labelY = node.y - r - 3;
            break;
          case 'center':
            ctx.textBaseline = 'middle';
            labelY = node.y;
            break;
          case 'below':
          default:
            ctx.textBaseline = 'top';
            labelY = node.y + r + 3;
            break;
        }
        ctx.fillText(node.label, node.x, labelY);
      }
      ctx.globalAlpha = 1;
    });

    ctx.restore();
  }, [theme, highlightedNode, nodeRadiusScale, countKey, maxCount, labelPosition, getLabelOpacity]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { width, height } = dimensions;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    paint(ctx, width, height, dpr);
  }, [dimensions, paint]);

  useImperativeHandle(ref, () => ({
    toDataURL: (opts) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      if (!opts || !opts.widthPx || !opts.heightPx) return canvas.toDataURL('image/png');

      const { width, height } = dimensions;
      const scale = Math.min(opts.widthPx / width, opts.heightPx / height);
      const drawW = Math.max(1, Math.round(width * scale));
      const drawH = Math.max(1, Math.round(height * scale));

      const off = document.createElement('canvas');
      off.width = drawW;
      off.height = drawH;
      paint(off.getContext('2d'), width, height, scale);
      return off.toDataURL('image/png');
    }
  }), [dimensions, paint]);

  const screenToGraph = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const t = transformRef.current;
    return {
      x: (clientX - rect.left - t.x) / t.k,
      y: (clientY - rect.top - t.y) / t.k
    };
  }, []);

  const findNode = useCallback((gx, gy) => {
    const simNodes = nodesRef.current;
    let closest = null;
    let minDist = Infinity;
    for (const node of simNodes) {
      const r = nodeRadiusScale(node[countKey] || 1);
      const dx = node.x - gx;
      const dy = node.y - gy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < r + 5 && dist < minDist) { minDist = dist; closest = node; }
    }
    return closest;
  }, [nodeRadiusScale, countKey]);

  const handleMouseDown = useCallback((e) => {
    const gp = screenToGraph(e.clientX, e.clientY);
    const node = findNode(gp.x, gp.y);
    if (node) {
      dragNodeRef.current = node;
      isDragging.current = true;
      node.fx = node.x;
      node.fy = node.y;
      if (simRef.current) simRef.current.alphaTarget(0.1).restart();
    }
  }, [screenToGraph, findNode]);

  const handleMouseMove = useCallback((e) => {
    if (isDragging.current && dragNodeRef.current) {
      const gp = screenToGraph(e.clientX, e.clientY);
      dragNodeRef.current.fx = gp.x;
      dragNodeRef.current.fy = gp.y;
      densityCacheRef.current = null;
    } else {
      const gp = screenToGraph(e.clientX, e.clientY);
      const node = findNode(gp.x, gp.y);
      if (onNodeHover) onNodeHover(node);
      if (canvasRef.current) canvasRef.current.style.cursor = node ? 'pointer' : 'default';
    }
  }, [screenToGraph, findNode, onNodeHover]);

  const handleMouseUp = useCallback(() => {
    if (dragNodeRef.current) {
      dragNodeRef.current.fx = null;
      dragNodeRef.current.fy = null;
      dragNodeRef.current = null;
    }
    isDragging.current = false;
    if (simRef.current) simRef.current.alphaTarget(0);
  }, []);

  const handleClick = useCallback((e) => {
    const gp = screenToGraph(e.clientX, e.clientY);
    const node = findNode(gp.x, gp.y);
    if (onNodeClick) onNodeClick(node);
  }, [screenToGraph, findNode, onNodeClick]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const t = transformRef.current;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newK = Math.max(0.1, Math.min(5, t.k * factor));
    transformRef.current = {
      x: mouseX - (mouseX - t.x) * (newK / t.k),
      y: mouseY - (mouseY - t.y) * (newK / t.k),
      k: newK
    };
    setTransform({ ...transformRef.current });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  if (!nodes || nodes.length === 0) {
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
        Nenhum dado disponível para visualização
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full min-h-[400px]">
      <canvas
        ref={canvasRef}
        className="w-full h-full rounded-lg"
        style={{ background: theme === 'dark' ? '#16171a' : '#fcfbf8' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
      />
    </div>
  );
});

DensityVisualization.displayName = 'DensityVisualization';
export default DensityVisualization;
