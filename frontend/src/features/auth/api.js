const API_BASE = "http://127.0.0.1:8000";

export async function loginRequest(email, password) {
  const body = new URLSearchParams();
  body.append("username", email);
  body.append("password", password);

  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    throw new Error("Invalid credentials");
  }

  return res.json();
}

export function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
  };
}