import React, { useState } from 'react';
import { useMetis } from 'contexts/MetisContext';
import { Button, ButtonGroup } from 'reactstrap';

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const PRESETS = [
  { label: 'Today',  from: daysAgo(0),  to: null },
  { label: '7d',     from: daysAgo(7),  to: null },
  { label: '30d',    from: daysAgo(30), to: null },
  { label: 'All',    from: null,         to: null },
];

export default function TimelineScrubber() {
  const { timelineRange, setTimelineRange } = useMetis();
  const [activePreset, setActivePreset] = useState('30d');
  const [customMode, setCustomMode] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');

  const applyPreset = (p) => {
    setActivePreset(p.label);
    setCustomMode(false);
    setTimelineRange({ from: p.from, to: p.to });
  };

  const applyCustom = () => {
    setActivePreset('custom');
    setTimelineRange({ from: customFrom || null, to: customTo || null });
  };

  return (
    <div style={{
      background: '#161b22', border: '1px solid #30363d', borderRadius: 6,
      padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12,
      flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: 11, color: '#8b949e', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
        Timeline
      </span>

      <ButtonGroup size="sm">
        {PRESETS.map(p => (
          <Button
            key={p.label}
            color={activePreset === p.label ? 'info' : 'secondary'}
            outline={activePreset !== p.label}
            onClick={() => applyPreset(p)}
            style={{ fontSize: 11, padding: '3px 10px' }}
          >
            {p.label}
          </Button>
        ))}
        <Button
          color={customMode ? 'info' : 'secondary'}
          outline={!customMode}
          onClick={() => setCustomMode(c => !c)}
          style={{ fontSize: 11, padding: '3px 10px' }}
        >
          Custom
        </Button>
      </ButtonGroup>

      {customMode && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="date"
            value={customFrom}
            onChange={e => setCustomFrom(e.target.value)}
            style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}
          />
          <span style={{ color: '#555', fontSize: 12 }}>→</span>
          <input
            type="date"
            value={customTo}
            onChange={e => setCustomTo(e.target.value)}
            style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}
          />
          <Button size="sm" color="info" onClick={applyCustom} style={{ fontSize: 11, padding: '3px 10px' }}>
            Apply
          </Button>
        </div>
      )}

      {timelineRange.from && (
        <span style={{ fontSize: 11, color: '#8b949e' }}>
          {timelineRange.from} → {timelineRange.to || 'now'}
        </span>
      )}
    </div>
  );
}
