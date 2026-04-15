import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMetis } from 'contexts/MetisContext';
import { useAuth } from 'contexts/AuthContext';
import {
  dispatchRun,
  getDomains,
  getFindings,
  getHosts,
  getProjects,
  getScope,
} from 'api/metisApi';

const STATIC_ACTIONS = [
  { id: 'create-project', label: 'Create Project', icon: 'fas fa-plus-circle', action: 'navigate', target: '/metis/projects?create=1' },
  { id: 'projects', label: 'Go to Projects', icon: 'fas fa-folder-open', action: 'navigate', target: '/metis/projects' },
  { id: 'dashboard', label: 'Go to Dashboard', icon: 'fas fa-tachometer-alt', action: 'navigate', target: '/dashboard' },
  { id: 'ai-settings', label: 'AI Provider Settings', icon: 'fas fa-robot', action: 'navigate', target: '/settings/ai-providers' },
  { id: 'users', label: 'User Management', icon: 'fas fa-users', action: 'navigate', target: '/settings/users' },
  { id: 'audit-log', label: 'Audit Log', icon: 'fas fa-clipboard-list', action: 'navigate', target: '/settings/audit-log' },
  { id: 'theme-default', label: 'Theme: Default', icon: 'fas fa-sun', action: 'theme', target: 'default' },
  { id: 'theme-night', label: 'Theme: Night Ops', icon: 'fas fa-moon', action: 'theme', target: 'night_ops' },
  { id: 'theme-crt', label: 'Theme: CRT', icon: 'fas fa-desktop', action: 'theme', target: 'crt' },
];

function buildCurrentProjectActions(projectId, hasScope) {
  if (!projectId) return [];

  return [
    { id: 'project-overview', label: 'Open Project Overview', icon: 'fas fa-border-all', action: 'navigate', target: `/metis/projects/${projectId}/overview` },
    { id: 'project-runs', label: 'Open Runs', icon: 'fas fa-play-circle', action: 'navigate', target: `/metis/projects/${projectId}/runs` },
    { id: 'project-report', label: 'Generate Report', icon: 'fas fa-file-alt', action: 'navigate', target: `/metis/projects/${projectId}/report` },
    { id: 'project-ai-brief', label: 'Ask AI Summary', icon: 'fas fa-robot', action: 'navigate', target: `/metis/projects/${projectId}/report?ai=1` },
    ...(hasScope ? [{
      id: 'project-passive',
      label: 'Run Wizard Step: Passive Recon',
      icon: 'fas fa-satellite-dish',
      action: 'dispatch',
      projectId,
      payload: { type: 'wizard_pipeline', params: { steps: ['dns', 'ct', 'subfinder'] } },
    }] : []),
    ...(hasScope ? [{
      id: 'project-wizard',
      label: 'Run Full Wizard',
      icon: 'fas fa-hat-wizard',
      action: 'dispatch',
      projectId,
      payload: { type: 'wizard_pipeline', params: { steps: ['dns', 'ct', 'subfinder', 'http_probe', 'wayback'] } },
    }] : []),
  ];
}

