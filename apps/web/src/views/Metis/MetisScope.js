import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from 'contexts/AuthContext';
import { getScope, updateScope, initiateVerify, checkVerify } from 'api/metisApi';
import {
  Row, Col, Card, CardBody, CardHeader, Button, Input, Badge, Spinner,
  Alert, Nav, NavItem, NavLink, TabContent, TabPane,
} from 'reactstrap';

const SCOPE_FIELDS = [
  { key: 'root_domains',     label: 'Root Domains',          placeholder: 'example.com, example.org', help: 'Top-level domains you own. Each must be verified before active scans.' },
  { key: 'brand_keywords',   label: 'Brand Keywords',        placeholder: 'acme, acmecorp',           help: 'Used for GitHub/leak searches.' },
  { key: 'known_subdomains', label: 'Known Subdomains',      placeholder: 'api.example.com, app.example.com', help: 'Pre-known subdomains to seed discovery.' },
  { key: 'ip_ranges',        label: 'IP Ranges (CIDR)',       placeholder: '10.0.0.0/8, 192.168.1.0/24',      help: 'IP ranges you control. Port scans run only here.' },
  { key: 'github_orgs',      label: 'GitHub Organizations',  placeholder: 'acmecorp, acme-dev',       help: 'Public GitHub orgs to scan for code hints.' },
  { key: 'email_domains',    label: 'Email Domains',         placeholder: 'example.com',              help: 'Used for credential leak monitoring.' },
];

function ScopeField({ fieldKey, label, placeholder, help, value, onChange }) {
  const text = (value || []).join(', ');
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ fontSize: 12, color: '#8b949e', fontWeight: 600, display: 'block', marginBottom: 6 }}>
        {label}
        <span style={{ fontSize: 10, color: '#555', fontWeight: 400, marginLeft: 8 }}>{help}</span>
      </label>
      <Input
        type="textarea"
        rows={2}
        placeholder={placeholder}
        value={text}
        onChange={e => {
          const arr = e.target.value.split(',').map(v => v.trim()).filter(Boolean);
          onChange(fieldKey, arr);
        }}
        style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 13, resize: 'vertical' }}
      />
    </div>
  );
}

function VerificationBadge({ status }) {
  const configs = {
    verified: { color: '#3fb950', bg: '#3fb95022', label: '✓ Verified' },
    pending:  { color: '#f0c040', bg: '#f0c04022', label: '⏳ Pending' },
    failed:   { color: '#f85149', bg: '#f8514922', label: '✗ Failed' },
  };
  const c = configs[status] || configs.pending;
  return (
    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: c.bg, color: c.color, fontWeight: 600 }}>
      {c.label}
    </span>
  );
}

