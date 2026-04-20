import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from 'contexts/AuthContext';
import GuidedHelpTour from 'components/GuidedHelpTour';
import { createWorkflowRun, getProject, getWorkflowRun, getWorkflowRuns, getWorkflows, syncWorkflows } from 'api/metisApi';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Col, Input, Row, Spinner } from 'reactstrap';

const STATUS_COLORS = { completed: '#3fb950', failed: '#f85149', running: '#f0c040', queued: '#8b949e' };

const WORKFLOW_CASES = [
  {
    id: 'passive-baseline',
    name: 'Passive Baseline',
    description: 'Start with discovery, DNS enrichment, grouping, and reports before any active validation.',
    tags: ['passive-first', 'safe'],
    workflowSlug: 'metis-smart-recon',
    input: {
      strict_evidence: true,
      optional_nodes: {
        github_hints: true,
        search_engine_recon: true,
        wayback: false,
        cti_exposure: false,
        hibp_scan: false,
        ping_check: false,
        directory_discovery: false,
        vuln_assessment: false,
        remediation_validation: false,
        iam_audit: false,
      },
    },
  },
  {
    id: 'authorized-validation',
    name: 'Authorized Validation',
    description: 'Use this after verification when you want HTTP/TLS/port validation plus grouped infrastructure.',
    tags: ['verified-scope', 'active'],
    workflowSlug: 'metis-smart-recon',
    input: {
      strict_evidence: true,
      optional_nodes: {
        github_hints: true,
        search_engine_recon: true,
        wayback: false,
        cti_exposure: false,
        hibp_scan: false,
        ping_check: true,
        directory_discovery: true,
        vuln_assessment: true,
        remediation_validation: false,
        iam_audit: true,
      },
    },
  },
  {
    id: 'history-and-intel',
    name: 'History + Intel',
    description: 'Keep the workflow passive but enrich with Wayback, CTI and HIBP to build an evidence timeline.',
    tags: ['history', 'intel'],
    workflowSlug: 'metis-smart-recon',
    input: {
      strict_evidence: true,
      optional_nodes: {
        github_hints: true,
        search_engine_recon: true,
        wayback: true,
        cti_exposure: true,
        hibp_scan: true,
        ping_check: false,
        directory_discovery: false,
        vuln_assessment: false,
        remediation_validation: false,
        iam_audit: false,
      },
    },
  },
  {
    id: 'report-heavy',
    name: 'Report Snapshot',
    description: 'Run the workflow mainly to build a clean evidence package and export-ready report artifacts.',
    tags: ['reporting', 'snapshot'],
    workflowSlug: 'metis-smart-recon',
    input: {
      strict_evidence: true,
      optional_nodes: {
        github_hints: false,
        search_engine_recon: true,
        wayback: true,
        cti_exposure: false,
        hibp_scan: false,
        ping_check: false,
        directory_discovery: false,
        vuln_assessment: false,
        remediation_validation: false,
        iam_audit: false,
      },
      report: {
        template: 'metis-technical-recon',
        include_exports: ['json', 'pdf'],
      },
    },
  },
];

