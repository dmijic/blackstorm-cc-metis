import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from 'contexts/AuthContext';
import { useMetis } from 'contexts/MetisContext';
import { getProject, getLayers, getProjectTimeline } from 'api/metisApi';
import LayersPanel from 'components/Metis/LayersPanel';
import TimelineScrubber from 'components/Metis/TimelineScrubber';
import EntityDrawer from 'components/Metis/EntityDrawer';
import { Row, Col, Card, CardBody, CardHeader, Spinner } from 'reactstrap';

const SEVERITY_COLORS = { critical: '#ff4444', high: '#ff8800', medium: '#ffcc00', low: '#44aaff', info: '#888' };
const STATUS_COLORS   = { completed: '#3fb950', failed: '#f85149', running: '#f0c040', queued: '#8b949e' };

function StatCard({ icon, value, label, color, to }) {
  const content = (
    <div style={{
      background: '#161b22', border: '1px solid #30363d', borderRadius: 8,
      padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16,
      cursor: to ? 'pointer' : 'default', transition: 'border-color 0.15s',
    }}
    onMouseEnter={e => to && (e.currentTarget.style.borderColor = color)}
    onMouseLeave={e => to && (e.currentTarget.style.borderColor = '#30363d')}
    >
      <div style={{ width: 44, height: 44, borderRadius: '50%', background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <i className={icon} style={{ color, fontSize: 18 }} />
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 700, color: '#e6edf3', lineHeight: 1 }}>{value ?? '—'}</div>
        <div style={{ fontSize: 12, color: '#8b949e', marginTop: 3 }}>{label}</div>
      </div>
    </div>
  );
  return to ? <Link to={to} style={{ textDecoration: 'none' }}>{content}</Link> : content;
}

function TimelineEvent({ event }) {
  const icons = {
    domain_discovered: { icon: 'fas fa-globe', color: '#4fc3f7' },
    finding_created:   { icon: 'fas fa-bug',   color: SEVERITY_COLORS[event.severity] || '#ef5350' },
    job_run:           { icon: 'fas fa-play',  color: STATUS_COLORS[event.status] || '#8b949e' },
  };
  const meta = icons[event.event_type] || { icon: 'fas fa-circle', color: '#555' };

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid #21262d' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${meta.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
        <i className={meta.icon} style={{ color: meta.color, fontSize: 10 }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: '#c9d1d9' }}>{event.label}</div>
        <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>{event.event_type?.replace(/_/g, ' ')} · {event.occurred_at?.slice(0, 16)}</div>
      </div>
    </div>
  );
}

