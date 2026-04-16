import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from 'contexts/AuthContext';
import { getProject, getScope, getRuns, dispatchRun, getRunDetail } from 'api/metisApi';
import WizardStepper from 'components/Metis/WizardStepper';
import { Row, Col, Card, CardBody, CardHeader, Button, Input, Alert, Spinner, Badge } from 'reactstrap';

const STEP_RUN_TYPES = {
  passive: 'wizard_pipeline',
  validate:'http_probe',
  history: 'wayback',
};

const STATUS_COLORS = { completed: '#3fb950', failed: '#f85149', running: '#f0c040', queued: '#8b949e', cancelled: '#555' };
const DEFAULT_WIZARD_OPTIONS = {
  github_hints: true,
  http_probe: true,
  port_scan: true,
  directory_enum: true,
  wayback: false,
};

function buildPipelineSteps(options) {
  return [
    'dns',
    'ct',
    'subfinder',
    ...(options.github_hints ? ['github_hints'] : []),
    ...(options.http_probe ? ['http_probe'] : []),
    ...(options.port_scan ? ['port_scan'] : []),
    ...(options.directory_enum ? ['directory_enum'] : []),
    ...(options.wayback ? ['wayback'] : []),
  ];
}

function RecommendationCard({ title, body, href, tone = 'info' }) {
  const color = tone === 'warn' ? '#f0c040' : '#58a6ff';

  return (
    <div style={{ border: `1px solid ${color}33`, background: `${color}10`, padding: '12px 14px', marginBottom: 10 }}>
      <div style={{ fontSize: 12, color: '#e6edf3', fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4, lineHeight: 1.5 }}>{body}</div>
      {href && <Link to={href} style={{ fontSize: 11, color: color, textDecoration: 'none', marginTop: 8, display: 'inline-block' }}>Open →</Link>}
    </div>
  );
}

