import { useState, useEffect, useCallback } from 'react';
import { getSessions, deleteSession, logout, getLatestSummary } from '../services/api';
import { useNavigate } from 'react-router-dom';
import CreateSession from './CreateSession';

export default function Dashboard() {
  const [sessions, setSessions]     = useState([]);
  const [summary, setSummary]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch]         = useState('');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sessData, sumData] = await Promise.all([
        getSessions({ limit: 50 }),
        getLatestSummary(),
      ]);
      setSessions(sessData.items || []);
      setSummary(sumData);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this session?')) return;
    try {
      await deleteSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
    } catch { /* ignore */ }
  }

  const email = parseEmail();
  const totalMin = sessions.reduce((acc, s) => acc + (parseInt(s.duration) || 0), 0);
  const projects = [...new Set(sessions.map(s => s.project).filter(Boolean))];
  const filtered = sessions.filter(s =>
    !search || s.project?.toLowerCase().includes(search.toLowerCase()) ||
    s.worked_on?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={S.page}>
      {/* Nav */}
      <nav style={S.nav}>
        <span style={S.navLogo}>📝 DevLog</span>
        <div style={S.navRight}>
          <span style={S.navEmail}>{email}</span>
          <button onClick={handleLogout} style={S.logoutBtn}>Logout</button>
        </div>
      </nav>

      <div style={S.container}>
        {/* Stats */}
        <div style={S.statsRow}>
          <StatCard label="Total Sessions" value={sessions.length} icon="🗂️" />
          <StatCard label="Time Tracked" value={`${Math.round(totalMin / 60 * 10) / 10}h`} icon="⏱️" />
          <StatCard label="Projects" value={projects.length} icon="📁" />
          {summary && <StatCard label="Weekly Sessions" value={summary.total_sessions} icon="📊" />}
        </div>

        {/* Sessions Header */}
        <div style={S.sectionHeader}>
          <h2 style={S.sectionTitle}>Sessions</h2>
          <div style={S.headerRight}>
            <input
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={S.searchInput}
            />
            <button onClick={() => setShowCreate(true)} style={S.newBtn}>
              + New Session
            </button>
          </div>
        </div>

        {/* Sessions List */}
        {loading ? (
          <div style={S.emptyState}>Loading sessions...</div>
        ) : filtered.length === 0 ? (
          <div style={S.emptyState}>
            {search ? 'No sessions match your search.' : 'No sessions yet. Log your first one!'}
          </div>
        ) : (
          <div style={S.sessionsList}>
            {filtered.map(session => (
              <SessionCard key={session.id} session={session} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateSession
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <div style={S.statCard}>
      <span style={S.statIcon}>{icon}</span>
      <span style={S.statValue}>{value}</span>
      <span style={S.statLabel}>{label}</span>
    </div>
  );
}

function SessionCard({ session, onDelete }) {
  const statusColor = { active: '#10b981', DRAFT: '#f59e0b', completed: '#6366f1' };
  const date = new Date(session.date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  return (
    <div style={S.sessionCard}>
      <div style={S.cardTop}>
        <div style={S.cardLeft}>
          <span style={S.projectName}>{session.project || 'No project'}</span>
          <span style={{ ...S.statusBadge, background: statusColor[session.status] || '#374151' }}>
            {session.status}
          </span>
        </div>
        <div style={S.cardRight}>
          <span style={S.cardDate}>{date}</span>
          <span style={S.cardDuration}>⏱ {session.duration} min</span>
          <button onClick={() => onDelete(session.id)} style={S.deleteBtn} title="Delete">✕</button>
        </div>
      </div>
      <p style={S.workedOn}>{session.worked_on}</p>
      {session.what_learned && (
        <p style={S.learned}><span style={S.learnedLabel}>Learned:</span> {session.what_learned}</p>
      )}
      {session.blockers && (
        <p style={S.blockers}><span style={S.blockersLabel}>Blockers:</span> {session.blockers}</p>
      )}
    </div>
  );
}

function parseEmail() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return '';
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.sub || '';
  } catch { return ''; }
}

const S = {
  page: { minHeight: '100vh', background: '#0a0f1e', color: '#f9fafb' },
  nav: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 24px', height: '56px',
    background: '#111827', borderBottom: '1px solid #374151',
    position: 'sticky', top: 0, zIndex: 10,
  },
  navLogo: { fontWeight: '700', fontSize: '16px', color: '#f9fafb' },
  navRight: { display: 'flex', alignItems: 'center', gap: '16px' },
  navEmail: { color: '#9ca3af', fontSize: '13px' },
  logoutBtn: {
    padding: '6px 14px', borderRadius: '6px', border: '1px solid #374151',
    background: 'transparent', color: '#9ca3af', cursor: 'pointer', fontSize: '13px',
  },
  container: { maxWidth: '860px', margin: '0 auto', padding: '32px 24px' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '32px' },
  statCard: {
    background: '#1f2937', border: '1px solid #374151', borderRadius: '10px',
    padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
  },
  statIcon: { fontSize: '22px' },
  statValue: { fontSize: '28px', fontWeight: '700', color: '#f9fafb' },
  statLabel: { fontSize: '12px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' },
  sectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' },
  sectionTitle: { margin: 0, fontSize: '18px', fontWeight: '600', color: '#f9fafb' },
  headerRight: { display: 'flex', gap: '12px', alignItems: 'center' },
  searchInput: {
    padding: '8px 14px', borderRadius: '8px', border: '1px solid #374151',
    background: '#1f2937', color: '#f9fafb', fontSize: '13px', outline: 'none', width: '180px',
  },
  newBtn: {
    padding: '8px 18px', borderRadius: '8px', border: 'none',
    background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: '600',
  },
  emptyState: { textAlign: 'center', color: '#9ca3af', padding: '60px 0', fontSize: '15px' },
  sessionsList: { display: 'flex', flexDirection: 'column', gap: '12px' },
  sessionCard: {
    background: '#1f2937', border: '1px solid #374151', borderRadius: '10px',
    padding: '18px 20px',
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
  cardLeft: { display: 'flex', alignItems: 'center', gap: '10px' },
  projectName: { fontWeight: '600', fontSize: '15px', color: '#f9fafb' },
  statusBadge: {
    padding: '2px 10px', borderRadius: '999px', fontSize: '11px',
    fontWeight: '600', color: '#fff', textTransform: 'uppercase',
  },
  cardRight: { display: 'flex', alignItems: 'center', gap: '14px' },
  cardDate: { color: '#9ca3af', fontSize: '13px' },
  cardDuration: { color: '#9ca3af', fontSize: '13px' },
  deleteBtn: {
    background: 'transparent', border: 'none', color: '#6b7280',
    cursor: 'pointer', fontSize: '14px', padding: '2px 6px', borderRadius: '4px',
  },
  workedOn: { margin: '0 0 8px', color: '#e5e7eb', fontSize: '14px', lineHeight: '1.5' },
  learned: { margin: '0 0 6px', fontSize: '13px', color: '#9ca3af', lineHeight: '1.5' },
  learnedLabel: { color: '#10b981', fontWeight: '600' },
  blockers: { margin: '0', fontSize: '13px', color: '#9ca3af', lineHeight: '1.5' },
  blockersLabel: { color: '#f59e0b', fontWeight: '600' },
};
