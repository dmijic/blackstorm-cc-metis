import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from 'contexts/AuthContext';
import {
  createWorkflowRun,
  getOverrides,
  getProject,
  getScope,
  getWorkflowRun,
  getWorkflowRuns,
  getWorkflows,
} from 'api/metisApi';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Col, Input, Row, Spinner } from 'reactstrap';

const PHASE_ORDER = [
  'Define Scope',
  'Verify / Authorization',
  'Passive Discovery',
  'DNS & Ownership',
  'Live Validation',
  'Attack Surface Map',
  'Optional History',
  'Intelligence / Exposure',
  'Findings',
  'Report',
];

const OPTIONAL_DEFAULTS = {
  github_hints: true,
  search_engine_recon: true,
  ping_check: false,
  directory_discovery: true,
  wayback: false,
  cti_exposure: false,
  hibp_scan: false,
  vuln_assessment: false,
  remediation_validation: false,
  iam_audit: false,
};

const STATUS_COLORS = {
  completed: '#3fb950',
  resumed: '#58a6ff',
  running: '#f0c040',
  queued: '#8b949e',
  pending: '#6e7681',
  blocked: '#f85149',
  failed: '#f85149',
};

const RECOMMENDATION_NODE_MAP = {
  'offer-hibp': 'hibp_scan',
  'offer-vuln-assessment': 'vuln_assessment',
  'review-admin-panels': 'iam_audit',
  'review-cert-reuse': 'cti_exposure',
};

const RECOMMENDATION_ROUTE_MAP = {
  'offer-hibp': 'modules',
  'offer-vuln-assessment': 'findings',
  'review-admin-panels': 'entities?tab=hosts',
  'review-cert-reuse': 'entities?tab=hosts',
};

function phaseNodes(workflow) {
  const grouped = {};
  (workflow?.nodes || [])
    .slice()
    .sort((left, right) => left.position - right.position)
    .forEach((node) => {
      const phase = node.ui_meta_json?.phase || 'General';
      grouped[phase] = grouped[phase] || [];
      grouped[phase].push(node);
    });

  return grouped;
}

function buildOptionalDefaults(workflow, scope) {
  const emailDomains = scope?.email_domains?.length || 0;
  const githubOrgs = scope?.github_orgs?.length || 0;

  return (workflow?.nodes || []).reduce((acc, node) => {
    if (!node.is_optional) {
      return acc;
    }

    if (node.key === 'hibp_scan') {
      acc[node.key] = emailDomains > 0;
      return acc;
    }

    if (node.key === 'github_hints') {
      acc[node.key] = githubOrgs > 0;
      return acc;
    }

    acc[node.key] = OPTIONAL_DEFAULTS[node.key] ?? true;
    return acc;
  }, {});
}

function buildStepMap(selectedRun) {
  return (selectedRun?.steps || []).reduce((acc, step) => {
    acc[step.key] = step;
    return acc;
  }, {});
}

function summarizeHighlights(scope, context) {
  const liveHosts = Object.values(context?.host_services?.http || {})
    .filter((item) => item && !item.blocked && item.live)
    .length;

  const groupedAssets = context?.attack_surface?.grouped_assets?.group_count
    || context?.attack_surface?.grouped_assets?.groups?.length
    || 0;

  const findingsCount =
    (context?.findings?.items?.findings || 0)
    + (context?.findings?.directory?.finding_count || 0)
    + (context?.findings?.iam?.findings || 0);

  return [
    { label: 'Root Domains', value: scope?.root_domains?.length || 0, color: '#58a6ff' },
    { label: 'Verified Domains', value: context?.scope?.verified_domains?.length || 0, color: '#3fb950' },
    { label: 'DNS Records', value: context?.dns?.records?.length || 0, color: '#81c784' },
    { label: 'CT Subdomains', value: context?.discovery?.ct_subdomains?.length || 0, color: '#4fc3f7' },
    { label: 'Resolved Hosts', value: context?.resolved?.host_ips?.length || 0, color: '#ffb74d' },
    { label: 'Live Hosts', value: liveHosts, color: '#4dd0e1' },
    { label: 'Infra Groups', value: groupedAssets, color: '#ba68c8' },
    { label: 'Findings', value: findingsCount, color: '#ff7043' },
  ];
}

