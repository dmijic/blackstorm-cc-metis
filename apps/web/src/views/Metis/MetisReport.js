import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from 'contexts/AuthContext';
import { getReportJson, getAiSummary } from 'api/metisApi';
import { Row, Col, Card, CardBody, CardHeader, Button, Badge, Spinner, Alert } from 'reactstrap';

const SEVERITY_COLORS = { critical: '#ff4444', high: '#ff8800', medium: '#ffcc00', low: '#44aaff', info: '#888' };

function StatBlock({ value, label, color }) {
  return (
    <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: '20px', textAlign: 'center' }}>
      <div style={{ fontSize: 32, fontWeight: 700, color: color || '#58a6ff' }}>{value ?? '—'}</div>
      <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default function MetisReport() {
  const { id }    = useParams();
  const { token } = useAuth();
  const [searchParams] = useSearchParams();

  const [report,     setReport]     = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [aiSummary,  setAiSummary]  = useState('');
  const [aiLoading,  setAiLoading]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getReportJson(id, token);
      setReport(res);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [id, token]);

  useEffect(() => { load(); }, [load]);
  const fetchAi = useCallback(async () => {
    setAiLoading(true);
    try {
      const res = await getAiSummary(id, token);
      setAiSummary(res.summary);
    } catch (e) {
      setAiSummary('AI summary unavailable: ' + e.message);
    }
    setAiLoading(false);
  }, [id, token]);

  useEffect(() => {
    if (searchParams.get('ai') === '1' && !aiSummary && !aiLoading) {
      fetchAi();
    }
  }, [searchParams, aiSummary, aiLoading, fetchAi]);

  const downloadJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `metis-report-${id}.json`; a.click();
  };

  const downloadHtml = async () => {
    try {
      const baseUrl = import.meta.env.VITE_API_URL || '/api';
      const response = await fetch(`${baseUrl}/metis/projects/${id}/report/html?ai_summary=${!!aiSummary}`, {
        headers: {
          Accept: 'text/html',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to generate HTML report.');
      }

      const html = await response.text();
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      alert(e.message);
    }
  };

  const downloadPdf = async () => {
    try {
      const baseUrl = import.meta.env.VITE_API_URL || '/api';
      const response = await fetch(`${baseUrl}/metis/projects/${id}/report/pdf?ai_summary=${!!aiSummary}`, {
        headers: {
          Accept: 'application/pdf',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF report.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `metis-report-${id}.pdf`;
      a.click();
    } catch (e) {
      alert(e.message);
    }
  };

  if (loading) return <div className="content" style={{ textAlign: 'center', padding: 60 }}><Spinner color="info" /></div>;

  const stats = report?.statistics || {};
  const findings = report?.findings || [];
  const hosts = report?.surface_map?.hosts || [];
  const intelHits = report?.intel_hits || [];

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h4 style={{ color: '#e6edf3', margin: 0 }}>Security Report</h4>
          <p style={{ color: '#8b949e', fontSize: 13, marginTop: 4 }}>
            Generated: {report?.meta?.generated_at?.slice(0, 16)} UTC
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button color="secondary" outline onClick={downloadJson} style={{ fontSize: 12 }}>
            <i className="fas fa-download" style={{ marginRight: 6 }} />JSON
          </Button>
          <Button color="info" outline onClick={downloadHtml} style={{ fontSize: 12 }}>
            <i className="fas fa-file-alt" style={{ marginRight: 6 }} />HTML Report
          </Button>
          <Button color="info" onClick={downloadPdf} style={{ fontSize: 12 }}>
            <i className="fas fa-file-pdf" style={{ marginRight: 6 }} />PDF Report
          </Button>
        </div>
      </div>

      {/* AI Executive Brief */}
      <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, marginBottom: 24 }}>
        <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>
            <i className="fas fa-robot" style={{ color: '#58a6ff', marginRight: 8 }} />AI Executive Brief
          </span>
          <Button size="sm" color="info" outline onClick={fetchAi} disabled={aiLoading} style={{ fontSize: 11 }}>
            {aiLoading ? <><Spinner size="sm" style={{ width: 12, height: 12 }} /> Analyzing…</> : '✦ Generate Brief'}
          </Button>
        </CardHeader>
        <CardBody style={{ padding: 20 }}>
          {aiSummary ? (
            <div style={{ fontSize: 13, color: '#c9d1d9', lineHeight: 1.8, whiteSpace: 'pre-wrap',
              borderLeft: '3px solid #58a6ff', paddingLeft: 16 }}>
              {aiSummary}
            </div>
          ) : (
            <div style={{ color: '#555', fontSize: 13, fontStyle: 'italic' }}>
              Click "Generate Brief" to get an AI-powered executive summary of this project's attack surface.
            </div>
          )}
        </CardBody>
      </Card>

      {/* Stats */}
      <Row style={{ marginBottom: 24 }}>
        {[
          { value: stats.total_domains,    label: 'Total Domains',      color: '#4fc3f7' },
          { value: stats.live_hosts,       label: 'Live Hosts',         color: '#81c784' },
          { value: stats.total_urls,       label: 'Historical URLs',    color: '#ffb74d' },
          { value: stats.critical_findings,label: 'Critical Findings',  color: '#ff4444' },
          { value: stats.high_findings,    label: 'High Findings',      color: '#ff8800' },
          { value: stats.open_findings,    label: 'Open Findings',      color: '#ef5350' },
        ].map(s => (
          <Col key={s.label} md={4} lg={2} style={{ marginBottom: 16 }}>
            <StatBlock {...s} />
          </Col>
        ))}
      </Row>

      <Row>
        {/* Findings table */}
        <Col md={7} style={{ marginBottom: 24 }}>
          <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8 }}>
            <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 18px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>Findings</span>
            </CardHeader>
            <CardBody style={{ padding: 0, maxHeight: 400, overflowY: 'auto' }}>
              {findings.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: '#555', fontSize: 13 }}>No findings recorded.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#0d1117' }}>
                      {['Severity', 'Title', 'Type', 'Status'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', fontSize: 11, color: '#8b949e', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {findings.map(f => (
                      <tr key={f.id} style={{ borderBottom: '1px solid #21262d' }}>
                        <td style={{ padding: '8px 12px' }}>
                          <Badge style={{ background: SEVERITY_COLORS[f.severity] + '22', color: SEVERITY_COLORS[f.severity], fontSize: 10 }}>
                            {f.severity}
                          </Badge>
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: 12, color: '#e6edf3' }}>{f.title}</td>
                        <td style={{ padding: '8px 12px', fontSize: 11, color: '#8b949e' }}>{f.type}</td>
                        <td style={{ padding: '8px 12px', fontSize: 11, color: '#555' }}>{f.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>
        </Col>

        {/* Live hosts */}
        <Col md={5} style={{ marginBottom: 24 }}>
          <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8 }}>
            <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 18px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>
                <i className="fas fa-server" style={{ color: '#81c784', marginRight: 6 }} />Live Hosts
              </span>
            </CardHeader>
            <CardBody style={{ padding: 0, maxHeight: 400, overflowY: 'auto' }}>
              {hosts.filter(h => h.is_live).length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: '#555', fontSize: 13 }}>No live hosts.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#0d1117' }}>
                      {['Host', 'IP', 'Status', 'Title'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', fontSize: 11, color: '#8b949e', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {hosts.filter(h => h.is_live).map(h => (
                      <tr key={h.hostname} style={{ borderBottom: '1px solid #21262d' }}>
                        <td style={{ padding: '8px 12px', fontSize: 11, color: '#e6edf3', fontFamily: 'monospace' }}>{h.hostname}</td>
                        <td style={{ padding: '8px 12px', fontSize: 11, color: '#555' }}>{h.ip}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <Badge style={{ background: h.status < 400 ? '#3fb95022' : '#f8514922', color: h.status < 400 ? '#3fb950' : '#f85149', fontSize: 10 }}>
                            {h.status}
                          </Badge>
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: 11, color: '#8b949e', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {h.title || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>

      {/* Scope */}
      <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8 }}>
        <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 18px' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>Scope</span>
        </CardHeader>
        <CardBody style={{ padding: 20 }}>
          {[
            ['Root Domains', report?.scope?.root_domains],
            ['IP Ranges',    report?.scope?.ip_ranges],
            ['GitHub Orgs',  report?.scope?.github_orgs],
            ['Email Domains',report?.scope?.email_domains],
          ].map(([label, items]) => (
            items?.length > 0 && (
              <div key={label} style={{ marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: '#8b949e', marginRight: 12 }}>{label}:</span>
                {items.map(i => (
                  <Badge key={i} style={{ background: '#21262d', color: '#c9d1d9', fontSize: 11, marginRight: 6, marginBottom: 4 }}>{i}</Badge>
                ))}
              </div>
            )
          ))}
        </CardBody>
      </Card>

      <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, marginTop: 24 }}>
        <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 18px' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>Threat Intel</span>
        </CardHeader>
        <CardBody style={{ padding: 20 }}>
          {intelHits.length === 0 ? (
            <div style={{ color: '#555', fontSize: 12 }}>No HIBP/CTI hits recorded for this project.</div>
          ) : (
            intelHits.slice(0, 10).map(hit => (
              <div key={hit.id} style={{ padding: '8px 0', borderBottom: '1px solid #21262d' }}>
                <div style={{ fontSize: 12, color: '#e6edf3' }}>{hit.title}</div>
                <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>
                  {hit.provider_type} · {hit.hit_type} · {hit.severity}
                </div>
              </div>
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}
