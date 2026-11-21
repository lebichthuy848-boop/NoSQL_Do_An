import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dagre from "@dagrejs/dagre";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  BookOpen,
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  Eye,
  EyeOff,
  Focus,
  Fullscreen,
  Layers3,
  Maximize2,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Search,
  Shrink,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { apiRequest } from "../../api/http";
import { getCatalogRepository } from "../../repositories/catalogRepository";
import type { GraphData } from "../../types/catalog";
import {
  collapseBranch,
  displayName,
  mergeExpandedGraph,
  prioritizeGraph,
} from "./graphModel";

type Mode = "career" | "skill" | "resource" | "taxonomy";
type Direction = "LR" | "TB";
type Selection = { kind: "node" | "edge"; item: any } | null;
type GraphNodeData = {
  label: string;
  fullLabel: string;
  nodeType: string;
  description?: string;
  expandable?: boolean;
  expanded?: boolean;
  relationCount?: number;
};
const repo = getCatalogRepository();
const NODE_W = 210,
  NODE_H = 76;
const colors: Record<string, string> = {
  career: "#4f46e5",
  skill: "#0891b2",
  skillGroup: "#7c3aed",
  course: "#059669",
  provider: "#d97706",
};
const modeLabels: Record<Mode, string> = {
  career: "Career Graph",
  skill: "Skill Graph",
  resource: "Resource Graph",
  taxonomy: "ESCO Taxonomy",
};
const edgeLabels: Record<string, string> = {
  requires_skill: "Yêu cầu kỹ năng",
  teaches: "Giảng dạy",
  offered_by: "Được cung cấp bởi",
  esco_skill_group: "Thuộc nhóm ESCO",
  esco_group_broader: "Nhóm rộng hơn",
  esco_skill_broader: "Kỹ năng rộng hơn",
  esco_skill_knowledge: "Liên hệ tri thức",
  skill_prerequisite: "Prerequisite đã phê duyệt",
};
const edgeColors: Record<string, string> = {
  requires_skill: "#818cf8",
  teaches: "#34d399",
  offered_by: "#fbbf24",
  esco_skill_group: "#a78bfa",
  esco_group_broader: "#c084fc",
  esco_skill_broader: "#e879f9",
  esco_skill_knowledge: "#22d3ee",
  skill_prerequisite: "#e879f9",
};
const iconFor = (type: string) =>
  type === "career"
    ? BriefcaseBusiness
    : type === "skill"
      ? Network
      : type === "course"
        ? BookOpen
        : type === "provider"
          ? Building2
          : Layers3;
const routeFor = (id: string) =>
  id.startsWith("careers/")
    ? `/careers/${id.split("/")[1]}`
    : id.startsWith("skills/")
      ? `/skills/${id.split("/")[1]}`
      : (id.startsWith("courses/") || id.startsWith("app_resource_drafts/"))
        ? `/resources/${encodeURIComponent(id)}`
        : null;

