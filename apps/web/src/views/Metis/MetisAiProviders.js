import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from 'contexts/AuthContext';
import { getAiProviders, createAiProvider, updateAiProvider, deleteAiProvider } from 'api/metisApi';
import {
  Row, Col, Card, CardBody, CardHeader, Button, Input, Badge, Spinner,
  Modal, ModalHeader, ModalBody, ModalFooter, Form, FormGroup, Label, Alert,
} from 'reactstrap';

const PROVIDER_ICONS = {
  openai: 'fas fa-brain', anthropic: 'fas fa-robot',
  gemini: 'fas fa-gem', openai_compatible: 'fas fa-plug',
};
const PROVIDER_COLORS = { openai: '#10a37f', anthropic: '#d4a843', gemini: '#4285f4', openai_compatible: '#58a6ff' };

const DEFAULT_MODELS = {
  openai: 'gpt-4o', anthropic: 'claude-sonnet-4-6', gemini: 'gemini-1.5-pro', openai_compatible: '',
};

function ProviderCard({ provider, onEdit, onDelete, onSetDefault }) {
  const color = PROVIDER_COLORS[provider.provider] || '#555';
  return (
    <Card style={{
      background: '#161b22', border: `1px solid ${provider.is_default ? color : '#30363d'}`,
      borderRadius: 8, transition: 'border-color 0.15s',
    }}>
      <CardBody style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className={PROVIDER_ICONS[provider.provider] || 'fas fa-cog'} style={{ color, fontSize: 16 }} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#e6edf3' }}>{provider.name}</div>
              <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>
                {provider.provider} · {provider.model || 'default model'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {provider.is_default && (
              <Badge style={{ background: color + '22', color, fontSize: 10 }}>Default</Badge>
            )}
            {provider.enabled ? (
              <Badge style={{ background: '#3fb95022', color: '#3fb950', fontSize: 10 }}>Active</Badge>
            ) : (
              <Badge style={{ background: '#21262d', color: '#555', fontSize: 10 }}>Disabled</Badge>
            )}
          </div>
        </div>

        {provider.base_url && (
          <div style={{ fontSize: 11, color: '#555', marginBottom: 12, fontFamily: 'monospace' }}>
            {provider.base_url}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {!provider.is_default && (
            <Button size="sm" color="secondary" outline onClick={() => onSetDefault(provider)} style={{ fontSize: 11 }}>
              Set Default
            </Button>
          )}
          <Button size="sm" color="info" outline onClick={() => onEdit(provider)} style={{ fontSize: 11 }}>
            Edit
          </Button>
          <Button size="sm" color="danger" outline onClick={() => onDelete(provider)} style={{ fontSize: 11, marginLeft: 'auto' }}>
            <i className="fas fa-trash-alt" />
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

const EMPTY_FORM = { name: '', provider: 'openai', model: '', api_key: '', base_url: '', is_default: false };

export default function MetisAiProviders() {
  const { token } = useAuth();

  const [providers, setProviders] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState(false);
  const [editTarget,setEditTarget]= useState(null);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAiProviders(token);
      setProviders(res.data || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setError(null);
    setModal(true);
  };

  const openEdit = (provider) => {
    setEditTarget(provider);
    setForm({
      name: provider.name,
      provider: provider.provider,
      model: provider.model || DEFAULT_MODELS[provider.provider] || '',
      api_key: '',
      base_url: provider.base_url || '',
      is_default: provider.is_default,
    });
    setError(null);
    setModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = { ...form };
      if (!payload.api_key) delete payload.api_key; // don't overwrite if empty on edit
      if (editTarget) {
        await updateAiProvider(editTarget.id, payload, token);
      } else {
        await createAiProvider(payload, token);
      }
      setModal(false);
      load();
    } catch (e) {
      setError(e.message || 'Save failed');
    }
    setSaving(false);
  };

  const handleDelete = async (provider) => {
    if (!confirm(`Delete "${provider.name}"?`)) return;
    try {
      await deleteAiProvider(provider.id, token);
      load();
    } catch (e) {
      alert('Delete failed: ' + e.message);
    }
  };

  const setDefault = async (provider) => {
    try {
      await updateAiProvider(provider.id, { is_default: true }, token);
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h4 style={{ color: '#e6edf3', margin: 0 }}>AI Providers</h4>
          <p style={{ color: '#8b949e', fontSize: 13, marginTop: 4 }}>
            Configure OpenAI, Anthropic, Gemini, or any OpenAI-compatible endpoint for AI summaries.
          </p>
        </div>
        <Button color="info" onClick={openCreate} style={{ fontSize: 12 }}>
          <i className="fas fa-plus" style={{ marginRight: 6 }} />Add Provider
        </Button>
      </div>

      <Alert color="info" style={{ fontSize: 12, marginBottom: 24, borderRadius: 6 }}>
        <i className="fas fa-shield-alt" style={{ marginRight: 6 }} />
        API keys are encrypted at rest. They are never sent to the frontend or logged. Only the server uses them to call AI APIs.
        <div style={{ marginTop: 8 }}>
          OSINT, CTI, and webhook connectors are configured separately in <Link to="/settings/modules" style={{ color: '#58a6ff' }}>External Services</Link>.
        </div>
      </Alert>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spinner color="info" /></div>
      ) : providers.length === 0 ? (
        <div style={{ border: '1px dashed #30363d', borderRadius: 8, padding: 60, textAlign: 'center', color: '#555' }}>
          <i className="fas fa-robot" style={{ fontSize: 48, marginBottom: 16, display: 'block' }} />
          <p>No AI providers configured yet.</p>
          <Button color="info" onClick={openCreate}>Add First Provider</Button>
        </div>
      ) : (
        <Row>
          {providers.map(p => (
            <Col key={p.id} md={6} lg={4} style={{ marginBottom: 20 }}>
              <ProviderCard provider={p} onEdit={openEdit} onDelete={handleDelete} onSetDefault={setDefault} />
            </Col>
          ))}
        </Row>
      )}

      {/* Add/Edit Modal */}
      <Modal isOpen={modal} toggle={() => setModal(false)}>
        <Form onSubmit={handleSave}>
          <ModalHeader toggle={() => setModal(false)} style={{ background: '#161b22', color: '#e6edf3', borderBottom: '1px solid #30363d' }}>
            {editTarget ? 'Edit Provider' : 'Add AI Provider'}
          </ModalHeader>
          <ModalBody style={{ background: '#161b22' }}>
            {error && <Alert color="danger" style={{ fontSize: 12 }}>{error}</Alert>}

            <FormGroup>
              <Label style={{ color: '#8b949e', fontSize: 12 }}>Display Name *</Label>
              <Input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Anthropic Claude Sonnet"
                style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 13 }} />
            </FormGroup>

            <FormGroup>
              <Label style={{ color: '#8b949e', fontSize: 12 }}>Provider *</Label>
              <Input type="select" value={form.provider}
                onChange={e => setForm(f => ({ ...f, provider: e.target.value, model: DEFAULT_MODELS[e.target.value] || '' }))}
                style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 13 }}>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="gemini">Google Gemini</option>
                <option value="openai_compatible">OpenAI-Compatible (custom)</option>
              </Input>
            </FormGroup>

            <FormGroup>
              <Label style={{ color: '#8b949e', fontSize: 12 }}>Model</Label>
              <Input value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                placeholder={DEFAULT_MODELS[form.provider] || 'model name'}
                style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 13 }} />
            </FormGroup>

            <FormGroup>
              <Label style={{ color: '#8b949e', fontSize: 12 }}>
                API Key {editTarget ? '(leave blank to keep existing)' : '*'}
              </Label>
              <Input type="password" value={form.api_key} onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
                required={!editTarget} placeholder="sk-..."
                style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 13 }} />
            </FormGroup>

            {form.provider === 'openai_compatible' && (
              <FormGroup>
                <Label style={{ color: '#8b949e', fontSize: 12 }}>Base URL</Label>
                <Input value={form.base_url} onChange={e => setForm(f => ({ ...f, base_url: e.target.value }))}
                  placeholder="https://api.your-provider.com/v1"
                  style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 13 }} />
              </FormGroup>
            )}

            <FormGroup check>
              <Input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} />
              <Label check style={{ color: '#8b949e', fontSize: 12 }}>Set as default provider</Label>
            </FormGroup>
          </ModalBody>
          <ModalFooter style={{ background: '#161b22', borderTop: '1px solid #30363d' }}>
            <Button color="secondary" outline onClick={() => setModal(false)}>Cancel</Button>
            <Button color="info" type="submit" disabled={saving}>
              {saving ? <Spinner size="sm" /> : (editTarget ? 'Save Changes' : 'Add Provider')}
            </Button>
          </ModalFooter>
        </Form>
      </Modal>
    </div>
  );
}
