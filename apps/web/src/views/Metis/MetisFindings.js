import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from 'contexts/AuthContext';
import { getFindings, createFinding, updateFinding } from 'api/metisApi';
import {
  Row, Col, Card, CardBody, CardHeader, Button, Badge, Input, Spinner,
  Modal, ModalHeader, ModalBody, ModalFooter, Form, FormGroup, Label,
} from 'reactstrap';

const SEVERITY_COLORS = { critical: '#ff4444', high: '#ff8800', medium: '#ffcc00', low: '#44aaff', info: '#888' };
const STATUS_OPTIONS   = ['open', 'in_review', 'resolved', 'accepted_risk'];
const SEVERITY_OPTIONS = ['critical', 'high', 'medium', 'low', 'info'];

function FindingRow({ finding, onStatusChange, onSelect }) {
  const [updating, setUpdating] = useState(false);
  const sColor = SEVERITY_COLORS[finding.severity] || '#888';

  return (
    <tr style={{ borderBottom: '1px solid #21262d', cursor: 'pointer' }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(88,166,255,0.04)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <td style={{ padding: '10px 12px', width: 4 }}>
        <div style={{ width: 4, height: 32, borderRadius: 2, background: sColor }} />
      </td>
      <td style={{ padding: '10px 12px' }} onClick={() => onSelect(finding)}>
        <span style={{ fontSize: 13, color: '#e6edf3', fontWeight: 500 }}>{finding.title}</span>
        {finding.summary && <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{finding.summary.slice(0, 80)}…</div>}
      </td>
      <td style={{ padding: '10px 12px' }}>
        <Badge style={{ background: sColor + '22', color: sColor, fontSize: 10 }}>
          {finding.severity?.toUpperCase()}
        </Badge>
      </td>
      <td style={{ padding: '10px 12px', fontSize: 12, color: '#8b949e' }}>{finding.type}</td>
      <td style={{ padding: '10px 12px' }}>
        <Badge style={{
          background: finding.confidence === 'high' ? '#3fb95022' : '#21262d',
          color: finding.confidence === 'high' ? '#3fb950' : '#8b949e', fontSize: 10,
        }}>
          {finding.confidence}
        </Badge>
      </td>
      <td style={{ padding: '10px 12px' }}>
        <select
          value={finding.status}
          onChange={async e => {
            setUpdating(true);
            await onStatusChange(finding.id, e.target.value);
            setUpdating(false);
          }}
          onClick={e => e.stopPropagation()}
          style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 11, padding: '2px 6px', borderRadius: 4 }}
        >
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        {updating && <Spinner size="sm" style={{ marginLeft: 6, width: 10, height: 10 }} />}
      </td>
      <td style={{ padding: '10px 12px', fontSize: 11, color: '#555' }}>{finding.created_at?.slice(0, 10)}</td>
    </tr>
  );
}

