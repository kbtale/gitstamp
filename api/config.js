export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientId = process.env.GITHUB_CLIENT_ID || process.env.VITE_GITHUB_APP_CLIENT_ID || '';
  const appSlug = process.env.GITHUB_APP_SLUG || process.env.VITE_GITHUB_APP_SLUG || '';

  return res.status(200).json({
    clientId,
    appSlug
  });
}