function KnowledgeNode({ data, selected }: NodeProps<Node<GraphNodeData>>) {
  const Icon = iconFor(data.nodeType);
  return (
    <div
      className={`kg-node kg-${data.nodeType} ${selected ? "selected" : ""}`}
      title={data.fullLabel}
    >
      <Handle type="target" position={Position.Left} />
      <span className="kg-icon">
        <Icon />
      </span>
      <span className="kg-copy">
        <small>
          {data.nodeType === "course"
            ? "RESOURCE"
            : data.nodeType.replace(/([A-Z])/g, " $1").toUpperCase()}
        </small>
        <b>{data.label}</b>
      </span>
      {data.expandable && (
        <span className={`kg-expand ${data.expanded ? "open" : ""}`}>
          <ChevronDown />
        </span>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { knowledge: KnowledgeNode };

function entity(id: string) {
  if (id.startsWith("careers/")) return repo.getCareerById(id);
  if (id.startsWith("skills/")) return repo.getSkillById(id);
  if (id.startsWith("courses/") || id.startsWith("app_resource_drafts/")) return repo.getCourseById(id);
  if (id.startsWith("providers/"))
    return repo.getProviders().find((x) => x.id === id);
  return repo.getSkillGroups().find((x) => x.id === id);
}
function layoutGraph(
  data: GraphData,
  direction: Direction,
  limit: number,
  nodeFilter: Set<string>,
  edgeFilter: Set<string>,
  requirement: string,
  labelsOn: boolean,
  expanded: Set<string>,
  selectedId?: string,
) {
  const allowedEdges = data.edges.filter(
    (e) =>
      edgeFilter.has(e.type) &&
      (e.type !== "requires_skill" ||
        requirement === "all" ||
        String((e.data as any)?.requirement_type) === requirement),
  );
  const connected = new Set(allowedEdges.flatMap((e) => [e.source, e.target]));
  const eligible = {
    ...data,
    nodes: data.nodes.filter(
      (n) =>
        nodeFilter.has(n.type) && (connected.has(n.id) || n.id === selectedId),
    ),
  };
  const rawNodes = prioritizeGraph(eligible, selectedId || "", expanded, limit);
  const ids = new Set(rawNodes.map((n) => n.id));
  const rawEdges = allowedEdges.filter(
    (e) => ids.has(e.source) && ids.has(e.target),
  );
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: 44,
    ranksep: direction === "LR" ? 110 : 85,
    marginx: 35,
    marginy: 35,
  });
  rawNodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  rawEdges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  const nodes: Node<GraphNodeData>[] = rawNodes.map((n) => {
    const info: any = entity(n.id),
      pos = g.node(n.id),
      expandable =
        n.type === "skill" || n.type === "course" || n.type === "skillGroup",
      named = displayName(n.label, n.id);
    return {
      id: n.id,
      type: "knowledge",
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data: {
        label:
          named.label.length > 42
            ? `${named.label.slice(0, 39)}…`
            : named.label,
        fullLabel: named.label,
        nodeType: n.type,
        description: info?.description,
        expandable,
        expanded: expanded.has(n.id),
      },
    };
  });
  const edges: Edge[] = rawEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: labelsOn ? edgeLabels[e.type] || e.type : undefined,
    data: {
      ...(typeof e.data === "object" && e.data ? e.data : {}),
      relationType: e.type,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 16,
      height: 16,
      color: edgeColors[e.type] || "#8b5cf6",
    },
    style: {
      stroke: edgeColors[e.type] || "#a78bfa",
      strokeWidth: 1.8,
    },
    labelStyle: { fontSize: 10, fontWeight: 700, fill: "#64748b" },
    labelBgStyle: { fill: "#fff", fillOpacity: 0.9 },
    labelBgPadding: [5, 3],
    labelBgBorderRadius: 5,
  }));
  return { nodes, edges };
}