export default function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen, switchTheme } = useMetis();
  const { token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef(null);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [entities, setEntities] = useState([]);
  const [scope, setScope] = useState(null);

  const currentProjectId = useMemo(() => {
    const match = location.pathname.match(/\/metis\/projects\/(\d+)/);
    return match?.[1] || null;
  }, [location.pathname]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(open => !open);
      }

      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setCommandPaletteOpen]);

  useEffect(() => {
    if (!commandPaletteOpen) return;

    setQuery('');
    setSelected(0);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [commandPaletteOpen]);

  useEffect(() => {
    if (!commandPaletteOpen || !token) return;

    let active = true;

    const load = async () => {
      setLoading(true);

      try {
        const [projectsRes, scopeRes, domainsRes, hostsRes, findingsRes] = await Promise.all([
          getProjects({ page: 1 }, token),
          currentProjectId ? getScope(currentProjectId, token).catch(() => null) : Promise.resolve(null),
          currentProjectId ? getDomains(currentProjectId, { page: 1 }, token).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
          currentProjectId ? getHosts(currentProjectId, { page: 1 }, token).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
          currentProjectId ? getFindings(currentProjectId, { status: 'open' }, token).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        ]);

        if (!active) return;

        setProjects(projectsRes?.data || []);
        setScope(scopeRes?.data || null);
        setEntities([
          ...(domainsRes?.data || []).slice(0, 12).map(item => ({
            id: `domain-${item.id}`,
            label: item.domain,
            subtitle: 'Domain entity',
            icon: 'fas fa-globe',
            action: 'navigate',
            target: `/metis/projects/${currentProjectId}/entities?tab=domains&search=${encodeURIComponent(item.domain)}`,
          })),
          ...(hostsRes?.data || []).slice(0, 12).map(item => ({
            id: `host-${item.id}`,
            label: item.hostname,
            subtitle: 'Host entity',
            icon: 'fas fa-server',
            action: 'navigate',
            target: `/metis/projects/${currentProjectId}/entities?tab=hosts&search=${encodeURIComponent(item.hostname)}`,
          })),
          ...(findingsRes?.data || []).slice(0, 8).map(item => ({
            id: `finding-${item.id}`,
            label: item.title,
            subtitle: 'Finding',
            icon: 'fas fa-bug',
            action: 'navigate',
            target: `/metis/projects/${currentProjectId}/findings?search=${encodeURIComponent(item.title)}`,
          })),
        ]);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [commandPaletteOpen, currentProjectId, token]);

  const currentProjectActions = useMemo(
    () => buildCurrentProjectActions(currentProjectId, (scope?.root_domains || []).length > 0),
    [currentProjectId, scope]
  );

  const dynamicProjectItems = useMemo(
    () => projects.slice(0, 10).map(project => ({
      id: `project-${project.id}`,
      label: project.name,
      subtitle: `Project${project.client ? ` · ${project.client}` : ''}`,
      icon: 'fas fa-book-bookmark',
      action: 'navigate',
      target: `/metis/projects/${project.id}/overview`,
    })),
    [projects]
  );

  const items = useMemo(() => {
    const baseItems = [
      ...currentProjectActions,
      ...STATIC_ACTIONS,
      ...dynamicProjectItems,
      ...entities,
    ];

    const loweredQuery = query.trim().toLowerCase();

    return baseItems.filter(item =>
      !loweredQuery
      || item.label.toLowerCase().includes(loweredQuery)
      || item.subtitle?.toLowerCase().includes(loweredQuery)
    );
  }, [currentProjectActions, dynamicProjectItems, entities, query]);

  const execute = useCallback(async (item) => {
    setCommandPaletteOpen(false);

    if (item.action === 'navigate') {
      navigate(item.target);
      return;
    }

    if (item.action === 'theme') {
      switchTheme(item.target);
      return;
    }

    if (item.action === 'dispatch') {
      try {
        await dispatchRun(item.projectId, item.payload, token);
        navigate(`/metis/projects/${item.projectId}/runs`);
      } catch (e) {
        alert(e.message);
      }
    }
  }, [navigate, setCommandPaletteOpen, switchTheme, token]);

  const handleKey = (e) => {
    if (items.length === 0 && ['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) {
      e.preventDefault();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected(index => Math.min(index + 1, items.length - 1));
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected(index => Math.max(index - 1, 0));
    }

    if (e.key === 'Enter' && items[selected]) {
      execute(items[selected]);
    }

    if (e.key === 'Escape') {
      setCommandPaletteOpen(false);
    }
  };

  if (!commandPaletteOpen) return null;

  return (
    <>
      <div
        onClick={() => setCommandPaletteOpen(false)}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 2000 }}
      />

      <div style={{
        position: 'fixed', top: '12vh', left: '50%', transform: 'translateX(-50%)',
        width: 680, maxWidth: '95vw', zIndex: 2001,
        background: '#161b22', border: '1px solid #30363d', borderRadius: 12,
        boxShadow: '0 24px 64px rgba(0,0,0,0.8)', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #21262d' }}>
          <i className="fas fa-search" style={{ color: '#8b949e', marginRight: 12, fontSize: 14 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(0); }}
            onKeyDown={handleKey}
            placeholder="Search projects, entities, or quick actions..."
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: '#e6edf3', fontSize: 15, fontFamily: 'inherit',
            }}
          />
          <span style={{
            fontSize: 10, color: '#555', border: '1px solid #30363d',
            padding: '2px 6px', borderRadius: 4, letterSpacing: 0.5,
          }}>
            ESC
          </span>
        </div>

        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          {loading && (
            <div style={{ padding: '10px 16px', fontSize: 11, color: '#8b949e' }}>
              Loading context…
            </div>
          )}

          {items.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#555', fontSize: 13 }}>
              No results for "{query}"
            </div>
          ) : (
            items.map((item, index) => (
              <div
                key={item.id}
                onClick={() => execute(item)}
                onMouseEnter={() => setSelected(index)}
                style={{
                  display: 'flex', alignItems: 'center', padding: '11px 16px',
                  cursor: 'pointer',
                  background: index === selected ? 'rgba(88,166,255,0.12)' : 'transparent',
                  borderLeft: index === selected ? '3px solid #58a6ff' : '3px solid transparent',
                  transition: 'background 0.1s',
                }}
              >
                <i className={item.icon} style={{ color: '#8b949e', width: 20, fontSize: 13, marginRight: 12 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: index === selected ? '#e6edf3' : '#c9d1d9', fontSize: 13 }}>
                    {item.label}
                  </div>
                  {item.subtitle && (
                    <div style={{ fontSize: 11, color: '#6e7681', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.subtitle}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{
          padding: '8px 16px', borderTop: '1px solid #21262d',
          display: 'flex', gap: 16, flexWrap: 'wrap',
        }}>
          {[['Ctrl/⌘ K', 'open'], ['↑↓', 'navigate'], ['↵', 'select'], ['esc', 'close']].map(([key, label]) => (
            <span key={key} style={{ fontSize: 10, color: '#555', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ background: '#21262d', padding: '1px 6px', borderRadius: 3, fontFamily: 'monospace' }}>{key}</span>
              {label}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
