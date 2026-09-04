import { existsSync, readFileSync } from 'node:fs';

const envFiles = ['.env', '.env.local', '.env.production', '.env.production.local'];

function readEnvValue(name) {
  let result = process.env[name];

  for (const file of envFiles) {
    if (!existsSync(file)) continue;

    const match = readFileSync(file, 'utf8').match(new RegExp(`^${name}\\s*=\\s*(.+?)\\s*$`, 'm'));
    if (match) {
      result = match[1].replace(/^(?:"|')|(?:"|')$/g, '');
    }
  }

  return result?.trim();
}

const value = process.env.VITE_SUPABASE_URL?.trim() || readEnvValue('VITE_SUPABASE_URL');

if (!value) {
  throw new Error('VITE_SUPABASE_URL is required for a production build.');
}

let url;

try {
  url = new URL(value);
} catch {
  throw new Error('VITE_SUPABASE_URL must be a valid absolute URL.');
}

if (url.protocol !== 'https:') {
  throw new Error(
    'VITE_SUPABASE_URL must use HTTPS for production. An HTTP Supabase URL is blocked by browsers when the app is served over HTTPS.',
  );
}

if (url.username || url.password || url.hash) {
  throw new Error('VITE_SUPABASE_URL must not include credentials or a URL fragment.');
}