function extractPipelineSamples(output) {
  if (!output?.steps) {
    return { domains: [], hosts: [], urls: [] };
  }

  const discoveredDomains = new Set();
  const resolvedHosts = new Set();
  const historicalUrls = new Set();

  Object.values(output.steps.dns || {}).forEach((result) => {
    (result?.discovered_subdomains || []).forEach((domain) => discoveredDomains.add(domain));
    (result?.resolved_hosts || []).forEach((host) => {
      if (host?.hostname) {
        resolvedHosts.add(host.hostname);
      }
    });
  });

  Object.values(output.steps.dns_enrichment || {}).forEach((result) => {
    (result?.discovered_subdomains || []).forEach((domain) => discoveredDomains.add(domain));
    (result?.resolved_hosts || []).forEach((host) => {
      if (host?.hostname) {
        resolvedHosts.add(host.hostname);
      }
    });
  });

  Object.values(output.steps.ct || {}).forEach((result) => {
    (result?.subdomains || []).forEach((domain) => discoveredDomains.add(domain));
  });

  Object.values(output.steps.subfinder || {}).forEach((result) => {
    (result?.subdomains || []).forEach((domain) => discoveredDomains.add(domain));
  });

  const probeResults = output.steps.http_probe?.hosts || output.steps.http_probe || {};
  Object.entries(probeResults).forEach(([host, result]) => {
    if (!result?.blocked) {
      resolvedHosts.add(host);
    }
  });

  return {
    domains: Array.from(discoveredDomains).slice(0, 8),
    hosts: Array.from(resolvedHosts).slice(0, 8),
    urls: Array.from(historicalUrls).slice(0, 5),
  };
}

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
  const [wizardOptions, setWizardOptions] = useState(DEFAULT_WIZARD_OPTIONS);
  const [latestWizardRun, setLatestWizardRun] = useState(null);
  const [latestWizardOutput, setLatestWizardOutput] = useState(null);
  const [wizardDetailLoading, setWizardDetailLoading] = useState(false);

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

  useEffect(() => {
    const latest = runs.find(r => r.type === 'wizard_pipeline');
    setLatestWizardRun(latest || null);

    if (!latest) {
      setLatestWizardOutput(null);
      return;
    }

    let active = true;

    const loadWizardDetail = async () => {
      setWizardDetailLoading(true);
      try {
        const detail = await getRunDetail(id, latest.id, token);
        if (!active) return;
        setLatestWizardOutput(detail.output || null);
      } catch (_) {
        if (active) setLatestWizardOutput(null);
      }
      if (active) setWizardDetailLoading(false);
    };

    loadWizardDetail();

    return () => {
      active = false;
    };
  }, [runs, id, token]);

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
      const steps = buildPipelineSteps(wizardOptions);
      await dispatchRun(id, {
        type: 'wizard_pipeline',
        params: {
          steps,
          optional_steps: ['wayback'],
        },
      }, token);
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
  const historyEnabled = wizardOptions.wayback;
  const currentStep = hasScopeDomains
    ? (stepStatuses.passive === 'completed'
      ? (stepStatuses.validate === 'completed'
        ? ((stepStatuses.history === 'completed' || !historyEnabled) ? 5 : 4)
        : 3)
      : 2)
    : 1;

  const chain = latestWizardOutput?.chain || latestWizardRun?.summary_json?.chain || null;
  const warningItems = latestWizardOutput?.warnings || [];
  const backendRecommendations = latestWizardOutput?.recommendations || [];
  const pipelineSamples = useMemo(() => extractPipelineSamples(latestWizardOutput), [latestWizardOutput]);
  const localRecommendations = [
    !scope?.root_domains?.length ? {
      title: 'Add root domains',
      body: 'Wizard needs one or more root domains in scope before passive discovery can start.',
      href: `/metis/projects/${id}/scope`,
      tone: 'warn',
    } : null,
    scope?.root_domains?.length > 0 && !project?.stats?.verified_domains ? {
      title: 'Unlock active validation',
      body: 'Passive recon works without verification, but HTTP probe, port scan, and directory discovery still require verified scope.',
      href: `/metis/projects/${id}/scope`,
      tone: 'warn',
    } : null,
    (scope?.github_orgs || []).length > 0 && !wizardOptions.github_hints ? {
      title: 'GitHub orgs are in scope',
      body: 'Enable GitHub Hints in pipeline options if you want public repo metadata and keyword matches.',
      href: `/metis/projects/${id}/modules`,
    } : null,
    (scope?.email_domains || []).length > 0 ? {
      title: 'Email domains are available',
      body: 'Once passive recon is done, run HIBP from Modules to enrich the footprint with credential exposure metadata.',
      href: `/metis/projects/${id}/modules`,
    } : null,
  ].filter(Boolean);

  if (loading) return <div className="content" style={{ textAlign: 'center', padding: 60 }}><Spinner color="info" /></div>;

  return (
    <div className="content">
      <h4 style={{ color: '#e6edf3', marginBottom: 4 }}>Recon Wizard</h4>
      <p style={{ color: '#8b949e', fontSize: 13, marginBottom: 24 }}>
        End-to-end reconnaissance pipeline for {project?.data?.name || 'the current project'} · Scope → Passive → Validate → History → Surface Map → Report
      </p>

      {error && <Alert color="danger" style={{ fontSize: 12 }}>{error}</Alert>}
      <Alert color="info" style={{ fontSize: 12, marginBottom: 20 }}>
        <strong>How this chain works:</strong> DNS, CT, Subfinder, and optional GitHub hints expand the domain inventory; newly found domains are resolved again for DNS and IP data; resolved hosts feed HTTP validation; live hosts feed port scan and directory discovery. Configure provider keys in <Link to="/settings/modules" style={{ color: '#58a6ff' }}>External Services</Link>.
      </Alert>

      {!hasScopeDomains && (
        <Alert color="warning" style={{ fontSize: 12, marginBottom: 20 }}>
          <i className="fas fa-exclamation-triangle" style={{ marginRight: 6 }} />
          No root domains in scope. <Link to={`/metis/projects/${id}/scope`} style={{ color: '#f0c040' }}>Add scope first →</Link>
        </Alert>
      )}
      {warningItems.length > 0 && (
        <Alert color="warning" style={{ fontSize: 12, marginBottom: 20 }}>
          <strong>Pipeline warnings:</strong> {warningItems.map(item => `${item.step}: ${item.message}`).join(' · ')}
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
          <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, marginTop: 20 }}>
            <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '12px 18px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>
                <i className="fas fa-sliders-h" style={{ color: '#58a6ff', marginRight: 8 }} />Pipeline Options
              </span>
            </CardHeader>
            <CardBody style={{ padding: 18 }}>
              {[
                ['github_hints', 'GitHub Public Hints', 'Runs only if GitHub orgs exist in project scope.'],
                ['http_probe', 'HTTP Probe', 'Uses discovered domains and resolved hosts from passive steps.'],
                ['port_scan', 'Port Scan', 'Runs only on live, authorized hosts after HTTP probe.'],
                ['directory_enum', 'Directory Discovery', 'Uses active, authorized web targets only.'],
                ['wayback', 'Wayback History (Optional)', 'Disabled by default so the wizard does not stall on archive fetches.'],
              ].map(([key, label, description]) => (
                <label key={key} style={{ display: 'block', marginBottom: 12, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={wizardOptions[key]}
                      onChange={(e) => setWizardOptions((current) => ({ ...current, [key]: e.target.checked }))}
                      style={{ accentColor: '#4fc3f7' }}
                    />
                    <span style={{ fontSize: 12, color: '#c9d1d9' }}>{label}</span>
                  </div>
                  <div style={{ fontSize: 10, color: '#6e7681', marginTop: 3, paddingLeft: 22 }}>{description}</div>
                </label>
              ))}
              <div style={{ fontSize: 11, color: '#8b949e', marginTop: 14, lineHeight: 1.6 }}>
                Passive steps can run immediately after you define scope. Active validation still requires verified domains or approved IP ranges.
              </div>
            </CardBody>
          </Card>
        </Col>

        {/* Manual step panel + run log */}
        <Col md={7} lg={8}>
          {chain && (
            <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, marginBottom: 20 }}>
              <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '12px 18px' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>
                  <i className="fas fa-project-diagram" style={{ color: '#58a6ff', marginRight: 8 }} />Latest Pipeline Summary
                </span>
              </CardHeader>
              <CardBody style={{ padding: 18 }}>
                {wizardDetailLoading ? (
                  <div style={{ textAlign: 'center', padding: 12 }}><Spinner size="sm" color="info" /></div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                      {[
                        ['Seed Domains', chain.seed_domains],
                        ['Discovered Domains', chain.discovered_domains],
                        ['Resolved Hosts', chain.resolved_hosts],
                        ['Live Hosts', chain.live_hosts],
                        ['Historical URLs', chain.historical_urls],
                        ['Open Findings', chain.open_findings],
                      ].map(([label, value]) => (
                        <div key={label} style={{ border: '1px solid #21262d', padding: '12px 14px' }}>
                          <div style={{ fontSize: 20, color: '#e6edf3', fontWeight: 700 }}>{value ?? 0}</div>
                          <div style={{ fontSize: 10, color: '#8b949e', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 14, fontSize: 11, color: '#8b949e' }}>
                      Latest run: {latestWizardRun?.status || '—'} {latestWizardRun?.created_at ? `· ${latestWizardRun.created_at.slice(0, 16).replace('T', ' ')}` : ''}
                    </div>
                    {(pipelineSamples.domains.length > 0 || pipelineSamples.hosts.length > 0 || pipelineSamples.urls.length > 0) && (
                      <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
                        {pipelineSamples.domains.length > 0 && (
                          <div style={{ fontSize: 11, color: '#8b949e', lineHeight: 1.6 }}>
                            <strong style={{ color: '#c9d1d9' }}>Sample discovered domains:</strong> {pipelineSamples.domains.join(', ')}
                          </div>
                        )}
                        {pipelineSamples.hosts.length > 0 && (
                          <div style={{ fontSize: 11, color: '#8b949e', lineHeight: 1.6 }}>
                            <strong style={{ color: '#c9d1d9' }}>Sample resolved or live hosts:</strong> {pipelineSamples.hosts.join(', ')}
                          </div>
                        )}
                        {pipelineSamples.urls.length > 0 && (
                          <div style={{ fontSize: 11, color: '#8b949e', lineHeight: 1.6 }}>
                            <strong style={{ color: '#c9d1d9' }}>Sample historical URLs:</strong> {pipelineSamples.urls.join(', ')}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          <Link to={`/metis/projects/${id}/entities?tab=domains`} style={{ fontSize: 11, color: '#58a6ff' }}>Open domains →</Link>
                          <Link to={`/metis/projects/${id}/entities?tab=hosts`} style={{ fontSize: 11, color: '#58a6ff' }}>Open hosts →</Link>
                          <Link to={`/metis/projects/${id}/entities?tab=urls`} style={{ fontSize: 11, color: '#58a6ff' }}>Open URLs →</Link>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardBody>
            </Card>
          )}

          {(backendRecommendations.length > 0 || localRecommendations.length > 0) && (
            <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, marginBottom: 20 }}>
              <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '12px 18px' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>
                  <i className="fas fa-lightbulb" style={{ color: '#58a6ff', marginRight: 8 }} />Recommended Next Actions
                </span>
              </CardHeader>
              <CardBody style={{ padding: 18 }}>
                {backendRecommendations.map((item) => (
                  <RecommendationCard
                    key={item.id}
                    title={item.label}
                    body={`Suggested by the latest wizard pipeline based on discovered inventory.`}
                    href={
                      item.target === 'scope'
                        ? `/metis/projects/${id}/scope`
                        : item.target === 'modules'
                          ? `/metis/projects/${id}/modules`
                          : item.target === 'report'
                            ? `/metis/projects/${id}/report`
                            : item.target === 'validate'
                              ? `/metis/projects/${id}/entities?tab=hosts`
                              : item.target === 'history'
                                ? `/metis/projects/${id}/wizard`
                                : undefined
                    }
                  />
                ))}
                {localRecommendations.map((item) => (
                  <RecommendationCard key={item.title} {...item} />
                ))}
              </CardBody>
            </Card>
          )}

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
                        <>
                          <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 10 }}>
                            History fetch is optional and can be skipped if you only need current surface inventory.
                          </div>
                          <Button size="sm" color="info" disabled={running || !manualDomain}
                            onClick={() => runManualStep('wayback', { domain: manualDomain })}>
                            Wayback Fetch
                          </Button>
                        </>
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
