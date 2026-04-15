import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from 'contexts/AuthContext';
import { useMetis } from 'contexts/MetisContext';
import { getDedupeSuggestions, getDomains, getHosts, getUrls } from 'api/metisApi';
import EntityDrawer from 'components/Metis/EntityDrawer';
import {
  Card, CardBody, CardHeader, Nav, NavItem, NavLink, TabContent, TabPane,
  Input, Button, Badge, Spinner, Modal, ModalBody, ModalFooter, ModalHeader,
} from 'reactstrap';

function Pagination({ meta, onPage }) {
  if (!meta || meta.last_page <= 1) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '12px 0' }}>
      <Button size="sm" color="secondary" outline disabled={meta.current_page === 1} onClick={() => onPage(meta.current_page - 1)}>‹</Button>
      <span style={{ fontSize: 12, color: '#8b949e' }}>{meta.current_page} / {meta.last_page}</span>
      <Button size="sm" color="secondary" outline disabled={meta.current_page === meta.last_page} onClick={() => onPage(meta.current_page + 1)}>›</Button>
    </div>
  );
}

function DomainTable({ domains, onSelect }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#0d1117' }}>
            {['Domain', 'Layer', 'Verified', 'DNS Records', 'CT Sources', 'First Seen', 'Last Seen'].map(h => (
              <th key={h} style={{ padding: '10px 12px', fontSize: 11, color: '#8b949e', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {domains.map(d => (
            <tr key={d.id} onClick={() => onSelect('domain', d.id, d)} style={{ borderBottom: '1px solid #21262d', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(88,166,255,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <td style={{ padding: '9px 12px', fontSize: 12, color: '#e6edf3', fontFamily: 'monospace' }}>{d.domain}</td>
              <td style={{ padding: '9px 12px' }}>
                <Badge style={{ background: '#21262d', color: '#8b949e', fontSize: 10 }}>{d.layer}</Badge>
              </td>
              <td style={{ padding: '9px 12px', fontSize: 12, color: d.verified ? '#3fb950' : '#555' }}>
                {d.verified ? '✓' : '—'}
              </td>
              <td style={{ padding: '9px 12px', fontSize: 12, color: '#8b949e' }}>{d.dns_json?.length || '—'}</td>
              <td style={{ padding: '9px 12px', fontSize: 12, color: '#8b949e' }}>{d.ct_sources_json?.length || '—'}</td>
              <td style={{ padding: '9px 12px', fontSize: 11, color: '#555' }}>{d.first_seen?.slice(0, 10)}</td>
              <td style={{ padding: '9px 12px', fontSize: 11, color: '#555' }}>{d.last_seen?.slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HostTable({ hosts, onSelect }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#0d1117' }}>
            {['Hostname', 'IP', 'Status', 'Title', 'Server', 'Live', 'First Seen'].map(h => (
              <th key={h} style={{ padding: '10px 12px', fontSize: 11, color: '#8b949e', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hosts.map(h => (
            <tr key={h.id} onClick={() => onSelect('host', h.id, h)} style={{ borderBottom: '1px solid #21262d', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(88,166,255,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <td style={{ padding: '9px 12px', fontSize: 12, color: '#e6edf3', fontFamily: 'monospace' }}>{h.hostname}</td>
              <td style={{ padding: '9px 12px', fontSize: 12, color: '#8b949e' }}>{h.ip || '—'}</td>
              <td style={{ padding: '9px 12px' }}>
                {h.http_status ? (
                  <Badge style={{ background: h.http_status < 400 ? '#3fb95022' : '#f8514922', color: h.http_status < 400 ? '#3fb950' : '#f85149', fontSize: 10 }}>
                    {h.http_status}
                  </Badge>
                ) : '—'}
              </td>
              <td style={{ padding: '9px 12px', fontSize: 12, color: '#8b949e', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {h.http_json?.title || '—'}
              </td>
              <td style={{ padding: '9px 12px', fontSize: 12, color: '#8b949e' }}>{h.http_json?.server || '—'}</td>
              <td style={{ padding: '9px 12px', fontSize: 12, color: h.is_live ? '#3fb950' : '#555' }}>
                {h.is_live ? '●' : '○'}
              </td>
              <td style={{ padding: '9px 12px', fontSize: 11, color: '#555' }}>{h.first_seen?.slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UrlTable({ urls }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#0d1117' }}>
            {['URL', 'Source', 'Status', 'First Seen'].map(h => (
              <th key={h} style={{ padding: '10px 12px', fontSize: 11, color: '#8b949e', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {urls.map(u => (
            <tr key={u.id} style={{ borderBottom: '1px solid #21262d' }}>
              <td style={{ padding: '8px 12px', fontSize: 11, color: '#8b949e', fontFamily: 'monospace', maxWidth: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {u.url}
              </td>
              <td style={{ padding: '8px 12px' }}>
                <Badge style={{ background: '#21262d', color: '#8b949e', fontSize: 10 }}>{u.source}</Badge>
              </td>
              <td style={{ padding: '8px 12px', fontSize: 12, color: '#8b949e' }}>{u.status_code || '—'}</td>
              <td style={{ padding: '8px 12px', fontSize: 11, color: '#555' }}>{u.first_seen?.slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MetisEntities() {
  const { id }          = useParams();
  const { token }       = useAuth();
  const { openEntity }  = useMetis();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get('tab')
    || (location.pathname.endsWith('/entities/hosts') ? 'hosts' : null)
    || (location.pathname.endsWith('/entities/urls') ? 'urls' : null)
    || 'domains';
  const searchParam = searchParams.get('search') || '';
  const [tab, setTab] = useState(tabParam);

  const [domains, setDomains] = useState([]);
  const [hosts,   setHosts]   = useState([]);
  const [urls,    setUrls]    = useState([]);
  const [meta,    setMeta]    = useState({});
  const [search,  setSearch]  = useState(searchParam);
  const [loading, setLoading] = useState(false);
  const [page,    setPage]    = useState(1);
  const [dedupeModal, setDedupeModal] = useState(false);
  const [dedupeLoading, setDedupeLoading] = useState(false);
  const [dedupeSuggestions, setDedupeSuggestions] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'domains') {
        const res = await getDomains(id, { search, page }, token);
        setDomains(res.data || []); setMeta(res.meta || {});
      } else if (tab === 'hosts') {
        const res = await getHosts(id, { search, page }, token);
        setHosts(res.data || []); setMeta(res.meta || {});
      } else {
        const res = await getUrls(id, { search, page }, token);
        setUrls(res.data || []); setMeta(res.meta || {});
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [id, tab, search, page, token]);

  useEffect(() => { setPage(1); }, [tab, search]);
  useEffect(() => {
    setTab(tabParam);
  }, [tabParam]);
  useEffect(() => {
    setSearch(searchParam);
  }, [searchParam]);
  useEffect(() => { load(); }, [load]);

  const switchTab = (t) => {
    setTab(t);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', t);
    if (search) nextParams.set('search', search);
    setSearchParams(nextParams);
  };

  const loadDedupeSuggestions = async () => {
    setDedupeLoading(true);
    try {
      const res = await getDedupeSuggestions(id, token);
      setDedupeSuggestions(res.data || []);
      setDedupeModal(true);
    } catch (e) {
      alert(e.message);
    }
    setDedupeLoading(false);
  };

  return (
    <div className="content">
      <h4 style={{ color: '#e6edf3', marginBottom: 4 }}>Entities</h4>
      <p style={{ color: '#8b949e', fontSize: 13, marginBottom: 20 }}>Browse all discovered domains, hosts, and URLs.</p>

      <Nav tabs style={{ borderBottom: '1px solid #30363d', marginBottom: 0 }}>
        {[
          { key: 'domains', label: 'Domains', icon: 'fas fa-globe', color: '#4fc3f7' },
          { key: 'hosts',   label: 'Hosts',   icon: 'fas fa-server', color: '#81c784' },
          { key: 'urls',    label: 'URLs',    icon: 'fas fa-link',  color: '#ffb74d' },
        ].map(t => (
          <NavItem key={t.key}>
            <NavLink
              onClick={() => switchTab(t.key)}
              style={{
                color: tab === t.key ? t.color : '#8b949e',
                borderBottom: tab === t.key ? `2px solid ${t.color}` : '2px solid transparent',
                borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                background: 'none', cursor: 'pointer', fontSize: 13, padding: '10px 16px',
              }}
            >
              <i className={t.icon} style={{ marginRight: 6 }} />{t.label}
            </NavLink>
          </NavItem>
        ))}
      </Nav>

      <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '0 8px 8px 8px' }}>
        <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '12px 18px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <Input
              value={search}
              onChange={e => {
                const nextValue = e.target.value;
                setSearch(nextValue);
                const nextParams = new URLSearchParams(searchParams);
                nextParams.set('tab', tab);
                if (nextValue) nextParams.set('search', nextValue);
                else nextParams.delete('search');
                setSearchParams(nextParams, { replace: true });
              }}
              placeholder={`Search ${tab}…`}
              style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 13, maxWidth: 300 }}
            />
            <Button size="sm" color="secondary" outline onClick={loadDedupeSuggestions} disabled={dedupeLoading} style={{ fontSize: 11 }}>
              {dedupeLoading ? <Spinner size="sm" /> : 'AI Dedupe'}
            </Button>
            {loading && <Spinner size="sm" color="info" style={{ alignSelf: 'center' }} />}
          </div>
        </CardHeader>
        <CardBody style={{ padding: 0 }}>
          {tab === 'domains' && (
            domains.length === 0
              ? <div style={{ padding: 40, textAlign: 'center', color: '#555', fontSize: 13 }}>No domains discovered yet. Run Passive OSINT to populate.</div>
              : <DomainTable domains={domains} onSelect={openEntity} />
          )}
          {tab === 'hosts' && (
            hosts.length === 0
              ? <div style={{ padding: 40, textAlign: 'center', color: '#555', fontSize: 13 }}>No hosts yet. Run HTTP Probe to populate.</div>
              : <HostTable hosts={hosts} onSelect={openEntity} />
          )}
          {tab === 'urls' && (
            urls.length === 0
              ? <div style={{ padding: 40, textAlign: 'center', color: '#555', fontSize: 13 }}>No URLs yet. Run Wayback fetch to populate.</div>
              : <UrlTable urls={urls} />
          )}
          <div style={{ padding: '0 18px' }}>
            <Pagination meta={meta} onPage={setPage} />
          </div>
        </CardBody>
      </Card>

      <EntityDrawer projectId={id} />

      <Modal isOpen={dedupeModal} toggle={() => setDedupeModal(false)} size="lg">
        <ModalHeader toggle={() => setDedupeModal(false)} style={{ background: '#161b22', color: '#e6edf3', borderBottom: '1px solid #30363d' }}>
          AI Dedupe Suggestions
        </ModalHeader>
        <ModalBody style={{ background: '#161b22', color: '#c9d1d9' }}>
          {dedupeSuggestions.length === 0 ? (
            <div style={{ color: '#555', fontSize: 13 }}>No duplicate candidates were suggested by the configured AI provider.</div>
          ) : (
            dedupeSuggestions.map((group, index) => (
              <div key={index} style={{ padding: '10px 0', borderBottom: '1px solid #21262d' }}>
                <div style={{ fontSize: 12, color: '#e6edf3' }}>Keep: {group.keep}</div>
                <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>Merge: {(group.merge || []).join(', ') || '—'}</div>
                <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>Reason: {group.reason || 'No reason returned.'}</div>
              </div>
            ))
          )}
        </ModalBody>
        <ModalFooter style={{ background: '#161b22', borderTop: '1px solid #30363d' }}>
          <Button color="secondary" outline onClick={() => setDedupeModal(false)}>Close</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
