import React, { useMemo, useCallback, useState, useEffect } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Layers, Zap, FolderTree, Activity } from 'lucide-react';
import { cn } from '../utils/cn';

/**
 * Custom File Node to render individual files beautifully with glassmorphism.
 */
const FileNode = ({ data, selected }) => {
  // Determine color coding based on language or complexity
  const getGlowColor = () => {
    if (data.isDirectSelected) return 'shadow-amber-500/80 border-amber-500 shadow-md ring-2 ring-amber-500/20';
    if (data.isHighlighted) return 'shadow-rose-500/80 border-rose-500 shadow-md ring-2 ring-rose-500/20';
    if (data.complexity === 'high') return 'shadow-rose-500/30 border-rose-500/30';
    if (data.language === 'python') return 'shadow-blue-500/30 border-blue-500/30';
    return 'shadow-emerald-500/30 border-emerald-500/30';
  };

  return (
    <div className={cn(
      "px-4 py-2 shadow-lg rounded-md bg-zinc-900/80 backdrop-blur-md border transition-all duration-300",
      getGlowColor(),
      data.isDimmed ? "opacity-30 scale-95" : "opacity-100 scale-100"
    )}>
      <Handle type="target" position={Position.Top} className="opacity-0 w-0 h-0" />
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-zinc-100">{data.name}</span>
        <span className="text-xs text-zinc-400 truncate max-w-[150px]">{data.path}</span>
        <div className="flex items-center gap-2 mt-2 text-xs">
          <span className="text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">{data.loc} LoC</span>
          <span className={cn(
            "px-1.5 py-0.5 rounded capitalize font-semibold",
            data.complexity === 'high' ? 'text-rose-400 bg-rose-400/10' : 'text-emerald-400 bg-emerald-400/10'
          )}>
            {data.complexity}
          </span>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="opacity-0 w-0 h-0" />
    </div>
  );
};

const nodeTypes = {
  file: FileNode,
};

