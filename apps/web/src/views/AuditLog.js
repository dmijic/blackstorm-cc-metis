import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from 'contexts/AuthContext';
import { getGlobalAuditLog } from 'api/metisApi';
import { Card, CardBody, CardHeader, Input, Spinner } from 'reactstrap';

export default function AuditLog() {
  const { token, user } = useAuth();

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getGlobalAuditLog({ action }, token);
      setLogs(response.data || []);
    } catch (e) {
      setLogs([]);
    }
    setLoading(false);
  }, [action, token]);

  useEffect(() => {
    load();
  }, [load]);

  if (user?.role !== 'Admin') {
    return (
      <div className="content">
        <Card>
          <CardBody style={{ padding: 24, color: '#8b949e' }}>
            Admin access is required to view the global audit log.
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h4 style={{ color: '#e6edf3', margin: 0 }}>Audit Log</h4>
          <p style={{ color: '#8b949e', fontSize: 13, marginTop: 4 }}>
            Project changes, scope verification, runs, reports, and other security-sensitive actions.
          </p>
        </div>
      </div>

      <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8 }}>
        <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '12px 18px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Input
              value={action}
              onChange={e => setAction(e.target.value)}
              placeholder="Filter by action prefix, e.g. job., scope., report."
              style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', maxWidth: 340 }}
            />
            {loading && <Spinner size="sm" color="info" />}
          </div>
        </CardHeader>
        <CardBody style={{ padding: 0 }}>
          {logs.length === 0 ? (
            <div style={{ padding: 36, textAlign: 'center', color: '#555' }}>
              No audit entries match the current filter.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#0d1117' }}>
                    {['Occurred', 'Action', 'User', 'Project', 'Entity', 'Meta'].map(header => (
                      <th key={header} style={{ padding: '10px 12px', fontSize: 11, color: '#8b949e', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} style={{ borderBottom: '1px solid #21262d' }}>
                      <td style={{ padding: '10px 12px', fontSize: 11, color: '#555' }}>{log.occurred_at?.slice(0, 19).replace('T', ' ')}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: '#e6edf3' }}>{log.action}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: '#8b949e' }}>{log.user?.name || 'system'}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: '#8b949e' }}>{log.project?.name || '—'}</td>
                      <td style={{ padding: '10px 12px', fontSize: 11, color: '#8b949e' }}>
                        {log.entity_type ? `${log.entity_type}${log.entity_id ? ` #${log.entity_id}` : ''}` : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 11, color: '#555', maxWidth: 320, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {log.meta ? JSON.stringify(log.meta) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
