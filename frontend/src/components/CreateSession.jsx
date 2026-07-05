import { useState } from 'react';
import { createSession } from '../services/api';

export default function CreateSession({ onClose, onCreated }) {
  const [form, setForm] = useState({
    project: '', worked_on: '', what_learned: '',
    duration: '', blockers: '', status: 'active',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await createSession(form);
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={S.modalHeader}>
          <h2 style={S.modalTitle}>Log Session</h2>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={S.form}>
          <div style={S.row}>
            <Field label="Project" name="project" value={form.project}
              onChange={handleChange} placeholder="e.g. DevLog Backend" required />
            <Field label="Duration (minutes)" name="duration" value={form.duration}
              onChange={handleChange} placeholder="e.g. 90" required />
          </div>

          <Field label="What did you work on?" name="worked_on" value={form.worked_on}
            onChange={handleChange} placeholder="Describe what you built or fixed..." required multiline />

          <Field label="What did you learn?" name="what_learned" value={form.what_learned}
            onChange={handleChange} placeholder="Key takeaways, new concepts..." multiline />

          <Field label="Blockers" name="blockers" value={form.blockers}
            onChange={handleChange} placeholder="What slowed you down? (leave blank if none)" multiline />

          <div style={S.fieldGroup}>
            <label style={S.label}>Status</label>
            <select name="status" value={form.status} onChange={handleChange} style={S.input}>
              <option value="active">Active</option>
              <option value="DRAFT">Draft</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {error && <p style={S.error}>{error}</p>}

          <div style={S.actions}>
            <button type="button" onClick={onClose} style={S.cancelBtn}>Cancel</button>
            <button type="submit" disabled={loading} style={S.submitBtn}>
              {loading ? 'Saving...' : 'Save Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, name, value, onChange, placeholder, required, multiline }) {
  const S2 = {
    group: { display: 'flex', flexDirection: 'column', flex: 1 },
    label: { fontSize: '13px', color: '#9ca3af', marginBottom: '6px', fontWeight: '500' },
    input: {
      padding: '10px 14px', borderRadius: '8px', border: '1px solid #374151',
      background: '#111827', color: '#f9fafb', fontSize: '14px', outline: 'none',
      resize: 'vertical', minHeight: multiline ? '80px' : 'auto', fontFamily: 'inherit',
    },
  };
  return (
    <div style={S2.group}>
      <label style={S2.label}>{label}{required && ' *'}</label>
      {multiline
        ? <textarea name={name} value={value} onChange={onChange} placeholder={placeholder} style={S2.input} required={required} />
        : <input name={name} value={value} onChange={onChange} placeholder={placeholder} style={S2.input} required={required} />
      }
    </div>
  );
}

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px',
  },
  modal: {
    background: '#1f2937', border: '1px solid #374151', borderRadius: '12px',
    width: '100%', maxWidth: '620px', maxHeight: '90vh', overflowY: 'auto',
    padding: '28px',
  },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  modalTitle: { margin: 0, fontSize: '18px', fontWeight: '700', color: '#f9fafb' },
  closeBtn: { background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '18px' },
  form: { display: 'flex', flexDirection: 'column', gap: '16px' },
  row: { display: 'flex', gap: '16px' },
  fieldGroup: { display: 'flex', flexDirection: 'column' },
  label: { fontSize: '13px', color: '#9ca3af', marginBottom: '6px', fontWeight: '500' },
  input: {
    padding: '10px 14px', borderRadius: '8px', border: '1px solid #374151',
    background: '#111827', color: '#f9fafb', fontSize: '14px', outline: 'none',
  },
  error: { color: '#ef4444', fontSize: '13px', margin: 0 },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' },
  cancelBtn: {
    padding: '10px 20px', borderRadius: '8px', border: '1px solid #374151',
    background: 'transparent', color: '#9ca3af', cursor: 'pointer', fontSize: '14px',
  },
  submitBtn: {
    padding: '10px 24px', borderRadius: '8px', border: 'none',
    background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: '600',
  },
};