const WORKFLOW_HELP_STEPS = [
  {
    selector: '.workflows-help-header',
    title: 'Workflow purpose',
    body: 'Workflow engine orkestrira chaining: output jednog nodea postaje input sljedećeg, a cijeli run ostaje reviewable i resumable.',
    hint: 'Najčešći početak je `Metis Smart Recon` jer već pokriva discovery, validation, grouping i reporting.',
  },
  {
    selector: '.workflows-help-cases',
    title: 'Load a launch case',
    body: 'Ovi testni slučajevi pune launch input JSON i biraju zadani workflow tako da brzo provjeriš tipične scenarije bez ručnog sastavljanja payload-a.',
    hint: 'Ako scope još nije verificiran, kreni s passive baseline slučajem.',
  },
  {
    selector: '.workflows-help-library',
    title: 'Workflow definition',
    body: 'Ovdje biraš workflow, vidiš nodeove, faze i guardraile. Aktivni nodeovi jasno pokazuju da traže verified scope ili override.',
    hint: 'Prije pokretanja pogledaj je li neki korak označen kao optional ili verified-only.',
  },
  {
    selector: '.workflows-help-input',
    title: 'Launch input',
    body: 'Launch input kontrolira optional nodeove, evidence mode, resume-from-run ponašanje i dodatni report context bez mijenjanja samog workflow blueprints sloja.',
    hint: 'Ako nešto nije obavezno, isključi ga ovdje umjesto ručnog prekidanja workflowa.',
  },
  {
    selector: '.workflows-help-runs',
    title: 'Run history',
    body: 'Ovdje vidiš sve workflow runove za projekt, uključujući OVERRIDE badge kada je korišten emergency override s audit trailom.',
    hint: 'Pregled historyja je najbolji način da usporediš baseline i kasnije validated runove.',
  },
  {
    selector: '.workflows-help-detail',
    title: 'Run detail and context',
    body: 'Run detail prikazuje svaki step, njegov status, summary i kompletan context snapshot koji možeš dalje koristiti za report, AI i custom scripts.',
    hint: 'Ako workflow ne daje očekivani rezultat, prvo gledaj summary po stepovima pa tek onda sirovi context JSON.',
  },
];