function GraphWorkspace() {
  const reduceMotion = useReducedMotion(),
    flowApi = useReactFlow(),
    shellRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("career"),
    [focus, setFocus] = useState(repo.getCareers()[0]?.id || ""),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<Selection>(null),
    [expanded, setExpanded] = useState(new Set<string>()),
    [limit, setLimit] = useState(30),
    [direction, setDirection] = useState<Direction>("LR"),
    [labelsOn, setLabelsOn] = useState(false),
    [sidebarOpen, setSidebarOpen] = useState(true),
    [requirement, setRequirement] = useState("all"),
    [notice, setNotice] = useState<string | null>(null),
    [nodeFilter, setNodeFilter] = useState(
      new Set(["career", "skill", "skillGroup", "course", "provider"]),
    ),
    [edgeFilter, setEdgeFilter] = useState(
      new Set([
        "requires_skill",
        "teaches",
        "offered_by",
        "esco_skill_group",
        "esco_group_broader",
        "esco_skill_broader",
        "esco_skill_knowledge",
        "skill_prerequisite",
      ]),
    );
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] });
  const [graphLoading, setGraphLoading] = useState(true);
  const [graphError, setGraphError] = useState("");
  const options = useMemo(
    () =>
      mode === "career"
        ? repo
            .getCareers()
            .map((x) => ({ id: x.id, name: x.name, type: "career" }))
        : mode === "skill"
          ? repo
              .getSkills()
              .map((x) => ({ id: x.id, name: x.name, type: "skill" }))
          : mode === "resource"
            ? repo
                .getCourses()
                .filter((x) => x.id.startsWith("courses/"))
                .map((x) => ({ id: x.id, name: x.title, type: "course" }))
            : repo.getSkillGroups().map((x) => ({
                id: x.id,
                name: `${x.code} · ${x.name}`,
                type: "skillGroup",
              })),
    [mode, repo.getCareers().length, repo.getSkills().length, repo.getCourses().length, repo.getSkillGroups().length],
  );
  useEffect(() => {
    if (!focus && options[0]) setFocus(options[0].id);
  }, [focus, options]);
  const matches = useMemo(
    () =>
      options
        .filter((x) => x.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 40),
    [options, query],
  );
  useEffect(() => {
    if (!focus) { setGraph({ nodes: [], edges: [] }); setGraphLoading(false); return; }
    const controller = new AbortController();
    let active = true;
    setGraphLoading(true); setGraphError('');
    const params = new URLSearchParams({ focusId: focus, limit: '200' });
    params.set('edgeTypes', mode === 'career' ? 'requires_skill' : mode === 'skill' ? 'requires_skill,teaches,skill_prerequisite,esco_skill_group' : mode === 'resource' ? 'teaches,offered_by,course_entry_skill' : 'esco_skill_group,esco_group_broader,esco_skill_broader,esco_skill_knowledge');
    apiRequest<GraphData>(`/graph/neighborhood?${params}`, { signal: controller.signal }).then((result) => {
      if (active) setGraph(result);
    }).catch((error) => {
      if (active && !(error instanceof DOMException && error.name === 'AbortError')) setGraphError(error instanceof Error ? error.message : 'Không thể tải graph từ Backend.');
    }).finally(() => { if (active) setGraphLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [focus, mode]);
  const laid = useMemo(
    () =>
      layoutGraph(
        graph,
        direction,
        limit,
        nodeFilter,
        edgeFilter,
        requirement,
        labelsOn,
        expanded,
        focus,
      ),
    [
      graph,
      direction,
      limit,
      nodeFilter,
      edgeFilter,
      requirement,
      labelsOn,
      expanded,
      focus,
    ],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(laid.nodes),
    [edges, setEdges, onEdgesChange] = useEdgesState(laid.edges);
  const activeRelations = useMemo(
    () =>
      [
        ...new Set(edges.map((edge) => String(edge.data?.relationType || ""))),
      ].filter(Boolean),
    [edges],
  );
  useEffect(() => {
    if (selected?.kind === "node") {
      const id = selected.item.id,
        neighbors = new Set([id]);
      laid.edges.forEach((edge) => {
        if (edge.source === id || edge.target === id) {
          neighbors.add(edge.source);
          neighbors.add(edge.target);
        }
      });
      setNodes(
        laid.nodes.map((node) => ({
          ...node,
          className: neighbors.has(node.id) ? "kg-related" : "kg-dimmed",
        })),
      );
      setEdges(
        laid.edges.map((edge) => ({
          ...edge,
          className:
            edge.source === id || edge.target === id
              ? "kg-edge-active"
              : "kg-edge-dimmed",
        })),
      );
    } else {
      setNodes(laid.nodes);
      setEdges(laid.edges);
    }
  }, [laid, selected, setNodes, setEdges]);
  const reset = useCallback((nextMode = mode) => {
    const choices = nextMode === 'career' ? repo.getCareers() : nextMode === 'skill' ? repo.getSkills() : nextMode === 'resource' ? repo.getCourses() : repo.getSkillGroups();
    const first = choices[0];
    if (!first) { setFocus(''); return; }
    setFocus(first.id); setExpanded(new Set()); setSelected(null); setQuery('');
    setTimeout(() => flowApi.fitView({ duration: reduceMotion ? 0 : 450, padding: 0.18 }), 30);
  }, [mode, flowApi, reduceMotion]);
  const changeMode = (nextMode: Mode) => { setMode(nextMode); reset(nextMode); setRequirement('all'); };
  const toggleNode = (type: string) => setNodeFilter((values) => { const next = new Set(values); next.has(type) ? next.delete(type) : next.add(type); return next; });
  const toggleEdge = (type: string) => setEdgeFilter((values) => { const next = new Set(values); next.has(type) ? next.delete(type) : next.add(type); return next; });
  const expandNode = async (id: string) => {
    const params = new URLSearchParams({ focusId: id, limit: '200' });
    params.set('edgeTypes', [...edgeFilter].join(','));
    setGraphLoading(true); setGraphError('');
    try {
      const addition = await apiRequest<GraphData>(`/graph/neighborhood?${params}`);
      const before = new Set(graph.nodes.map((node) => node.id));
      const merged = mergeExpandedGraph(graph, [addition]);
      const added = merged.nodes.filter((node) => !before.has(node.id));
      setGraph(merged); setExpanded((values) => new Set(values).add(id));
      setNotice(added.length ? `Đã tải ${added.length} node và các quan hệ từ Backend.` : 'Các node lân cận đã có trên canvas.');
    } catch (error) { setGraphError(error instanceof Error ? error.message : 'Không thể mở rộng graph.'); }
    finally { setGraphLoading(false); }
    setTimeout(() => setNotice(null), 6500);
  };
  const collapseNode = async (id: string) => {
    const next = collapseBranch(expanded, id); setExpanded(next); setGraphLoading(true);
    try {
      const branches = [focus, ...next];
      const results = await Promise.all(branches.map(async (focusId) => {
        const params = new URLSearchParams({ focusId, limit: '200' });
        params.set('edgeTypes', [...edgeFilter].join(','));
        return apiRequest<GraphData>(`/graph/neighborhood?${params}`);
      }));
      setGraph(mergeExpandedGraph(results[0] || { nodes: [], edges: [] }, results.slice(1)));
    } catch (error) { setGraphError(error instanceof Error ? error.message : 'Không thể thu gọn graph.'); }
    finally { setGraphLoading(false); }
    setNotice('Đã tải lại các nhánh graph còn mở từ Backend.');
    setTimeout(() => setNotice(null), 4500);
  };
  const selectNode = (_: unknown, node: Node) => {
    setSelected({ kind: "node", item: node });
    const neighbors = new Set([node.id]);
    edges.forEach((e) => {
      if (e.source === node.id || e.target === node.id) {
        neighbors.add(e.source);
        neighbors.add(e.target);
      }
    });
    setNodes((ns) =>
      ns.map((n) => ({
        ...n,
        className: neighbors.has(n.id) ? "kg-related" : "kg-dimmed",
      })),
    );
    setEdges((es) =>
      es.map((e) => ({
        ...e,
        className:
          e.source === node.id || e.target === node.id
            ? "kg-edge-active"
            : "kg-edge-dimmed",
      })),
    );
    const width = node.measured?.width || NODE_W,
      height = node.measured?.height || NODE_H,
      zoom = flowApi.getZoom();
    setTimeout(
      () =>
        flowApi.setCenter(
          node.position.x + width / 2,
          node.position.y + height / 2,
          { zoom, duration: reduceMotion ? 0 : 260 },
        ),
      40,
    );
  };
  const clearSelection = () => {
    setSelected(null);
    setNodes((ns) => ns.map((n) => ({ ...n, className: "" })));
    setEdges((es) => es.map((e) => ({ ...e, className: "" })));
  };
  const fullscreen = () => shellRef.current?.requestFullscreen?.();
  return (
    <div
      className={`graph-shell graph-workspace ${sidebarOpen ? "" : "sidebar-collapsed"} ${selected ? "detail-open" : ""}`}
      ref={shellRef}
    >
      <aside className={`graph-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="graph-side-title">
          <div>
            <span>KNOWLEDGE GRAPH</span>
            <b>Khám phá quan hệ</b>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Thu gọn bộ lọc"
          >
            <PanelLeftClose />
          </button>
        </div>
        <div className="graph-mode">
          {(Object.keys(modeLabels) as Mode[]).map((m) => {
            const I =
              m === "career"
                ? BriefcaseBusiness
                : m === "skill"
                  ? Network
                  : m === "resource"
                    ? BookOpen
                    : Layers3;
            return (
              <button
                className={mode === m ? "active" : ""}
                onClick={() => changeMode(m)}
                key={m}
              >
                <I />
                {modeLabels[m]}
              </button>
            );
          })}
        </div>
        <label className="search">
          <Search />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm node làm tâm..."
          />
        </label>
        <div className="focus-list">
          {matches.map((x) => {
            const named = displayName(x.name, x.id);
            return (
              <button
                className={focus === x.id ? "active" : ""}
                key={x.id}
                title={
                  named.fallback
                    ? "Bản ghi thiếu tên trong dữ liệu"
                    : named.label
                }
                onClick={() => {
                  setFocus(x.id);
                  setExpanded(new Set());
                  setQuery("");
                  clearSelection();
                }}
              >
                <span
                  className="focus-dot"
                  style={{ background: colors[x.type] }}
                />
                <span className="focus-name">{named.label}</span>
                {named.fallback && <small>Data issue</small>}
              </button>
            );
          })}
        </div>
        <GraphFilter title="Loại node">
          {Object.entries({
            career: "Career",
            skill: "Skill",
            skillGroup: "ESCO Group",
            course: "Resource",
            provider: "Provider",
          }).map(([k, v]) => (
            <label className="check" key={k}>
              <input
                type="checkbox"
                checked={nodeFilter.has(k)}
                onChange={() => toggleNode(k)}
              />
              <i style={{ background: colors[k] }} />
              {v}
            </label>
          ))}
        </GraphFilter>
        <GraphFilter title="Quan hệ">
          {Object.entries(edgeLabels).map(([k, v]) => (
            <label className="check" key={k}>
              <input
                type="checkbox"
                checked={edgeFilter.has(k)}
                onChange={() => toggleEdge(k)}
              />
              {v}
            </label>
          ))}
        </GraphFilter>
        {mode === "career" && (
          <GraphFilter title="Mức yêu cầu">
            <div className="segmented">
              {["all", "essential", "optional"].map((x) => (
                <button
                  className={requirement === x ? "active" : ""}
                  onClick={() => setRequirement(x)}
                  key={x}
                >
                  {x}
                </button>
              ))}
            </div>
          </GraphFilter>
        )}
      </aside>
      {!sidebarOpen && (
        <button
          className="graph-open-sidebar"
          onClick={() => setSidebarOpen(true)}
        >
          <PanelLeftOpen /> Bộ lọc
        </button>
      )}
      <main className="graph-stage">
        <AnimatePresence>
          {notice && (
            <motion.div
              className="graph-notice"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
            >
              <span>{notice}</span>
              <button
                onClick={() => setNotice(null)}
                aria-label="Đóng thông báo"
              >
                <X />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="graph-toolbar">
          <div>
            <b>{modeLabels[mode]}</b>
            <span>
              {nodes.length} node · {edges.length} edge · tối đa {limit}
            </span>
          </div>
          <div className="graph-tools">
            <label>
              Số node{" "}
              <select value={limit} onChange={(e) => setLimit(+e.target.value)}>
                <option>20</option>
                <option>30</option>
                <option>50</option>
                <option>80</option>
              </select>
            </label>
            <button
              onClick={() => setLabelsOn((v) => !v)}
              title="Bật/tắt nhãn cạnh"
            >
              {labelsOn ? <Eye /> : <EyeOff />}
            </button>
            {selected && (
              <button onClick={clearSelection} title="Bỏ chọn node hoặc edge">
                <X />
              </button>
            )}
            <button
              onClick={() => setDirection((v) => (v === "LR" ? "TB" : "LR"))}
              title="Đổi hướng bố cục"
            >
              <Shrink />
            </button>
            <button
              onClick={() =>
                flowApi.fitView({
                  duration: reduceMotion ? 0 : 450,
                  padding: 0.18,
                })
              }
              title="Fit view"
            >
              <Maximize2 />
            </button>
            <button onClick={() => reset()} title="Reset graph">
              <RotateCcw />
            </button>
            <button onClick={fullscreen} title="Toàn màn hình">
              <Fullscreen />
            </button>
          </div>
        </div>
{graphLoading && <div className="graph-notice" role="status">Đang tải neighborhood từ Backend…</div>}
        {graphError && <div className="warning" role="alert">{graphError}</div>}
                {nodes.length ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={selectNode}
            onPaneClick={clearSelection}
            onEdgeClick={(_, edge) => setSelected({ kind: "edge", item: edge })}
            nodesDraggable
            fitView
            fitViewOptions={{ padding: 0.18 }}
            minZoom={0.2}
            maxZoom={1.8}
            onlyRenderVisibleElements
          >
            <Background gap={24} size={1} />
            <MiniMap
              nodeColor={(n) => colors[String(n.data.nodeType)] || "#64748b"}
              pannable
              zoomable
            />
            <Controls showInteractive={false} />
          </ReactFlow>
        ) : (
          <div className="graph-empty">
            <Network />
            <h3>Không có node phù hợp</h3>
            <p>Hãy bật lại loại node hoặc quan hệ trong bộ lọc.</p>
          </div>
        )}
        <div className="graph-legend-pro">
          <div className="graph-legend-nodes">
            {Object.entries(colors).map(([k, v]) => (
              <span key={k}>
                <i style={{ background: v }} />
                {k}
              </span>
            ))}
          </div>
          <div className="graph-legend-relations" aria-label="Chú giải quan hệ">
            {activeRelations.map((relation) => (
              <span key={relation} title={relation}>
                <i style={{ background: edgeColors[relation] || "#a78bfa" }} />
                {edgeLabels[relation] || relation}
              </span>
            ))}
          </div>
          <em>
            Prerequisite chỉ xuất hiện khi Backend xác nhận cạnh và bằng chứng hợp lệ.
          </em>
        </div>
      </main>
      <AnimatePresence>
        {selected && (
          <motion.aside
            className="graph-detail"
            initial={{ x: 390, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 390, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.24 }}
          >
            <button className="close" onClick={clearSelection}>
              <X />
            </button>
            {selected.kind === "node" ? (
              <NodeDetails
                node={selected.item}
                expanded={expanded.has(selected.item.id)}
                onExpand={() => expandNode(selected.item.id)}
                onCollapse={() => collapseNode(selected.item.id)}
              />
            ) : (
              <EdgeDetails edge={selected.item} />
            )}
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
function GraphFilter({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details className="graph-filter" open>
      <summary>
        {title}
        <ChevronDown />
      </summary>
      <div>{children}</div>
    </details>
  );
}
function NodeDetails({
  node,
  expanded,
  onExpand,
  onCollapse,
}: {
  node: Node<GraphNodeData>;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
}) {
  const info: any = entity(node.id),
    route = routeFor(node.id),
    canExpand =
      node.data.nodeType === "skill" ||
      node.data.nodeType === "course" ||
      node.data.nodeType === "skillGroup";
  return (
    <>
      <span className="pill">{node.data.nodeType}</span>
      <h2>{node.data.fullLabel}</h2>
      <code>{node.id}</code>
      {info?.description && <p>{info.description}</p>}
      <dl className="graph-meta">
        {info?.careerGroup && (
          <>
            <dt>Nhóm nghề</dt>
            <dd>{info.careerGroup}</dd>
          </>
        )}
        {info?.skillType && (
          <>
            <dt>Loại kỹ năng</dt>
            <dd>{info.skillType}</dd>
          </>
        )}
        {info?.resourceType && (
          <>
            <dt>Định dạng</dt>
            <dd>{info.resourceType}</dd>
          </>
        )}
        {info?.providerName && (
          <>
            <dt>Nhà cung cấp</dt>
            <dd>{info.providerName}</dd>
          </>
        )}
      </dl>
      <div className="graph-detail-actions">
        {canExpand &&
          (expanded ? (
            <button className="btn secondary" onClick={onCollapse}>
              <Shrink /> Collapse neighbors
            </button>
          ) : (
            <button className="btn primary" onClick={onExpand}>
              <Network /> Expand neighbors
            </button>
          ))}
        {route && (
          <Link className="btn secondary" to={route}>
            Xem trang chi tiết
          </Link>
        )}
      </div>
    </>
  );
}
function EdgeDetails({ edge }: { edge: Edge }) {
  const relation = String(edge.data?.relationType || edge.label || "relation"),
    requirement = edge.data?.requirement_type;
  return (
    <>
      <span className="pill">EDGE</span>
      <h2>{edgeLabels[relation] || relation}</h2>
      <code>
        {edge.source} → {edge.target}
      </code>
      {requirement && (
        <p>
          <b>Mức yêu cầu:</b> {String(requirement)}
        </p>
      )}
      <p>
        Chiều quan hệ được bảo toàn theo `_from → _to` trong dữ liệu
        ArangoDB.
      </p>
      {edge.data && (
        <pre>{JSON.stringify(edge.data, null, 2).slice(0, 2200)}</pre>
      )}
    </>
  );
}
export default function GraphExplorer() {
  return (
    <ReactFlowProvider>
      <GraphWorkspace />
    </ReactFlowProvider>
  );
}
