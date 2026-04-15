import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Badge, Spinner } from 'reactstrap';
import { useMetis } from 'contexts/MetisContext';
import { useAuth } from 'contexts/AuthContext';
import { createNote, getDomain, getEntitySummary, getHost } from 'api/metisApi';

const SEVERITY_COLORS = {
  critical: '#ff4444', high: '#ff8800', medium: '#ffcc00', low: '#44aaff', info: '#888',
};

function SectionHeader({ title }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#8b949e',
      textTransform: 'uppercase', padding: '14px 0 6px', borderBottom: '1px solid #21262d',
      marginBottom: 10,
    }}>
      {title}
    </div>
  );
}

function KVRow({ label, value }) {
  if (!value && value !== 0) return null;

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
      <span style={{ color: '#8b949e', fontSize: 12, minWidth: 110 }}>{label}</span>
      <span style={{ color: '#c9d1d9', fontSize: 12, textAlign: 'right', wordBreak: 'break-all' }}>
        {String(value)}
      </span>
    </div>
  );
}

function NoteInput({ projectId, entityType, entityId, onSaved }) {
  const { token } = useAuth();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!text.trim()) return;

    setSaving(true);
    try {
      await createNote(projectId, { text, entity_type: entityType, entity_id: entityId }, token);
      setText('');
      onSaved?.();
    } catch (e) {
      alert('Failed to save note: ' + e.message);
    }
    setSaving(false);
  };

  return (
    <div style={{ marginTop: 10 }}>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Add a note..."
        style={{
          width: '100%', background: '#0d1117', border: '1px solid #30363d', borderRadius: 4,
          color: '#c9d1d9', padding: 8, fontSize: 12, resize: 'vertical', minHeight: 70,
        }}
      />
      <Button
        size="sm" color="primary" onClick={save} disabled={saving || !text.trim()}
        style={{ marginTop: 6, fontSize: 11 }}
      >
        {saving ? <Spinner size="sm" /> : 'Save Note'}
      </Button>
    </div>
  );
}

function RelatedList({ title, items, emptyLabel, renderPrimary, renderSecondary }) {
  return (
    <>
      <SectionHeader title={title} />
      {items?.length > 0 ? (
        items.map(item => (
          <div key={`${title}-${item.id}`} style={{ padding: '8px 0', borderBottom: '1px solid #21262d' }}>
            <div style={{ fontSize: 12, color: '#e6edf3' }}>{renderPrimary(item)}</div>
            {renderSecondary && (
              <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
                {renderSecondary(item)}
              </div>
            )}
          </div>
        ))
      ) : (
        <div style={{ color: '#555', fontSize: 12 }}>{emptyLabel}</div>
      )}
    </>
  );
}

