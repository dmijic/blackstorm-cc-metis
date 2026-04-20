import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from 'contexts/AuthContext';
import GuidedHelpTour from 'components/GuidedHelpTour';
import {
  createScriptTemplate,
  createScriptRun,
  duplicateScriptTemplate,
  getScriptRun,
  getScriptRuns,
  getScriptTemplates,
  interpretScriptRun,
  updateScriptTemplate,
} from 'api/metisApi';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Col, Input, Row, Spinner } from 'reactstrap';

const createEmptyTemplateForm = () => ({
  name: '',
  description: '',
  runtime: 'shell',
  timeout_seconds: 30,
  script_body: '',
  ai_prompt_template: '',
  input_schema_json: '{\n  "type": "object"\n}',
  output_schema_json: '{\n  "type": "object"\n}',
  allowed_target_types_json: '["domain", "host", "ip"]',
  execution_policy_json: '{\n  "sandbox": true,\n  "network": "none"\n}',
  environment_policy_json: '{\n  "allowed_env": ["METIS_INPUT_JSON"]\n}',
  network_policy_json: '{\n  "mode": "disabled"\n}',
});

const toPrettyJson = (value) => JSON.stringify(value, null, 2);

const SCRIPT_RUN_EXAMPLES = [
  {
    id: 'shared-ip-cluster',
    name: 'Shared IP Cluster',
    description: 'Smoke-test the shell template with multiple IPs that should later be grouped into one infra cluster.',
    templateSlug: 'ip-summary-shell',
    tags: ['shell', 'quick test'],
    input: {
      targets: ['198.51.100.10', '198.51.100.11', '198.51.100.12'],
      context: {
        purpose: 'shared_ip_cluster_review',
        source: 'attack_surface.grouped_assets',
      },
    },
  },
  {
    id: 'dns-host-handoff',
    name: 'DNS Handoff',
    description: 'Validate that a Python script can receive chained DNS and host variables from a workflow step.',
    templateSlug: 'json-shape-python',
    tags: ['python', 'workflow input'],
    input: {
      targets: ['app.example.com', 'api.example.com'],
      dns: {
        a_records: ['198.51.100.20'],
        aaaa_records: ['2001:db8::20'],
      },
      resolved: {
        host_ips: {
          'app.example.com': ['198.51.100.20'],
          'api.example.com': ['198.51.100.20', '2001:db8::20'],
        },
      },
    },
  },
  {
    id: 'web-surface-shape',
    name: 'Web Surface Shape',
    description: 'Feed a mixed host/API/admin payload and inspect whether the parsed JSON stays deterministic for later AI interpretation.',
    templateSlug: 'json-shape-python',
    tags: ['python', 'classification'],
    input: {
      targets: ['admin.example.com', 'docs.example.com', 'api.example.com'],
      host_services: {
        http: [
          { host: 'admin.example.com', class: 'admin/login', status: 200 },
          { host: 'docs.example.com', class: 'docs', status: 200 },
          { host: 'api.example.com', class: 'api', status: 401 },
        ],
      },
      findings: {
        items: [{ title: 'Admin panel exposed', severity: 'medium' }],
      },
    },
  },
  {
    id: 'tls-cert-review',
    name: 'TLS Cert Review',
    description: 'Test a structured cert reuse payload before sending the run to AI for an evidence-grounded summary.',
    templateSlug: 'ip-summary-shell',
    tags: ['shell', 'tls'],
    input: {
      targets: ['app.example.com', 'cdn.example.com'],
      tls: {
        certificates: [
          {
            fingerprint_sha1: 'cert-a',
            issuer: 'Let\'s Encrypt',
            hosts: ['app.example.com', 'cdn.example.com'],
            expires_at: '2026-06-30T00:00:00Z',
          },
        ],
      },
      recommendation_seed: 'cert_reuse_cluster_analysis',
    },
  },
];