export default function MetisScope() {
  const { id }    = useParams();
  const { token } = useAuth();

  const [scope,         setScope]         = useState({});
  const [verifications, setVerifications] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(false);
  const [tab,           setTab]           = useState('scope');

  // Verification form
  const [verifyDomain, setVerifyDomain] = useState('');
  const [verifyMethod, setVerifyMethod] = useState('dns_txt');
  const [verifyResult, setVerifyResult] = useState(null);
  const [checking,     setChecking]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getScope(id, token);
      setScope(res.data || {});
      setVerifications(res.verifications || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [id, token]);

  useEffect(() => { load(); }, [load]);

  const handleFieldChange = (key, val) => setScope(s => ({ ...s, [key]: val }));

  const save = async () => {
    setSaving(true);
    try {
      await updateScope(id, scope, token);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      alert('Save failed: ' + e.message);
    }
    setSaving(false);
  };

  const startVerification = async () => {
    if (!verifyDomain.trim()) return;
    try {
      const res = await initiateVerify(id, { domain: verifyDomain, method: verifyMethod }, token);
      setVerifyResult(res);
      load();
    } catch (e) {
      alert('Failed to initiate: ' + e.message);
    }
  };

  const runCheck = async (verification) => {
    setChecking(verification.id);
    try {
      const res = await checkVerify(id, verification.id, token);
      if (res.verified) {
        alert(`✓ Domain ${verification.domain} verified successfully!`);
      } else {
        alert(`✗ Verification failed for ${verification.domain}. Check the record and try again.`);
      }
      load();
    } catch (e) {
      alert('Check failed: ' + e.message);
    }
    setChecking(null);
  };

  if (loading) return <div className="content" style={{ textAlign: 'center', padding: 60 }}><Spinner color="info" /></div>;

  return (
    <div className="content">
      <h4 style={{ color: '#e6edf3', marginBottom: 4 }}>Scope Editor</h4>
      <p style={{ color: '#8b949e', fontSize: 13, marginBottom: 24 }}>
        Define the authorized attack surface. Passive discovery can run immediately; active scans only run against verified domains or approved IP ranges.
      </p>

      <Nav tabs style={{ borderBottom: '1px solid #30363d', marginBottom: 20 }}>
        {['scope', 'verification'].map(t => (
          <NavItem key={t}>
            <NavLink
              onClick={() => setTab(t)}
              style={{
                color: tab === t ? '#58a6ff' : '#8b949e',
                borderBottom: tab === t ? '2px solid #58a6ff' : '2px solid transparent',
                borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                background: 'none', cursor: 'pointer', fontSize: 13, padding: '8px 16px', textTransform: 'capitalize',
              }}
            >
              {t === 'scope' ? 'Scope Definition' : 'Domain Verification'}
            </NavLink>
          </NavItem>
        ))}
      </Nav>

      <TabContent activeTab={tab}>
        {/* Scope definition tab */}
        <TabPane tabId="scope">
          <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8 }}>
            <CardBody style={{ padding: 24 }}>
              {SCOPE_FIELDS.map(f => (
                <ScopeField
                  key={f.key}
                  fieldKey={f.key}
                  label={f.label}
                  placeholder={f.placeholder}
                  help={f.help}
                  value={scope[f.key]}
                  onChange={handleFieldChange}
                />
              ))}
              {saved && <Alert color="success" style={{ fontSize: 12, padding: '8px 16px' }}>Scope saved.</Alert>}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button color="info" onClick={save} disabled={saving} style={{ fontSize: 12 }}>
                  {saving ? <Spinner size="sm" /> : 'Save Scope'}
                </Button>
              </div>
            </CardBody>
          </Card>
        </TabPane>

        {/* Verification tab */}
        <TabPane tabId="verification">
          <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, marginBottom: 20 }}>
            <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 20px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>Initiate Domain Verification</span>
            </CardHeader>
            <CardBody style={{ padding: 20 }}>
              <p style={{ fontSize: 12, color: '#8b949e', marginBottom: 16 }}>
                Active probes (HTTP probe, port scan, directory enum) run only on verified domains.
                Verify by adding a DNS TXT record or serving a file at a well-known path.
              </p>
              <Row>
                <Col md={5}>
                  <label style={{ fontSize: 12, color: '#8b949e', display: 'block', marginBottom: 4 }}>Domain</label>
                  <Input
                    value={verifyDomain}
                    onChange={e => setVerifyDomain(e.target.value)}
                    placeholder="example.com"
                    style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 13 }}
                  />
                </Col>
                <Col md={3}>
                  <label style={{ fontSize: 12, color: '#8b949e', display: 'block', marginBottom: 4 }}>Method</label>
                  <Input
                    type="select"
                    value={verifyMethod}
                    onChange={e => setVerifyMethod(e.target.value)}
                    style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 13 }}
                  >
                    <option value="dns_txt">DNS TXT Record</option>
                    <option value="well_known">Well-Known File</option>
                  </Input>
                </Col>
                <Col md={4} style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <Button color="info" onClick={startVerification} style={{ fontSize: 12, width: '100%' }}>
                    Generate Token
                  </Button>
                </Col>
              </Row>

              {verifyResult && (
                <Alert color="info" style={{ marginTop: 16, fontSize: 12 }}>
                  <strong>Instructions:</strong> {verifyResult.instructions}
                  <br />
                  <strong>Token:</strong> <code style={{ fontSize: 11 }}>{verifyResult.data?.token}</code>
                </Alert>
              )}
            </CardBody>
          </Card>

          {/* Existing verifications */}
          <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8 }}>
            <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 20px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>Domain Verifications</span>
            </CardHeader>
            <CardBody style={{ padding: 0 }}>
              {verifications.length === 0 ? (
                <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: 30 }}>
                  No verification requests yet.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#0d1117' }}>
                      {['Domain', 'Method', 'Status', 'Verified At', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', fontSize: 11, color: '#8b949e', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {verifications.map(v => (
                      <tr key={v.id} style={{ borderBottom: '1px solid #21262d' }}>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: '#e6edf3' }}>{v.domain}</td>
                        <td style={{ padding: '10px 16px', fontSize: 12, color: '#8b949e' }}>{v.method}</td>
                        <td style={{ padding: '10px 16px' }}><VerificationBadge status={v.status} /></td>
                        <td style={{ padding: '10px 16px', fontSize: 11, color: '#555' }}>{v.verified_at?.slice(0, 16) || '—'}</td>
                        <td style={{ padding: '10px 16px' }}>
                          {v.status !== 'verified' && (
                            <Button
                              size="sm" color="info" outline
                              onClick={() => runCheck(v)}
                              disabled={checking === v.id}
                              style={{ fontSize: 11 }}
                            >
                              {checking === v.id ? <Spinner size="sm" /> : 'Check Now'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>
        </TabPane>
      </TabContent>
    </div>
  );
}