export default function MetisFindings() {
  const { id }    = useParams();
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [findings,  setFindings]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState(searchParams.get('search') || '');
  const [severity,  setSeverity]  = useState('');
  const [status,    setStatus]    = useState('open');
  const [modal,     setModal]     = useState(false);
  const [selected,  setSelected]  = useState(null);
  const [form,      setForm]      = useState({ type: '', severity: 'medium', title: '', summary: '', confidence: 'medium' });
  const [saving,    setSaving]    = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getFindings(id, { search, severity, status }, token);
      setFindings(res.data || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [id, search, severity, status, token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setSearch(searchParams.get('search') || '');
  }, [searchParams]);

  const handleStatusChange = async (findingId, newStatus) => {
    await updateFinding(id, findingId, { status: newStatus }, token);
    load();
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createFinding(id, form, token);
      setModal(false);
      setForm({ type: '', severity: 'medium', title: '', summary: '', confidence: 'medium' });
      load();
    } catch (e) {
      alert('Failed to create finding: ' + e.message);
    }
    setSaving(false);
  };

  const countBySeverity = (sev) => findings.filter(f => f.severity === sev).length;

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h4 style={{ color: '#e6edf3', margin: 0 }}>Findings</h4>
          <p style={{ color: '#8b949e', fontSize: 13, marginTop: 4 }}>{findings.length} finding{findings.length !== 1 ? 's' : ''} shown</p>
        </div>
        <Button color="danger" outline onClick={() => setModal(true)} style={{ fontSize: 12 }}>
          <i className="fas fa-plus" style={{ marginRight: 6 }} />Log Finding
        </Button>
      </div>

      {/* Severity summary */}
      <Row style={{ marginBottom: 20 }}>
        {SEVERITY_OPTIONS.map(sev => (
          <Col key={sev} style={{ marginBottom: 10 }}>
            <div style={{
              background: '#161b22', border: `1px solid ${SEVERITY_COLORS[sev]}44`, borderRadius: 6,
              padding: '12px', textAlign: 'center', cursor: 'pointer',
              opacity: severity && severity !== sev ? 0.5 : 1,
            }}
            onClick={() => setSeverity(severity === sev ? '' : sev)}
            >
              <div style={{ fontSize: 22, fontWeight: 700, color: SEVERITY_COLORS[sev] }}>{countBySeverity(sev)}</div>
              <div style={{ fontSize: 11, color: '#8b949e', textTransform: 'capitalize', marginTop: 2 }}>{sev}</div>
            </div>
          </Col>
        ))}
      </Row>

      {/* Filters */}
      <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8 }}>
        <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '12px 18px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search findings…"
              onBlur={() => {
                const nextParams = new URLSearchParams(searchParams);
                if (search) nextParams.set('search', search);
                else nextParams.delete('search');
                setSearchParams(nextParams, { replace: true });
              }}
              style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 13, maxWidth: 280 }} />
            <Input type="select" value={severity} onChange={e => setSeverity(e.target.value)}
              style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 13, maxWidth: 160 }}>
              <option value="">All Severities</option>
              {SEVERITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </Input>
            <Input type="select" value={status} onChange={e => setStatus(e.target.value)}
              style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 13, maxWidth: 160 }}>
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </Input>
            {loading && <Spinner size="sm" color="info" />}
          </div>
        </CardHeader>
        <CardBody style={{ padding: 0 }}>
          {findings.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#555', fontSize: 13 }}>
              No findings match the current filters.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#0d1117' }}>
                    <th style={{ width: 4 }} />
                    {['Title', 'Severity', 'Type', 'Confidence', 'Status', 'Created'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', fontSize: 11, color: '#8b949e', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {findings.map(f => (
                    <FindingRow
                      key={f.id}
                      finding={f}
                      onStatusChange={handleStatusChange}
                      onSelect={setSelected}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Finding detail modal */}
      {selected && (
        <Modal isOpen={!!selected} toggle={() => setSelected(null)} size="lg">
          <ModalHeader toggle={() => setSelected(null)} style={{ background: '#161b22', color: '#e6edf3', borderBottom: '1px solid #30363d' }}>
            {selected.title}
          </ModalHeader>
          <ModalBody style={{ background: '#161b22', color: '#c9d1d9', fontSize: 13 }}>
            <p><strong>Type:</strong> {selected.type}</p>
            <p><strong>Severity:</strong> <span style={{ color: SEVERITY_COLORS[selected.severity] }}>{selected.severity}</span></p>
            <p><strong>Confidence:</strong> {selected.confidence}</p>
            <p><strong>Status:</strong> {selected.status}</p>
            {selected.summary && <p><strong>Summary:</strong><br />{selected.summary}</p>}
            {selected.evidence_json && (
              <div>
                <strong>Evidence:</strong>
                <pre style={{ fontSize: 11, background: '#0d1117', padding: 12, borderRadius: 4, marginTop: 8, overflowX: 'auto' }}>
                  {JSON.stringify(selected.evidence_json, null, 2)}
                </pre>
              </div>
            )}
          </ModalBody>
          <ModalFooter style={{ background: '#161b22', borderTop: '1px solid #30363d' }}>
            <Button color="secondary" outline onClick={() => setSelected(null)}>Close</Button>
          </ModalFooter>
        </Modal>
      )}

      {/* Create finding modal */}
      <Modal isOpen={modal} toggle={() => setModal(false)}>
        <Form onSubmit={handleCreate}>
          <ModalHeader toggle={() => setModal(false)} style={{ background: '#161b22', color: '#e6edf3', borderBottom: '1px solid #30363d' }}>
            Log Finding
          </ModalHeader>
          <ModalBody style={{ background: '#161b22' }}>
            {[
              { key: 'title',      label: 'Title *',     type: 'text',   required: true },
              { key: 'type',       label: 'Type *',      type: 'text',   required: true,  placeholder: 'misconfiguration, exposed_port, xss, sqli…' },
            ].map(f => (
              <FormGroup key={f.key}>
                <Label style={{ color: '#8b949e', fontSize: 12 }}>{f.label}</Label>
                <Input placeholder={f.placeholder} required={f.required} value={form[f.key]}
                  onChange={e => setForm(v => ({ ...v, [f.key]: e.target.value }))}
                  style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 13 }} />
              </FormGroup>
            ))}
            {[['severity', SEVERITY_OPTIONS], ['confidence', ['low', 'medium', 'high']]].map(([key, opts]) => (
              <FormGroup key={key}>
                <Label style={{ color: '#8b949e', fontSize: 12, textTransform: 'capitalize' }}>{key}</Label>
                <Input type="select" value={form[key]} onChange={e => setForm(v => ({ ...v, [key]: e.target.value }))}
                  style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 13 }}>
                  {opts.map(o => <option key={o} value={o}>{o}</option>)}
                </Input>
              </FormGroup>
            ))}
            <FormGroup>
              <Label style={{ color: '#8b949e', fontSize: 12 }}>Summary</Label>
              <Input type="textarea" rows={3} value={form.summary}
                onChange={e => setForm(v => ({ ...v, summary: e.target.value }))}
                style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 13 }} />
            </FormGroup>
          </ModalBody>
          <ModalFooter style={{ background: '#161b22', borderTop: '1px solid #30363d' }}>
            <Button color="secondary" outline onClick={() => setModal(false)}>Cancel</Button>
            <Button color="danger" type="submit" disabled={saving}>
              {saving ? <Spinner size="sm" /> : 'Log Finding'}
            </Button>
          </ModalFooter>
        </Form>
      </Modal>
    </div>
  );
}
