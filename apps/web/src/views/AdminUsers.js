import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from 'contexts/AuthContext';
import { createUser, getUsers, updateUser } from 'api/metisApi';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Form,
  Input,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Spinner,
} from 'reactstrap';

// SuperAdmin can only be assigned by another SuperAdmin
const ROLES_ADMIN      = ['Admin', 'Operator', 'Analyst', 'Viewer'];
const ROLES_SUPERADMIN = ['SuperAdmin', 'Admin', 'Operator', 'Analyst', 'Viewer'];
const EMPTY_FORM       = { name: '', email: '', password: '', role: 'Viewer' };

const ROLE_BADGE = {
  SuperAdmin: { bg: 'rgba(248,81,73,0.12)', border: '#f85149', color: '#f85149' },
  Admin:      { bg: 'rgba(79,195,247,0.10)', border: '#4fc3f7', color: '#4fc3f7' },
  Operator:   { bg: 'rgba(240,192,64,0.10)', border: '#f0c040', color: '#f0c040' },
  Analyst:    { bg: 'rgba(63,185,80,0.10)',  border: '#3fb950', color: '#3fb950' },
  Viewer:     { bg: 'rgba(139,148,158,0.10)', border: '#30363d', color: '#8b949e' },
};

function RoleBadge({ role }) {
  const s = ROLE_BADGE[role] || ROLE_BADGE.Viewer;
  return (
    <span style={{
      fontSize: 9, padding: '2px 7px', fontWeight: 700,
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
      textTransform: 'uppercase', letterSpacing: 0.8,
    }}>
      {role}
      {role === 'SuperAdmin' && ' ★'}
    </span>
  );
}

