import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from 'contexts/AuthContext';
import { cancelRun, dispatchRun, getRuns, getToolsCatalog } from 'api/metisApi';
import { Alert, Button, ButtonGroup, Card, CardBody, CardHeader, Input, Spinner } from 'reactstrap';

const STATUS_COLORS = { completed: '#3fb950', failed: '#f85149', running: '#f0c040', queued: '#8b949e', cancelled: '#555' };
const TYPE_ICONS = {
  dns_lookup: 'fas fa-server',
  ct_lookup: 'fas fa-certificate',
  subfinder: 'fas fa-search',
  github_hints: 'fab fa-github',
  http_probe: 'fas fa-broadcast-tower',
  wayback: 'fas fa-history',
  port_scan: 'fas fa-network-wired',
  directory_enum: 'fas fa-folder-open',
  vuln_assessment: 'fas fa-shield-virus',
  remediation_validation: 'fas fa-clipboard-check',
  iam_audit: 'fas fa-user-shield',
  hibp_scan: 'fas fa-user-secret',
  cti_exposure: 'fas fa-satellite',
  wizard_pipeline: 'fas fa-hat-wizard',
};

export default function MetisRuns() {
  const { id } = useParams();
  const { token } = useAuth();

  const [runs, setRuns] = useState([]);
  const [tools, setTools] = useState([]);
  const [runtime, setRuntime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatus] = useState('');
  const [typeFilter, setType] = useState('');
  const [cancelling, setCancelling] = useState(null);
  const [dispatching, setDispatching] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    domain: '',
    hosts: '',
    ports: '80,443,8080,8443',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [runsResponse, toolsResponse] = await Promise.all([
        getRuns(id, { status: statusFilter, type: typeFilter }, token),
        getToolsCatalog(token).catch(() => ({ data: [], runtime: null })),
      ]);

      setRuns(runsResponse.data || []);
      setTools(toolsResponse.data || []);
      setRuntime(toolsResponse.runtime || null);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [id, statusFilter, typeFilter, token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const hasActive = runs.some(run => run.status === 'queued' || run.status === 'running');
    if (!hasActive) return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [runs, load]);

  const handleCancel = async (run) => {
    setCancelling(run.id);
    try {
      await cancelRun(id, run.id, token);
      load();
    } catch (e) {
      alert('Cancel failed: ' + e.message);
    }
    setCancelling(null);
  };

  const runTool = async (type) => {
    setDispatching(true);
    setError('');

    try {
      const hosts = form.hosts.split(',').map(host => host.trim()).filter(Boolean);
      const payloads = {
        dns_lookup: { type, params: { domain: form.domain } },
        ct_lookup: { type, params: { domain: form.domain } },
        subfinder: { type, params: { domain: form.domain } },
        github_hints: { type, params: {} },
        wayback: { type, params: { domain: form.domain } },
        http_probe: { type, params: { hosts } },
        port_scan: { type, params: { hosts, ports: form.ports } },
        directory_enum: { type, params: { hosts } },
        vuln_assessment: { type, params: { hosts } },
        remediation_validation: { type, params: {} },
        iam_audit: { type, params: { hosts } },
        hibp_scan: { type, params: {} },
        cti_exposure: { type, params: {} },
        wizard_pipeline: { type, params: { steps: ['dns', 'ct', 'subfinder', 'github_hints', 'http_probe', 'port_scan', 'directory_enum', 'wayback'] } },
      };

      await dispatchRun(id, payloads[type], token);
      load();
    } catch (e) {
      setError(e.data?.message || e.message);
    }

    setDispatching(false);
  };

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h4 style={{ color: '#e6edf3', marginBottom: 4 }}>Runs</h4>
          <p style={{ color: '#8b949e', fontSize: 13, marginBottom: 0 }}>
            Manual tool mode and execution history for recon, validation, and ASM pipeline steps.
          </p>
        </div>
      </div>

      {error && <Alert color="danger" style={{ fontSize: 12 }}>{error}</Alert>}

      <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, marginBottom: 20 }}>
        <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>Manual Tool Mode</div>
              <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>
                Active scans are blocked unless the target is in a verified domain or approved IP range.
              </div>
            </div>
            <div style={{ fontSize: 11, color: runtime?.reachable ? '#3fb950' : '#f0c040' }}>
              Tool sidecar: {runtime?.reachable ? 'reachable' : 'degraded'}
            </div>
          </div>
        </CardHeader>
        <CardBody style={{ padding: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            <div>
              <label style={{ display: 'block', color: '#8b949e', fontSize: 12, marginBottom: 4 }}>Domain</label>
              <Input
                value={form.domain}
                onChange={e => setForm(current => ({ ...current, domain: e.target.value }))}
                placeholder="example.com"
                style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9' }}
              />
              <div style={{ marginTop: 10 }}>
                <ButtonGroup size="sm">
                  {[
                    ['dns_lookup', 'DNS'],
                    ['ct_lookup', 'CT'],
                    ['subfinder', 'Subfinder'],
                    ['github_hints', 'GitHub'],
                    ['wayback', 'Wayback'],
                  ].map(([type, label]) => (
                    <Button key={type} color="info" outline disabled={dispatching || !form.domain} onClick={() => runTool(type)}>
                      {label}
                    </Button>
                  ))}
                </ButtonGroup>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', color: '#8b949e', fontSize: 12, marginBottom: 4 }}>Hosts / IPs</label>
              <Input
                type="textarea"
                rows={3}
                value={form.hosts}
                onChange={e => setForm(current => ({ ...current, hosts: e.target.value }))}
                placeholder="api.example.com, app.example.com, 10.0.0.15"
                style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9' }}
              />
              <div style={{ marginTop: 10 }}>
                <ButtonGroup size="sm">
                  <Button color="info" outline disabled={dispatching || !form.hosts.trim()} onClick={() => runTool('http_probe')}>
                    HTTP Probe
                  </Button>
                  <Button color="warning" outline disabled={dispatching || !form.hosts.trim()} onClick={() => runTool('port_scan')}>
                    Port Scan
                  </Button>
                  <Button color="danger" outline disabled={dispatching || !form.hosts.trim()} onClick={() => runTool('directory_enum')}>
                    Dir Enum
                  </Button>
                </ButtonGroup>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', color: '#8b949e', fontSize: 12, marginBottom: 4 }}>Ports</label>
              <Input
                value={form.ports}
                onChange={e => setForm(current => ({ ...current, ports: e.target.value }))}
                placeholder="80,443,8080,8443"
                style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9' }}
              />
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button color="info" disabled={dispatching} onClick={() => runTool('wizard_pipeline')} style={{ fontSize: 12 }}>
                    {dispatching ? <Spinner size="sm" /> : 'Run Full Wizard'}
                  </Button>
                  <Button color="secondary" outline disabled={dispatching} onClick={() => runTool('hibp_scan')} style={{ fontSize: 12 }}>
                    HIBP
                  </Button>
                  <Button color="secondary" outline disabled={dispatching} onClick={() => runTool('cti_exposure')} style={{ fontSize: 12 }}>
                    CTI
                  </Button>
                  <Button color="secondary" outline disabled={dispatching || !form.hosts.trim()} onClick={() => runTool('vuln_assessment')} style={{ fontSize: 12 }}>
                    Vuln
                  </Button>
                  <Button color="secondary" outline disabled={dispatching} onClick={() => runTool('remediation_validation')} style={{ fontSize: 12 }}>
                    Remediation
                  </Button>
                  <Button color="secondary" outline disabled={dispatching || !form.hosts.trim()} onClick={() => runTool('iam_audit')} style={{ fontSize: 12 }}>
                    IAM Audit
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {tools.map(tool => (
              <span key={tool.id} style={{
                fontSize: 11,
                padding: '6px 10px',
                borderRadius: 14,
                background: tool.category === 'active' ? '#f0c04022' : '#21262d',
                color: tool.category === 'active' ? '#f0c040' : '#8b949e',
                border: '1px solid #30363d',
              }}>
                {tool.label} · {tool.guard.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8 }}>
        <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '12px 18px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <Input type="select" value={statusFilter} onChange={e => setStatus(e.target.value)}
              style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 13, maxWidth: 160 }}>
              <option value="">All Statuses</option>
              {['queued', 'running', 'completed', 'failed', 'cancelled'].map(status => <option key={status} value={status}>{status}</option>)}
            </Input>
            <Input type="select" value={typeFilter} onChange={e => setType(e.target.value)}
              style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 13, maxWidth: 200 }}>
              <option value="">All Types</option>
              {Object.keys(TYPE_ICONS).map(type => <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>)}
            </Input>
            {loading && <Spinner size="sm" color="info" />}
            <Button size="sm" color="secondary" outline onClick={load} style={{ fontSize: 11 }}>
              <i className="fas fa-sync-alt" />
            </Button>
          </div>
        </CardHeader>
        <CardBody style={{ padding: 0 }}>
          {runs.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#555', fontSize: 13 }}>
              No runs yet.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#0d1117' }}>
                    {['#', 'Type', 'Status', 'Progress', 'Summary', 'Started', 'Duration', 'Actions'].map(header => (
                      <th key={header} style={{ padding: '10px 12px', fontSize: 11, color: '#8b949e', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.map(run => {
                    const duration = run.started_at && run.finished_at
                      ? Math.round((new Date(run.finished_at) - new Date(run.started_at)) / 1000) + 's'
                      : run.started_at ? 'running…' : '—';

                    return (
                      <tr key={run.id} style={{ borderBottom: '1px solid #21262d' }}>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: '#555' }}>#{run.id}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <i className={TYPE_ICONS[run.type] || 'fas fa-cog'} style={{ color: '#8b949e', fontSize: 11 }} />
                            <span style={{ fontSize: 12, color: '#e6edf3' }}>{run.type?.replace(/_/g, ' ')}</span>
                          </div>
                          {run.params_json?.domain && <div style={{ fontSize: 10, color: '#555', marginTop: 2, marginLeft: 20 }}>{run.params_json.domain}</div>}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {run.status === 'running' && <Spinner size="sm" style={{ width: 12, height: 12, color: STATUS_COLORS.running }} />}
                            <span style={{ background: `${STATUS_COLORS[run.status]}22`, color: STATUS_COLORS[run.status], padding: '2px 8px', borderRadius: 12, fontSize: 10 }}>
                              {run.status}
                            </span>
                          </div>
                          {run.error_message && (
                            <div style={{ fontSize: 10, color: '#f85149', marginTop: 3, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {run.error_message}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 80, height: 4, background: '#21262d', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${run.progress}%`, height: '100%', background: STATUS_COLORS[run.status] || '#555' }} />
                            </div>
                            <span style={{ fontSize: 10, color: '#555' }}>{run.progress}%</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 11, color: '#8b949e' }}>
                          {run.summary_json
                            ? Object.entries(run.summary_json).map(([key, value]) => (
                                <div key={key}>{key.replace(/_/g, ' ')}: <strong style={{ color: '#c9d1d9' }}>{Array.isArray(value) ? value.join(', ') : String(value)}</strong></div>
                              ))
                            : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 11, color: '#555' }}>{run.started_at?.slice(0, 16) || '—'}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: '#8b949e' }}>{duration}</td>
                        <td style={{ padding: '10px 12px' }}>
                          {['queued', 'running'].includes(run.status) && (
                            <Button size="sm" color="danger" outline
                              onClick={() => handleCancel(run)}
                              disabled={cancelling === run.id}
                              style={{ fontSize: 10 }}
                            >
                              {cancelling === run.id ? <Spinner size="sm" /> : 'Cancel'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
