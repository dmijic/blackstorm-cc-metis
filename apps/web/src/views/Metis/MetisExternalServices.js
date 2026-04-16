import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from 'contexts/AuthContext';
import { getModules, updateModule } from 'api/metisApi';
import { Alert, Button, Col, Input, Row, Spinner } from 'reactstrap';

function ServiceCard({ module, onSave, saving, canEdit }) {
  const [enabled, setEnabled] = useState(Boolean(module.enabled));
  const [notes, setNotes] = useState(module.notes || '');
  const [config, setConfig] = useState(module.config || {});

  useEffect(() => {
    setEnabled(Boolean(module.enabled));
    setNotes(module.notes || '');
    setConfig(module.config || {});
  }, [module]);

  const configFields = useMemo(() => {
    if (Array.isArray(module.fields)) {
      return module.fields;
    }

    if (module.config_schema && typeof module.config_schema === 'object') {
      return Object.entries(module.config_schema).map(([k, s]) => ({ key: k, ...s }));
    }

    return [];
  }, [module.fields, module.config_schema]);

  const sc = module.configured ? '#3fb950' : '#8b949e';
  const disabled = !canEdit || module.locked;

  return (
    <div style={{ background: '#161b22', border: '1px solid #30363d', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ background: '#0d1117', borderBottom: '1px solid #21262d', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>{module.name}</div>
          <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>{module.description}</div>
          <div style={{ fontSize: 10, color: module.locked ? '#f0c040' : '#6e7681', marginTop: 6 }}>
            {module.guardrail}
          </div>
        </div>
        <span style={{ fontSize: 9, padding: '2px 7px', fontWeight: 700, whiteSpace: 'nowrap', background: module.configured ? 'rgba(63,185,80,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${sc}`, color: sc, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          {module.configured ? 'configured' : 'not configured'}
        </span>
      </div>
      <div style={{ padding: 16, flexGrow: 1 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, cursor: disabled ? 'default' : 'pointer', color: '#c9d1d9', fontSize: 12, textTransform: 'none', letterSpacing: 0 }}>
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} disabled={disabled} style={{ accentColor: '#4fc3f7', width: 14, height: 14 }} />
          Enable {module.name}
        </label>
        {(module.instructions || []).length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Quick Setup</div>
            {(module.instructions || []).map((instruction) => (
              <div key={instruction} style={{ fontSize: 11, color: '#c9d1d9', marginBottom: 5, lineHeight: 1.5 }}>
                • {instruction}
              </div>
            ))}
            {module.docs_url && (
              <a href={module.docs_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#58a6ff', textDecoration: 'none' }}>
                Detailed docs →
              </a>
            )}
          </div>
        )}
        {configFields.map(f => (
          <div key={f.key} style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', color: '#8b949e', fontSize: 10, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {f.label || f.key}{f.required && <span style={{ color: '#f85149', marginLeft: 3 }}>*</span>}
            </label>
            {f.type === 'boolean' ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: disabled ? 'default' : 'pointer', color: '#c9d1d9', fontSize: 12, margin: 0 }}>
                <input
                  type="checkbox"
                  checked={Boolean(config[f.key])}
                  onChange={e => setConfig(c => ({ ...c, [f.key]: e.target.checked }))}
                  disabled={disabled}
                  style={{ accentColor: '#4fc3f7', width: 14, height: 14 }}
                />
                <span>{f.placeholder || 'Enabled'}</span>
              </label>
            ) : (
              <Input
                type={f.type === 'secret' || f.type === 'password' ? 'password' : 'text'}
                placeholder={f.placeholder || ''}
                value={config[f.key] || ''}
                onChange={e => setConfig(c => ({ ...c, [f.key]: e.target.value }))}
                disabled={disabled}
                style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 12 }}
              />
            )}
            {f.help && <div style={{ fontSize: 10, color: '#484f58', marginTop: 3 }}>{f.help}</div>}
          </div>
        ))}
        {configFields.length === 0 && (
          <div style={{ marginBottom: 12, fontSize: 11, color: module.locked ? '#f0c040' : '#555', lineHeight: 1.5 }}>
            {module.locked ? 'This is a research placeholder and remains non-executable in this build.' : 'This integration currently stores only enable/disable state and operator notes.'}
          </div>
        )}
        <div>
          <label style={{ display: 'block', color: '#8b949e', fontSize: 10, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Notes</label>
          <Input type="textarea" placeholder="Optional notes…" value={notes} onChange={e => setNotes(e.target.value)} disabled={disabled} rows={2} style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 11, resize: 'vertical' }} />
        </div>
        {module.last_synced_at && (
          <div style={{ marginTop: 10, fontSize: 10, color: '#555' }}>
            Last updated: {module.last_synced_at.slice(0, 16).replace('T', ' ')}
          </div>
        )}
      </div>
      {canEdit && !module.locked && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid #21262d' }}>
          <Button color="info" size="sm" disabled={saving} onClick={() => onSave(module.slug, { enabled, notes, config })}>
            {saving ? <Spinner size="sm" /> : 'Save'}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function MetisExternalServices() {
  const { token, user } = useAuth();
  const canEdit = user?.role === 'Admin' || user?.role === 'SuperAdmin';
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getModules(token);
      setModules(res?.data || res || []);
    } catch (e) { setError('Failed to load: ' + e.message); }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (slug, data) => {
    setSaving(s => ({ ...s, [slug]: true }));
    setError(''); setSuccess('');
    try { await updateModule(slug, data, token); setSuccess(`${slug} updated.`); load(); }
    catch (e) { setError('Save failed: ' + e.message); }
    setSaving(s => ({ ...s, [slug]: false }));
  };

  const filtered = useMemo(() => {
    if (filter === 'enabled') return modules.filter(m => m.enabled);
    if (filter === 'configured') return modules.filter(m => m.configured);
    return modules;
  }, [modules, filter]);

  const grouped = useMemo(() => {
    return filtered.reduce((acc, module) => {
      const key = module.category || 'other';
      acc[key] = acc[key] || [];
      acc[key].push(module);
      return acc;
    }, {});
  }, [filtered]);

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h4 style={{ color: '#e6edf3', margin: 0, fontWeight: 600 }}>External Services</h4>
          <p style={{ color: '#8b949e', fontSize: 12, marginTop: 4, marginBottom: 0 }}>Configure OSINT, CTI, and integration connectors. AI model credentials are configured separately.</p>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {['all', 'enabled', 'configured'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ background: filter === f ? 'rgba(79,195,247,0.1)' : 'transparent', border: `1px solid ${filter === f ? '#4fc3f7' : '#30363d'}`, color: filter === f ? '#4fc3f7' : '#8b949e', padding: '4px 12px', fontSize: 10, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>{f}</button>
          ))}
        </div>
      </div>
      <Alert color="info" className="mb-3" style={{ fontSize: 12 }}>
        <strong>Where to configure what:</strong> `Settings → External Services` stores OSINT/CTI/integration credentials, `Settings → AI Providers` stores LLM credentials, and `Project → Scope` must contain root domains, GitHub orgs, or email domains before some connectors can do useful work.
        <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link to="/settings/ai-providers" style={{ color: '#58a6ff' }}>Open AI Providers →</Link>
          <Link to="/metis/projects" style={{ color: '#58a6ff' }}>Open Projects →</Link>
        </div>
      </Alert>
      <Alert color="secondary" className="mb-3" style={{ fontSize: 12 }}>
        <strong>Quick setup flow:</strong> 1. define project scope, 2. add provider credentials or webhook URLs here, 3. save and enable the connector, 4. run the matching project module or wizard step. Research placeholders stay visible for documentation, but they remain non-executable in this build.
      </Alert>
      {error && <Alert color="danger" className="mb-3" style={{ fontSize: 12 }}>{error}</Alert>}
      {success && <Alert color="success" className="mb-3" style={{ fontSize: 12 }}>{success}</Alert>}
      {loading ? (
        <div style={{ padding: 48, textAlign: 'center' }}><Spinner color="info" /><div style={{ color: '#8b949e', fontSize: 12, marginTop: 10 }}>Loading…</div></div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#555', fontSize: 12 }}>No modules found. Run <code>db:seed</code>.</div>
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <div key={category} style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 10 }}>
              {category}
            </div>
            <Row>
              {items.map(m => (
                <Col key={m.slug} lg="4" md="6" className="mb-4">
                  <ServiceCard module={m} onSave={handleSave} saving={!!saving[m.slug]} canEdit={canEdit} />
                </Col>
              ))}
            </Row>
          </div>
        ))
      )}
    </div>
  );
}
