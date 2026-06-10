// Source: lines 139115-140873 地图画布编辑器 (data-v-91aea07d)
// Ported from Vue to React — architecture matches source exactly:
// - Raw variables for pan/zoom (O/P/L) updated without re-render during drag
// - Reactive state (W/Q) for content layer transform (triggers re-render)
// - K object for position overrides (ref, mutated directly)
// - requestAnimationFrame for canvas redraws (Le/xt)
// - Direct DOM manipulation for node positions during drag

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
  useMemo,
} from 'react';
import {
  NODE_TYPE_OPTIONS,
  CONNECTION_TYPES,
  NODE_WIDTH,
  NODE_HEIGHT,
  inferTypeFromName,
  getTypeById,
  LEVEL_COLORS,
} from './geomap-constants';
import type { 画布节点, 连线数据, MapId } from './geomap-constants';
import {
  layoutHierarchical,
  layoutSubtree,
  refineLayout,
} from './geomap-layout';

// Source: Qg (line 138149) — default line settings
const DEFAULT_LINE_SETTINGS = {
  父子连线: { 颜色: '', 线型: 'dashed' as const, 线宽: 1.6, 显示: true },
  已规划连线: {
    颜色: '#9b6bae',
    线型: 'dashed' as const,
    线宽: 2.2,
    显示: true,
    动画: true,
    显示章节号: true,
  },
  已来过连线: {
    颜色: '#27ae60',
    线型: 'solid' as const,
    线宽: 2.6,
    显示: true,
    动画: true,
    显示章节号: true,
  },
};

// Source: mv (line 138168) — line style dash patterns
const LINE_STYLE_DASH: Record<string, number[]> = {
  solid: [],
  dashed: [10, 6],
  dotted: [3, 3],
  'dash-dot': [12, 4, 3, 4],
  'long-dash': [16, 8],
};

// Source: hv (line 138175) — line type options
const LINE_TYPE_OPTIONS = [
  { value: 'solid', label: '实线' },
  { value: 'dashed', label: '虚线' },
  { value: 'dotted', label: '点线' },
  { value: 'dash-dot', label: '点划线' },
  { value: 'long-dash', label: '长虚线' },
];

// Source: A (line 139209) — parent color palette
const PARENT_COLORS = [
  '#4A90D9',
  '#50B86C',
  '#E6854A',
  '#9B59B6',
  '#E74C6F',
  '#1ABC9C',
  '#F39C12',
  '#6C5CE7',
];

// Source: gv=130, xv=54 (line 137147-148)
const GV = NODE_WIDTH; // 130
const XV = NODE_HEIGHT; // 54

interface GeoMapCanvasProps {
  节点列表: 画布节点[];
  连线列表: 连线数据[];
  规划路线连线列表?: 连线数据[];
  已经历路线连线列表?: 连线数据[];
  选中节点ID: MapId | null;
  选中连线ID: string | null;
  on节点移动: (id: MapId, x: number, y: number) => void;
  on节点添加: (x: number, y: number) => void;
  on节点删除: (id: MapId) => void;
  on连线创建: (fromId: MapId, toId: MapId) => void;
  on连线删除: (id: string) => void;
  on父节点变更: (id: MapId, parentId: MapId | null) => void;
  on选中节点ID变更: (id: MapId | null) => void;
  on选中连线ID变更: (id: string | null) => void;
  节点颜色映射?: Map<MapId, string>;
}

export interface GeoMapCanvasRef {
  适配全景: () => void;
  重新布局: (mode: string) => void;
  重新布局子树: (nodeId: MapId) => void;
  更新画布尺寸: () => void;
  绘制所有连线: () => void;
  设置布局模式: (mode: string) => void;
}

