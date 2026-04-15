import React, { useState } from 'react';
import { useMetis } from 'contexts/MetisContext';
import { Badge, Button, Spinner } from 'reactstrap';

const LAYER_META = {
  scope:     { label: 'Scope',     icon: 'fas fa-crosshairs',    color: '#4fc3f7' },
  discovery: { label: 'Discovery', icon: 'fas fa-search',        color: '#81c784' },
  live:      { label: 'Live',      icon: 'fas fa-broadcast-tower',color: '#aed581' },
  history:   { label: 'History',   icon: 'fas fa-history',       color: '#ffb74d' },
  findings:  { label: 'Findings',  icon: 'fas fa-bug',           color: '#ef5350' },
  notes:     { label: 'Notes',     icon: 'fas fa-sticky-note',   color: '#ce93d8' },
};

function LayerRow({ name, meta, toggle, active, count, lastUpdated, onRefresh, loading }) {
  return (
    <div
      className={`metis-layer-row${active ? ' active' : ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '8px 12px',
        borderRadius: 6,
        marginBottom: 4,
        background: active ? 'rgba(79,195,247,0.08)' : 'transparent',
        cursor: 'pointer',
        borderLeft: active ? `3px solid ${meta.color}` : '3px solid transparent',
        transition: 'all 0.15s',
      }}
      onClick={toggle}
    >
      <i
        className={meta.icon}
        style={{ color: meta.color, width: 20, fontSize: 13, marginRight: 10 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: active ? '#e0e0e0' : '#888' }}>
          {meta.label}
        </div>
        <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
          {lastUpdated ? `updated ${String(lastUpdated).slice(0, 16).replace('T', ' ')}` : 'no updates yet'}
        </div>
      </div>
      {count !== undefined && (
        <Badge
          style={{
            background: active ? meta.color : '#333',
            color: active ? '#000' : '#888',
            fontSize: 11,
            marginRight: 8,
            minWidth: 28,
          }}
        >
          {loading ? <Spinner size="sm" style={{ width: 10, height: 10 }} /> : count}
        </Badge>
      )}
      {onRefresh && (
        <button
          onClick={(e) => { e.stopPropagation(); onRefresh(name); }}
          style={{
            background: 'none', border: 'none', color: '#555', cursor: 'pointer',
            padding: '0 4px', fontSize: 11,
          }}
          title="Refresh layer"
        >
          <i className="fas fa-sync-alt" />
        </button>
      )}
    </div>
  );
}

export default function LayersPanel({ layers, loading, onRefresh }) {
  const { layerToggles, toggleLayer } = useMetis();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className="metis-layers-panel"
      style={{
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: 8,
        padding: '12px 0',
        minWidth: 220,
      }}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 12px 10px',
          borderBottom: '1px solid #21262d',
          marginBottom: 8,
          cursor: 'pointer',
        }}
        onClick={() => setCollapsed(c => !c)}
      >
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, color: '#8b949e', textTransform: 'uppercase' }}>
          Layers
        </span>
        <i className={`fas fa-chevron-${collapsed ? 'down' : 'up'}`} style={{ fontSize: 10, color: '#555' }} />
      </div>

      {!collapsed && Object.entries(LAYER_META).map(([name, meta]) => (
        <LayerRow
          key={name}
          name={name}
          meta={meta}
          toggle={() => toggleLayer(name)}
          active={layerToggles[name]}
          count={layers?.[name]?.count}
          lastUpdated={layers?.[name]?.last_updated}
          onRefresh={onRefresh}
          loading={loading}
        />
      ))}
    </div>
  );
}
