const API_URL = 'http://localhost:8000';

// Helper to get token
const getToken = () => localStorage.getItem('token');

// Login
export async function login(username, password) {
  const formData = new URLSearchParams();
  formData.append('username', username);
  formData.append('password', password);
  
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData
  });
  
  if (!response.ok) throw new Error('Bad credentials');
  
  const data = await response.json();
  localStorage.setItem('token', data.access_token);
  return data;
}

// Get sessions
export async function getSessions() {
  const response = await fetch(`${API_URL}/sessions/`, {
    headers: { 'Authorization': `Bearer ${getToken()}` }
  });
  
  if (!response.ok) throw new Error('Failed to fetch sessions');
  return response.json();
}

// Create session
export async function createSession(sessionData) {
  const response = await fetch(`${API_URL}/sessions/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(sessionData)
  });
  
  if (!response.ok) throw new Error('Failed to create session');
  return response.json();
}