import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from 'contexts/AuthContext';
import { getProjects } from 'api/metisApi';

const BASE = import.meta.env.VITE_API_URL || '/api';

async function apiFetch(path, token) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return res.json();
}

const SEV_COLOR = {
  critical: '#f85149',
  high:     '#ff7b72',
  med:      '#f0c040',
  low:      '#3fb950',
};

const STATUS_COLOR = {
  new:            '#4fc3f7',
  in_review:      '#f0c040',
  confirmed:      '#3fb950',
  false_positive: '#8b949e',
  escalated:      '#f85149',
};

function StatBox({ label, value, icon, accent }) {
  return (
    <div style={{
      background: '#161b22',
      border: `1px solid #30363d`,
      borderLeft: `3px solid ${accent}`,
      padding: '14px 18px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      flex: '1 1 180px',
      minWidth: 0,
    }}>
      <i className={icon} style={{ fontSize: 22, color: accent, width: 28, textAlign: 'center' }} />
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#e6edf3', lineHeight: 1 }}>{value ?? '—'}</div>
        <div style={{ fontSize: 11, color: '#8b949e', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { token, user } = useAuth();

  const [projects, setProjects]     = useState([]);
  const [findings, setFindings]     = useState([]);
  const [subjects, setSubjects]     = useState([]);
  const [actionRuns, setActionRuns] = useState([]);
  const [loading, setLoading]       = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [projRes, findRes, subRes, runRes] = await Promise.all([
        apiFetch('/metis/projects?per_page=5', token),
        apiFetch('/intel/findings?per_page=8', token),
        apiFetch('/intel/subjects?per_page=100', token),
        apiFetch('/response/action-runs?per_page=6', token),
      ]);
      setProjects(projRes?.data || []);
      setFindings(findRes?.data || []);
      setSubjects(subRes?.data || []);
      setActionRuns(runRes?.data || []);
    } catch (_) {
      /* silent – API may not be running */
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const sevCounts = findings.reduce((acc, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="content" style={{ padding: '20px 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ color: '#e6edf3', margin: 0, fontWeight: 600, letterSpacing: -0.3 }}>
          Command Center
        </h3>
        <p style={{ color: '#8b949e', fontSize: 13, margin: '4px 0 0' }}>
          {user?.name || user?.email} &nbsp;·&nbsp;
          <span style={{ color: '#4fc3f7' }}>{user?.role}</span>
          {user?.role === 'SuperAdmin' && (
            <span style={{
              marginLeft: 8, fontSize: 10, background: 'rgba(248,81,73,0.15)',
              border: '1px solid #f85149', color: '#f85149', padding: '1px 6px',
              textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700,
            }}>
              GOD MODE
            </span>
          )}
        </p>
      </div>

      {/* Stat boxes */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <StatBox label="Projects"    value={projects.length}    icon="fas fa-folder-open"  accent="#4fc3f7" />
        <StatBox label="Subjects"    value={subjects.length}    icon="fas fa-crosshairs"   accent="#79c0ff" />
        <StatBox label="Intel Hits"  value={findings.length}    icon="fas fa-shield-alt"   accent="#f0c040" />
        <StatBox label="Action Runs" value={actionRuns.length}  icon="fas fa-bolt"         accent="#3fb950" />
        <StatBox label="Critical"    value={sevCounts.critical || 0} icon="fas fa-exclamation-triangle" accent="#f85149" />
        <StatBox label="High"        value={sevCounts.high || 0}     icon="fas fa-fire"              accent="#ff7b72" />
      </div>

      {/* Two-column grid */}
      <div
        className="metis-dashboard-grid"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}
      >

        {/* Recent Intel Findings */}
        <div style={{ background: '#161b22', border: '1px solid #30363d' }}>
          <div style={{
            padding: '10px 16px', borderBottom: '1px solid #21262d',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#c9d1d9', textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Recent Intel
            </span>
            <Link to="/intel/inbox" style={{ fontSize: 11, color: '#4fc3f7', textDecoration: 'none' }}>
              View all →
            </Link>
          </div>
          {loading ? (
            <div style={{ padding: 24, color: '#8b949e', fontSize: 12 }}>Loading…</div>
          ) : findings.length === 0 ? (
            <div style={{ padding: 24, color: '#555', fontSize: 12 }}>No findings yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {findings.slice(0, 6).map(f => (
                  <tr key={f.id} style={{ borderBottom: '1px solid #21262d' }}>
                    <td style={{ padding: '8px 16px', width: 6 }}>
                      <span style={{
                        display: 'inline-block', width: 6, height: 6,
                        background: SEV_COLOR[f.severity] || '#555',
                      }} />
                    </td>
                    <td style={{ padding: '8px 8px 8px 0', fontSize: 12, color: '#c9d1d9', maxWidth: 0 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.title}
                      </div>
                      <div style={{ fontSize: 10, color: '#8b949e', marginTop: 2 }}>
                        {f.source} &nbsp;·&nbsp;
                        <span style={{ color: SEV_COLOR[f.severity] }}>{f.severity}</span>
                      </div>
                    </td>
                    <td style={{ padding: '8px 16px 8px 0', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <span style={{
                        fontSize: 10, padding: '2px 6px',
                        background: 'rgba(255,255,255,0.04)',
                        border: `1px solid ${STATUS_COLOR[f.status] || '#30363d'}`,
                        color: STATUS_COLOR[f.status] || '#8b949e',
                      }}>
                        {(f.status || '').replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent Projects */}
        <div style={{ background: '#161b22', border: '1px solid #30363d' }}>
          <div style={{
            padding: '10px 16px', borderBottom: '1px solid #21262d',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#c9d1d9', textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Metis Projects
            </span>
            <Link to="/metis/projects" style={{ fontSize: 11, color: '#4fc3f7', textDecoration: 'none' }}>
              View all →
            </Link>
          </div>
          {loading ? (
            <div style={{ padding: 24, color: '#8b949e', fontSize: 12 }}>Loading…</div>
          ) : projects.length === 0 ? (
            <div style={{ padding: 24, color: '#555', fontSize: 12 }}>
              No projects yet.{' '}
              <Link to="/metis/projects" style={{ color: '#4fc3f7' }}>Create one →</Link>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {projects.slice(0, 5).map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #21262d' }}>
                    <td style={{ padding: '9px 16px' }}>
                      <Link
                        to={`/metis/projects/${p.id}/overview`}
                        style={{ color: '#c9d1d9', textDecoration: 'none', fontSize: 12, fontWeight: 500 }}
                      >
                        {p.name}
                      </Link>
                      <div style={{ fontSize: 10, color: '#8b949e', marginTop: 2 }}>
                        {p.client_name || '—'} &nbsp;·&nbsp; {p.status || 'active'}
                      </div>
                    </td>
                    <td style={{ padding: '9px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 10, color: '#555' }}>{p.created_at?.slice(0, 10)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Intel Subjects */}
        <div style={{ background: '#161b22', border: '1px solid #30363d' }}>
          <div style={{
            padding: '10px 16px', borderBottom: '1px solid #21262d',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#c9d1d9', textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Monitored Subjects
            </span>
            <Link to="/intel/subjects" style={{ fontSize: 11, color: '#4fc3f7', textDecoration: 'none' }}>
              Manage →
            </Link>
          </div>
          {loading ? (
            <div style={{ padding: 24, color: '#8b949e', fontSize: 12 }}>Loading…</div>
          ) : subjects.length === 0 ? (
            <div style={{ padding: 24, color: '#555', fontSize: 12 }}>No subjects configured.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {subjects.slice(0, 5).map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #21262d' }}>
                    <td style={{ padding: '8px 16px' }}>
                      <span style={{ fontSize: 12, color: '#c9d1d9' }}>{s.name}</span>
                      <div style={{ fontSize: 10, color: '#8b949e', marginTop: 2 }}>{s.type}</div>
                    </td>
                    <td style={{ padding: '8px 16px', textAlign: 'right' }}>
                      <span style={{
                        fontSize: 10, padding: '2px 6px',
                        background: s.enabled ? 'rgba(63,185,80,0.1)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${s.enabled ? '#3fb950' : '#30363d'}`,
                        color: s.enabled ? '#3fb950' : '#555',
                      }}>
                        {s.enabled ? 'enabled' : 'disabled'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent Action Runs */}
        <div style={{ background: '#161b22', border: '1px solid #30363d' }}>
          <div style={{
            padding: '10px 16px', borderBottom: '1px solid #21262d',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#c9d1d9', textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Response Actions
            </span>
            <Link to="/response/action-runs" style={{ fontSize: 11, color: '#4fc3f7', textDecoration: 'none' }}>
              View all →
            </Link>
          </div>
          {loading ? (
            <div style={{ padding: 24, color: '#8b949e', fontSize: 12 }}>Loading…</div>
          ) : actionRuns.length === 0 ? (
            <div style={{ padding: 24, color: '#555', fontSize: 12 }}>No action runs yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {actionRuns.slice(0, 5).map(r => {
                  const statusColor = { success: '#3fb950', failed: '#f85149', running: '#4fc3f7', pending: '#f0c040' }[r.status] || '#8b949e';
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid #21262d' }}>
                      <td style={{ padding: '8px 16px' }}>
                        <span style={{ fontSize: 12, color: '#c9d1d9' }}>{r.action_type}</span>
                        <div style={{ fontSize: 10, color: '#8b949e', marginTop: 2 }}>
                          {r.playbook?.name || `Playbook #${r.playbook_id}`}
                        </div>
                      </td>
                      <td style={{ padding: '8px 16px', textAlign: 'right' }}>
                        <span style={{
                          fontSize: 10, padding: '2px 6px',
                          background: `${statusColor}18`,
                          border: `1px solid ${statusColor}`,
                          color: statusColor,
                        }}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  );
}