const SCRIPT_HELP_STEPS = [
  {
    selector: '.scripts-help-header',
    title: 'What this screen is for',
    body: 'Scripts su sigurni sandbox moduli za vlastitu obradu rezultata: normalizaciju JSON-a, pretvaranje outputa u strukturirane varijable i AI interpretaciju dokaza.',
    hint: 'Najprije odluči radiš li samo test run ili želiš napraviti novi reusable template.',
  },
  {
    selector: '.scripts-help-examples',
    title: 'Load a test case',
    body: 'Ovdje imaš gotove testne slučajeve. Jednim klikom pune odabrani template i input JSON da možeš odmah provjeriti chaining bez ručnog pisanja payload-a.',
    hint: 'Ako prvi put koristiš modul, kreni s jednim od ovih primjera.',
  },
  {
    selector: '.scripts-help-library',
    title: 'Template library',
    body: 'Ovdje biraš postojeći template, vidiš runtime politike, allowed target tipove i možeš duplicirati system template prije uređivanja.',
    hint: 'System template ostaje read-only dok ga ne dupliciraš.',
  },
  {
    selector: '.scripts-help-input',
    title: 'Input binding',
    body: 'U ovaj JSON ulaze varijable iz workflowa ili ručno pripremljeni test payload. To je točno ono što će skripta dobiti kao `METIS_INPUT_JSON`.',
    hint: 'Drži input što manjim i relevantnim za provjeru jedne logike.',
  },
  {
    selector: '.scripts-help-editor',
    title: 'Template editor',
    body: 'Editor definira runtime, timeout, script body, schema-e i AI prompt. Time stvaraš reusable modul koji se kasnije može vezati u workflow node.',
    hint: 'Ako radiš novu skriptu, prvo spremi mali deterministic output pa je tek onda širi.',
  },
  {
    selector: '.scripts-help-runs',
    title: 'Run history',
    body: 'Svaki test ili produkcijski run ostaje zapisan. Odavde biraš konkretan run i vidiš njegov status bez ponovnog izvršavanja.',
    hint: 'Ako run ostane queued ili running, pričekaj auto-refresh prije novog pokretanja.',
  },
  {
    selector: '.scripts-help-output',
    title: 'Inspect raw and parsed output',
    body: 'Desno uspoređuješ parsed output, stdout, stderr i AI summary. To ti odmah pokaže je li skripta vratila stabilan JSON i ima li grešaka u runtimeu.',
    hint: 'Tek kad je parsed output dobar, ima smisla kliknuti `Ask AI`.',
  },
];

