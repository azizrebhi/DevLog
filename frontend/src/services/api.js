const API_URL = 'http://localhost:8000';

const getToken = () => localStorage.getItem('token');

export async function register(email, password) {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Registration failed');
  }
  return res.json();
}

export async function login(email, password) {
  const form = new URLSearchParams();
  form.append('username', email);
  form.append('password', password);
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  if (!res.ok) throw new Error('Invalid credentials');
  const data = await res.json();
  localStorage.setItem('token', data.access_token);
  return data;
}

export function logout() {
  localStorage.removeItem('token');
}

export async function getSessions(params = {}) {
  const query = new URLSearchParams();
  if (params.project) query.set('project', params.project);
  if (params.limit)   query.set('limit', params.limit);
  if (params.cursor)  query.set('cursor', params.cursor);
  const res = await fetch(`${API_URL}/sessions/?${query}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (res.status === 401) { logout(); window.location.href = '/login'; }
  if (!res.ok) throw new Error('Failed to fetch sessions');
  return res.json();
}

export async function createSession(data) {
  const res = await fetch(`${API_URL}/sessions/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create session');
  return res.json();
}

export async function deleteSession(id) {
  const res = await fetch(`${API_URL}/sessions/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Failed to delete session');
  return res.ok;
}

export async function getLatestSummary() {
  const res = await fetch(`${API_URL}/summary/latest`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to fetch summary');
  return res.json();
}
