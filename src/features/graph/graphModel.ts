import type { GraphData } from '../../types/catalog';

export function displayName(value: unknown, id: string) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text && !/^[-–—]+$/.test(text)) return { label: text, fallback: false };
  const key = id.includes('/') ? id.split('/').pop()! : id;
  return { label: `[Thiếu tên] ${key}`, fallback: true };
}

export function mergeExpandedGraph(base: GraphData, additions: GraphData[] = []): GraphData {
  const nodes = new Map(base.nodes.map((node) => [node.id, node]));
  const edges = new Map(base.edges.map((edge) => [edge.id, edge]));
  for (const graph of additions) {
    for (const node of graph.nodes) nodes.set(node.id, node);
    for (const edge of graph.edges) edges.set(edge.id, edge);
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

export function prioritizeGraph(data: GraphData, focus: string, expanded: Set<string>, limit: number) {
  const expandedNeighbors = new Set<string>();
  const focusNeighbors = new Set<string>([focus]);
  for (const edge of data.edges) {
    if (expanded.has(edge.source) || expanded.has(edge.target)) {
      expandedNeighbors.add(edge.source); expandedNeighbors.add(edge.target);
    }
    if (edge.source === focus || edge.target === focus) {
      focusNeighbors.add(edge.source); focusNeighbors.add(edge.target);
    }
  }
  return data.nodes.map((node, index) => ({
    node, index,
    score: node.id === focus ? 10000 : expanded.has(node.id) ? 9000 : expandedNeighbors.has(node.id) ? 8000 : focusNeighbors.has(node.id) ? 5000 : 0,
  })).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit).map((item) => item.node);
}

export function collapseBranch(expanded: Set<string>, id: string) {
  const next = new Set(expanded);
  next.delete(id);
  return next;
}
