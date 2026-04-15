import React from 'react';
import { NavLink, useParams } from 'react-router-dom';

const NAV_ITEMS = [
  { to: 'overview',  label: 'Overview',  icon: 'fas fa-tachometer-alt' },
  { to: 'scope',     label: 'Scope',     icon: 'fas fa-crosshairs' },
  { to: 'wizard',    label: 'Wizard',    icon: 'fas fa-magic' },
  { to: 'entities',  label: 'Entities',  icon: 'fas fa-globe' },
  { to: 'modules',   label: 'Modules',   icon: 'fas fa-cubes' },
  { to: 'findings',  label: 'Findings',  icon: 'fas fa-bug' },
  { to: 'runs',      label: 'Runs',      icon: 'fas fa-play-circle' },
  { to: 'report',    label: 'Report',    icon: 'fas fa-file-alt' },
];

export default function ProjectNav() {
  const { id } = useParams();

  if (!id) return null;

  return (
    <div className="metis-project-nav" style={{ paddingLeft: 0, marginBottom: 0, paddingBottom: 12 }}>
      {NAV_ITEMS.map(item => (
        <NavLink
          key={item.to}
          to={`/metis/projects/${id}/${item.to}`}
          style={({ isActive }) => ({
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 12,
            padding: '4px 12px',
            borderRadius: 20,
            textDecoration: 'none',
            color: isActive ? '#4fc3f7' : '#8b949e',
            background: isActive ? 'rgba(79,195,247,0.1)' : 'transparent',
            border: isActive ? '1px solid rgba(79,195,247,0.3)' : '1px solid transparent',
            transition: 'all 0.15s',
          })}
        >
          <i className={item.icon} style={{ fontSize: 10 }} />
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}
