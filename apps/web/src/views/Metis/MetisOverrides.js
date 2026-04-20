import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from 'contexts/AuthContext';
import { createOverride, getOverrideOptions, getOverrides } from 'api/metisApi';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Col, Input, Row, Spinner } from 'reactstrap';

function optionGroups(options) {
  return [
    ['Domains & DNS', options?.targets?.domains || []],
    ['Hosts', options?.targets?.hosts || []],
    ['IP Addresses', options?.targets?.ips || []],
  ].filter(([, items]) => items.length > 0);
}

export default function MetisOverrides() {
  const { id } = useParams();
  const { token, user } = useAuth();
  const isSuperAdmin = user?.role === 'SuperAdmin';

  const [overrides, setOverrides] = useState([]);
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedTargets, setSelectedTargets] = useState([]);
  const [filterType, setFilterType] = useState('all');
  const [form, setForm] = useState({
    run_type: 'http_probe',
    reason: '',
    target_summary: '',
    one_time: true,
    expires_at: '',
    confirmation_text: 'OVERRIDE',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [overrideRes, optionsRes] = await Promise.all([
        getOverrides(id, {}, token),
        getOverrideOptions(id, token),
      ]);
      setOverrides(overrideRes.data || []);
      setOptions(optionsRes.data || null);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [id, token]);

  useEffect(() => {
    if (isSuperAdmin) {
      load();
    } else {
      setLoading(false);
    }
  }, [isSuperAdmin, load]);

  useEffect(() => {
    if (selectedTargets.length === 0) {
      return;
    }

    setForm((current) => ({
      ...current,
      target_summary: `${current.run_type || 'override'} on ${selectedTargets.length} approved target${selectedTargets.length === 1 ? '' : 's'}`,
    }));
  }, [selectedTargets, form.run_type]);

  const visibleTargets = useMemo(() => {
    const all = options?.targets?.all || [];
    if (filterType === 'all') {
      return all;
    }

    return all.filter((item) => item.type === filterType || (filterType === 'domain_or_host' && item.type === 'domain_or_host'));
  }, [filterType, options]);

  const submit = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await createOverride(id, {
        ...form,
        targets: selectedTargets,
        expires_at: form.expires_at || null,
      }, token);
      setSuccess('Emergency override created.');
      setSelectedTargets([]);
      setForm({
        run_type: 'http_probe',
        reason: '',
        target_summary: '',
        one_time: true,
        expires_at: '',
        confirmation_text: 'OVERRIDE',
      });
      await load();
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  };

  if (!isSuperAdmin) {
    return (
      <div className="content">
        <Alert color="warning" style={{ fontSize: 12 }}>
          Emergency override is visible only to SuperAdmin.
        </Alert>
      </div>
    );
  }

  if (loading) {
    return <div className="content" style={{ textAlign: 'center', padding: 60 }}><Spinner color="info" /></div>;
  }

  return (
    <div className="content">
      <div style={{ marginBottom: 20 }}>
        <h4 style={{ color: '#e6edf3', marginBottom: 4 }}>Emergency Override</h4>
        <p style={{ color: '#8b949e', fontSize: 13, marginBottom: 0 }}>
          Per-run exception flow for SuperAdmin. Targets must come from already discovered or scoped project inventory.
        </p>
      </div>

      {error && <Alert color="danger" style={{ fontSize: 12 }}>{error}</Alert>}
      {success && <Alert color="success" style={{ fontSize: 12 }}>{success}</Alert>}
      <Alert color="warning" style={{ fontSize: 12 }}>
        <strong>Guardrail:</strong> override ne može ciljati ništa izvan postojećeg scope/discovery inventara projekta. Backend to dodatno provjerava prije spremanja i prije korištenja overridea.
      </Alert>

      <Row>
        <Col lg={5} style={{ marginBottom: 20 }}>
          <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8 }}>
            <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 18px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>Create Override</span>
            </CardHeader>
            <CardBody style={{ padding: 18 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Run Type</div>
                <Input
                  type="select"
                  value={form.run_type}
                  onChange={(event) => setForm((current) => ({ ...current, run_type: event.target.value }))}
                  style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 12 }}
                >
                  {(options?.run_types || []).map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </Input>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6, alignItems: 'center' }}>
                  <div style={{ fontSize: 10, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5 }}>Approved Targets</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[
                      ['all', 'All'],
                      ['domain_or_host', 'DNS'],
                      ['host', 'Hosts'],
                      ['ip', 'IPs'],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setFilterType(value)}
                        style={{
                          background: filterType === value ? 'rgba(79,195,247,0.12)' : 'transparent',
                          color: filterType === value ? '#4fc3f7' : '#8b949e',
                          border: `1px solid ${filterType === value ? '#4fc3f7' : '#30363d'}`,
                          padding: '2px 8px',
                          fontSize: 10,
                          cursor: 'pointer',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <Input
                  type="select"
                  multiple
                  value={selectedTargets}
                  onChange={(event) => {
                    const values = Array.from(event.target.selectedOptions).map((option) => option.value);
                    setSelectedTargets(values);
                  }}
                  style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 12, minHeight: 220 }}
                >
                  {optionGroups({
                    targets: {
                      domains: filterType === 'all' || filterType === 'domain_or_host' ? options?.targets?.domains : [],
                      hosts: filterType === 'all' || filterType === 'host' ? options?.targets?.hosts : [],
                      ips: filterType === 'all' || filterType === 'ip' ? options?.targets?.ips : [],
                    },
                  }).map(([label, items]) => (
                    <optgroup key={label} label={label}>
                      {items.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </Input>
                <div style={{ fontSize: 10, color: '#6e7681', marginTop: 6 }}>
                  Drži `Cmd` ili `Ctrl` za višestruki odabir. Dostupne su samo IP adrese, poddomene i DNS entiteti već vezani uz projekt.
                </div>
              </div>

              {selectedTargets.length > 0 && (
                <div style={{ marginBottom: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {selectedTargets.map((target) => (
                    <Badge key={target} style={{ background: '#21262d', color: '#c9d1d9' }}>{target}</Badge>
                  ))}
                </div>
              )}

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Target Summary</div>
                <Input
                  value={form.target_summary}
                  onChange={(event) => setForm((current) => ({ ...current, target_summary: event.target.value }))}
                  placeholder="Short audited summary of this exception"
                  style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 12 }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Reason</div>
                <Input
                  type="textarea"
                  rows={4}
                  value={form.reason}
                  onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
                  placeholder="Why this authorized exception is needed."
                  style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 12 }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Expires At (optional)</div>
                <Input
                  value={form.expires_at}
                  onChange={(event) => setForm((current) => ({ ...current, expires_at: event.target.value }))}
                  placeholder="2026-04-18 12:00:00"
                  style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 12 }}
                />
              </div>

              <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, color: '#c9d1d9', marginBottom: 12 }}>
                <input
                  type="checkbox"
                  checked={form.one_time}
                  onChange={(event) => setForm((current) => ({ ...current, one_time: event.target.checked }))}
                  style={{ accentColor: '#4fc3f7' }}
                />
                One-time token
              </label>

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Confirmation Text</div>
                <Input
                  value={form.confirmation_text}
                  onChange={(event) => setForm((current) => ({ ...current, confirmation_text: event.target.value }))}
                  style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 12 }}
                />
              </div>
              <Button color="warning" onClick={submit} disabled={saving || selectedTargets.length === 0}>
                {saving ? <Spinner size="sm" /> : 'Create Override'}
              </Button>
            </CardBody>
          </Card>
        </Col>

        <Col lg={7} style={{ marginBottom: 20 }}>
          <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8 }}>
            <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 18px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>Override History</span>
            </CardHeader>
            <CardBody style={{ padding: 18 }}>
              {overrides.length === 0 ? (
                <div style={{ fontSize: 12, color: '#555' }}>No emergency overrides yet.</div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {overrides.map((override) => (
                    <div key={override.id} style={{ border: '1px solid #30363d', background: '#0d1117', padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 12, color: '#e6edf3' }}>#{override.id} · {override.target_summary}</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <Badge style={{ background: '#f0c04022', color: '#f0c040' }}>{override.status}</Badge>
                          {override.one_time && <Badge style={{ background: '#58a6ff22', color: '#58a6ff' }}>one-time</Badge>}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: '#8b949e', marginTop: 6, lineHeight: 1.6 }}>{override.reason}</div>
                      <div style={{ fontSize: 10, color: '#6e7681', marginTop: 8 }}>
                        {override.run_type || 'any active run'} · {Array.isArray(override.targets_json) ? override.targets_json.join(', ') : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, marginTop: 20 }}>
            <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 18px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>Inventory Bound Targets</span>
            </CardHeader>
            <CardBody style={{ padding: 18 }}>
              {(options?.targets?.all || []).length === 0 ? (
                <div style={{ fontSize: 12, color: '#555' }}>No discovered or scoped targets are available yet.</div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {optionGroups(options).map(([label, items]) => (
                    <div key={label}>
                      <div style={{ fontSize: 10, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {items.map((item) => (
                          <Badge key={item.value} style={{ background: '#21262d', color: '#c9d1d9' }}>{item.label}</Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
