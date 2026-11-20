import { useMemo } from 'react';
import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from '@xyflow/react';
import { Network } from 'lucide-react';
import type { AdminRecord } from '../types/admin';

export default function MiniSkillGraph({ rows, relation = 'requires_skill', limit = 28 }: { rows: AdminRecord[]; relation?: string; limit?: number }) {
  const { nodes, edges } = useMemo(() => {
    const selected = rows.slice(0, limit);
    const ids = new Set<string>();
    const ns: Node[] = [];
    const es: Edge[] = [];
    selected.forEach((row, index) => {
      const from = String(row._from || row.name || row.title || `node-${index}`);
      const to = String(row._to || row._key);
      [[from, 'from'], [to, 'to']].forEach(([id, side]) => {
        if (!ids.has(id)) {
          ids.add(id);
          ns.push({ id, position: { x: (ns.length % 4) * 190, y: Math.floor(ns.length / 4) * 112 }, data: { label: `${side === 'from' ? 'Nguồn' : 'Đích'} · ${id.split('/').pop()}` }, className: `admin-graph-node ${side}` });
        }
      });
      if (from && to) es.push({ id: `${relation}-${row._key}`, source: from, target: to, label: relation, animated: false, style: { stroke: '#8b7cf6' } });
    });
    return { nodes: ns, edges: es };
  }, [rows, relation, limit]);
  if (!edges.length) return <div className="admin-empty-graph"><Network size={30} /><strong>Chưa có quan hệ để vẽ</strong><span>Thêm dữ liệu quan hệ để xem đồ thị.</span></div>;
  return <div className="admin-mini-graph"><ReactFlow nodes={nodes} edges={edges} fitView nodesDraggable nodesConnectable={false} elementsSelectable><Background color="#a8a2cb" gap={20} /><MiniMap pannable zoomable /><Controls /></ReactFlow></div>;
}