export default function AdminUsers() {
  const { token, user } = useAuth();
  const isSuperAdmin = user?.role === 'SuperAdmin';
  const isAdmin      = user?.role === 'Admin' || isSuperAdmin;

  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [modal,   setModal]   = useState(false);
  const [form,    setForm]    = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getUsers({ search }, token);
      setUsers(response.data || []);
    } catch {
      setUsers([]);
    }
    setLoading(false);
  }, [search, token]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setModal(true);
  };

  const openEdit = (target) => {
    setEditing(target);
    setForm({ name: target.name, email: target.email, password: '', role: target.role });
    setError('');
    setModal(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      if (editing) {
        const payload = { ...form };
        if (!payload.password) delete payload.password;
        await updateUser(editing.id, payload, token);
      } else {
        await createUser(form, token);
      }
      setModal(false);
      setForm(EMPTY_FORM);
      setEditing(null);
      load();
    } catch (e) {
      setError(e.message || 'Save failed.');
    }

    setSaving(false);
  };

  if (!isAdmin) {
    return (
      <div className="content">
        <Card>
          <CardBody style={{ padding: 24, color: '#8b949e', fontSize: 13 }}>
            Admin access is required to manage users.
          </CardBody>
        </Card>
      </div>
    );
  }

  const availableRoles = isSuperAdmin ? ROLES_SUPERADMIN : ROLES_ADMIN;

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h4 style={{ color: '#e6edf3', margin: 0, fontWeight: 600, letterSpacing: -0.2 }}>Users</h4>
          <p style={{ color: '#8b949e', fontSize: 12, marginTop: 4, marginBottom: 0 }}>
            Manage operator access and role assignments for the Command Center.
            {isSuperAdmin && (
              <span style={{ marginLeft: 8, color: '#f85149', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>
                God Mode Active
              </span>
            )}
          </p>
        </div>
        <Button color="info" onClick={openCreate} style={{ whiteSpace: 'nowrap' }}>
          <i className="fas fa-user-plus" style={{ marginRight: 6 }} />Add User
        </Button>
      </div>

      <Card style={{ background: '#161b22', border: '1px solid #30363d' }}>
        <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '10px 16px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or email"
              style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', maxWidth: 300 }}
            />
            {loading && <Spinner size="sm" color="info" />}
          </div>
        </CardHeader>
        <CardBody style={{ padding: 0 }}>
          {users.length === 0 && !loading ? (
            <div style={{ padding: 36, textAlign: 'center', color: '#555', fontSize: 12 }}>No users found.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#0d1117' }}>
                    {['Name', 'Email', 'Role', 'Created', ''].map(h => (
                      <th key={h} style={{
                        padding: '9px 14px', fontSize: 10, color: '#8b949e',
                        textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.8,
                        borderBottom: '1px solid #21262d', fontWeight: 700,
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #21262d' }}>
                      <td style={{ padding: '9px 14px', fontSize: 12, color: '#e6edf3', fontWeight: 500 }}>
                        {item.name}
                        {item.role === 'SuperAdmin' && (
                          <span style={{ marginLeft: 6, fontSize: 9, color: '#f85149' }}>★ GOD</span>
                        )}
                      </td>
                      <td style={{ padding: '9px 14px', fontSize: 12, color: '#8b949e' }}>{item.email}</td>
                      <td style={{ padding: '9px 14px' }}><RoleBadge role={item.role} /></td>
                      <td style={{ padding: '9px 14px', fontSize: 11, color: '#484f58' }}>{item.created_at?.slice(0, 10)}</td>
                      <td style={{ padding: '9px 14px' }}>
                        {/* SuperAdmin users can only be edited by other SuperAdmins */}
                        {(item.role !== 'SuperAdmin' || isSuperAdmin) && (
                          <Button size="sm" color="secondary" outline onClick={() => openEdit(item)}>
                            Edit
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Modal isOpen={modal} toggle={() => setModal(false)}>
        <Form onSubmit={save}>
          <ModalHeader toggle={() => setModal(false)}
            style={{ background: '#0d1117', color: '#e6edf3', borderBottom: '1px solid #30363d' }}>
            {editing ? 'Edit User' : 'Create User'}
          </ModalHeader>
          <ModalBody style={{ background: '#161b22' }}>
            {error && (
              <div style={{
                marginBottom: 12, padding: '7px 10px', fontSize: 12,
                background: 'rgba(248,81,73,0.08)', border: '1px solid #f85149', color: '#f85149',
              }}>
                {error}
              </div>
            )}

            {[['name', 'Name', 'text'], ['email', 'Email', 'email']].map(([key, label, type]) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', color: '#8b949e', fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {label}
                </label>
                <Input
                  type={type}
                  value={form[key]}
                  onChange={e => setForm(c => ({ ...c, [key]: e.target.value }))}
                  style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9' }}
                  required
                />
              </div>
            ))}

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', color: '#8b949e', fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Password {editing && <span style={{ color: '#484f58' }}>(leave blank to keep)</span>}
              </label>
              <Input
                type="password"
                value={form.password}
                onChange={e => setForm(c => ({ ...c, password: e.target.value }))}
                style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9' }}
                required={!editing}
              />
            </div>

            <div>
              <label style={{ display: 'block', color: '#8b949e', fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Role
              </label>
              <Input
                type="select"
                value={form.role}
                onChange={e => setForm(c => ({ ...c, role: e.target.value }))}
                style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9' }}
              >
                {availableRoles.map(role => (
                  <option key={role} value={role}>{role}{role === 'SuperAdmin' ? ' (God Mode)' : ''}</option>
                ))}
              </Input>
            </div>
          </ModalBody>
          <ModalFooter style={{ background: '#0d1117', borderTop: '1px solid #30363d' }}>
            <Button color="secondary" outline onClick={() => setModal(false)}>Cancel</Button>
            <Button color="info" type="submit" disabled={saving}>
              {saving ? <Spinner size="sm" /> : (editing ? 'Save Changes' : 'Create User')}
            </Button>
          </ModalFooter>
        </Form>
      </Modal>
    </div>
  );
}
