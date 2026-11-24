import React, { useRef, useEffect, useState, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';
import { scaleLinear } from 'd3-scale';
import { generateClusterColors } from './communityDetection';

const AGGRESSIVE_MIN_OPACITY = 0.15;
const OVERLAP_OPACITY = 0.45;

const NetworkVisualization = forwardRef(({
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
  const linksRef = useRef([]);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const dragNodeRef = useRef(null);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });

  const countKey = stats?.method === 'keywords' ? 'occurrenceCount' : 'publicationCount';

  const maxCount = useMemo(() => {
    if (!nodes || nodes.length === 0) return 1;
    return Math.max(...nodes.map(n => n[countKey] || 1));
  }, [nodes, countKey]);

  const nodeRadiusScale = useMemo(() =>
    scaleLinear().domain([0, maxCount]).range([4, 22]).clamp(true),
    [maxCount]
  );

  const linkWidthScale = useMemo(() => {
    if (!edges || edges.length === 0) return scaleLinear().domain([0, 1]).range([0.5, 0.5]);
    const maxW = Math.max(...edges.map(e => e.weight));
    return scaleLinear().domain([0, maxW]).range([0.3, 4]).clamp(true);
  }, [edges]);

  const clusterColors = useMemo(() => {
    if (!nodes || nodes.length === 0) return {};
    const ids = [...new Set(nodes.map(n => n.clusterId).filter(id => id !== null))];
    const colors = generateClusterColors(ids.length);
    const map = {};
    ids.forEach((id, i) => { map[id] = colors[i]; });
    return map;
  }, [nodes]);

  const fontSizeScale = useMemo(() =>
    scaleLinear().domain([0, maxCount]).range([8, 16]).clamp(true),
    [maxCount]
  );

  const getNodeOpacity = useCallback((simNodes, node, counts) => {
    if (!simNodes || simNodes.length === 0 || labelOpacityThreshold <= 0) return 1;

    const count = node[countKey] || 1;

    // Sobreposto a um nó de maior ocorrência: opacidade "agressiva, mas nem tanto"
    const overlapsHigher = simNodes.some(other => {
      if (other === node) return false;
      const otherCount = other[countKey] || 1;
      if (otherCount <= count) return false;
      const dx = node.x - other.x;
      const dy = node.y - other.y;
      const r = nodeRadiusScale(count);
      const ro = nodeRadiusScale(otherCount);
      return Math.sqrt(dx * dx + dy * dy) < r + ro;
    });
    if (overlapsHigher) return OVERLAP_OPACITY;

    // Menores ocorrências recebem opacidade agressiva; maiores ficam nítidas
    const minCount = counts[0];
    const maxCount = counts[counts.length - 1];
    if (maxCount <= minCount) return 1;

    const cutoffIdx = Math.floor(counts.length * (labelOpacityThreshold / 100)) - 1;
    const cutoff = cutoffIdx >= 0 ? counts[cutoffIdx] : minCount;
    if (cutoff <= minCount || count >= cutoff) return 1;

    const ratio = (count - minCount) / (cutoff - minCount);
    return AGGRESSIVE_MIN_OPACITY + (1 - AGGRESSIVE_MIN_OPACITY) * ratio;
  }, [countKey, labelOpacityThreshold, nodeRadiusScale]);

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
      linksRef.current = [];
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
    linksRef.current = simLinks;

    if (simRef.current) simRef.current.stop();

    const sim = forceSimulation(simNodes)
      .force('link', forceLink(simLinks).id(d => d.id).distance(50).strength(0.5))
      .force('charge', forceManyBody().strength(-60).distanceMax(300))
      .force('center', forceCenter(dimensions.width / 2, dimensions.height / 2))
      .force('collide', forceCollide().radius(d => nodeRadiusScale(d[countKey] || 1) + 2).strength(0.8))
      .alphaDecay(0.02)
      .velocityDecay(0.4)
      .on('tick', () => { draw(); });

    simRef.current = sim;
    return () => { sim.stop(); };
  }, [nodes, edges, dimensions, countKey]);

  useEffect(() => { draw(); }, [highlightedNode, transform, labelPosition, labelOpacityThreshold]);

  const drawLabel = useCallback((ctx, node, r, isDark, t, simNodes, counts) => {
    const fontSize = fontSizeScale(node[countKey] || 1);
    if (t.k <= 0.3 && r <= 6) return;

    ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = isDark ? '#E5E7EB' : '#1F2937';
    ctx.globalAlpha = getNodeOpacity(simNodes, node, counts);

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
    ctx.globalAlpha = 1;
  }, [fontSizeScale, countKey, labelPosition, getNodeOpacity]);

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

    const simLinks = linksRef.current;
    const simNodes = nodesRef.current;

    const counts = simNodes.map(n => n[countKey] || 1).sort((a, b) => a - b);
    const drawNodes = [...simNodes].sort((a, b) => (a[countKey] || 1) - (b[countKey] || 1));

    simLinks.forEach(link => {
      const isHighlighted = highlightedNode &&
        (link.source.id === highlightedNode || link.target.id === highlightedNode);

      const alpha = highlightedNode ? (isHighlighted ? 0.7 : 0.05) : 0.25;
      const widthPx = linkWidthScale(link.weight);

      ctx.beginPath();
      ctx.moveTo(link.source.x, link.source.y);
      ctx.lineTo(link.target.x, link.target.y);
      ctx.strokeStyle = isDark ? '#6B7280' : '#9CA3AF';
      ctx.globalAlpha = alpha;
      ctx.lineWidth = widthPx / t.k;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    drawNodes.forEach(node => {
      const r = nodeRadiusScale(node[countKey] || 1);
      const isHighlighted = highlightedNode === node.id;
      const isFaded = highlightedNode && !isHighlighted;

      const opacity = getNodeOpacity(simNodes, node, counts);
      ctx.globalAlpha = isFaded ? 0.2 : opacity;

      const color = isHighlighted ? '#FBBF24' : (clusterColors[node.clusterId] || '#9CA3AF');
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      if (isHighlighted) {
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 2 / t.k;
        ctx.stroke();
      }

      drawLabel(ctx, node, r, isDark, t, simNodes, counts);
      ctx.globalAlpha = 1;
    });

    ctx.restore();
  }, [theme, highlightedNode, nodeRadiusScale, linkWidthScale, clusterColors, countKey, drawLabel, getNodeOpacity]);

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
      setIsDragging(true);
      node.fx = node.x;
      node.fy = node.y;
      if (simRef.current) simRef.current.alphaTarget(0.1).restart();
    }
  }, [screenToGraph, findNode]);

  const handleMouseMove = useCallback((e) => {
    if (isDragging && dragNodeRef.current) {
      const gp = screenToGraph(e.clientX, e.clientY);
      dragNodeRef.current.fx = gp.x;
      dragNodeRef.current.fy = gp.y;
    } else {
      const gp = screenToGraph(e.clientX, e.clientY);
      const node = findNode(gp.x, gp.y);
      if (onNodeHover) onNodeHover(node);
      if (canvasRef.current) canvasRef.current.style.cursor = node ? 'pointer' : 'default';
    }
  }, [isDragging, screenToGraph, findNode, onNodeHover]);

  const handleMouseUp = useCallback(() => {
    if (dragNodeRef.current) {
      dragNodeRef.current.fx = null;
      dragNodeRef.current.fy = null;
      dragNodeRef.current = null;
    }
    setIsDragging(false);
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

NetworkVisualization.displayName = 'NetworkVisualization';
export default NetworkVisualization;
