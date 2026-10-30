export function getAuthHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
