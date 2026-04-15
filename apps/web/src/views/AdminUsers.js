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

const ROLES = ['Admin', 'Operator', 'Analyst', 'Viewer'];
const EMPTY_FORM = { name: '', email: '', password: '', role: 'Viewer' };

export default function AdminUsers() {
  const { token, user } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getUsers({ search }, token);
      setUsers(response.data || []);
    } catch (e) {
      setUsers([]);
    }
    setLoading(false);
  }, [search, token]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModal(true);
  };

  const openEdit = (target) => {
    setEditing(target);
    setForm({
      name: target.name,
      email: target.email,
      password: '',
      role: target.role,
    });
    setModal(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);

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
      alert(e.message);
    }

    setSaving(false);
  };

  if (user?.role !== 'Admin') {
    return (
      <div className="content">
        <Card>
          <CardBody style={{ padding: 24, color: '#8b949e' }}>
            Admin access is required to manage users.
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h4 style={{ color: '#e6edf3', margin: 0 }}>Users</h4>
          <p style={{ color: '#8b949e', fontSize: 13, marginTop: 4 }}>
            Manage operator access and role assignments for the Command Center.
          </p>
        </div>
        <Button color="info" onClick={openCreate} style={{ fontSize: 12 }}>
          <i className="fas fa-user-plus" style={{ marginRight: 6 }} />Add User
        </Button>
      </div>

      <Card style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8 }}>
        <CardHeader style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '12px 18px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search users by name or email"
              style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', maxWidth: 320 }}
            />
            {loading && <Spinner size="sm" color="info" />}
          </div>
        </CardHeader>
        <CardBody style={{ padding: 0 }}>
          {users.length === 0 ? (
            <div style={{ padding: 36, textAlign: 'center', color: '#555' }}>
              No users found.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#0d1117' }}>
                    {['Name', 'Email', 'Role', 'Created', 'Actions'].map(header => (
                      <th key={header} style={{ padding: '10px 12px', fontSize: 11, color: '#8b949e', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #21262d' }}>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: '#e6edf3' }}>{item.name}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: '#8b949e' }}>{item.email}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: '#8b949e' }}>{item.role}</td>
                      <td style={{ padding: '10px 12px', fontSize: 11, color: '#555' }}>{item.created_at?.slice(0, 10)}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <Button size="sm" color="secondary" outline onClick={() => openEdit(item)} style={{ fontSize: 11 }}>
                          Edit
                        </Button>
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
          <ModalHeader toggle={() => setModal(false)} style={{ background: '#161b22', color: '#e6edf3', borderBottom: '1px solid #30363d' }}>
            {editing ? 'Edit User' : 'Create User'}
          </ModalHeader>
          <ModalBody style={{ background: '#161b22' }}>
            {[
              ['name', 'Name', 'text'],
              ['email', 'Email', 'email'],
            ].map(([key, label, type]) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', color: '#8b949e', fontSize: 12, marginBottom: 4 }}>{label}</label>
                <Input
                  type={type}
                  value={form[key]}
                  onChange={e => setForm(current => ({ ...current, [key]: e.target.value }))}
                  style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9' }}
                  required
                />
              </div>
            ))}

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', color: '#8b949e', fontSize: 12, marginBottom: 4 }}>
                Password {editing ? '(leave blank to keep existing)' : ''}
              </label>
              <Input
                type="password"
                value={form.password}
                onChange={e => setForm(current => ({ ...current, password: e.target.value }))}
                style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9' }}
                required={!editing}
              />
            </div>

            <div>
              <label style={{ display: 'block', color: '#8b949e', fontSize: 12, marginBottom: 4 }}>Role</label>
              <Input
                type="select"
                value={form.role}
                onChange={e => setForm(current => ({ ...current, role: e.target.value }))}
                style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9' }}
              >
                {ROLES.map(role => <option key={role} value={role}>{role}</option>)}
              </Input>
            </div>
          </ModalBody>
          <ModalFooter style={{ background: '#161b22', borderTop: '1px solid #30363d' }}>
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
