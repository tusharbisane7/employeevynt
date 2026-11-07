
const API =
  import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Get authentication token
export function getToken() {
  return localStorage.getItem('vyt_token');
}

// Common API request function
export async function api(path, options = {}) {
  const token = getToken();

  const headers = {
    ...(options.body instanceof FormData
      ? {}
      : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    throw new Error('Your session has expired. Please login again.');
  }

  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }

  return data;
}

// Generate normal file URL
export function fileUrl(path) {
  if (!path) return '';

  return `${API.replace(/\/api\/?$/, '')}${path}`;
}

// Open protected PDF or document with authentication
export async function openProtectedFile(path) {
  if (!path) {
    throw new Error('Document path is missing.');
  }

  const token = getToken();

  if (!token) {
    throw new Error('Authentication required. Please login again.');
  }

  const response = await fetch(fileUrl(path), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    throw new Error('Your session has expired. Please login again.');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Unable to open document.');
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  const newWindow = window.open(objectUrl, '_blank');

  if (!newWindow) {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'document.pdf';
    link.click();
  }

  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
}

// Export API configuration
export { API };
