import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from 'contexts/AuthContext';
import { getModules, updateModule } from 'api/metisApi';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Col, FormGroup, Input, Label, Row, Spinner } from 'reactstrap';

function ServiceCard({ module, onSave, saving, canEdit }) {
  const [enabled, setEnabled] = useState(Boolean(module.enabled));
  const [notes, setNotes] = useState(module.notes || '');
  const [config, setConfig] = useState(module.config || {});

  useEffect(() => {
    setEnabled(Boolean(module.enabled));
    setNotes(module.notes || '');
    setConfig(module.config || {});
  }, [module]);

  return (
    <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, height: '100%' }}>
      <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#e6edf3' }}>{module.name}</div>
            <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>{module.description}</div>
          </div>
          <Badge style={{ background: module.configured ? '#3fb95022' : '#21262d', color: module.configured ? '#3fb950' : '#8b949e', fontSize: 10 }}>
            {module.configured ? 'configured' : 'not configured'}
          </Badge>
        </div>
      </CardHeader>
      <CardBody style={{ padding: 18 }}>
        <div style={{ fontSize: 11, color: '#f0c040', marginBottom: 12 }}>{module.guardrail}</div>

        {(module.instructions || []).map(instruction => (
          <div key={instruction} style={{ fontSize: 11, color: '#8b949e', marginBottom: 6 }}>
            • {instruction}
          </div>
        ))}

        {module.docs_url && (
          <div style={{ marginTop: 10, marginBottom: 14 }}>
            <a href={module.docs_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#58a6ff' }}>
              Detailed docs →
            </a>
          </div>
        )}

        {module.fields?.map(field => (
          <FormGroup key={field.key} style={{ marginBottom: 12 }}>
            <Label style={{ color: '#8b949e', fontSize: 12 }}>{field.label}</Label>
            {field.type === 'boolean' ? (
              <div>
                <Label check style={{ color: '#c9d1d9', fontSize: 12 }}>
                  <Input
                    type="checkbox"
                    checked={Boolean(config[field.key])}
                    disabled={module.locked || !canEdit}
                    onChange={e => setConfig(current => ({ ...current, [field.key]: e.target.checked }))}
                  />{' '}
                  Enabled
                </Label>
              </div>
            ) : (
              <Input
                type={field.type === 'secret' ? 'password' : 'text'}
                value={config[field.key] ?? ''}
                disabled={module.locked || !canEdit}
                placeholder={field.placeholder || ''}
                onChange={e => setConfig(current => ({ ...current, [field.key]: e.target.value }))}
                style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 12 }}
              />
            )}
          </FormGroup>
        ))}

        <FormGroup style={{ marginBottom: 14 }}>
          <Label style={{ color: '#8b949e', fontSize: 12 }}>Notes</Label>
          <Input
            type="textarea"
            rows={2}
            value={notes}
            disabled={module.locked || !canEdit}
            onChange={e => setNotes(e.target.value)}
            style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 12 }}
          />
        </FormGroup>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Label check style={{ color: '#c9d1d9', fontSize: 12 }}>
            <Input type="checkbox" checked={enabled} disabled={module.locked || !canEdit} onChange={e => setEnabled(e.target.checked)} />{' '}
            Enabled
          </Label>
          <Button
            color="info"
            size="sm"
            disabled={saving || module.locked || !canEdit}
            onClick={() => onSave(module.slug, { enabled, notes, config })}
            style={{ fontSize: 11 }}
          >
            {saving ? <Spinner size="sm" /> : 'Save'}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

export default function MetisExternalServices() {
  const { token, user } = useAuth();
  const canEdit = user?.role === 'admin';
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingSlug, setSavingSlug] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getModules(token);
      setModules(response.data || []);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => {
    return modules.reduce((acc, module) => {
      acc[module.category] = acc[module.category] || [];
      acc[module.category].push(module);
      return acc;
    }, {});
  }, [modules]);

  const saveModule = async (slug, payload) => {
    setSavingSlug(slug);
    setFeedback('');
    setError('');
    try {
      await updateModule(slug, payload, token);
      setFeedback('Service settings saved.');
      await load();
    } catch (e) {
      setError(e.data?.message || e.message);
    }
    setSavingSlug('');
  };

  if (loading) {
    return <div className="content" style={{ textAlign: 'center', paddingTop: 60 }}><Spinner color="info" /></div>;
  }

  return (
    <div className="content">
      <div style={{ marginBottom: 24 }}>
        <h4 style={{ color: '#e6edf3', marginBottom: 4 }}>External Services</h4>
        <p style={{ color: '#8b949e', fontSize: 13, marginBottom: 0 }}>
          Configure OSINT, threat intel, and defensive workflow connectors for Metis.
        </p>
      </div>

      {!user?.role || user.role !== 'admin' ? (
        <Alert color="warning" style={{ fontSize: 12 }}>
          Only admins can update connector settings. Non-admin users can still review setup instructions and docs links.
        </Alert>
      ) : null}

      {feedback && <Alert color="success" style={{ fontSize: 12 }}>{feedback}</Alert>}
      {error && <Alert color="danger" style={{ fontSize: 12 }}>{error}</Alert>}

      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 }}>
            {category}
          </div>
          <Row>
            {items.map(module => (
              <Col key={module.slug} md={6} xl={4} style={{ marginBottom: 18 }}>
                <ServiceCard module={module} onSave={saveModule} saving={savingSlug === module.slug} canEdit={canEdit} />
              </Col>
            ))}
          </Row>
        </div>
      ))}
    </div>
  );
}