function LayerPreviewCard({ title, icon, color, items, emptyLabel, linkTo, onOpen, renderMeta }) {
  return (
    <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, height: '100%' }}>
      <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '12px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>
            <i className={icon} style={{ color, marginRight: 8 }} />
            {title}
          </span>
          {linkTo && <Link to={linkTo} style={{ fontSize: 11, color: '#58a6ff' }}>View all →</Link>}
        </div>
      </CardHeader>
      <CardBody style={{ padding: '12px 18px', maxHeight: 260, overflowY: 'auto' }}>
        {items?.length > 0 ? (
          items.slice(0, 12).map(item => (
            <div
              key={`${title}-${item.id}`}
              onClick={() => onOpen?.(item)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 0', borderBottom: '1px solid #21262d', cursor: onOpen ? 'pointer' : 'default',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: '#e6edf3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.domain || item.hostname || item.title || item.text || item.url || `#${item.id}`}
                </div>
                {renderMeta && (
                  <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
                    {renderMeta(item)}
                  </div>
                )}
              </div>
              {onOpen && <i className="fas fa-chevron-right" style={{ fontSize: 10, color: '#555' }} />}
            </div>
          ))
        ) : (
          <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: 20 }}>
            {emptyLabel}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export default function MetisOverview() {
  const { id }    = useParams();
  const { token } = useAuth();
  const { timelineRange, layerToggles, openEntity } = useMetis();

  const [project,  setProject]  = useState(null);
  const [layers,   setLayers]   = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [layersLoading, setLayersLoading] = useState(false);

  const loadProject = useCallback(async () => {
    try {
      const res = await getProject(id, token);
      setProject(res);
    } catch (e) {
      console.error(e);
    }
  }, [id, token]);

  const loadLayers = useCallback(async () => {
    setLayersLoading(true);
    try {
      const params = {};
      if (timelineRange.from) params.from = timelineRange.from;
      if (timelineRange.to)   params.to   = timelineRange.to;
      const res = await getLayers(id, params, token);
      setLayers(res);
    } catch (e) {
      console.error(e);
    }
    setLayersLoading(false);
  }, [id, token, timelineRange]);

  const loadTimeline = useCallback(async () => {
    try {
      const params = {};
      if (timelineRange.from) params.from = timelineRange.from;
      if (timelineRange.to)   params.to   = timelineRange.to;
      const res = await getProjectTimeline(id, params, token);
      setTimeline(res.data || []);
    } catch (e) {
      console.error(e);
    }
  }, [id, token, timelineRange]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadProject(), loadLayers(), loadTimeline()]).finally(() => setLoading(false));
  }, [loadProject, loadLayers, loadTimeline]);

  if (loading) {
    return <div className="content" style={{ textAlign: 'center', paddingTop: 60 }}><Spinner color="info" /></div>;
  }

  const stats = project?.stats || {};

  return (
    <div className="content">
      {/* Project header */}
      <Row style={{ marginBottom: 20 }}>
        <Col>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div>
              <h3 style={{ color: '#e6edf3', margin: 0 }}>{project?.data?.name}</h3>
              <p style={{ color: '#8b949e', fontSize: 12, marginTop: 3 }}>
                {project?.data?.client && <span style={{ marginRight: 12 }}>{project.data.client}</span>}
                <Link to={`/metis/projects/${id}/scope`} style={{ color: '#58a6ff', fontSize: 11 }}>
                  <i className="fas fa-crosshairs" style={{ marginRight: 4 }} />Edit Scope
                </Link>
                <Link to={`/metis/projects/${id}/wizard`} style={{ color: '#58a6ff', fontSize: 11, marginLeft: 12 }}>
                  <i className="fas fa-magic" style={{ marginRight: 4 }} />Wizard
                </Link>
                <Link to={`/metis/projects/${id}/modules`} style={{ color: '#58a6ff', fontSize: 11, marginLeft: 12 }}>
                  <i className="fas fa-cubes" style={{ marginRight: 4 }} />Modules
                </Link>
                <Link to={`/metis/projects/${id}/report`} style={{ color: '#58a6ff', fontSize: 11, marginLeft: 12 }}>
                  <i className="fas fa-file-alt" style={{ marginRight: 4 }} />Report
                </Link>
              </p>
            </div>
          </div>
        </Col>
      </Row>

      {/* Timeline scrubber */}
      <Row style={{ marginBottom: 20 }}>
        <Col><TimelineScrubber /></Col>
      </Row>

      {/* Stats cards */}
      <Row style={{ marginBottom: 24 }}>
        {[
          { icon: 'fas fa-shield-alt',    value: stats.verified_domains, label: 'Verified Domains', color: '#4fc3f7', to: `scope` },
          { icon: 'fas fa-sitemap',       value: stats.new_subdomains_7d, label: 'New Subdomains', color: '#81c784', to: `entities/domains` },
          { icon: 'fas fa-server',        value: stats.live_hosts,       label: 'Live Hosts',      color: '#aed581', to: `entities/hosts` },
          { icon: 'fas fa-bug',           value: stats.new_findings_7d,  label: 'New Findings',    color: '#ef5350', to: `findings` },
          { icon: 'fas fa-times-circle',  value: stats.jobs_failed,      label: 'Jobs Failed',     color: '#f85149', to: `runs` },
          { icon: 'fas fa-link',          value: stats.urls,             label: 'Historical URLs', color: '#ffb74d', to: `entities/urls` },
        ].map(s => (
          <Col key={s.label} md={4} lg={2} style={{ marginBottom: 16 }}>
            <StatCard {...s} to={s.to ? `/metis/projects/${id}/${s.to}` : undefined} />
          </Col>
        ))}
      </Row>

      {/* Main content: Layers + Timeline */}
      <Row>
        {/* Left: Layers panel */}
        <Col md={3}>
          <LayersPanel layers={layers} loading={layersLoading} onRefresh={loadLayers} />
        </Col>

        {/* Right: Live layer items + Timeline */}
        <Col md={9}>
          <Row>
            {layerToggles.live && (
              <Col md={6} style={{ marginBottom: 20 }}>
                <LayerPreviewCard
                  title="Live Layer"
                  icon="fas fa-broadcast-tower"
                  color="#81c784"
                  items={layers?.live?.items || []}
                  emptyLabel="No live hosts yet. Run HTTP probe to discover."
                  linkTo={`/metis/projects/${id}/entities/hosts`}
                  onOpen={(host) => openEntity('host', host.id, host)}
                  renderMeta={(host) => [host.ip, host.http_status ? `HTTP ${host.http_status}` : null].filter(Boolean).join(' · ')}
                />
              </Col>
            )}

            {layerToggles.discovery && (
              <Col md={6} style={{ marginBottom: 20 }}>
                <LayerPreviewCard
                  title="Discovery Layer"
                  icon="fas fa-search"
                  color="#4fc3f7"
                  items={layers?.discovery?.items || []}
                  emptyLabel="No discovery entities yet."
                  linkTo={`/metis/projects/${id}/entities/domains`}
                  onOpen={(domain) => openEntity('domain', domain.id, domain)}
                  renderMeta={(domain) => [domain.layer, domain.verified ? 'verified' : null].filter(Boolean).join(' · ')}
                />
              </Col>
            )}

            {layerToggles.history && (
              <Col md={6} style={{ marginBottom: 20 }}>
                <LayerPreviewCard
                  title="History Layer"
                  icon="fas fa-history"
                  color="#ffb74d"
                  items={layers?.history?.items || []}
                  emptyLabel="No historical URLs yet."
                  linkTo={`/metis/projects/${id}/entities/urls`}
                  renderMeta={(url) => [url.source, url.status_code ? `HTTP ${url.status_code}` : null].filter(Boolean).join(' · ')}
                />
              </Col>
            )}

            {layerToggles.findings && (
              <Col md={6} style={{ marginBottom: 20 }}>
                <LayerPreviewCard
                  title="Findings Layer"
                  icon="fas fa-bug"
                  color="#ef5350"
                  items={layers?.findings?.items || []}
                  emptyLabel="No findings recorded."
                  linkTo={`/metis/projects/${id}/findings`}
                  onOpen={(finding) => openEntity('finding', finding.id, finding)}
                  renderMeta={(finding) => [finding.severity, finding.status].filter(Boolean).join(' · ')}
                />
              </Col>
            )}

            {layerToggles.notes && (
              <Col md={12} style={{ marginBottom: 20 }}>
                <LayerPreviewCard
                  title="Notes Layer"
                  icon="fas fa-sticky-note"
                  color="#ce93d8"
                  items={layers?.notes?.items || []}
                  emptyLabel="No notes attached yet."
                  renderMeta={(note) => [note.creator?.name, note.created_at?.slice(0, 16)].filter(Boolean).join(' · ')}
                />
              </Col>
            )}

            {/* Timeline events */}
            <Col md={12}>
              <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8 }}>
                <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '12px 18px' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>
                    <i className="fas fa-stream" style={{ color: '#8b949e', marginRight: 8 }} />
                    Recent Events
                  </span>
                </CardHeader>
                <CardBody style={{ padding: '0 18px', maxHeight: 340, overflowY: 'auto' }}>
                  {timeline.length > 0 ? (
                    timeline.slice(0, 30).map((ev, i) => <TimelineEvent key={i} event={ev} />)
                  ) : (
                    <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: 30 }}>
                      No events in selected time range.
                    </div>
                  )}
                </CardBody>
              </Card>
            </Col>
          </Row>
        </Col>
      </Row>

      <EntityDrawer projectId={id} />
    </div>
  );
}