export default function DependencyGraph({ rawNodes = [], rawEdges = [], onNodeClick = null, customHighlightNodeIds = null, customDimmedNodeIds = null, customDirectSelectedNodeIds = null }) {
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  // Convert backend nodes (flat array) into xyflow node format
  const initialNodes = useMemo(() => {
    return rawNodes.map((n, i) => {
      const row = Math.floor(i / 5);
      const col = i % 5;
      
      return {
        id: n.id,
        type: 'file',
        position: { x: col * 280, y: row * 180 }, // Spacing
        data: {
          name: n.name,
          path: n.path,
          loc: n.loc,
          language: n.language,
          complexity: n.complexity,
          blastRadius: n.blastRadius || 0,
          isDimmed: false,
          isHighlighted: false,
          isDirectSelected: false
        }
      };
    });
  }, [rawNodes]);

  // Convert backend edges into xyflow edge format
  const initialEdges = useMemo(() => {
    return rawEdges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: true,
      style: { stroke: '#4b5563', strokeWidth: 1.5 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#4b5563',
      },
    }));
  }, [rawEdges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync state if initial values change
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // BFS to compute blast radius of a single node in the frontend dynamically
  const highlightBlastRadius = useCallback((nodeId) => {
    if (!nodeId) {
      // Reset all highlights
      setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, isDimmed: false, isHighlighted: false, isDirectSelected: false } })));
      setEdges((eds) => eds.map((e) => ({ ...e, animated: true, style: { stroke: '#4b5563', strokeWidth: 1.5 } })));
      return;
    }

    // Build adjacency mapping: target -> source
    const parentsMap = {};
    rawEdges.forEach(e => {
      if (!parentsMap[e.target]) parentsMap[e.target] = [];
      parentsMap[e.target].push(e.source);
    });

    // BFS Queue to find all nodes depending on selectedNodeId
    const blastSet = new Set();
    const queue = [nodeId];

    while (queue.length > 0) {
      const curr = queue.shift();
      const parents = parentsMap[curr] || [];
      parents.forEach(p => {
        if (!blastSet.has(p)) {
          blastSet.add(p);
          queue.push(p);
        }
      });
    }

    // Include the clicked node itself in the highlight set
    blastSet.add(nodeId);

    // Apply Dimming/Highlighting states
    setNodes((nds) => nds.map((n) => {
      const isPart = blastSet.has(n.id);
      return {
        ...n,
        data: {
          ...n.data,
          isDimmed: !isPart,
          isHighlighted: isPart && n.id !== nodeId,
          isDirectSelected: n.id === nodeId
        }
      };
    }));

    // Highlight edges belonging to the blast radius pathway
    setEdges((eds) => eds.map((e) => {
      const isPart = blastSet.has(e.source) && blastSet.has(e.target);
      return {
        ...e,
        animated: isPart,
        style: {
          stroke: isPart ? '#6366f1' : '#27272a',
          strokeWidth: isPart ? 2.5 : 1.0
        }
      };
    }));

  }, [rawEdges, setNodes, setEdges]);

  // Hook for controlled custom highlights from parent (e.g. PR Impact)
  useEffect(() => {
    if (customHighlightNodeIds || customDimmedNodeIds || customDirectSelectedNodeIds) {
      setNodes((nds) => nds.map((n) => {
        const isDirectSelected = customDirectSelectedNodeIds ? customDirectSelectedNodeIds.has(n.id) : false;
        const isHighlighted = customHighlightNodeIds ? customHighlightNodeIds.has(n.id) : false;
        const isDimmed = customDimmedNodeIds ? customDimmedNodeIds.has(n.id) : false;
        return {
          ...n,
          data: {
            ...n.data,
            isDirectSelected,
            isHighlighted: isHighlighted && !isDirectSelected,
            isDimmed
          }
        };
      }));

      setEdges((eds) => eds.map((e) => {
        const isPart = customHighlightNodeIds && customHighlightNodeIds.has(e.source) && customHighlightNodeIds.has(e.target);
        return {
          ...e,
          animated: isPart,
          style: {
            stroke: isPart ? '#f43f5e' : '#27272a',
            strokeWidth: isPart ? 2.5 : 1.0
          }
        };
      }));
    } else {
      // Reset custom highlights if cleared
      setNodes(initialNodes);
      setEdges(initialEdges);
    }
  }, [customHighlightNodeIds, customDimmedNodeIds, customDirectSelectedNodeIds, initialNodes, initialEdges, setNodes, setEdges]);

  const onNodeClickInternal = useCallback((event, node) => {
    if (onNodeClick) {
      onNodeClick(node.id);
      return;
    }
    if (selectedNodeId === node.id) {
      setSelectedNodeId(null);
      highlightBlastRadius(null);
    } else {
      setSelectedNodeId(node.id);
      highlightBlastRadius(node.id);
    }
  }, [selectedNodeId, highlightBlastRadius, onNodeClick]);

  const onPaneClick = useCallback(() => {
    if (onNodeClick) {
      return;
    }
    setSelectedNodeId(null);
    highlightBlastRadius(null);
  }, [highlightBlastRadius, onNodeClick]);

  return (
    <div className="w-full h-full relative rounded-xl overflow-hidden border border-zinc-800/50 bg-zinc-950/50">

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClickInternal}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        className="bg-transparent"
        minZoom={0.1}
      >
        <Background color="#27272a" gap={20} size={1} />
        <Controls 
          className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden shadow-xl [&_button]:bg-zinc-900 [&_button]:border-b [&_button]:border-zinc-800 [&_button:last-child]:border-b-0 [&_button:hover]:bg-zinc-800 [&_svg]:fill-zinc-400 [&_path]:fill-zinc-400" 
        />
        <MiniMap 
          style={{ backgroundColor: '#18181b' }}
          nodeColor={(n) => {
            if (n.data?.complexity === 'high') return '#f43f5e';
            return '#10b981';
          }}
          maskColor="rgba(9, 9, 11, 0.8)"
          className="border border-zinc-800 rounded-lg overflow-hidden shadow-xl"
        />
      </ReactFlow>
    </div>
  );
}
