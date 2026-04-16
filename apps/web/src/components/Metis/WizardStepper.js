import React from 'react';
import { Button, Spinner } from 'reactstrap';

const STEPS = [
  { id: 1, key: 'scope',   label: 'Define Scope',      icon: 'fas fa-crosshairs',    desc: 'Set root domains, keywords, IP ranges, GitHub orgs.' },
  { id: 2, key: 'passive', label: 'Passive OSINT',     icon: 'fas fa-satellite-dish', desc: 'DNS records, CT, RDAP, Subfinder, GitHub hints, and IP enrichment.' },
  { id: 3, key: 'validate',label: 'Validate Live',     icon: 'fas fa-broadcast-tower',desc: 'HTTP probe, port scan, and directory discovery using prior passive results.' },
  { id: 4, key: 'history', label: 'History',            icon: 'fas fa-history',       desc: 'Optional Wayback Machine fetch for legacy URLs and path discovery.' },
  { id: 5, key: 'surface', label: 'Attack Surface Map', icon: 'fas fa-map',          desc: 'Deduplicate and classify all discovered assets.' },
  { id: 6, key: 'report',  label: 'Documentation',     icon: 'fas fa-file-alt',       desc: 'Generate PDF/HTML/JSON report with AI executive brief.' },
];

function StepIcon({ step, status }) {
  const colors = {
    completed: '#3fb950',
    active: '#58a6ff',
    pending: '#30363d',
    running: '#f0c040',
    failed: '#f85149',
  };
  const color = colors[status] || colors.pending;

  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%',
      border: `2px solid ${color}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: status === 'active' ? 'rgba(88,166,255,0.15)' : 'transparent',
      flexShrink: 0,
    }}>
      {status === 'completed' ? (
        <i className="fas fa-check" style={{ color, fontSize: 13 }} />
      ) : status === 'running' ? (
        <Spinner size="sm" style={{ color, width: 14, height: 14 }} />
      ) : (
        <i className={step.icon} style={{ color, fontSize: 13 }} />
      )}
    </div>
  );
}

export default function WizardStepper({ currentStep, stepStatuses = {}, onStepClick, onRunAll, runningAll }) {
  return (
    <div style={{ position: 'relative' }}>
      {/* Vertical connector line */}
      <div style={{
        position: 'absolute', left: 17, top: 18, bottom: 18,
        width: 2, background: '#21262d', zIndex: 0,
      }} />

      {STEPS.map((step, idx) => {
        const status = stepStatuses[step.key] ||
          (step.id < currentStep ? 'completed' : step.id === currentStep ? 'active' : 'pending');

        return (
          <div
            key={step.key}
            onClick={() => onStepClick?.(step)}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 16,
              padding: '12px 16px', marginBottom: 4,
              borderRadius: 8, cursor: onStepClick ? 'pointer' : 'default',
              background: status === 'active' ? 'rgba(88,166,255,0.06)' : 'transparent',
              border: status === 'active' ? '1px solid rgba(88,166,255,0.2)' : '1px solid transparent',
              position: 'relative', zIndex: 1, transition: 'all 0.15s',
            }}
          >
            <StepIcon step={step} status={status} />
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 13, fontWeight: 600,
                color: status === 'active' ? '#e6edf3' : status === 'completed' ? '#3fb950' : '#6e7681',
                marginBottom: 3,
              }}>
                {idx + 1}. {step.label}
              </div>
              <div style={{ fontSize: 11, color: '#6e7681', lineHeight: 1.4 }}>{step.desc}</div>
            </div>
            {status === 'failed' && (
              <span style={{ fontSize: 10, color: '#f85149', alignSelf: 'center' }}>FAILED</span>
            )}
          </div>
        );
      })}

      {onRunAll && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Button
            color="info"
            onClick={onRunAll}
            disabled={runningAll}
            style={{ fontSize: 12, padding: '8px 24px' }}
          >
            {runningAll ? <><Spinner size="sm" /> Running Pipeline…</> : '▶ Run Full Wizard Pipeline'}
          </Button>
        </div>
      )}
    </div>
  );
}
