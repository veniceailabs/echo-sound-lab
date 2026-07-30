import React, { useEffect, useMemo, useState } from 'react';
import type { SessionImportPackageGraph, SessionImportPackageNode } from '../services/sessionImportService';

interface SessionPackageTreeProps {
  graph: SessionImportPackageGraph | null | undefined;
  title?: string;
  className?: string;
}

const formatNodeStats = (node: SessionImportPackageNode): string => {
  const label = `${node.fileCount} file${node.fileCount === 1 ? '' : 's'}`;
  if (node.audioFileCount === node.fileCount) return `${label} · all audio`;
  if (node.audioFileCount > 0) return `${label} · ${node.audioFileCount} audio`;
  return label;
};

const SessionPackageTreeNode: React.FC<{
  node: SessionImportPackageNode;
  depth: number;
  expandedPaths: Set<string>;
  togglePath: (path: string) => void;
}> = ({ node, depth, expandedPaths, togglePath }) => {
  const isFolder = node.kind === 'folder';
  const isExpanded = isFolder && expandedPaths.has(node.path);
  const indentStyle = { marginLeft: `${depth * 14}px` };

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => isFolder && togglePath(node.path)}
        className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
          isFolder
            ? 'border-white/10 bg-white/[0.04] hover:border-cyan-400/30 hover:bg-cyan-500/[0.06]'
            : 'border-white/5 bg-black/20 hover:border-white/10 hover:bg-black/30'
        }`}
        style={indentStyle}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2">
            <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
              isFolder ? 'bg-cyan-500/15 text-cyan-100' : 'bg-white/10 text-slate-200'
            }`}>
              {isFolder ? (isExpanded ? '−' : '+') : '•'}
            </span>
            <span className="truncate font-medium text-white">{node.name}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-slate-200">
              {node.kind}
            </span>
            <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2 py-0.5 text-cyan-100">
              {formatNodeStats(node)}
            </span>
          </div>
        </div>
        <div className="mt-1 truncate text-[11px] text-slate-500">
          {node.path}
        </div>
      </button>
      {isFolder && isExpanded && node.children.length > 0 && (
        <div className="mt-1">
          {node.children.map((child) => (
            <SessionPackageTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              togglePath={togglePath}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const SessionPackageTree: React.FC<SessionPackageTreeProps> = ({ graph, title = 'Session Package Tree', className }) => {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!graph) {
      setExpandedPaths(new Set());
      return;
    }
    const next = new Set<string>();
    graph.nodes.forEach((node) => {
      if (node.kind === 'folder') {
        next.add(node.path);
      }
    });
    setExpandedPaths(next);
  }, [graph?.audioFileCount, graph?.fileCount, graph?.rootName, graph?.topLevelNodeCount]);

  const togglePath = useMemo(
    () => (path: string) => {
      setExpandedPaths((current) => {
        const next = new Set(current);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        return next;
      });
    },
    [],
  );

  if (!graph) return null;

  return (
    <div className={className}>
      <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/[0.04] px-3 py-3 text-xs text-cyan-100">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold text-cyan-50">{title}</div>
          <div className="text-cyan-100/80">
            {graph.fileCount} files · {graph.audioFileCount} audio · {graph.topLevelNodeCount} top-level nodes
          </div>
        </div>
        <div className="mt-1 text-[11px] text-cyan-100/70">
          Root: {graph.rootName}
          {graph.rootPath ? ` · ${graph.rootPath}` : ''}
        </div>
      </div>
      <div className="mt-3 max-h-96 space-y-1 overflow-auto pr-1">
        {graph.nodes.length > 0 ? (
          graph.nodes.map((node) => (
            <SessionPackageTreeNode
              key={node.path}
              node={node}
              depth={0}
              expandedPaths={expandedPaths}
              togglePath={togglePath}
            />
          ))
        ) : (
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-xs text-slate-400">
            No package nodes detected.
          </div>
        )}
      </div>
    </div>
  );
};