function NodePill({ node }) {
  return (
    <div style={{ border: '1px solid #30363d', background: '#0d1117', padding: '8px 10px', minWidth: 180 }}>
      <div style={{ fontSize: 11, color: '#e6edf3', fontWeight: 600 }}>{node.ui_meta_json?.name || node.type}</div>
      <div style={{ fontSize: 10, color: '#8b949e', marginTop: 3 }}>{node.ui_meta_json?.short_description || node.type}</div>
      <div style={{ fontSize: 9, color: node.requires_verified_scope ? '#f0c040' : '#58a6ff', marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {node.execution_mode} {node.requires_verified_scope ? '· verified scope' : ''} {node.is_optional ? '· optional' : ''}
      </div>
    </div>
  );
}

export default function MetisWorkflows() {
  const { id } = useParams();
  const { token, user } = useAuth();

  const [project, setProject] = useState(null);
  const [workflows, setWorkflows] = useState([]);
  const [runs, setRuns] = useState([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [selectedRunId, setSelectedRunId] = useState('');
  const [selectedRun, setSelectedRun] = useState(null);
  const [inputJson, setInputJson] = useState('{\n  "strict_evidence": true\n}');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [projectRes, workflowsRes, runsRes] = await Promise.all([
        getProject(id, token),
        getWorkflows({ project_id: id }, token),
        getWorkflowRuns(id, {}, token),
      ]);

      const nextWorkflows = workflowsRes.data || [];
      const nextRuns = runsRes.data || [];
      setProject(projectRes?.data || projectRes);
      setWorkflows(nextWorkflows);
      setRuns(nextRuns);

      if (!selectedWorkflowId && nextWorkflows[0]?.id) {
        setSelectedWorkflowId(String(nextWorkflows[0].id));
      }

      const nextRunId = selectedRunId || (nextRuns[0]?.id ? String(nextRuns[0].id) : '');
      if (nextRunId) {
        setSelectedRunId(nextRunId);
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [id, token, selectedRunId, selectedWorkflowId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const active = runs.some((run) => ['queued', 'running'].includes(run.status));
    if (!active) return undefined;

    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [runs, load]);

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
        if (alive) setSelectedRun(null);
      });

    return () => {
      alive = false;
    };
  }, [id, selectedRunId, token]);

  const selectedWorkflow = useMemo(
    () => workflows.find((workflow) => String(workflow.id) === String(selectedWorkflowId)) || null,
    [workflows, selectedWorkflowId]
  );

  const loadCase = useCallback((workflowCase) => {
    const matched = workflows.find((workflow) => workflow.slug === workflowCase.workflowSlug);
    if (matched?.id) {
      setSelectedWorkflowId(String(matched.id));
    }
    setInputJson(JSON.stringify(workflowCase.input, null, 2));
  }, [workflows]);

  const launchWorkflow = async () => {
    setRunning(true);
    setError('');
    try {
      let parsedInput = {};
      try {
        parsedInput = inputJson.trim() ? JSON.parse(inputJson) : {};
      } catch (parseError) {
        throw new Error('Input JSON is invalid.');
      }

      const response = await createWorkflowRun(id, {
        workflow_id: Number(selectedWorkflowId),
        input: parsedInput,
      }, token);

      setSelectedRunId(String(response?.data?.id || ''));
      await load();
    } catch (e) {
      setError(e.message);
    }
    setRunning(false);
  };

  const doSync = async () => {
    setSyncing(true);
    setError('');
    try {
      await syncWorkflows(token);
      await load();
    } catch (e) {
      setError(e.message);
    }
    setSyncing(false);
  };

  if (loading) {
    return <div className="content" style={{ textAlign: 'center', padding: 60 }}><Spinner color="info" /></div>;
  }

  return (
    <div className="content">
      <div className="workflows-help-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h4 style={{ color: '#e6edf3', marginBottom: 4 }}>Workflow Engine</h4>
          <p style={{ color: '#8b949e', fontSize: 13, marginBottom: 0 }}>
            Modular chaining for passive recon, active validation, attack-surface grouping, reporting, and recommendation steps{project?.name ? ` for ${project.name}` : ''}.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <GuidedHelpTour
            title="Workflow Help"
            buttonLabel="Help"
            autoOpenOnce={false}
            steps={WORKFLOW_HELP_STEPS}
          />
          {user?.role !== 'Viewer' && (
            <>
              <Button size="sm" color="secondary" outline onClick={doSync} disabled={syncing}>
                {syncing ? <Spinner size="sm" /> : 'Sync Defaults'}
              </Button>
              <Link to={`/metis/projects/${id}/scripts`} className="btn btn-sm btn-outline-info">Scripts</Link>
              {user?.role === 'SuperAdmin' && <Link to={`/metis/projects/${id}/overrides`} className="btn btn-sm btn-outline-warning">Overrides</Link>}
            </>
          )}
        </div>
      </div>

      {error && <Alert color="danger" style={{ fontSize: 12 }}>{error}</Alert>}
      <Alert color="secondary" style={{ fontSize: 12 }}>
        <strong>How to use it:</strong> start passive, inspect the generated variables and grouped assets, enable active nodes only once scope is verified, then use the same run context for recommendations and reports. If Wayback fails, the workflow keeps moving and marks that step as optional history only.
      </Alert>

      <Row className="workflows-help-cases" style={{ marginBottom: 4 }}>
        {WORKFLOW_CASES.map((workflowCase) => (
          <Col key={workflowCase.id} xl={3} md={6} style={{ marginBottom: 16 }}>
            <Card style={{ background: '#161b22', border: '1px solid #30363d', height: '100%' }}>
              <CardBody style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {workflowCase.tags.map((tag) => (
                    <Badge key={tag} style={{ background: '#21262d', color: '#8b949e' }}>{tag}</Badge>
                  ))}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>{workflowCase.name}</div>
                <div style={{ fontSize: 11, color: '#8b949e', lineHeight: 1.7, flexGrow: 1 }}>{workflowCase.description}</div>
                <Button color="secondary" outline size="sm" onClick={() => loadCase(workflowCase)}>
                  Load Case
                </Button>
              </CardBody>
            </Card>
          </Col>
        ))}
      </Row>

      <Row>
        <Col lg={5} style={{ marginBottom: 20 }}>
          <Card className="workflows-help-library" style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8 }}>
            <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 18px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>Available Workflows</span>
            </CardHeader>
            <CardBody style={{ padding: 18 }}>
              <Input
                type="select"
                value={selectedWorkflowId}
                onChange={(event) => setSelectedWorkflowId(event.target.value)}
                style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 13, marginBottom: 14 }}
              >
                {workflows.map((workflow) => (
                  <option key={workflow.id} value={workflow.id}>{workflow.name}</option>
                ))}
              </Input>
              {selectedWorkflow && (
                <>
                  <div style={{ fontSize: 11, color: '#8b949e', lineHeight: 1.6, marginBottom: 14 }}>
                    {selectedWorkflow.description}
                  </div>
                  <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
                    {(selectedWorkflow.nodes || []).map((node) => <NodePill key={node.id} node={node} />)}
                  </div>
                  <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Launch Input
                  </div>
                  <Input
                    className="workflows-help-input"
                    type="textarea"
                    rows={10}
                    value={inputJson}
                    onChange={(event) => setInputJson(event.target.value)}
                    style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 12, fontFamily: 'monospace' }}
                  />
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
                    <Button color="info" disabled={running || !selectedWorkflowId} onClick={launchWorkflow}>
                      {running ? <Spinner size="sm" /> : 'Run Workflow'}
                    </Button>
                    <Link to={`/metis/projects/${id}/report`} style={{ fontSize: 11, color: '#58a6ff' }}>Open report builder →</Link>
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        </Col>

        <Col lg={7} style={{ marginBottom: 20 }}>
          <Card className="workflows-help-runs" style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, marginBottom: 20 }}>
            <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>Workflow Runs</span>
                <Input
                  type="select"
                  value={selectedRunId}
                  onChange={(event) => setSelectedRunId(event.target.value)}
                  style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 12, maxWidth: 260 }}
                >
                  <option value="">Select run…</option>
                  {runs.map((run) => (
                    <option key={run.id} value={run.id}>
                      #{run.id} · {run.workflow?.name || run.workflow?.slug} · {run.status}
                    </option>
                  ))}
                </Input>
              </div>
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
                        border: String(run.id) === String(selectedRunId) ? '1px solid #58a6ff' : '1px solid #30363d',
                        background: '#0d1117',
                        padding: '10px 12px',
                        color: '#c9d1d9',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                        <div style={{ fontSize: 12 }}>
                          #{run.id} · {run.workflow?.name || run.workflow?.slug}
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          {run.override && <Badge style={{ background: '#f0c04022', color: '#f0c040' }}>OVERRIDE</Badge>}
                          <Badge style={{ background: `${STATUS_COLORS[run.status] || '#8b949e'}22`, color: STATUS_COLORS[run.status] || '#8b949e' }}>
                            {run.status}
                          </Badge>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card className="workflows-help-detail" style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8 }}>
            <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 18px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>Run Detail</span>
            </CardHeader>
            <CardBody style={{ padding: 18 }}>
              {!selectedRun ? (
                <div style={{ fontSize: 12, color: '#555' }}>Select a workflow run to inspect nodes, variables, and evidence context.</div>
              ) : (
                <>
                  <div style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
                    {(selectedRun.steps || []).map((step) => (
                      <div key={step.id} style={{ border: '1px solid #30363d', background: '#0d1117', padding: '10px 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                          <div style={{ fontSize: 12, color: '#e6edf3' }}>{step.key}</div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            {step.used_override && <Badge style={{ background: '#f0c04022', color: '#f0c040' }}>OVERRIDE</Badge>}
                            <Badge style={{ background: `${STATUS_COLORS[step.status] || '#8b949e'}22`, color: STATUS_COLORS[step.status] || '#8b949e' }}>
                              {step.status}
                            </Badge>
                          </div>
                        </div>
                        {step.summary && (
                          <div style={{ fontSize: 11, color: '#8b949e', marginTop: 6, lineHeight: 1.6 }}>
                            {Object.entries(step.summary).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`).join(' · ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {selectedRun.context?.recommendations?.items && (
                    <Alert color="secondary" style={{ fontSize: 12 }}>
                      <strong>Recommended next steps:</strong>{' '}
                      {selectedRun.context.recommendations.items.map((item) => item.title || item.reason || item.id).join(' · ')}
                    </Alert>
                  )}
                  <div style={{ fontSize: 10, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                    Context Snapshot
                  </div>
                  <pre style={{ margin: 0, background: '#0d1117', color: '#c9d1d9', border: '1px solid #30363d', padding: 12, maxHeight: 320, overflow: 'auto', fontSize: 11 }}>
                    {JSON.stringify(selectedRun.context || {}, null, 2)}
                  </pre>
                </>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
