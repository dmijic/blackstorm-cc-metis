import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from 'contexts/AuthContext';
import { dispatchRun, getIntelHits, getModules, getRuns } from 'api/metisApi';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Col, Row, Spinner } from 'reactstrap';

const RUN_MODULES = [
  {
    key: 'github_public',
    name: 'GitHub Public Code Hints',
    runType: 'github_hints',
    connectorSlug: 'github_public',
    description: 'Public repo metadata and scope keyword matching for configured GitHub orgs.',
  },
  {
    key: 'hibp',
    name: 'HIBP Breach Monitor',
    runType: 'hibp_scan',
    connectorSlug: 'hibp',
    description: 'Scans configured email domains for public breach exposure without storing passwords.',
  },
  {
    key: 'shodan',
    name: 'CTI Exposure Feed',
    runType: 'cti_exposure',
    connectorSlug: 'shodan',
    description: 'Passive enrichment of discovered IPs with external exposure metadata.',
  },
  {
    key: 'directory_enum',
    name: 'Directory Discovery',
    runType: 'directory_enum',
    description: 'Verified-scope-only discovery of exposed backups, repos, and default endpoints.',
  },
  {
    key: 'vuln_assessment',
    name: 'Vuln Assessment',
    runType: 'vuln_assessment',
    description: 'Non-exploit heuristic assessment of headers, cookies, and risky exposed services.',
  },
  {
    key: 'remediation_validation',
    name: 'Remediation Validation',
    runType: 'remediation_validation',
    description: 'Re-checks previously recorded findings and auto-resolves controls that are no longer present.',
  },
  {
    key: 'iam_audit',
    name: 'IAM Audit',
    runType: 'iam_audit',
    description: 'Session/header policy review for auth-facing hosts in verified scope.',
  },
];

const BLOCKED_MODULES = [
  {
    key: 'simulated_phishing',
    name: 'Simulated Phishing',
    description: 'Research placeholder only. No executable phishing workflow is enabled in Metis.',
  },
  {
    key: 'post_exploitation_audit',
    name: 'Privilege Mapping / BloodHound',
    description: 'Research placeholder only. No post-exploitation collection or graphing workflow is enabled in Metis.',
  },
];

const RUN_TYPE_BY_MODULE = {
  github_public: 'github_hints',
  hibp: 'hibp_scan',
  shodan: 'cti_exposure',
  directory_enum: 'directory_enum',
  vuln_assessment: 'vuln_assessment',
  remediation_validation: 'remediation_validation',
  iam_audit: 'iam_audit',
};

