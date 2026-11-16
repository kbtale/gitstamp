export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, code_verifier, redirect_uri } = req.body || {};
  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  const clientId = process.env.GITHUB_CLIENT_ID || process.env.VITE_GITHUB_APP_CLIENT_ID || req.body?.client_id;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  const payload = {
    client_id: clientId,
    code,
    redirect_uri
  };

  if (clientSecret) {
    payload.client_secret = clientSecret;
  }
  if (code_verifier) {
    payload.code_verifier = code_verifier;
  }

  try {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'GitStamp'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Token exchange failed' });
  }
}