export const GeoMapCanvas = forwardRef<GeoMapCanvasRef, GeoMapCanvasProps>(
  (
    {
      节点列表,
      连线列表,
      规划路线连线列表 = [],
      已经历路线连线列表 = [],
      选中节点ID,
      选中连线ID,
      on节点移动,
      on节点添加,
      on节点删除,
      on连线创建,
      on连线删除,
      on父节点变更,
      on选中节点ID变更,
      on选中连线ID变更,
    },
    ref
  ) => {
    // Source: M = container ref, R = static canvas, D = content layer (lines 139177-139180)
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    // Source: O/P — raw pan (line 139181-139182), updated without triggering re-render
    const rawPanX = useRef(0);
    const rawPanY = useRef(0);

    // Source: L = zoom ref (line 139183), T = min zoom, z = max zoom
    const rawZoom = useRef(1);
    const ZOOM_MIN = 0.2;
    const ZOOM_MAX = 3;

    // Source: W/Q — reactive pan for content layer (line 139186-139187)
    const [reactivePanX, setReactivePanX] = useState(0);
    const [reactivePanY, setReactivePanY] = useState(0);
    const [reactiveZoom, setReactiveZoom] = useState(1);

    // Source: K = position overrides (line 139198), reactive for node rendering
    const [positions, setPositions] = useState<
      Record<MapId, { x: number; y: number }>
    >({});
    const K = useRef<Record<MapId, { x: number; y: number }>>({});

    // Source: C = interaction mode (line 139191), null | 'pan' | 'drag-node' | 'connect'
    const modeRef = useRef<string | null>(null);

    // Source: N = drag node (line 139192)
    const dragNodeRef = useRef<any>(null);

    // Source: ee = mouse start pos (line 139193)
    const mouseStartRef = useRef({ x: 0, y: 0 });

    // Source: j = node start pos (line 139194)
    const nodeStartRef = useRef({ x: 0, y: 0 });

    // Source: Z = pan start pos (line 139195)
    const panStartRef = useRef({ x: 0, y: 0 });

    // Source: H = connect-from node id (line 139196)
    const connectFromRef = useRef<MapId | null>(null);

    // Source: B = connect mouse pos relative to container (line 139197)
    const connectMouseRef = useRef({ x: 0, y: 0 });

    // Source: ie = child node ids being dragged with parent (line 139200)
    const childDragIds = useRef<MapId[]>([]);

    // Source: fe = original positions of child nodes (line 139201)
    const childDragOrigPos = useRef<Record<MapId, { x: number; y: number }>>(
      {}
    );

    // UI state
    const [contextMenu, setContextMenu] = useState<{
      x: number;
      y: number;
      nodeId: MapId;
    } | null>(null);
    const [saveHint, setSaveHint] = useState('');
    const [layoutMode, setLayoutMode] = useState<'层级' | '网络'>('层级');
    const [showLineSettings, setShowLineSettings] = useState(false);

    // Source: o = _ye() line settings (line 138197-138241)
    const [lineSettings, setLineSettings] = useState(() =>
      JSON.parse(JSON.stringify(DEFAULT_LINE_SETTINGS))
    );

    // rAF handle for canvas redraws — Source: ne (line 139347)
    const rafHandle = useRef<number | null>(null);

    // Source: oe (line 139188) — update both raw and reactive pan
    const updatePan = useCallback((x: number, y: number) => {
      rawPanX.current = x;
      rawPanY.current = y;
      setReactivePanX(x);
      setReactivePanY(y);
    }, []);

    // Source: pe (line 139293) — get container rect
    const getContainerRect = useCallback(() => {
      return (
        containerRef.current?.getBoundingClientRect() || {
          left: 0,
          top: 0,
          width: 0,
          height: 0,
        }
      );
    }, []);

    // Source: ke (line 139219) — computed node list with position overrides applied
    const resolvedNodes = useMemo(() => {
      return 节点列表.map(n => {
        const id = n.id;
        const override = K.current[id];
        return {
          ...n,
          id,
          父地图ID: n.父地图ID ? n.父地图ID : null,
          x: override ? override.x : n.x != null ? Number(n.x) : 0,
          y: override ? override.y : n.y != null ? Number(n.y) : 0,
        };
      });
    }, [节点列表, positions]); // positions triggers recalc when K changes trigger setPositions

    // Source: ae (line 139250) — node id -> node map
    const nodeMap = useMemo(() => {
      const map = new Map<MapId, any>();
      for (const n of resolvedNodes) map.set(n.id, n);
      return map;
    }, [resolvedNodes]);

    // Source: he (line 139239) — parent color mapping
    const parentColorMap = useMemo(() => {
      const parentIds = new Set<MapId>();
      for (const n of resolvedNodes) {
        if (n.父地图ID) parentIds.add(n.父地图ID);
      }
      const map = new Map<MapId, string>();
      let ci = 0;
      for (const pid of parentIds) {
        map.set(pid, PARENT_COLORS[ci % PARENT_COLORS.length]);
        ci++;
      }
      return map;
    }, [resolvedNodes]);

    // Source: ge (line 139304-139306) — content coords to screen coords
    const contentToScreen = useCallback((x: number, y: number) => {
      return {
        x: x * rawZoom.current + rawPanX.current,
        y: y * rawZoom.current + rawPanY.current,
      };
    }, []);

    // Source: Ve (line 139307-139313) — node center-bottom in screen coords
    const nodeScreenPos = useCallback(
      (node: any) => {
        const override = K.current[node.id];
        const x = override ? override.x : node.x;
        const y = override ? override.y : node.y;
        return contentToScreen(x + GV / 2, y + XV + 2);
      },
      [contentToScreen]
    );

    // Source: J (line 139282) — collect all descendant ids
    const getDescendantIds = useCallback(
      (nodeId: MapId) => {
        const result: MapId[] = [];
        function collect(pid: MapId) {
          for (const n of resolvedNodes) {
            if (n.父地图ID === pid) {
              result.push(n.id);
              collect(n.id);
            }
          }
        }
        collect(nodeId);
        return result;
      },
      [resolvedNodes]
    );

    // Source: Ce (line 139326) — find node at screen coords
    const findNodeAtScreen = useCallback(
      (sx: number, sy: number) => {
        for (const n of resolvedNodes) {
          const sp = nodeScreenPos(n);
          if (Math.hypot(sp.x - sx, sp.y - sy) < 20) return n.id;
        }
        return null;
      },
      [resolvedNodes, nodeScreenPos]
    );

    // Source: Le (line 139348) — schedule canvas redraw via rAF
    const scheduleRedraw = useCallback(() => {
      if (rafHandle.current) return;
      rafHandle.current = requestAnimationFrame(() => {
        rafHandle.current = null;
        drawAllConnections();
      });
    }, []);

    // Source: pt (line 139376) — resize canvas element, only when size actually changes
    const lastCanvasSize = useRef({ w: 0, h: 0 });
    const resizeCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = window.devicePixelRatio || 1;
      // Only resize if dimensions actually changed (avoids clearing canvas unnecessarily)
      if (
        Math.abs(lastCanvasSize.current.w - rect.width) > 0.5 ||
        Math.abs(lastCanvasSize.current.h - rect.height) > 0.5
      ) {
        lastCanvasSize.current = { w: rect.width, h: rect.height };
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.scale(dpr, dpr);
        }
      }
    }, []);

    // Animation canvas ref — Source: V.value (second canvas for flowing effects)
    const animCanvasRef = useRef<HTMLCanvasElement>(null);
    const animRafRef = useRef<number | null>(null);
    // Animation state — Source: Ee/Pe (per-route progress tracking)
    const animProgressRef = useRef({ 当前段: 0, 进度: 0 });
    const animProgressRef2 = useRef({ 当前段: 0, 进度: 0 });
    const We = 3; // Source: speed constant

    // Resolve node positions directly from K.current (always up-to-date, bypasses React render cycle)
    const resolveNodePos = useCallback(
      (nodeId: MapId) => {
        const n = 节点列表.find(n => n.id === nodeId);
        const override = K.current[nodeId];
        return {
          x: override ? override.x : n ? (n.x != null ? Number(n.x) : 0) : 0,
          y: override ? override.y : n ? (n.y != null ? Number(n.y) : 0) : 0,
        };
      },
      [节点列表]
    );

    // Source: xt (line 139528) — draw all connections on canvas in screen space
    // Reads positions from K.current directly — no dependency on React state
    const drawAllConnections = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.clearRect(0, 0, w, h);

      const cs = getComputedStyle(document.documentElement);
      const textMuted = cs.getPropertyValue('--text-muted').trim() || '#64748b';
      const primary = cs.getPropertyValue('--primary').trim() || '#8b5cf6';
      const textPrimary =
        cs.getPropertyValue('--text-primary').trim() || '#f8fafc';
      const bgCard = cs.getPropertyValue('--bg-card').trim() || '#1e293b';

      const settings = lineSettings;
      const allNodeIds = new Set(节点列表.map(n => n.id));

      // Helper: screen pos for a node id (reads K.current directly)
      const scrPos = (nid: MapId) => {
        const p = resolveNodePos(nid);
        return contentToScreen(p.x + GV / 2, p.y + XV + 2);
      };

      // 1. Parent-child lines — Source: xt line 139543-139584
      const pcSettings = settings.父子连线;
      if (pcSettings.显示) {
        const pcColor = pcSettings.颜色 || textMuted;
        const pcDash = LINE_STYLE_DASH[pcSettings.线型] || [5, 4];
        for (const node of 节点列表) {
          if (!node.父地图ID) continue;
          if (!allNodeIds.has(node.父地图ID)) continue;
          const from = scrPos(node.父地图ID);
          const to = scrPos(node.id);
          ctx.save();
          ctx.shadowColor = pcColor + '4D';
          ctx.shadowBlur = 4;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 2;
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.strokeStyle = pcColor;
          ctx.lineWidth = pcSettings.线宽;
          if (pcDash.length > 0) ctx.setLineDash(pcDash);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.restore();

          // Arrow at midpoint — Source: lines 139570-139583
          const mx = (from.x + to.x) / 2;
          const my = (from.y + to.y) / 2;
          const angle = Math.atan2(to.y - from.y, to.x - from.x);
          ctx.save();
          ctx.fillStyle = pcColor;
          ctx.translate(mx, my);
          ctx.rotate(angle);
          ctx.beginPath();
          ctx.moveTo(4, 0);
          ctx.lineTo(-2, -3);
          ctx.lineTo(-2, 3);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }

      // 2. Hit connections — Source: xt line 139586-139631
      for (const conn of 连线列表) {
        if (!allNodeIds.has(conn.起点ID) || !allNodeIds.has(conn.终点ID))
          continue;
        const typeDef =
          CONNECTION_TYPES.find(t => t.id === conn.连线类型) ||
          CONNECTION_TYPES[0];
        const color = conn.连线颜色 || typeDef.color;
        const from = scrPos(conn.起点ID);
        const to = scrPos(conn.终点ID);
        const isSelected =
          选中节点ID === conn.起点ID ||
          选中节点ID === conn.终点ID ||
          选中连线ID === conn.id;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? typeDef.width * 2 : typeDef.width;
        ctx.setLineDash(typeDef.dash as number[]);
        ctx.lineCap = 'round';
        if (isSelected && 选中连线ID === conn.id) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 8;
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.restore();

        // Connection label — Source: lines 139616-139630
        if (conn.连线标签) {
          const lx = (from.x + to.x) / 2;
          const ly = (from.y + to.y) / 2;
          ctx.save();
          ctx.font = `${isSelected ? 'bold ' : ''}${Math.max(10, 11 * rawZoom.current)}px "Noto Sans SC", sans-serif`;
          const textW = ctx.measureText(conn.连线标签).width;
          ctx.fillStyle = bgCard;
          ctx.fillRect(lx - textW / 2 - 4, ly - 14, textW + 8, 16);
          ctx.fillStyle = textPrimary;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(conn.连线标签, lx, ly - 6);
          ctx.restore();
        }
      }

      // 3. Route connections — Source: xt lines 139632-139688 (Tt function)
      // Planned routes (d.value = 规划路线连线列表) and traveled routes (f.value = 已经历路线连线列表)
      const routeSettings = settings.已规划连线;
      const traveledSettings = settings.已来过连线;
      const drawRouteConnections = (
        connections: 连线数据[],
        opts: {
          color: string;
          width: number;
          dash: number[];
          显示章节号: boolean;
        }
      ) => {
        for (const rc of connections) {
          if (!allNodeIds.has(rc.起点ID) || !allNodeIds.has(rc.终点ID))
            continue;
          const from = scrPos(rc.起点ID);
          const to = scrPos(rc.终点ID);
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.strokeStyle = opts.color;
          ctx.lineWidth = opts.width;
          ctx.lineCap = 'round';
          if (opts.dash.length > 0) ctx.setLineDash(opts.dash);
          ctx.shadowColor = opts.color + '66';
          ctx.shadowBlur = 4;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          // Arrow at endpoint — Source: lines 139657-139671
          const angle = Math.atan2(to.y - from.y, to.x - from.x);
          const arrowSize = 5;
          const ax = to.x - Math.cos(angle) * 22;
          const ay = to.y - Math.sin(angle) * 22;
          ctx.fillStyle = opts.color;
          ctx.translate(ax, ay);
          ctx.rotate(angle);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-10, -arrowSize);
          ctx.lineTo(-10, arrowSize);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          // Chapter label — Source: lines 139672-139686
          if (rc.连线标签 && opts.显示章节号) {
            const lx = (from.x + to.x) / 2;
            const ly = (from.y + to.y) / 2;
            ctx.save();
            ctx.font = `bold ${Math.max(11, 12 * rawZoom.current)}px "Noto Sans SC", sans-serif`;
            const tw = ctx.measureText(rc.连线标签).width;
            ctx.fillStyle = opts.color;
            ctx.fillRect(lx - tw / 2 - 6, ly - 16, tw + 12, 18);
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(rc.连线标签, lx, ly - 7);
            ctx.restore();
          }
        }
      };
      if (routeSettings.显示) {
        drawRouteConnections(规划路线连线列表, {
          color: routeSettings.颜色,
          width: routeSettings.线宽,
          dash:
            routeSettings.线型 === 'dashed'
              ? [10, 6]
              : routeSettings.线型 === 'dotted'
                ? [3, 3]
                : [],
          显示章节号: routeSettings.显示章节号,
        });
      }
      if (traveledSettings.显示) {
        drawRouteConnections(已经历路线连线列表, {
          color: traveledSettings.颜色,
          width: traveledSettings.线宽,
          dash: traveledSettings.线型 === 'solid' ? [] : [10, 6],
          显示章节号: traveledSettings.显示章节号,
        });
      }

      // 4. Temp connection line — Source: lines 139704-139725
      if (modeRef.current === 'connect' && connectFromRef.current !== null) {
        if (allNodeIds.has(connectFromRef.current)) {
          const from = scrPos(connectFromRef.current);
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(connectMouseRef.current.x, connectMouseRef.current.y);
          ctx.strokeStyle = primary;
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
          // Dot at mouse
          ctx.beginPath();
          ctx.arc(
            connectMouseRef.current.x,
            connectMouseRef.current.y,
            6,
            0,
            Math.PI * 2
          );
          ctx.fillStyle = primary + '80';
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }
    }, [
      lineSettings,
      节点列表,
      连线列表,
      规划路线连线列表,
      已经历路线连线列表,
      选中节点ID,
      选中连线ID,
      contentToScreen,
      resolveNodePos,
    ]);

    // Source: pt/ct — resize animation canvas (V.value)
    const lastAnimSize = useRef({ w: 0, h: 0 });
    const resizeAnimCanvas = useCallback(() => {
      const canvas = animCanvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = window.devicePixelRatio || 1;
      if (
        Math.abs(lastAnimSize.current.w - rect.width) > 0.5 ||
        Math.abs(lastAnimSize.current.h - rect.height) > 0.5
      ) {
        lastAnimSize.current = { w: rect.width, h: rect.height };
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.scale(dpr, dpr);
        }
      }
    }, []);

    // Source: Dt (line 139389) — draw flowing animation on animation canvas
    const drawAnimation = useCallback(() => {
      const canvas = animCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

      const settings = lineSettings;
      const allNodeIds = new Set(节点列表.map(n => n.id));

      // Helper: screen pos for node id
      const scrPos = (nid: MapId) => {
        const p = resolveNodePos(nid);
        return contentToScreen(p.x + GV / 2, p.y + XV + 2);
      };

      // Draw flowing effect for a set of connections — Source: Pt function (lines 139399-139496)
      const drawFlow = (
        connections: 连线数据[],
        opts: { color: string; width: number },
        state: { 当前段: number; 进度: number }
      ) => {
        if (connections.length === 0) return;
        if (state.当前段 >= connections.length) state.当前段 = 0;
        const conn = connections[state.当前段];
        if (!allNodeIds.has(conn.起点ID) || !allNodeIds.has(conn.终点ID)) {
          state.当前段 = (state.当前段 + 1) % connections.length;
          state.进度 = 0;
          return;
        }
        const from = scrPos(conn.起点ID);
        const to = scrPos(conn.终点ID);
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) {
          state.当前段 = (state.当前段 + 1) % connections.length;
          state.进度 = 0;
          return;
        }

        state.进度 += We;
        const progress = Math.min(state.进度 / dist, 1);
        const headX = from.x + dx * progress;
        const headY = from.y + dy * progress;
        const tailFrac = Math.min(0.35, 80 / dist);
        const tailStart = Math.max(0, progress - tailFrac);
        const tailX = from.x + dx * tailStart;
        const tailY = from.y + dy * tailStart;

        // Outer glow
        ctx.save();
        const g1 = ctx.createLinearGradient(tailX, tailY, headX, headY);
        g1.addColorStop(0, opts.color + '00');
        g1.addColorStop(0.4, opts.color + '18');
        g1.addColorStop(0.8, opts.color + '44');
        g1.addColorStop(1, opts.color + '88');
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(headX, headY);
        ctx.strokeStyle = g1;
        ctx.lineWidth = opts.width + 8;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();

        // Core beam
        const midStart = Math.max(0, progress - tailFrac * 0.7);
        const midX = from.x + dx * midStart;
        const midY = from.y + dy * midStart;
        ctx.save();
        const g2 = ctx.createLinearGradient(midX, midY, headX, headY);
        g2.addColorStop(0, opts.color + '00');
        g2.addColorStop(0.3, opts.color + '33');
        g2.addColorStop(0.7, opts.color + 'AA');
        g2.addColorStop(1, opts.color + 'EE');
        ctx.beginPath();
        ctx.moveTo(midX, midY);
        ctx.lineTo(headX, headY);
        ctx.strokeStyle = g2;
        ctx.lineWidth = opts.width + 3.5;
        ctx.lineCap = 'round';
        ctx.shadowColor = opts.color;
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.restore();

        // White core highlight
        const coreStart = Math.max(0, progress - tailFrac * 0.4);
        const coreX = from.x + dx * coreStart;
        const coreY = from.y + dy * coreStart;
        ctx.save();
        const g3 = ctx.createLinearGradient(coreX, coreY, headX, headY);
        g3.addColorStop(0, '#ffffff00');
        g3.addColorStop(0.5, '#ffffff66');
        g3.addColorStop(1, '#ffffffDD');
        ctx.beginPath();
        ctx.moveTo(coreX, coreY);
        ctx.lineTo(headX, headY);
        ctx.strokeStyle = g3;
        ctx.lineWidth = opts.width + 0.5;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();

        // Glow dot at head
        ctx.save();
        ctx.beginPath();
        ctx.arc(headX, headY, 5, 0, Math.PI * 2);
        ctx.fillStyle = opts.color + '66';
        ctx.shadowColor = opts.color;
        ctx.shadowBlur = 18;
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.beginPath();
        ctx.arc(headX, headY, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.restore();

        if (progress >= 1) {
          state.当前段 = (state.当前段 + 1) % connections.length;
          state.进度 = 0;
        }
      };

      // Draw planned routes animation — Source: d.value = 规划路线连线列表 (line 139148)
      if (
        settings.已规划连线.显示 &&
        settings.已规划连线.动画 &&
        规划路线连线列表.length > 0
      ) {
        drawFlow(
          规划路线连线列表,
          { color: settings.已规划连线.颜色, width: settings.已规划连线.线宽 },
          animProgressRef.current
        );
      }

      // Draw traveled routes animation — Source: f.value = 已经历路线连线列表 (line 139149)
      if (
        settings.已来过连线.显示 &&
        settings.已来过连线.动画 &&
        已经历路线连线列表.length > 0
      ) {
        const traveledState = animProgressRef2.current;
        drawFlow(
          已经历路线连线列表,
          { color: settings.已来过连线.颜色, width: settings.已来过连线.线宽 },
          traveledState
        );
      }
    }, [
      lineSettings,
      节点列表,
      规划路线连线列表,
      已经历路线连线列表,
      resolveNodePos,
      contentToScreen,
    ]);

    // Source: nt/kt (line 139361-139374) — start/stop animation loop
    useEffect(() => {
      const animEnabled =
        lineSettings.已规划连线.显示 && lineSettings.已规划连线.动画;
      if (!animEnabled) return;
      const loop = () => {
        resizeAnimCanvas();
        drawAnimation();
        animRafRef.current = requestAnimationFrame(loop);
      };
      animRafRef.current = requestAnimationFrame(loop);
      return () => {
        if (animRafRef.current) {
          cancelAnimationFrame(animRafRef.current);
          animRafRef.current = null;
        }
      };
    }, [
      drawAnimation,
      resizeAnimCanvas,
      lineSettings,
      规划路线连线列表,
      已经历路线连线列表,
    ]);

    // ── Fit all — matches source 适配全景 logic
    // Reads positions from K.current directly (always up-to-date)
    const fitAll = useCallback(() => {
      if (节点列表.length === 0) return;
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const n of 节点列表) {
        const p = resolveNodePos(n.id);
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x + GV > maxX) maxX = p.x + GV;
        if (p.y + XV > maxY) maxY = p.y + XV;
      }
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return;
      const contentW = maxX - minX + 80;
      const contentH = maxY - minY + 80;
      if (!Number.isFinite(contentW) || !Number.isFinite(contentH)) return;
      const newZoom = Math.min(
        rect.width / contentW,
        rect.height / contentH,
        ZOOM_MAX
      );
      if (!Number.isFinite(newZoom) || newZoom <= 0) return;
      const newPanX =
        (rect.width - contentW * newZoom) / 2 - minX * newZoom + 40 * newZoom;
      const newPanY =
        (rect.height - contentH * newZoom) / 2 - minY * newZoom + 40 * newZoom;
      rawZoom.current = newZoom;
      setReactiveZoom(newZoom);
      updatePan(newPanX, newPanY);
      resizeCanvas();
      scheduleRedraw();
    }, [节点列表, resolveNodePos, updatePan, resizeCanvas, scheduleRedraw]);

    // ── Layout
    const applyLayout = useCallback(
      (mode: string) => {
        if (节点列表.length === 0) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) return;
        // Build layout data from props + K.current overrides
        const dataForLayout = 节点列表.map(n => {
          const override = K.current[n.id];
          return {
            ...n,
            id: n.id,
            父地图ID: n.父地图ID ? n.父地图ID : null,
            x: override ? override.x : n.x != null ? Number(n.x) : 0,
            y: override ? override.y : n.y != null ? Number(n.y) : 0,
          };
        });

        let result: Map<number, { x: number; y: number }>;
        if (mode === '网络') {
          const initial = layoutHierarchical(dataForLayout as any, {
            宽: rect.width,
            高: rect.height,
          });
          const edges = 连线列表.map(c => ({ from: c.起点ID, to: c.终点ID }));
          for (const n of dataForLayout) {
            if (n.父地图ID) edges.push({ from: n.父地图ID, to: n.id });
          }
          result = refineLayout(initial, dataForLayout as any, edges as any);
        } else {
          result = layoutHierarchical(dataForLayout as any, {
            宽: rect.width,
            高: rect.height,
          });
        }

        const newPos: Record<MapId, { x: number; y: number }> = {};
        for (const [id, p] of result) {
          newPos[id] = p;
          K.current[id] = p;
        }
        setPositions(newPos);
        for (const node of 节点列表) {
          const p = newPos[node.id];
          if (p) on节点移动(node.id, p.x, p.y);
        }
        // K.current is now up-to-date, so fitAll reads correct positions
        fitAll();
      },
      [节点列表, 连线列表, on节点移动, fitAll]
    );

    const applySubtreeLayout = useCallback(
      (nodeId: MapId) => {
        const nodeData = 节点列表.find(n => n.id === nodeId);
        if (!nodeData) return;
        const override = K.current[nodeId];
        const subtreeIds = new Set<MapId>();
        const collect = (pid: MapId) => {
          节点列表
            .filter(n => n.父地图ID === pid)
            .forEach(c => {
              subtreeIds.add(c.id);
              collect(c.id);
            });
        };
        collect(nodeId);
        if (subtreeIds.size === 0) return;
        const nodeWithPos = {
          ...nodeData,
          id: nodeId,
          x: override ? override.x : (nodeData.x ?? 0),
          y: override ? override.y : (nodeData.y ?? 0),
        };
        const result = layoutSubtree(
          nodeWithPos as any,
          subtreeIds as any,
          节点列表 as any
        );
        for (const [id, p] of result) K.current[id] = p;
        const newPos: Record<MapId, { x: number; y: number }> = {};
        for (const [id, p] of result) newPos[id] = p;
        setPositions(prev => ({ ...prev, ...newPos }));
        for (const [id, p] of result) on节点移动(id, p.x, p.y);
        scheduleRedraw();
      },
      [节点列表, on节点移动, scheduleRedraw]
    );

    // ── Expose ref methods
    useImperativeHandle(
      ref,
      () => ({
        适配全景: fitAll,
        重新布局: applyLayout,
        重新布局子树: applySubtreeLayout,
        更新画布尺寸: () => {
          resizeCanvas();
          scheduleRedraw();
        },
        绘制所有连线: () => {
          resizeCanvas();
          drawAllConnections();
        },
        设置布局模式: (mode: string) => setLayoutMode(mode as any),
      }),
      [
        fitAll,
        applyLayout,
        applySubtreeLayout,
        resizeCanvas,
        scheduleRedraw,
        drawAllConnections,
      ]
    );

    // ── Initialize positions from node data
    // Only sets up NEW nodes (K.current undefined) and only triggers layout
    // when new nodes have all-zero positions. Does NOT re-layout on every prop change.
    useEffect(() => {
      if (节点列表.length === 0) return;
      let hasNewNodes = false;
      let hasNonZero = false;
      for (const n of 节点列表) {
        if (K.current[n.id] === undefined) {
          hasNewNodes = true;
          const nx = Number(n.x) || 0;
          const ny = Number(n.y) || 0;
          K.current[n.id] = { x: nx, y: ny };
          if (nx !== 0 || ny !== 0) hasNonZero = true;
        }
      }
      setPositions({ ...K.current });
      if (hasNewNodes && !hasNonZero && 节点列表.length > 1) {
        needsLayoutRef.current = true;
        // Trigger layout on next frame if container already has dimensions
        requestAnimationFrame(() => {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect && rect.width > 0 && rect.height > 0) {
            needsLayoutRef.current = false;
            applyLayout(layoutMode);
          }
        });
      }
    }, [节点列表]);

    // ── Resize observer + deferred layout
    const needsLayoutRef = useRef(false);
    useEffect(() => {
      if (!containerRef.current) return;
      const observer = new ResizeObserver(() => {
        resizeCanvas();
        scheduleRedraw();
        if (needsLayoutRef.current) {
          needsLayoutRef.current = false;
          applyLayout(layoutMode);
        }
      });
      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }, [resizeCanvas, scheduleRedraw, applyLayout, layoutMode]);

    // ── Redraw on data/selection changes — Source: Le() batches via rAF, no resize
    useEffect(() => {
      scheduleRedraw();
    }, [
      scheduleRedraw,
      resolvedNodes,
      连线列表,
      规划路线连线列表,
      已经历路线连线列表,
      选中节点ID,
      选中连线ID,
      lineSettings,
    ]);

    // ── Load saved view state
    useEffect(() => {
      try {
        const saved = localStorage.getItem('geomap_canvas_view');
        if (saved) {
          const data = JSON.parse(saved);
          if (Number.isFinite(data.zoom)) {
            rawZoom.current = data.zoom;
            setReactiveZoom(data.zoom);
          }
          if (Number.isFinite(data.panX)) updatePan(data.panX, data.panY ?? 0);
          return;
        }
      } catch {}
      if (节点列表.length > 0) setTimeout(fitAll, 200);
    }, []);

    // ── Mouse event handlers — matching source exactly ──

    // Source: Ke (line 139759) — container mousedown
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const onMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return;
        if (
          (e.target as HTMLElement).closest('.地图节点') ||
          (e.target as HTMLElement).closest('.锚点') ||
          (e.target as HTMLElement).closest('.连线设置气泡') ||
          (e.target as HTMLElement).closest('.缩放控制器')
        )
          return;

        // Start panning
        modeRef.current = 'pan';
        mouseStartRef.current = { x: e.clientX, y: e.clientY };
        panStartRef.current = { x: rawPanX.current, y: rawPanY.current };
        container.classList.add('panning');
        on选中节点ID变更(null);
        on选中连线ID变更(null);
        setContextMenu(null);
        e.preventDefault();
      };

      // Source: Qt (line 139878) — double-click add node
      const onDoubleClick = (e: MouseEvent) => {
        if (
          (e.target as HTMLElement).closest('.地图节点') ||
          (e.target as HTMLElement).closest('.缩放控制器') ||
          (e.target as HTMLElement).closest('.连线设置气泡')
        )
          return;
        const rect = container.getBoundingClientRect();
        const localX =
          (e.clientX - rect.left - rawPanX.current) / rawZoom.current;
        const localY =
          (e.clientY - rect.top - rawPanY.current) / rawZoom.current;
        on节点添加(localX, localY);
      };

      // Source: As (line 139890) — wheel zoom
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const rect = container.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const oldZoom = rawZoom.current;
        const newZoom = Math.max(
          ZOOM_MIN,
          Math.min(ZOOM_MAX, oldZoom * (e.deltaY < 0 ? 1.12 : 0.9))
        );
        const cx = (mx - rawPanX.current) / oldZoom;
        const cy = (my - rawPanY.current) / oldZoom;
        rawZoom.current = newZoom;
        setReactiveZoom(newZoom);
        updatePan(mx - cx * newZoom, my - cy * newZoom);
        resizeCanvas();
        scheduleRedraw();
      };

      const onContextMenu = (e: MouseEvent) => e.preventDefault();

      container.addEventListener('mousedown', onMouseDown);
      container.addEventListener('dblclick', onDoubleClick);
      container.addEventListener('wheel', onWheel, { passive: false });
      container.addEventListener('contextmenu', onContextMenu);
      return () => {
        container.removeEventListener('mousedown', onMouseDown);
        container.removeEventListener('dblclick', onDoubleClick);
        container.removeEventListener('wheel', onWheel);
        container.removeEventListener('contextmenu', onContextMenu);
      };
    }, [
      updatePan,
      scheduleRedraw,
      resizeCanvas,
      on选中节点ID变更,
      on选中连线ID变更,
      on节点添加,
    ]);

    // Source: St + it (lines 139787-139832) — global mousemove
    // Source: Ut (lines 139833-139876) — global mouseup
    useEffect(() => {
      const onMouseMove = (e: MouseEvent) => {
        const mode = modeRef.current;
        if (!mode) return;

        if (mode === 'pan') {
          const newPanX =
            panStartRef.current.x + (e.clientX - mouseStartRef.current.x);
          const newPanY =
            panStartRef.current.y + (e.clientY - mouseStartRef.current.y);
          rawPanX.current = newPanX;
          rawPanY.current = newPanY;
          setReactivePanX(newPanX);
          setReactivePanY(newPanY);
          drawAllConnections();
        } else if (mode === 'drag-node' && dragNodeRef.current) {
          const dx = (e.clientX - mouseStartRef.current.x) / rawZoom.current;
          const dy = (e.clientY - mouseStartRef.current.y) / rawZoom.current;
          const nx = nodeStartRef.current.x + dx;
          const ny = nodeStartRef.current.y + dy;

          // Update dragged node position via direct DOM
          const el = contentRef.current?.querySelector(
            `[data-node-id="${dragNodeRef.current}"]`
          ) as HTMLElement;
          if (el) el.style.transform = `translate3d(${nx}px, ${ny}px, 0)`;
          K.current[dragNodeRef.current] = { x: nx, y: ny };

          // Move children with parent
          const offsetX = nx - nodeStartRef.current.x;
          const offsetY = ny - nodeStartRef.current.y;
          for (const cid of childDragIds.current) {
            const orig = childDragOrigPos.current[cid];
            if (orig) {
              const cx = orig.x + offsetX;
              const cy = orig.y + offsetY;
              K.current[cid] = { x: cx, y: cy };
              const cel = contentRef.current?.querySelector(
                `[data-node-id="${cid}"]`
              ) as HTMLElement;
              if (cel) cel.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
            }
          }
          drawAllConnections();
        } else if (mode === 'connect') {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            connectMouseRef.current = {
              x: e.clientX - rect.left,
              y: e.clientY - rect.top,
            };
            drawAllConnections();
          }
        }
      };

      const onMouseUp = (e: MouseEvent) => {
        const mode = modeRef.current;

        if (mode === 'drag-node' && dragNodeRef.current) {
          const override = K.current[dragNodeRef.current];
          const dx = (e.clientX - mouseStartRef.current.x) / rawZoom.current;
          const dy = (e.clientY - mouseStartRef.current.y) / rawZoom.current;
          const finalX = override ? override.x : nodeStartRef.current.x + dx;
          const finalY = override ? override.y : nodeStartRef.current.y + dy;
          on节点移动(
            dragNodeRef.current,
            Math.round(finalX),
            Math.round(finalY)
          );
          for (const cid of childDragIds.current) {
            const cp = K.current[cid];
            if (cp) on节点移动(cid, Math.round(cp.x), Math.round(cp.y));
          }
          // Sync positions state
          setPositions({ ...K.current });
        }

        if (mode === 'connect' && connectFromRef.current !== null) {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            const targetId = findNodeAtScreen(sx, sy);
            if (targetId && targetId !== connectFromRef.current) {
              const exists = 连线列表.some(
                c =>
                  (c.起点ID === connectFromRef.current &&
                    c.终点ID === targetId) ||
                  (c.起点ID === targetId && c.终点ID === connectFromRef.current)
              );
              if (!exists) on连线创建(connectFromRef.current, targetId);
            }
          }
          connectFromRef.current = null;
          connectMouseRef.current = { x: 0, y: 0 };
          resizeCanvas();
          scheduleRedraw();
        }

        // Reset — Source: lines 139873-139876
        modeRef.current = null;
        dragNodeRef.current = null;
        childDragIds.current = [];
        childDragOrigPos.current = {};
        containerRef.current?.classList.remove(
          'dragging-node',
          'connecting',
          'panning'
        );
      };

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setContextMenu(null);
          if (modeRef.current === 'connect') {
            modeRef.current = null;
            connectFromRef.current = null;
            connectMouseRef.current = { x: 0, y: 0 };
            resizeCanvas();
            scheduleRedraw();
          }
        }
      };

      const onClick = () => setContextMenu(null);

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('click', onClick);
      return () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('click', onClick);
      };
    }, [
      drawAllConnections,
      resizeCanvas,
      scheduleRedraw,
      on节点移动,
      on连线创建,
      findNodeAtScreen,
      连线列表,
    ]);

    // ── Node event handlers (passed to JSX) ──

    // Source: et (line 139727) — node mousedown
    const handleNodeMouseDown = useCallback(
      (e: React.MouseEvent, nodeId: MapId) => {
        if ((e.target as HTMLElement).closest('.锚点')) return;
        e.preventDefault();
        on选中节点ID变更(nodeId);
        on选中连线ID变更(null);
        const node = nodeMap.get(nodeId);
        if (!node) return;
        dragNodeRef.current = nodeId;
        modeRef.current = 'drag-node';
        mouseStartRef.current = { x: e.clientX, y: e.clientY };
        const override = K.current[nodeId];
        nodeStartRef.current = {
          x: override ? override.x : node.x,
          y: override ? override.y : node.y,
        };
        childDragIds.current = getDescendantIds(nodeId);
        childDragOrigPos.current = {};
        for (const cid of childDragIds.current) {
          const cn = nodeMap.get(cid);
          if (cn) {
            const co = K.current[cid];
            childDragOrigPos.current[cid] = {
              x: co ? co.x : cn.x,
              y: co ? co.y : cn.y,
            };
          }
        }
        containerRef.current?.classList.add('dragging-node');
        setContextMenu(null);
      },
      [nodeMap, getDescendantIds, on选中节点ID变更, on选中连线ID变更]
    );

    // Source: Xe (line 139751) — anchor mousedown
    const handleAnchorMouseDown = useCallback(
      (e: React.MouseEvent, nodeId: MapId) => {
        e.preventDefault();
        e.stopPropagation();
        connectFromRef.current = nodeId;
        modeRef.current = 'connect';
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          connectMouseRef.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
          };
        }
        containerRef.current?.classList.add('connecting');
        scheduleRedraw();
      },
      [scheduleRedraw]
    );

    const handleNodeContextMenu = useCallback(
      (e: React.MouseEvent, nodeId: MapId) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, nodeId });
      },
      []
    );

    const handleRemoveParent = useCallback(() => {
      if (contextMenu) {
        on父节点变更(contextMenu.nodeId, null);
        setContextMenu(null);
      }
    }, [contextMenu, on父节点变更]);

    // ── Zoom control buttons ──
    const zoomIn = useCallback(() => {
      rawZoom.current = Math.min(ZOOM_MAX, rawZoom.current * 1.2);
      setReactiveZoom(rawZoom.current);
      resizeCanvas();
      scheduleRedraw();
    }, [resizeCanvas, scheduleRedraw]);

    const zoomOut = useCallback(() => {
      rawZoom.current = Math.max(ZOOM_MIN, rawZoom.current / 1.2);
      setReactiveZoom(rawZoom.current);
      resizeCanvas();
      scheduleRedraw();
    }, [resizeCanvas, scheduleRedraw]);

    // ── Save/load layout ──
    const saveLayout = useCallback(() => {
      const data: Record<MapId, { x: number; y: number }> = {};
      for (const n of resolvedNodes) data[n.id] = { x: n.x, y: n.y };
      localStorage.setItem('geomap_node_layout', JSON.stringify(data));
      setSaveHint('布局已保存');
      setTimeout(() => setSaveHint(''), 2000);
    }, [resolvedNodes]);

    const loadLayout = useCallback(() => {
      try {
        const saved = localStorage.getItem('geomap_node_layout');
        if (saved) {
          const data = JSON.parse(saved);
          for (const [idStr, pos] of Object.entries(data)) {
            const p = pos as { x: number; y: number };
            K.current[idStr] = p;
            on节点移动(idStr, p.x, p.y);
          }
          setPositions({ ...K.current });
          setSaveHint('布局已加载');
          setTimeout(() => setSaveHint(''), 2000);
        }
      } catch {}
    }, [on节点移动]);

    // ── Line settings save/load — Source: _ye (line 138197) ──
    const saveLineSettings = useCallback(() => {
      try {
        localStorage.setItem(
          'geomap_line_settings',
          JSON.stringify(lineSettings)
        );
      } catch {}
    }, [lineSettings]);

    const resetLineSettings = useCallback(() => {
      const defaults = JSON.parse(JSON.stringify(DEFAULT_LINE_SETTINGS));
      setLineSettings(defaults);
      // Apply defaults to K-like ref is not needed since settings are separate
    }, []);

    // Load saved line settings on mount
    useEffect(() => {
      try {
        const saved = localStorage.getItem('geomap_line_settings');
        if (saved) {
          const data = JSON.parse(saved);
          if (data && typeof data === 'object') setLineSettings(data);
        }
      } catch {}
    }, []);

    // Save line settings on change
    useEffect(() => {
      saveLineSettings();
    }, [saveLineSettings]);

    // ── Helper functions for node rendering ──
    const getNodeIcon = useCallback((node: any) => {
      if (node.地图类型) return getTypeById(node.地图类型).icon;
      return inferTypeFromName(node.地图名称).icon;
    }, []);

    const getNodeLabel = useCallback((node: any) => {
      if (node.地图类型) return getTypeById(node.地图类型).label;
      return inferTypeFromName(node.地图名称).label;
    }, []);

    const getChildCount = useCallback(
      (id: MapId) => {
        return 节点列表.filter(n => n.父地图ID === id).length;
      },
      [节点列表]
    );

    // Source: xe (line 139247-139249) — content layer transform
    const contentTransform = `translate(${reactivePanX}px, ${reactivePanY}px) scale(${reactiveZoom})`;

    // Source: Y (line 139261-139274) — node style
    const getNodeStyle = useCallback(
      (node: any): React.CSSProperties => {
        const pc = parentColorMap.get(node.id);
        const t = `translate3d(${node.x}px, ${node.y}px, 0)`;
        if (pc) {
          return {
            transform: t,
            borderLeft: `4px solid ${pc}`,
            backgroundColor: `${pc}18`,
          };
        }
        return {
          transform: t,
          borderLeft: `3px solid ${node.color || 'var(--text-muted)'}`,
        };
      },
      [parentColorMap]
    );

    return (
      <div ref={containerRef} className="地图画布容器 v-91aea07d">
        {/* Canvas layer — Source: R.value, pointer-events: none */}
        {/* Static canvas — Source: R.value (parent-child + hit connections) */}
        <div className="canvas层" style={{ zIndex: 1 }}>
          <canvas
            ref={canvasRef}
            style={{ display: 'block', width: '100%', height: '100%' }}
          />
        </div>
        {/* Animation canvas — Source: V.value (flowing route effects) */}
        <div className="canvas层 动画层" style={{ zIndex: 1 }}>
          <canvas
            ref={animCanvasRef}
            style={{ display: 'block', width: '100%', height: '100%' }}
          />
        </div>

        {/* Content layer — Source: D.value, pointer-events: none, children get auto */}
        <div
          className="内容层"
          ref={contentRef}
          style={{
            transform: contentTransform,
            transformOrigin: '0 0',
            zIndex: 2,
          }}
        >
          {resolvedNodes.map(node => {
            const isSelected = node.id === 选中节点ID;
            const childCount = getChildCount(node.id);
            const icon = getNodeIcon(node);
            const typeLabel = getNodeLabel(node);
            const style = getNodeStyle(node);

            return (
              <div
                key={node.id}
                className={`地图节点 ${isSelected ? 'selected' : ''}`}
                style={style}
                data-node-id={node.id}
                onMouseDown={e => handleNodeMouseDown(e, node.id)}
                onContextMenu={e => handleNodeContextMenu(e, node.id)}
              >
                <i className={`${icon} 节点图标`} />
                <div className="节点文本">
                  <div className="节点标题">{node.地图名称 || '未命名'}</div>
                  <div className="节点类型标签">{typeLabel}</div>
                </div>
                {node.父地图ID && <span className="父节点标记">↖子</span>}
                {childCount > 0 && (
                  <span className="子节点数标记">{childCount}↓</span>
                )}
                <div
                  className="锚点"
                  data-anchor={node.id}
                  title="拖拽创建连线"
                  onMouseDown={e => handleAnchorMouseDown(e, node.id)}
                />
              </div>
            );
          })}
        </div>

        {/* Zoom controls — Source: 缩放控制器 */}
        <div className="缩放控制器">
          <button onClick={zoomOut} title="缩小">
            −
          </button>
          <span className="缩放百分比">{Math.round(reactiveZoom * 100)}%</span>
          <button onClick={zoomIn} title="放大">
            +
          </button>
          <button
            className="图标按钮"
            onClick={() => fitAll()}
            title="重置视图"
          >
            <i className="ri-restart-line" />
          </button>
          <button
            className="图标按钮"
            onClick={loadLayout}
            title="加载布局坐标"
          >
            <i className="ri-folder-open-line" />
          </button>
          <button
            className="图标按钮"
            onClick={saveLayout}
            title="保存当前布局"
          >
            <i className="ri-save-line" />
          </button>
          <button
            className={`图标按钮 ${showLineSettings ? 'active' : ''}`}
            onClick={() => setShowLineSettings(v => !v)}
            title="连线设置"
          >
            <i className="ri-settings-4-line" />
          </button>
        </div>

        {/* Line settings popover — Source: o2e (line 138289) 连线设置气泡 */}
        {showLineSettings && (
          <div
            className="连线设置气泡 右键菜单"
            style={{ bottom: 60, right: 20, position: 'absolute', zIndex: 100 }}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            onDoubleClick={e => e.stopPropagation()}
          >
            {/* Header — Source: 气泡头部 (line 138335) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
                paddingBottom: 6,
                borderBottom: '1px solid var(--border)',
              }}
            >
              <span
                style={{
                  fontSize: '0.85em',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <i className="ri-line-chart-line" /> 连线设置
              </span>
              <button
                className="重置按钮"
                onClick={resetLineSettings}
                title="恢复默认"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  fontSize: '0.85em',
                  padding: '2px 4px',
                }}
              >
                <i className="ri-refresh-line" />
              </button>
            </div>

            {/* 父子连线 — Source: lines 138357-138520 */}
            <div style={{ marginBottom: 8 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.82em',
                  padding: '3px 0',
                  fontWeight: 500,
                }}
              >
                <span>
                  <span style={{ marginRight: 4 }}>━</span>父子连线
                </span>
                <input
                  type="checkbox"
                  checked={lineSettings.父子连线.显示}
                  onChange={() => {
                    setLineSettings(s => ({
                      ...s,
                      父子连线: { ...s.父子连线, 显示: !s.父子连线.显示 },
                    }));
                  }}
                />
              </div>
              {lineSettings.父子连线.显示 && (
                <div style={{ paddingLeft: 12, fontSize: '0.78em' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '2px 0',
                    }}
                  >
                    <span style={{ color: 'var(--text-secondary)' }}>颜色</span>
                    <input
                      type="color"
                      value={lineSettings.父子连线.颜色 || '#64748b'}
                      onChange={e => {
                        setLineSettings(s => ({
                          ...s,
                          父子连线: { ...s.父子连线, 颜色: e.target.value },
                        }));
                      }}
                      style={{
                        width: 24,
                        height: 18,
                        padding: 0,
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    />
                    {lineSettings.父子连线.颜色 && (
                      <button
                        onClick={() =>
                          setLineSettings(s => ({
                            ...s,
                            父子连线: { ...s.父子连线, 颜色: '' },
                          }))
                        }
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-muted)',
                          fontSize: '0.9em',
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '2px 0',
                    }}
                  >
                    <span style={{ color: 'var(--text-secondary)' }}>线型</span>
                    <select
                      value={lineSettings.父子连线.线型}
                      onChange={e => {
                        setLineSettings(s => ({
                          ...s,
                          父子连线: { ...s.父子连线, 线型: e.target.value },
                        }));
                      }}
                      style={{ fontSize: '0.95em', padding: '1px 4px' }}
                    >
                      {LINE_TYPE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '2px 0',
                    }}
                  >
                    <span style={{ color: 'var(--text-secondary)' }}>线宽</span>
                    <input
                      type="range"
                      min="0.5"
                      max="5"
                      step="0.1"
                      value={lineSettings.父子连线.线宽}
                      onChange={e => {
                        setLineSettings(s => ({
                          ...s,
                          父子连线: {
                            ...s.父子连线,
                            线宽: Number(e.target.value),
                          },
                        }));
                      }}
                      style={{ flex: 1 }}
                    />
                    <span style={{ minWidth: 24, textAlign: 'right' }}>
                      {lineSettings.父子连线.线宽.toFixed(1)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 已规划路线 — Source: lines 138521-138735 */}
            <div style={{ marginBottom: 8 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.82em',
                  padding: '3px 0',
                  fontWeight: 500,
                }}
              >
                <span>
                  <span style={{ marginRight: 4 }}>┅</span>已规划路线
                </span>
                <input
                  type="checkbox"
                  checked={lineSettings.已规划连线.显示}
                  onChange={() => {
                    setLineSettings(s => ({
                      ...s,
                      已规划连线: { ...s.已规划连线, 显示: !s.已规划连线.显示 },
                    }));
                  }}
                />
              </div>
              {lineSettings.已规划连线.显示 && (
                <div style={{ paddingLeft: 12, fontSize: '0.78em' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '2px 0',
                    }}
                  >
                    <span style={{ color: 'var(--text-secondary)' }}>颜色</span>
                    <input
                      type="color"
                      value={lineSettings.已规划连线.颜色}
                      onChange={e => {
                        setLineSettings(s => ({
                          ...s,
                          已规划连线: { ...s.已规划连线, 颜色: e.target.value },
                        }));
                      }}
                      style={{
                        width: 24,
                        height: 18,
                        padding: 0,
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    />
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '2px 0',
                    }}
                  >
                    <span style={{ color: 'var(--text-secondary)' }}>线型</span>
                    <select
                      value={lineSettings.已规划连线.线型}
                      onChange={e => {
                        setLineSettings(s => ({
                          ...s,
                          已规划连线: { ...s.已规划连线, 线型: e.target.value },
                        }));
                      }}
                      style={{ fontSize: '0.95em', padding: '1px 4px' }}
                    >
                      {LINE_TYPE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '2px 0',
                    }}
                  >
                    <span style={{ color: 'var(--text-secondary)' }}>线宽</span>
                    <input
                      type="range"
                      min="0.5"
                      max="6"
                      step="0.1"
                      value={lineSettings.已规划连线.线宽}
                      onChange={e => {
                        setLineSettings(s => ({
                          ...s,
                          已规划连线: {
                            ...s.已规划连线,
                            线宽: Number(e.target.value),
                          },
                        }));
                      }}
                      style={{ flex: 1 }}
                    />
                    <span style={{ minWidth: 24, textAlign: 'right' }}>
                      {lineSettings.已规划连线.线宽.toFixed(1)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 已来过路线 — Source: lines 138737-138880 */}
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.82em',
                  padding: '3px 0',
                  fontWeight: 500,
                }}
              >
                <span>
                  <span style={{ marginRight: 4 }}>━</span>已来过路线
                </span>
                <input
                  type="checkbox"
                  checked={lineSettings.已来过连线.显示}
                  onChange={() => {
                    setLineSettings(s => ({
                      ...s,
                      已来过连线: { ...s.已来过连线, 显示: !s.已来过连线.显示 },
                    }));
                  }}
                />
              </div>
              {lineSettings.已来过连线.显示 && (
                <div style={{ paddingLeft: 12, fontSize: '0.78em' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '2px 0',
                    }}
                  >
                    <span style={{ color: 'var(--text-secondary)' }}>颜色</span>
                    <input
                      type="color"
                      value={lineSettings.已来过连线.颜色}
                      onChange={e => {
                        setLineSettings(s => ({
                          ...s,
                          已来过连线: { ...s.已来过连线, 颜色: e.target.value },
                        }));
                      }}
                      style={{
                        width: 24,
                        height: 18,
                        padding: 0,
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    />
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '2px 0',
                    }}
                  >
                    <span style={{ color: 'var(--text-secondary)' }}>线型</span>
                    <select
                      value={lineSettings.已来过连线.线型}
                      onChange={e => {
                        setLineSettings(s => ({
                          ...s,
                          已来过连线: { ...s.已来过连线, 线型: e.target.value },
                        }));
                      }}
                      style={{ fontSize: '0.95em', padding: '1px 4px' }}
                    >
                      {LINE_TYPE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '2px 0',
                    }}
                  >
                    <span style={{ color: 'var(--text-secondary)' }}>线宽</span>
                    <input
                      type="range"
                      min="0.5"
                      max="6"
                      step="0.1"
                      value={lineSettings.已来过连线.线宽}
                      onChange={e => {
                        setLineSettings(s => ({
                          ...s,
                          已来过连线: {
                            ...s.已来过连线,
                            线宽: Number(e.target.value),
                          },
                        }));
                      }}
                      style={{ flex: 1 }}
                    />
                    <span style={{ minWidth: 24, textAlign: 'right' }}>
                      {lineSettings.已来过连线.线宽.toFixed(1)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Right-click context menu */}
        {contextMenu && (
          <div
            className="右键菜单"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button onClick={handleRemoveParent}>🔗 取消父节点</button>
          </div>
        )}

        {/* Save hint */}
        {saveHint && (
          <div className="保存提示卡片 fade-enter-active">{saveHint}</div>
        )}
      </div>
    );
  }
);

GeoMapCanvas.displayName = 'GeoMapCanvas';
export default GeoMapCanvas;