function samplePreview(context) {
  return {
    domains: (context?.discovery?.ct_subdomains || []).slice(0, 8),
    hosts: (context?.resolved?.host_ips || []).map((item) => item.hostname).filter(Boolean).slice(0, 8),
    urls: (context?.history?.urls || []).map((item) => item.url).filter(Boolean).slice(0, 5),
    groups: (context?.attack_surface?.grouped_assets?.groups || []).slice(0, 5),
    recommendations: (context?.recommendations?.items || []).slice(0, 5),
  };
}

function statusForPhase(phase, nodes, stepMap, verificationUnlocked) {
  if (phase === 'Verify / Authorization') {
    return verificationUnlocked ? 'completed' : 'blocked';
  }

  const steps = nodes.map((node) => stepMap[node.key]).filter(Boolean);
  if (steps.some((step) => step.status === 'failed')) {
    return 'failed';
  }
  if (steps.some((step) => step.status === 'running' || step.status === 'queued')) {
    return 'running';
  }
  if (steps.length > 0 && steps.every((step) => step.status === 'completed')) {
    return 'completed';
  }
  if (steps.length > 0) {
    return 'resumed';
  }

  return 'pending';
}

function highlightStatus(status) {
  return STATUS_COLORS[status] || '#6e7681';
}

function formatSummary(summary) {
  if (!summary || typeof summary !== 'object') {
    return 'No summary available.';
  }

  return Object.entries(summary)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
    .join(' · ');
}