export default function MetisScripts() {
  const { id } = useParams();
  const { token, user } = useAuth();

  const [templates, setTemplates] = useState([]);
  const [runs, setRuns] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedRunId, setSelectedRunId] = useState('');
  const [selectedRun, setSelectedRun] = useState(null);
  const [inputJson, setInputJson] = useState('{\n  "targets": []\n}');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [interpreting, setInterpreting] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [error, setError] = useState('');
  const [templateForm, setTemplateForm] = useState(createEmptyTemplateForm);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [templatesRes, runsRes] = await Promise.all([
        getScriptTemplates({ project_id: id }, token),
        getScriptRuns(id, {}, token),
      ]);

      const nextTemplates = templatesRes.data || [];
      const nextRuns = runsRes.data || [];
      setTemplates(nextTemplates);
      setRuns(nextRuns);

      if (!selectedTemplateId && nextTemplates[0]?.id) {
        setSelectedTemplateId(String(nextTemplates[0].id));
      }

      if (!selectedRunId && nextRuns[0]?.id) {
        setSelectedRunId(String(nextRuns[0].id));
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [id, token, selectedRunId, selectedTemplateId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const active = runs.some((run) => ['queued', 'running'].includes(run.status));
    if (!active) return undefined;
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [runs, load]);

  useEffect(() => {
    if (!selectedRunId) {
      setSelectedRun(null);
      return;
    }

    let alive = true;
    getScriptRun(id, selectedRunId, token)
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

  const selectedTemplate = useMemo(
    () => templates.find((template) => String(template.id) === String(selectedTemplateId)) || null,
    [templates, selectedTemplateId]
  );

  useEffect(() => {
    if (!selectedTemplate) {
      return;
    }

    setTemplateForm({
      name: selectedTemplate.name || '',
      description: selectedTemplate.description || '',
      runtime: selectedTemplate.runtime || 'shell',
      timeout_seconds: selectedTemplate.timeout_seconds || 30,
      script_body: selectedTemplate.script_body || '',
      ai_prompt_template: selectedTemplate.ai_prompt_template || '',
      input_schema_json: toPrettyJson(selectedTemplate.input_schema_json || { type: 'object' }),
      output_schema_json: toPrettyJson(selectedTemplate.output_schema_json || { type: 'object' }),
      allowed_target_types_json: toPrettyJson(selectedTemplate.allowed_target_types_json || ['domain', 'host', 'ip']),
      execution_policy_json: toPrettyJson(selectedTemplate.execution_policy_json || { sandbox: true, network: 'none' }),
      environment_policy_json: toPrettyJson(selectedTemplate.environment_policy_json || { allowed_env: ['METIS_INPUT_JSON'] }),
      network_policy_json: toPrettyJson(selectedTemplate.network_policy_json || { mode: 'disabled' }),
    });
  }, [selectedTemplate]);

  const loadExample = useCallback((example) => {
    const matchingTemplate = templates.find((template) => template.slug === example.templateSlug);
    if (matchingTemplate?.id) {
      setSelectedTemplateId(String(matchingTemplate.id));
    }
    setInputJson(toPrettyJson(example.input));
  }, [templates]);

  const runTemplate = async () => {
    setRunning(true);
    setError('');
    try {
      const parsed = inputJson.trim() ? JSON.parse(inputJson) : {};
      const response = await createScriptRun(id, {
        template_id: Number(selectedTemplateId),
        input: parsed,
      }, token);
      setSelectedRunId(String(response?.data?.id || ''));
      await load();
    } catch (e) {
      setError(e.message);
    }
    setRunning(false);
  };

  const duplicateTemplate = async () => {
    if (!selectedTemplateId) return;
    setDuplicating(true);
    setError('');
    try {
      await duplicateScriptTemplate(selectedTemplateId, token);
      await load();
    } catch (e) {
      setError(e.message);
    }
    setDuplicating(false);
  };

  const interpretRun = async () => {
    if (!selectedRunId) return;
    setInterpreting(true);
    setError('');
    try {
      await interpretScriptRun(id, selectedRunId, token);
      const refreshed = await getScriptRun(id, selectedRunId, token);
      setSelectedRun(refreshed);
    } catch (e) {
      setError(e.message);
    }
    setInterpreting(false);
  };

  const parseJsonField = (value, fieldLabel) => {
    try {
      return value.trim() ? JSON.parse(value) : {};
    } catch (_) {
      throw new Error(`${fieldLabel} must be valid JSON.`);
    }
  };

  const saveTemplate = async (mode) => {
    setSavingTemplate(true);
    setError('');

    try {
      const payload = {
        project_id: Number(id),
        name: templateForm.name.trim(),
        description: templateForm.description.trim(),
        runtime: templateForm.runtime,
        timeout_seconds: Number(templateForm.timeout_seconds) || 30,
        script_body: templateForm.script_body,
        ai_prompt_template: templateForm.ai_prompt_template.trim(),
        input_schema_json: parseJsonField(templateForm.input_schema_json, 'Input schema'),
        output_schema_json: parseJsonField(templateForm.output_schema_json, 'Output schema'),
        allowed_target_types_json: parseJsonField(templateForm.allowed_target_types_json, 'Allowed target types'),
        execution_policy_json: parseJsonField(templateForm.execution_policy_json, 'Execution policy'),
        environment_policy_json: parseJsonField(templateForm.environment_policy_json, 'Environment policy'),
        network_policy_json: parseJsonField(templateForm.network_policy_json, 'Network policy'),
      };

      if (mode === 'update') {
        if (!selectedTemplateId || selectedTemplate?.is_system) {
          throw new Error('Select a non-system template to update it.');
        }

        await updateScriptTemplate(selectedTemplateId, payload, token);
      } else {
        const created = await createScriptTemplate(payload, token);
        setSelectedTemplateId(String(created?.data?.id || ''));
      }

      await load();
    } catch (e) {
      setError(e.message);
    }

    setSavingTemplate(false);
  };

  if (loading) {
    return <div className="content" style={{ textAlign: 'center', padding: 60 }}><Spinner color="info" /></div>;
  }

  return (
    <div className="content">
      <div
        className="scripts-help-header"
        style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap' }}
      >
        <div>
          <h4 style={{ color: '#e6edf3', marginBottom: 4 }}>Custom Scripts</h4>
          <p style={{ color: '#8b949e', fontSize: 13, marginBottom: 0 }}>
            Sandboxed shell/Python templates for structured post-processing, custom checks, and AI-backed result interpretation.
          </p>
        </div>
        <GuidedHelpTour
          title="Scripts Help"
          buttonLabel="Help"
          autoOpenOnce={false}
          steps={SCRIPT_HELP_STEPS}
        />
      </div>

      {error && <Alert color="danger" style={{ fontSize: 12 }}>{error}</Alert>}

      <Alert color="secondary" style={{ fontSize: 12 }}>
        <strong>Recommended flow:</strong> 1. load one test case below, 2. inspect the selected template policies, 3. run the script with a small JSON payload, 4. verify parsed output before trusting stdout, 5. duplicate and customize only after the baseline behaves predictably, 6. ask AI to summarize only grounded evidence.
      </Alert>

      <Row className="scripts-help-examples" style={{ marginBottom: 4 }}>
        {SCRIPT_RUN_EXAMPLES.map((example) => (
          <Col key={example.id} xl={3} md={6} style={{ marginBottom: 16 }}>
            <Card style={{ background: '#161b22', border: '1px solid #30363d', height: '100%' }}>
              <CardBody style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {example.tags.map((tag) => (
                    <Badge key={tag} style={{ background: '#21262d', color: '#8b949e' }}>{tag}</Badge>
                  ))}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>{example.name}</div>
                <div style={{ fontSize: 11, color: '#8b949e', lineHeight: 1.7, flexGrow: 1 }}>{example.description}</div>
                <div style={{ fontSize: 10, color: '#8b949e' }}>
                  Template: <span style={{ color: '#c9d1d9' }}>{example.templateSlug}</span>
                </div>
                <Button color="secondary" outline size="sm" onClick={() => loadExample(example)}>
                  Load Case
                </Button>
              </CardBody>
            </Card>
          </Col>
        ))}
      </Row>

      <Row>
        <Col lg={5} style={{ marginBottom: 20 }}>
          <Card className="scripts-help-library" style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8 }}>
            <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 18px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>Template Library</span>
            </CardHeader>
            <CardBody style={{ padding: 18 }}>
              <Input
                type="select"
                value={selectedTemplateId}
                onChange={(event) => setSelectedTemplateId(event.target.value)}
                style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 13, marginBottom: 14 }}
              >
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </Input>
              {selectedTemplate && (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    <Badge style={{ background: '#21262d', color: '#8b949e' }}>{selectedTemplate.runtime}</Badge>
                    {selectedTemplate.is_system && <Badge style={{ background: '#58a6ff22', color: '#58a6ff' }}>system</Badge>}
                    {selectedTemplate.enabled ? <Badge style={{ background: '#3fb95022', color: '#3fb950' }}>enabled</Badge> : <Badge style={{ background: '#f8514922', color: '#f85149' }}>disabled</Badge>}
                  </div>
                  <div style={{ fontSize: 11, color: '#8b949e', lineHeight: 1.6, marginBottom: 12 }}>
                    {selectedTemplate.description}
                  </div>
                  <div style={{ fontSize: 10, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                    Runtime Policies
                  </div>
                  <pre style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', padding: 12, fontSize: 11, maxHeight: 180, overflow: 'auto' }}>
                    {JSON.stringify({
                      input_schema: selectedTemplate.input_schema_json,
                      output_schema: selectedTemplate.output_schema_json,
                      execution_policy: selectedTemplate.execution_policy_json,
                      environment_policy: selectedTemplate.environment_policy_json,
                      network_policy: selectedTemplate.network_policy_json,
                    }, null, 2)}
                  </pre>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                    <Button color="info" onClick={runTemplate} disabled={running || !selectedTemplateId}>
                      {running ? <Spinner size="sm" /> : 'Test Run'}
                    </Button>
                    {(user?.role === 'Admin' || user?.role === 'SuperAdmin') && (
                      <Button color="secondary" outline onClick={duplicateTemplate} disabled={duplicating || !selectedTemplateId}>
                        {duplicating ? <Spinner size="sm" /> : 'Duplicate'}
                      </Button>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5, margin: '16px 0 6px' }}>
                    Input Binding
                  </div>
                  <Input
                    className="scripts-help-input"
                    type="textarea"
                    rows={9}
                    value={inputJson}
                    onChange={(event) => setInputJson(event.target.value)}
                    style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 11, fontFamily: 'monospace' }}
                  />
                </>
              )}
            </CardBody>
          </Card>

          {(user?.role === 'Admin' || user?.role === 'SuperAdmin') && (
            <Card className="scripts-help-editor" style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, marginTop: 20 }}>
              <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 18px' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>Template Editor</span>
              </CardHeader>
              <CardBody style={{ padding: 18 }}>
                {selectedTemplate?.is_system && (
                  <Alert color="secondary" style={{ fontSize: 12 }}>
                    System templates are read-only. Duplicate one first if you want to customize it.
                  </Alert>
                )}
                <Alert color="info" style={{ fontSize: 12 }}>
                  <strong>Step-by-step:</strong> give the template a narrow purpose, keep output deterministic JSON, declare the schema, then save and test with one of the cases above before connecting it to a workflow node.
                </Alert>
                <div style={{ display: 'grid', gap: 12 }}>
                  <Input
                    value={templateForm.name}
                    onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Template name"
                    style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 12 }}
                  />
                  <Input
                    value={templateForm.description}
                    onChange={(event) => setTemplateForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Short description"
                    style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 12 }}
                  />
                  <Row>
                    <Col md={6} style={{ marginBottom: 12 }}>
                      <Input
                        type="select"
                        value={templateForm.runtime}
                        onChange={(event) => setTemplateForm((current) => ({ ...current, runtime: event.target.value }))}
                        style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 12 }}
                      >
                        <option value="shell">shell</option>
                        <option value="python">python</option>
                      </Input>
                    </Col>
                    <Col md={6} style={{ marginBottom: 12 }}>
                      <Input
                        type="number"
                        min="5"
                        max="600"
                        value={templateForm.timeout_seconds}
                        onChange={(event) => setTemplateForm((current) => ({ ...current, timeout_seconds: event.target.value }))}
                        style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 12 }}
                      />
                    </Col>
                  </Row>
                  <Input
                    type="textarea"
                    rows={8}
                    value={templateForm.script_body}
                    onChange={(event) => setTemplateForm((current) => ({ ...current, script_body: event.target.value }))}
                    placeholder="Script body"
                    style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 11, fontFamily: 'monospace' }}
                  />
                  <Input
                    type="textarea"
                    rows={3}
                    value={templateForm.ai_prompt_template}
                    onChange={(event) => setTemplateForm((current) => ({ ...current, ai_prompt_template: event.target.value }))}
                    placeholder="AI interpretation prompt template"
                    style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 11 }}
                  />
                  {[
                    ['input_schema_json', 'Input Schema'],
                    ['output_schema_json', 'Output Schema'],
                    ['allowed_target_types_json', 'Allowed Target Types'],
                    ['execution_policy_json', 'Execution Policy'],
                    ['environment_policy_json', 'Environment Policy'],
                    ['network_policy_json', 'Network Policy'],
                  ].map(([key, label]) => (
                    <div key={key}>
                      <div style={{ fontSize: 10, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
                      <Input
                        type="textarea"
                        rows={4}
                        value={templateForm[key]}
                        onChange={(event) => setTemplateForm((current) => ({ ...current, [key]: event.target.value }))}
                        style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 11, fontFamily: 'monospace' }}
                      />
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button color="info" onClick={() => saveTemplate('create')} disabled={savingTemplate}>
                      {savingTemplate ? <Spinner size="sm" /> : 'Create Template'}
                    </Button>
                    <Button color="secondary" outline onClick={() => saveTemplate('update')} disabled={savingTemplate || selectedTemplate?.is_system}>
                      {savingTemplate ? <Spinner size="sm" /> : 'Update Selected'}
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}
        </Col>

        <Col lg={7} style={{ marginBottom: 20 }}>
          <Card className="scripts-help-runs" style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, marginBottom: 20 }}>
            <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>Script Runs</span>
                <Input
                  type="select"
                  value={selectedRunId}
                  onChange={(event) => setSelectedRunId(event.target.value)}
                  style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 12, maxWidth: 260 }}
                >
                  <option value="">Select run…</option>
                  {runs.map((run) => (
                    <option key={run.id} value={run.id}>#{run.id} · {run.template?.name} · {run.status}</option>
                  ))}
                </Input>
              </div>
            </CardHeader>
            <CardBody style={{ padding: 18 }}>
              {runs.length === 0 ? (
                <div style={{ fontSize: 12, color: '#555' }}>No script runs yet.</div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {runs.map((run) => (
                    <button
                      type="button"
                      key={run.id}
                      onClick={() => setSelectedRunId(String(run.id))}
                      style={{
                        textAlign: 'left',
                        border: String(run.id) === String(selectedRunId) ? '1px solid #58a6ff' : '1px solid #30363d',
                        background: '#0d1117',
                        color: '#c9d1d9',
                        padding: '10px 12px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: 12 }}>#{run.id} · {run.template?.name}</div>
                      <div style={{ fontSize: 10, color: '#8b949e', marginTop: 4 }}>{run.status}</div>
                    </button>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card className="scripts-help-output" style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8 }}>
            <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>Run Output</span>
              <Button color="info" outline size="sm" onClick={interpretRun} disabled={interpreting || !selectedRunId}>
                {interpreting ? <Spinner size="sm" /> : 'Ask AI'}
              </Button>
            </CardHeader>
            <CardBody style={{ padding: 18 }}>
              {!selectedRun ? (
                <div style={{ fontSize: 12, color: '#555' }}>Select a script run to inspect stdout, stderr, parsed output, and AI summary.</div>
              ) : (
                <div style={{ display: 'grid', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Parsed Output</div>
                    <pre style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', padding: 12, fontSize: 11, maxHeight: 180, overflow: 'auto' }}>
                      {JSON.stringify(selectedRun.data?.parsed_output_json || {}, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Stdout</div>
                    <pre style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', padding: 12, fontSize: 11, maxHeight: 140, overflow: 'auto' }}>
                      {selectedRun.stdout || '—'}
                    </pre>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Stderr</div>
                    <pre style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', padding: 12, fontSize: 11, maxHeight: 140, overflow: 'auto' }}>
                      {selectedRun.stderr || '—'}
                    </pre>
                  </div>
                  {selectedRun.data?.ai_summary_json && (
                    <Alert color="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
                      <strong>AI interpretation:</strong>
                      <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{selectedRun.data.ai_summary_json.content}</div>
                    </Alert>
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