function ModuleCard({ module, latestRun, onRun, running, disabled, reason }) {
  return (
    <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, height: '100%' }}>
      <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#e6edf3' }}>{module.name}</div>
            <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>{module.description}</div>
          </div>
          {module.connectorSlug && (
            <Badge style={{ background: module.configured ? '#3fb95022' : '#f0c04022', color: module.configured ? '#3fb950' : '#f0c040', fontSize: 10 }}>
              {module.configured ? 'configured' : 'needs setup'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardBody style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {latestRun ? (
          <div style={{ fontSize: 11, color: '#8b949e' }}>
            Last run: <span style={{ color: '#c9d1d9' }}>{latestRun.type.replace(/_/g, ' ')}</span> · {latestRun.status}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: '#555' }}>No module run yet.</div>
        )}
        {reason && <div style={{ fontSize: 11, color: '#f0c040' }}>{reason}</div>}
        <div style={{ marginTop: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button color="info" size="sm" disabled={disabled || running} onClick={onRun} style={{ fontSize: 11 }}>
            {running ? <Spinner size="sm" /> : 'Run Module'}
          </Button>
          {module.connectorSlug && (
            <Link to="/settings/modules" style={{ fontSize: 11, color: '#58a6ff' }}>
              Configure →
            </Link>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

export default function MetisModules() {
  const { id } = useParams();
  const { token } = useAuth();

  const [modules, setModules] = useState([]);
  const [hits, setHits] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [runningKey, setRunningKey] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [modulesResponse, hitsResponse, runsResponse] = await Promise.all([
        getModules(token),
        getIntelHits(id, { per_page: 20 }, token).catch(() => ({ data: [] })),
        getRuns(id, { per_page: 20 }, token).catch(() => ({ data: [] })),
      ]);

      setModules(modulesResponse.data || []);
      setHits(hitsResponse.data || []);
      setRuns(runsResponse.data || []);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [id, token]);

  useEffect(() => { load(); }, [load]);

  const moduleMap = useMemo(() => Object.fromEntries(modules.map(module => [module.slug, module])), [modules]);
  const latestRunByType = useMemo(() => {
    const map = {};
    runs.forEach(run => {
      if (!map[run.type]) map[run.type] = run;
    });
    return map;
  }, [runs]);

  const operationalModules = RUN_MODULES.map(module => {
    const connector = module.connectorSlug ? moduleMap[module.connectorSlug] : null;

    return {
      ...module,
      configured: connector ? connector.configured : true,
      enabled: connector ? connector.enabled : true,
    };
  });

  const runModule = async (module) => {
    setRunningKey(module.key);
    setError('');
    try {
      await dispatchRun(id, { type: module.runType, params: {} }, token);
      await load();
    } catch (e) {
      setError(e.data?.message || e.message);
    }
    setRunningKey('');
  };

  if (loading) {
    return <div className="content" style={{ textAlign: 'center', paddingTop: 60 }}><Spinner color="info" /></div>;
  }

  return (
    <div className="content">
      <div style={{ marginBottom: 24 }}>
        <h4 style={{ color: '#e6edf3', marginBottom: 4 }}>Modules</h4>
        <p style={{ color: '#8b949e', fontSize: 13, marginBottom: 0 }}>
          Verified-scope ASM, threat intel, and remediation modules for this project.
        </p>
      </div>

      {error && <Alert color="danger" style={{ fontSize: 12 }}>{error}</Alert>}

      <Row style={{ marginBottom: 20 }}>
        {operationalModules.map(module => {
          const latestRun = latestRunByType[RUN_TYPE_BY_MODULE[module.key]];
          const disabled = module.connectorSlug ? !module.configured || !module.enabled : false;
          const reason = module.connectorSlug && !module.configured
            ? 'Connector is not configured yet.'
            : module.connectorSlug && !module.enabled
              ? 'Connector exists but is disabled in settings.'
              : '';

          return (
            <Col key={module.key} md={6} xl={4} style={{ marginBottom: 18 }}>
              <ModuleCard
                module={module}
                latestRun={latestRun}
                onRun={() => runModule(module)}
                running={runningKey === module.key}
                disabled={disabled}
                reason={reason}
              />
            </Col>
          );
        })}
      </Row>

      <Row>
        <Col md={8} style={{ marginBottom: 20 }}>
          <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8 }}>
            <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 18px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>Threat Intel Hits</div>
            </CardHeader>
            <CardBody style={{ padding: 0 }}>
              {hits.length === 0 ? (
                <div style={{ padding: 30, color: '#555', fontSize: 12, textAlign: 'center' }}>
                  No CTI/HIBP hits yet. Run the HIBP or CTI modules after configuring connectors.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#0d1117' }}>
                        {['Provider', 'Type', 'Severity', 'Title', 'When'].map(header => (
                          <th key={header} style={{ padding: '10px 12px', fontSize: 11, color: '#8b949e', textAlign: 'left', textTransform: 'uppercase' }}>
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {hits.map(hit => (
                        <tr key={hit.id} style={{ borderBottom: '1px solid #21262d' }}>
                          <td style={{ padding: '10px 12px', fontSize: 11, color: '#c9d1d9' }}>{hit.provider_type}</td>
                          <td style={{ padding: '10px 12px', fontSize: 11, color: '#8b949e' }}>{hit.hit_type}</td>
                          <td style={{ padding: '10px 12px', fontSize: 11, color: '#c9d1d9' }}>{hit.severity}</td>
                          <td style={{ padding: '10px 12px', fontSize: 12, color: '#e6edf3' }}>{hit.title}</td>
                          <td style={{ padding: '10px 12px', fontSize: 11, color: '#555' }}>{hit.discovered_at?.slice(0, 16) || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </Col>

        <Col md={4} style={{ marginBottom: 20 }}>
          <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8 }}>
            <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 18px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>Guardrailed Placeholders</div>
            </CardHeader>
            <CardBody style={{ padding: 18 }}>
              {BLOCKED_MODULES.map(module => (
                <div key={module.key} style={{ paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid #21262d' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#e6edf3' }}>{module.name}</div>
                  <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>{module.description}</div>
                  <Badge style={{ marginTop: 8, background: '#f8514922', color: '#f85149', fontSize: 10 }}>
                    disabled in this build
                  </Badge>
                </div>
              ))}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
