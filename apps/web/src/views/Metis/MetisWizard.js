import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from 'contexts/AuthContext';
import { getProject, getScope, getRuns, dispatchRun } from 'api/metisApi';
import WizardStepper from 'components/Metis/WizardStepper';
import { Row, Col, Card, CardBody, CardHeader, Button, Input, Alert, Spinner, Badge } from 'reactstrap';

const STEP_RUN_TYPES = {
  passive: 'wizard_pipeline',
  validate:'http_probe',
  history: 'wayback',
};

const STATUS_COLORS = { completed: '#3fb950', failed: '#f85149', running: '#f0c040', queued: '#8b949e', cancelled: '#555' };

function RunRow({ run }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #21262d' }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS[run.status] || '#555', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: 12, color: '#c9d1d9' }}>{run.type}</span>
        {run.params_json?.domain && <span style={{ fontSize: 11, color: '#555', marginLeft: 8 }}>{run.params_json.domain}</span>}
      </div>
      <Badge style={{ background: STATUS_COLORS[run.status] + '22', color: STATUS_COLORS[run.status], fontSize: 10 }}>
        {run.status}
      </Badge>
      {run.summary_json && (
        <span style={{ fontSize: 10, color: '#555' }}>
          {Object.entries(run.summary_json).map(([k, v]) => `${k}: ${v}`).join(' · ')}
        </span>
      )}
    </div>
  );
}