function QuickStat({ item }) {
  return (
    <div style={{ background: '#0d1117', border: '1px solid #30363d', padding: '14px 16px' }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: item.color }}>{item.value ?? 0}</div>
      <div style={{ fontSize: 10, color: '#8b949e', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{item.label}</div>
    </div>
  );
}

export default function MetisWizard() {
  const { id } = useParams();
  const { token, user } = useAuth();
  const isSuperAdmin = user?.role === 'SuperAdmin';

  const [project, setProject] = useState(null);
  const [scope, setScope] = useState(null);
  const [workflow, setWorkflow] = useState(null);
  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [selectedRun, setSelectedRun] = useState(null);
  const [overrides, setOverrides] = useState([]);
  const [optionalNodes, setOptionalNodes] = useState({});
  const [resumeFromRunId, setResumeFromRunId] = useState('');
  const [overrideId, setOverrideId] = useState('');
  const [strictEvidence, setStrictEvidence] = useState(true);
  const [aiAssist, setAiAssist] = useState(true);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const requests = [
        getProject(id, token),
        getScope(id, token),
        getWorkflows({ project_id: id }, token),
        getWorkflowRuns(id, {}, token),
      ];

      if (isSuperAdmin) {
        requests.push(getOverrides(id, {}, token).catch(() => ({ data: [] })));
      }

      const [projectRes, scopeRes, workflowsRes, runsRes, overridesRes] = await Promise.all(requests);
      const scopePayload = scopeRes?.data ? { ...scopeRes.data, verifications: scopeRes.verifications || [] } : null;
      const nextWorkflow = (workflowsRes?.data || []).find((item) => item.slug === 'metis-smart-recon')
        || (workflowsRes?.data || [])[0]
        || null;

      const nextRuns = runsRes?.data || [];
      const nextSelectedRunId = selectedRunId || (nextRuns[0]?.id ? String(nextRuns[0].id) : '');

      setProject(projectRes?.data || projectRes);
      setScope(scopePayload);
      setWorkflow(nextWorkflow);
      setRuns(nextRuns);
      setSelectedRunId(nextSelectedRunId);
      setOverrides((overridesRes?.data || []).filter((item) => item.status === 'confirmed'));

      if (nextWorkflow) {
        setOptionalNodes((current) => (Object.keys(current).length ? current : buildOptionalDefaults(nextWorkflow, scopePayload)));
      }
    } catch (e) {
      setError(e.message);
    }

    setLoading(false);
  }, [id, isSuperAdmin, selectedRunId, token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedRunId) {
      setSelectedRun(null);
      return;
    }

    let alive = true;
    getWorkflowRun(id, selectedRunId, token)
      .then((response) => {
        if (alive) {
          setSelectedRun(response);
        }
      })
      .catch(() => {
        if (alive) {
          setSelectedRun(null);
        }
      });

    return () => {
      alive = false;
    };
  }, [id, selectedRunId, token]);

  useEffect(() => {
    const active = runs.some((run) => ['queued', 'running'].includes(run.status));
    if (!active) {
      return undefined;
    }

    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [runs, load]);

  useEffect(() => {
    if (!workflow) {
      return;
    }

    setOptionalNodes((current) => {
      const defaults = buildOptionalDefaults(workflow, scope);
      if (!Object.keys(current).length) {
        return defaults;
      }

      return { ...defaults, ...current };
    });
  }, [workflow, scope]);

  const verificationUnlocked =
    ((scope?.verifications || []).filter((item) => item.status === 'verified').length || project?.stats?.verified_domains || 0) > 0
    || (scope?.ip_ranges?.length || 0) > 0;
  const groupedPhases = useMemo(() => phaseNodes(workflow), [workflow]);
  const stepMap = useMemo(() => buildStepMap(selectedRun), [selectedRun]);
  const context = selectedRun?.context || {};
  const highlights = useMemo(() => summarizeHighlights(scope, context), [scope, context]);
  const preview = useMemo(() => samplePreview(context), [context]);
  const runInput = selectedRun?.data?.input_json || {};
  const runStrictEvidence = runInput?.strict_evidence !== false;

  const launchWizard = async () => {
    if (!workflow?.id) {
      return;
    }

    setRunning(true);
    setError('');
    setSuccess('');

    try {
      const response = await createWorkflowRun(id, {
        workflow_id: workflow.id,
        override_id: overrideId ? Number(overrideId) : undefined,
        input: {
          strict_evidence: strictEvidence,
          ai_assist: aiAssist,
          optional_nodes: optionalNodes,
          resume_from_run_id: resumeFromRunId ? Number(resumeFromRunId) : undefined,
        },
      }, token);

      setSelectedRunId(String(response?.data?.id || ''));
      setSuccess('Workflow queued.');
      await load();
    } catch (e) {
      setError(e.message);
    }

    setRunning(false);
  };

  const applyRecommendation = (recommendationId) => {
    const mappedNode = RECOMMENDATION_NODE_MAP[recommendationId];
    if (!mappedNode) {
      return;
    }

    setOptionalNodes((current) => ({
      ...current,
      [mappedNode]: true,
    }));
    setSuccess(`Enabled ${mappedNode} for the next run.`);
  };

  if (loading) {
    return <div className="content" style={{ textAlign: 'center', padding: 60 }}><Spinner color="info" /></div>;
  }

  if (!workflow) {
    return (
      <div className="content">
        <Alert color="warning" style={{ fontSize: 12 }}>
          No workflow definition is available yet. Open <Link to={`/metis/projects/${id}/workflows`} style={{ color: '#58a6ff' }}>Workflow Engine</Link> and sync defaults.
        </Alert>
      </div>
    );
  }

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h4 style={{ color: '#e6edf3', marginBottom: 4 }}>Smart Wizard</h4>
          <p style={{ color: '#8b949e', fontSize: 13, marginBottom: 0 }}>
            Workflow-driven authorized recon chain for {project?.name || 'this project'}.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to={`/metis/projects/${id}/workflows`} className="btn btn-sm btn-outline-info">Open Workflow Engine</Link>
          <Link to={`/metis/projects/${id}/report`} className="btn btn-sm btn-outline-secondary">Open Report Builder</Link>
        </div>
      </div>

      {error && <Alert color="danger" style={{ fontSize: 12 }}>{error}</Alert>}
      {success && <Alert color="success" style={{ fontSize: 12 }}>{success}</Alert>}

      <Alert color="info" style={{ fontSize: 12 }}>
        <strong>Chain behavior:</strong> scope variables feed passive discovery, discovery feeds DNS/IP enrichment, enriched hosts feed live validation, and the resulting evidence becomes grouped infrastructure, recommendations, and report sections in the same workflow context.
      </Alert>
      <Alert color={verificationUnlocked ? 'success' : 'warning'} style={{ fontSize: 12 }}>
        <strong>Authorization:</strong> passive nodes can run immediately. Active nodes still require verified domains or approved IP ranges. {isSuperAdmin ? 'SuperAdmin can attach an audited emergency override per run.' : 'No bypass is available here.'}
      </Alert>

      <Row>
        <Col lg={5} style={{ marginBottom: 20 }}>
          <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, marginBottom: 20 }}>
            <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 18px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>Wizard Phases</span>
            </CardHeader>
            <CardBody style={{ padding: 18 }}>
              <div style={{ display: 'grid', gap: 12 }}>
                {PHASE_ORDER.map((phase) => {
                  const nodes = groupedPhases[phase] || [];
                  const status = statusForPhase(phase, nodes, stepMap, verificationUnlocked);
                  const color = highlightStatus(status);

                  return (
                    <div key={phase} style={{ border: `1px solid ${color}33`, background: '#0d1117', padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#e6edf3' }}>{phase}</div>
                        <Badge style={{ background: `${color}22`, color }}>{status}</Badge>
                      </div>
                      {phase === 'Verify / Authorization' ? (
                        <div style={{ fontSize: 11, color: '#8b949e', lineHeight: 1.6 }}>
                          {verificationUnlocked
                            ? 'Verified domains or approved IP ranges are present, so active validation nodes can run.'
                            : 'Active nodes remain guarded until scope verification completes or an audited emergency override is attached.'}
                        </div>
                      ) : nodes.length === 0 ? (
                        <div style={{ fontSize: 11, color: '#555' }}>No nodes in this phase.</div>
                      ) : (
                        <div style={{ display: 'grid', gap: 10 }}>
                          {nodes.map((node) => {
                            const step = stepMap[node.key];
                            const optionalEnabled = node.is_optional ? optionalNodes[node.key] !== false : true;
                            const nodeBlocked = node.requires_verified_scope && !verificationUnlocked && !overrideId;

                            return (
                              <div key={node.id} style={{ border: '1px solid #21262d', padding: '10px 12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                                  <div>
                                    <div style={{ fontSize: 12, color: '#e6edf3', fontWeight: 600 }}>
                                      {node.ui_meta_json?.name || node.key}
                                    </div>
                                    <div style={{ fontSize: 10, color: '#8b949e', marginTop: 4, lineHeight: 1.5 }}>
                                      {node.ui_meta_json?.short_description || node.type}
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                    {node.is_optional && (
                                      <Badge style={{ background: optionalEnabled ? '#58a6ff22' : '#6e768122', color: optionalEnabled ? '#58a6ff' : '#6e7681' }}>
                                        {optionalEnabled ? 'enabled' : 'skipped'}
                                      </Badge>
                                    )}
                                    {node.requires_verified_scope && <Badge style={{ background: '#f0c04022', color: '#f0c040' }}>guarded</Badge>}
                                    {step?.used_override && <Badge style={{ background: '#f8514922', color: '#f0c040' }}>OVERRIDE</Badge>}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
                                  <div style={{ fontSize: 10, color: nodeBlocked ? '#f85149' : '#6e7681' }}>
                                    {step ? formatSummary(step.summary) : nodeBlocked ? 'Blocked until authorization unlocks.' : 'Ready for next run.'}
                                  </div>
                                  {node.is_optional && (
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#c9d1d9', fontSize: 11, margin: 0 }}>
                                      <input
                                        type="checkbox"
                                        checked={optionalEnabled}
                                        onChange={(event) => setOptionalNodes((current) => ({ ...current, [node.key]: event.target.checked }))}
                                        style={{ accentColor: '#4fc3f7' }}
                                      />
                                      Include
                                    </label>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8 }}>
            <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 18px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>Run Configuration</span>
            </CardHeader>
            <CardBody style={{ padding: 18 }}>
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Resume From Previous Run</div>
                  <Input
                    type="select"
                    value={resumeFromRunId}
                    onChange={(event) => setResumeFromRunId(event.target.value)}
                    style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 12 }}
                  >
                    <option value="">Start fresh</option>
                    {runs.map((run) => (
                      <option key={run.id} value={run.id}>
                        #{run.id} · {run.status} · {run.created_at?.slice(0, 16).replace('T', ' ')}
                      </option>
                    ))}
                  </Input>
                  <div style={{ fontSize: 10, color: '#6e7681', marginTop: 4 }}>
                    Completed nodes from the selected workflow run are reused unless you explicitly rerun them in Workflow Engine.
                  </div>
                </div>

                {isSuperAdmin && (
                  <div>
                    <div style={{ fontSize: 10, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Emergency Override</div>
                    <Input
                      type="select"
                      value={overrideId}
                      onChange={(event) => setOverrideId(event.target.value)}
                      style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 12 }}
                    >
                      <option value="">No override</option>
                      {overrides.map((override) => (
                        <option key={override.id} value={override.id}>
                          #{override.id} · {override.target_summary}
                        </option>
                      ))}
                    </Input>
                    <div style={{ fontSize: 10, color: '#f0c040', marginTop: 4 }}>
                      Every override is audited and attached to the workflow run metadata.
                    </div>
                  </div>
                )}

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#c9d1d9', fontSize: 12, margin: 0 }}>
                  <input type="checkbox" checked={strictEvidence} onChange={(event) => setStrictEvidence(event.target.checked)} style={{ accentColor: '#4fc3f7' }} />
                  Strictly evidence-based report sections
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#c9d1d9', fontSize: 12, margin: 0 }}>
                  <input type="checkbox" checked={aiAssist} onChange={(event) => setAiAssist(event.target.checked)} style={{ accentColor: '#4fc3f7' }} />
                  AI-assisted narrative and recommendations
                </label>

                <Button color="info" onClick={launchWizard} disabled={running}>
                  {running ? <Spinner size="sm" /> : 'Run Smart Wizard'}
                </Button>
              </div>
            </CardBody>
          </Card>
        </Col>

        <Col lg={7} style={{ marginBottom: 20 }}>
          <Row>
            {highlights.map((item) => (
              <Col md={6} xl={3} key={item.label} style={{ marginBottom: 16 }}>
                <QuickStat item={item} />
              </Col>
            ))}
          </Row>

          <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, marginBottom: 20 }}>
            <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>Workflow Runs</span>
              <Input
                type="select"
                value={selectedRunId}
                onChange={(event) => setSelectedRunId(event.target.value)}
                style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 12, maxWidth: 280 }}
              >
                <option value="">Select workflow run…</option>
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    #{run.id} · {run.status} {run.override ? '· OVERRIDE' : ''}
                  </option>
                ))}
              </Input>
            </CardHeader>
            <CardBody style={{ padding: 18 }}>
              {runs.length === 0 ? (
                <div style={{ fontSize: 12, color: '#555' }}>No workflow runs yet.</div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {runs.map((run) => (
                    <button
                      key={run.id}
                      type="button"
                      onClick={() => setSelectedRunId(String(run.id))}
                      style={{
                        textAlign: 'left',
                        background: '#0d1117',
                        border: String(run.id) === String(selectedRunId) ? '1px solid #58a6ff' : '1px solid #30363d',
                        color: '#c9d1d9',
                        padding: '10px 12px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 12 }}>
                          #{run.id} · {run.workflow?.name || workflow.name}
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {run.override && <Badge style={{ background: '#f0c04022', color: '#f0c040' }}>OVERRIDE</Badge>}
                          <Badge style={{ background: `${highlightStatus(run.status)}22`, color: highlightStatus(run.status) }}>{run.status}</Badge>
                        </div>
                      </div>
                      <div style={{ fontSize: 10, color: '#8b949e', marginTop: 6 }}>
                        {run.created_at?.slice(0, 16).replace('T', ' ')} · {formatSummary(run.summary_json)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, marginBottom: 20 }}>
            <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 18px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>Selected Run Context</span>
            </CardHeader>
            <CardBody style={{ padding: 18 }}>
              {!selectedRun ? (
                <div style={{ fontSize: 12, color: '#555' }}>Select a workflow run to inspect chained variables and evidence.</div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                    {selectedRun?.data?.override && <Badge style={{ background: '#f0c04022', color: '#f0c040' }}>OVERRIDE</Badge>}
                    {resumeFromRunId && <Badge style={{ background: '#58a6ff22', color: '#58a6ff' }}>resume requested</Badge>}
                    {runInput?.resume_from_run_id && <Badge style={{ background: '#58a6ff22', color: '#58a6ff' }}>resumed from #{runInput.resume_from_run_id}</Badge>}
                    <Badge style={{ background: runStrictEvidence ? '#3fb95022' : '#6e768122', color: runStrictEvidence ? '#3fb950' : '#8b949e' }}>
                      {runStrictEvidence ? 'strict evidence' : 'flexible evidence'}
                    </Badge>
                  </div>

                  {(preview.domains.length > 0 || preview.hosts.length > 0 || preview.urls.length > 0) && (
                    <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
                      {preview.domains.length > 0 && (
                        <div style={{ fontSize: 11, color: '#8b949e', lineHeight: 1.6 }}>
                          <strong style={{ color: '#c9d1d9' }}>Discovered domains:</strong> {preview.domains.join(', ')}
                        </div>
                      )}
                      {preview.hosts.length > 0 && (
                        <div style={{ fontSize: 11, color: '#8b949e', lineHeight: 1.6 }}>
                          <strong style={{ color: '#c9d1d9' }}>Resolved hosts:</strong> {preview.hosts.join(', ')}
                        </div>
                      )}
                      {preview.urls.length > 0 && (
                        <div style={{ fontSize: 11, color: '#8b949e', lineHeight: 1.6 }}>
                          <strong style={{ color: '#c9d1d9' }}>Historical URLs:</strong> {preview.urls.join(', ')}
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'grid', gap: 10 }}>
                    {(selectedRun.steps || []).map((step) => (
                      <div key={step.id} style={{ border: '1px solid #30363d', background: '#0d1117', padding: '10px 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                          <div style={{ fontSize: 12, color: '#e6edf3', fontWeight: 600 }}>{step.key}</div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {step.used_override && <Badge style={{ background: '#f0c04022', color: '#f0c040' }}>OVERRIDE</Badge>}
                            <Badge style={{ background: `${highlightStatus(step.status)}22`, color: highlightStatus(step.status) }}>{step.status}</Badge>
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: '#8b949e', marginTop: 6, lineHeight: 1.6 }}>
                          {formatSummary(step.summary)}
                        </div>
                        {step.output && (
                          <pre style={{ margin: '10px 0 0', background: 'transparent', color: '#c9d1d9', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {JSON.stringify(step.output, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardBody>
          </Card>

          <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, marginBottom: 20 }}>
            <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 18px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>Recommended Next Actions</span>
            </CardHeader>
            <CardBody style={{ padding: 18 }}>
              {preview.recommendations.length === 0 ? (
                <div style={{ fontSize: 12, color: '#555' }}>No recommendations yet. Run the wizard to generate evidence-based next steps.</div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {preview.recommendations.map((item) => (
                    <div key={item.id || item.title} style={{ border: '1px solid #30363d', background: '#0d1117', padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 12, color: '#e6edf3', fontWeight: 600 }}>{item.title || item.label || item.id}</div>
                        {RECOMMENDATION_NODE_MAP[item.id] && (
                          <Button color="info" outline size="sm" onClick={() => applyRecommendation(item.id)}>
                            Include in next run
                          </Button>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: '#8b949e', marginTop: 6, lineHeight: 1.6 }}>{item.reason || item.body || 'Follow-up is available based on observed evidence.'}</div>
                      {RECOMMENDATION_ROUTE_MAP[item.id] && (
                        <Link
                          to={`/metis/projects/${id}/${RECOMMENDATION_ROUTE_MAP[item.id]}`}
                          style={{ display: 'inline-block', marginTop: 8, fontSize: 11, color: '#58a6ff', textDecoration: 'none' }}
                        >
                          Open follow-up →
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {preview.groups.length > 0 && (
            <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8 }}>
              <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 18px' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>Infrastructure Group Preview</span>
              </CardHeader>
              <CardBody style={{ padding: 18 }}>
                <div style={{ display: 'grid', gap: 10 }}>
                  {preview.groups.map((group) => (
                    <div key={group.id || group.name} style={{ border: '1px solid #30363d', background: '#0d1117', padding: '12px 14px' }}>
                      <div style={{ fontSize: 12, color: '#e6edf3', fontWeight: 600 }}>{group.name}</div>
                      <div style={{ fontSize: 11, color: '#8b949e', marginTop: 6, lineHeight: 1.6 }}>
                        {(group.assets || []).join(', ')}
                      </div>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
}