function buildOverview(entityType, data) {
  if (!data) return null;

  if (entityType === 'domain') {
    return (
      <>
        <KVRow label="Domain" value={data.domain} />
        <KVRow label="Layer" value={data.layer} />
        <KVRow label="Verified" value={data.verified ? 'Yes' : 'No'} />
        <KVRow label="First seen" value={data.first_seen} />
        <KVRow label="Last seen" value={data.last_seen} />
        <KVRow label="DNS records" value={data.dns_json?.length || 0} />
        <KVRow label="RDAP" value={data.rdap_json ? 'available' : 'missing'} />
      </>
    );
  }

  if (entityType === 'host') {
    return (
      <>
        <KVRow label="Hostname" value={data.hostname} />
        <KVRow label="IP" value={data.ip} />
        <KVRow label="Status" value={data.http_status} />
        <KVRow label="Live" value={data.is_live ? 'Yes' : 'No'} />
        <KVRow label="Title" value={data.http_json?.title} />
        <KVRow label="Server" value={data.http_json?.server} />
        <KVRow label="Ports" value={data.open_ports?.join(', ')} />
      </>
    );
  }

  if (entityType === 'finding') {
    return (
      <>
        <KVRow label="Type" value={data.type} />
        <KVRow label="Confidence" value={data.confidence} />
        <KVRow label="Status" value={data.status} />
        <KVRow label="Created" value={data.created_at} />
        {data.summary && (
          <div style={{ color: '#c9d1d9', fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>
            {data.summary}
          </div>
        )}
      </>
    );
  }

  return (
    <pre style={{ fontSize: 11, color: '#8b949e', background: '#0d1117', padding: 12, borderRadius: 4, overflowX: 'auto' }}>
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

export default function EntityDrawer({ projectId }) {
  const { entityDrawer, closeEntity } = useMetis();
  const { token } = useAuth();
  const { open, entityType, entityId, data } = entityDrawer;

  const [tab, setTab] = useState('overview');
  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab('overview');
    setAiSummary('');
  }, [open, entityId]);

  const loadDetail = useCallback(async () => {
    if (!open || !projectId || !entityId) return;
    if (!['domain', 'host'].includes(entityType)) {
      setDetail(null);
      return;
    }

    setDetailLoading(true);
    try {
      const response = entityType === 'domain'
        ? await getDomain(projectId, entityId, token)
        : await getHost(projectId, entityId, token);

      setDetail(response);
    } catch (e) {
      setDetail(null);
    }
    setDetailLoading(false);
  }, [open, projectId, entityId, entityType, token]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const requestAi = useCallback(async () => {
    if (!data || !projectId) return;
    setAiLoading(true);
    try {
      const res = await getEntitySummary(projectId, {
        entity_type: entityType,
        entity_data: data,
      }, token);
      setAiSummary(res.summary);
    } catch (e) {
      setAiSummary('AI summary unavailable: ' + e.message);
    }
    setAiLoading(false);
  }, [data, entityType, projectId, token]);

  const notes = useMemo(() => detail?.notes || [], [detail]);
  const related = useMemo(() => detail?.related || [], [detail]);
  const findings = useMemo(() => detail?.findings || [], [detail]);

  if (!open) return null;

  const severityColor = data?.severity ? SEVERITY_COLORS[data.severity] : null;

  return (
    <>
      <div
        onClick={closeEntity}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1040 }}
      />

      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: 420, maxWidth: '95vw', zIndex: 1050,
        background: '#161b22', borderLeft: '1px solid #30363d',
        display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.5)',
        overflowY: 'auto',
      }}>
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #30363d',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              {entityType?.replace('_', ' ')}
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#e6edf3', wordBreak: 'break-all' }}>
              {data?.domain || data?.hostname || data?.title || data?.url || `#${entityId}`}
            </div>
            {severityColor && (
              <Badge style={{ background: severityColor, color: '#000', marginTop: 6, fontSize: 11 }}>
                {data.severity?.toUpperCase()}
              </Badge>
            )}
          </div>
          <button onClick={closeEntity} style={{ background: 'none', border: 'none', color: '#8b949e', fontSize: 18, cursor: 'pointer', padding: 0 }}>
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid #21262d', padding: '0 20px' }}>
          {['overview', 'evidence', 'related', 'actions'].map(name => (
            <button
              key={name}
              onClick={() => setTab(name)}
              style={{
                background: 'none', border: 'none', padding: '10px 12px 8px',
                color: tab === name ? '#58a6ff' : '#8b949e',
                borderBottom: tab === name ? '2px solid #58a6ff' : '2px solid transparent',
                fontSize: 12, cursor: 'pointer', textTransform: 'capitalize',
              }}
            >
              {name}
            </button>
          ))}
        </div>

        <div style={{ padding: '16px 20px', flex: 1, overflowY: 'auto' }}>
          {tab === 'overview' && (
            <>
              {buildOverview(entityType, data)}

              <SectionHeader title="AI Summary" />
              {aiSummary ? (
                <div style={{ fontSize: 12, color: '#c9d1d9', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {aiSummary}
                </div>
              ) : (
                <Button size="sm" color="info" outline onClick={requestAi} disabled={aiLoading} style={{ fontSize: 11 }}>
                  {aiLoading ? <><Spinner size="sm" /> Analyzing…</> : 'Ask AI'}
                </Button>
              )}
            </>
          )}

          {tab === 'evidence' && (
            <>
              <SectionHeader title="Evidence / Sources" />
              {data?.evidence_json && Object.keys(data.evidence_json).length > 0 ? (
                <pre style={{ fontSize: 11, color: '#8b949e', background: '#0d1117', padding: 12, borderRadius: 4, overflowX: 'auto' }}>
                  {JSON.stringify(data.evidence_json, null, 2)}
                </pre>
              ) : data?.dns_json ? (
                <pre style={{ fontSize: 11, color: '#8b949e', background: '#0d1117', padding: 12, borderRadius: 4, overflowX: 'auto' }}>
                  {JSON.stringify({ dns: data.dns_json, rdap: data.rdap_json || null }, null, 2)}
                </pre>
              ) : data?.http_json ? (
                <pre style={{ fontSize: 11, color: '#8b949e', background: '#0d1117', padding: 12, borderRadius: 4, overflowX: 'auto' }}>
                  {JSON.stringify(data.http_json, null, 2)}
                </pre>
              ) : (
                <div style={{ color: '#555', fontSize: 12 }}>No evidence stored.</div>
              )}
            </>
          )}

          {tab === 'related' && (
            <>
              {detailLoading ? (
                <div style={{ padding: '20px 0', textAlign: 'center' }}>
                  <Spinner size="sm" color="info" />
                </div>
              ) : (
                <>
                  {entityType === 'domain' && (
                    <RelatedList
                      title="Related Hosts"
                      items={related}
                      emptyLabel="No related hosts linked yet."
                      renderPrimary={(item) => item.hostname}
                      renderSecondary={(item) => [item.ip, item.http_status ? `HTTP ${item.http_status}` : null].filter(Boolean).join(' · ')}
                    />
                  )}

                  {entityType === 'host' && (
                    <RelatedList
                      title="Linked Findings"
                      items={findings}
                      emptyLabel="No findings linked to this host."
                      renderPrimary={(item) => item.title}
                      renderSecondary={(item) => [item.severity, item.status].filter(Boolean).join(' · ')}
                    />
                  )}

                  <RelatedList
                    title="Notes"
                    items={notes}
                    emptyLabel="No notes attached."
                    renderPrimary={(item) => item.text}
                    renderSecondary={(item) => [item.creator?.name, item.created_at?.slice(0, 16)].filter(Boolean).join(' · ')}
                  />
                </>
              )}
            </>
          )}

          {tab === 'actions' && (
            <>
              <SectionHeader title="Actions" />
              <NoteInput
                projectId={projectId}
                entityType={entityType ? `${entityType}_entity` : null}
                entityId={entityId}
                onSaved={loadDetail}
              />

              <div style={{ marginTop: 16 }}>
                <Button
                  size="sm" color="secondary" outline
                  style={{ fontSize: 11, marginRight: 8 }}
                  onClick={() => {
                    const json = JSON.stringify(data, null, 2);
                    const blob = new Blob([json], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `${entityType}-${entityId}.json`;
                    link.click();
                  }}
                >
                  <i className="fas fa-download" style={{ marginRight: 6 }} />Export JSON
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