export default function MetisWizard() {
  const { id }    = useParams();
  const { token } = useAuth();

  const [project, setProject] = useState(null);
  const [scope,   setScope]   = useState(null);
  const [runs,    setRuns]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error,   setError]   = useState(null);

  // Manual step params
  const [manualDomain, setManualDomain] = useState('');
  const [manualHosts,  setManualHosts]  = useState('');
  const [activeStep,   setActiveStep]   = useState(null);

  const load = useCallback(async () => {
    try {
      const [proj, sc, rs] = await Promise.all([
        getProject(id, token),
        getScope(id, token),
        getRuns(id, { per_page: 30 }, token),
      ]);
      setProject(proj);
      setScope(sc.data);
      setRuns(rs.data || []);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [id, token]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh while jobs are running
  useEffect(() => {
    const hasActive = runs.some(r => r.status === 'queued' || r.status === 'running');
    if (!hasActive) return;
    const interval = setInterval(() => load(), 5000);
    return () => clearInterval(interval);
  }, [runs, load]);

  const runWizard = async () => {
    setRunning(true);
    setError(null);
    try {
      await dispatchRun(id, { type: 'wizard_pipeline', params: { steps: ['dns', 'ct', 'subfinder', 'github_hints', 'http_probe', 'port_scan', 'directory_enum', 'wayback'] } }, token);
      load();
    } catch (e) {
      setError(e.message);
    }
    setRunning(false);
  };

  const runManualStep = async (type, params) => {
    setRunning(true);
    setError(null);
    try {
      await dispatchRun(id, { type, params }, token);
      setActiveStep(null);
      setManualDomain('');
      setManualHosts('');
      load();
    } catch (e) {
      setError(e.message);
    }
    setRunning(false);
  };

  // Compute step statuses from recent runs
  const stepStatuses = {};
  const RUN_TO_STEP = {
    dns_lookup: 'passive',
    ct_lookup: 'passive',
    subfinder: 'passive',
    github_hints: 'passive',
    http_probe: 'validate',
    port_scan: 'validate',
    directory_enum: 'validate',
    wayback: 'history',
  };
  runs.forEach(r => {
    const step = RUN_TO_STEP[r.type];
    if (step && !stepStatuses[step]) {
      stepStatuses[step] = r.status === 'completed' ? 'completed' : r.status === 'running' ? 'running' : r.status === 'failed' ? 'failed' : undefined;
    }
  });

  const hasScopeDomains = scope?.root_domains?.length > 0;
  const currentStep = hasScopeDomains
    ? (stepStatuses.passive === 'completed' ? (stepStatuses.validate === 'completed' ? (stepStatuses.history === 'completed' ? 5 : 4) : 3) : 2)
    : 1;

  if (loading) return <div className="content" style={{ textAlign: 'center', padding: 60 }}><Spinner color="info" /></div>;

  return (
    <div className="content">
      <h4 style={{ color: '#e6edf3', marginBottom: 4 }}>Recon Wizard</h4>
      <p style={{ color: '#8b949e', fontSize: 13, marginBottom: 24 }}>
        End-to-end reconnaissance pipeline · Scope → Passive → Validate → History → Surface Map → Report
      </p>

      {error && <Alert color="danger" style={{ fontSize: 12 }}>{error}</Alert>}

      {!hasScopeDomains && (
        <Alert color="warning" style={{ fontSize: 12, marginBottom: 20 }}>
          <i className="fas fa-exclamation-triangle" style={{ marginRight: 6 }} />
          No root domains in scope. <Link to={`/metis/projects/${id}/scope`} style={{ color: '#f0c040' }}>Add scope first →</Link>
        </Alert>
      )}

      <Row>
        {/* Stepper */}
        <Col md={5} lg={4}>
          <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8 }}>
            <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 18px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>
                <i className="fas fa-map-signs" style={{ color: '#58a6ff', marginRight: 8 }} />Pipeline Steps
              </span>
            </CardHeader>
            <CardBody style={{ padding: '16px 12px' }}>
              <WizardStepper
                currentStep={currentStep}
                stepStatuses={stepStatuses}
                onStepClick={step => setActiveStep(step)}
                onRunAll={hasScopeDomains ? runWizard : undefined}
                runningAll={running}
              />
            </CardBody>
          </Card>
        </Col>

        {/* Manual step panel + run log */}
        <Col md={7} lg={8}>
          {/* Manual step controls */}
          {activeStep && (
            <Card style={{ background: '#161b22', border: '1px solid #58a6ff', borderRadius: 8, marginBottom: 20 }}>
              <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#58a6ff' }}>
                  {activeStep.label}
                </span>
                <button onClick={() => setActiveStep(null)} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16 }}>✕</button>
              </CardHeader>
              <CardBody style={{ padding: 20 }}>
                {['passive', 'history'].includes(activeStep?.key) && (
                  <>
                    <label style={{ fontSize: 12, color: '#8b949e', display: 'block', marginBottom: 4 }}>Domain</label>
                    <Input
                      value={manualDomain}
                      onChange={e => setManualDomain(e.target.value)}
                      placeholder={scope?.root_domains?.[0] || 'example.com'}
                      style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 13, marginBottom: 12 }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      {activeStep.key === 'passive' && (
                        <>
                          <Button size="sm" color="info" disabled={running || !manualDomain}
                            onClick={() => runManualStep('dns_lookup', { domain: manualDomain })}>
                            DNS Lookup
                          </Button>
                          <Button size="sm" color="info" disabled={running || !manualDomain}
                            onClick={() => runManualStep('ct_lookup', { domain: manualDomain })}>
                            CT Lookup
                          </Button>
                          <Button size="sm" color="info" disabled={running || !manualDomain}
                            onClick={() => runManualStep('subfinder', { domain: manualDomain })}>
                            Subfinder
                          </Button>
                          <Button size="sm" color="info" disabled={running}
                            onClick={() => runManualStep('github_hints', {})}>
                            GitHub Hints
                          </Button>
                        </>
                      )}
                      {activeStep.key === 'history' && (
                        <Button size="sm" color="info" disabled={running || !manualDomain}
                          onClick={() => runManualStep('wayback', { domain: manualDomain })}>
                          Wayback Fetch
                        </Button>
                      )}
                    </div>
                  </>
                )}
                {activeStep?.key === 'validate' && (
                  <>
                    <label style={{ fontSize: 12, color: '#8b949e', display: 'block', marginBottom: 4 }}>Hosts (comma-separated)</label>
                    <Input
                      type="textarea"
                      rows={3}
                      value={manualHosts}
                      onChange={e => setManualHosts(e.target.value)}
                      placeholder="api.example.com, app.example.com"
                      style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 13, marginBottom: 12 }}
                    />
                    <p style={{ fontSize: 11, color: '#f85149' }}>
                      <i className="fas fa-shield-alt" style={{ marginRight: 4 }} />
                      Only verified-scope hosts will be probed. Others return 403.
                    </p>
                    <Button size="sm" color="info" disabled={running || !manualHosts}
                      onClick={() => {
                        const hosts = manualHosts.split(',').map(h => h.trim()).filter(Boolean);
                        runManualStep('http_probe', { hosts });
                      }}>
                      HTTP Probe
                    </Button>
                    <Button size="sm" color="warning" outline disabled={running || !manualHosts}
                      onClick={() => {
                        const hosts = manualHosts.split(',').map(h => h.trim()).filter(Boolean);
                        runManualStep('port_scan', { hosts });
                      }}>
                      Port Scan
                    </Button>
                    <Button size="sm" color="danger" outline disabled={running || !manualHosts}
                      onClick={() => {
                        const hosts = manualHosts.split(',').map(h => h.trim()).filter(Boolean);
                        runManualStep('directory_enum', { hosts });
                      }}>
                      Directory Enum
                    </Button>
                  </>
                )}
                {activeStep?.key === 'scope' && (
                  <p style={{ fontSize: 12, color: '#8b949e' }}>
                    <Link to={`/metis/projects/${id}/scope`} style={{ color: '#58a6ff' }}>→ Go to Scope Editor</Link>
                  </p>
                )}
                {activeStep?.key === 'report' && (
                  <p style={{ fontSize: 12, color: '#8b949e' }}>
                    <Link to={`/metis/projects/${id}/report`} style={{ color: '#58a6ff' }}>→ Go to Report</Link>
                  </p>
                )}
              </CardBody>
            </Card>
          )}

          {/* Recent runs */}
          <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8 }}>
            <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>
                <i className="fas fa-history" style={{ color: '#8b949e', marginRight: 8 }} />Recent Job Runs
              </span>
              <Link to={`/metis/projects/${id}/runs`} style={{ fontSize: 11, color: '#58a6ff' }}>View all →</Link>
            </CardHeader>
            <CardBody style={{ padding: '0 18px 8px', maxHeight: 360, overflowY: 'auto' }}>
              {runs.length === 0 ? (
                <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: 30 }}>No runs yet.</div>
              ) : (
                runs.slice(0, 20).map(r => <RunRow key={r.id} run={r} />)
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
