import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const projectRoot = process.cwd();
const utf8StrictDecoder = new TextDecoder('utf-8', { fatal: true });

const textFileExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.html',
  '.md',
  '.sql',
  '.yml',
  '.yaml',
  '.sh',
  '.txt',
]);

const skipPathPrefixes = [
  'dist/',
  'node_modules/',
  '.tmp_studio_chunks/',
];

const skipMojibakePatternCheckFiles = new Set([
  '.tmp_studio.html',
  '.tmp_studio_chunk_14.js',
  '.tmp_studio_chunk_2d.js',
]);

const suspiciousPatterns = [
  { name: 'replacement-character', regex: /\uFFFD/ },
  { name: 'latin1-arabic-mojibake', regex: /[\u00D8\u00D9\u00DA\u00DB][\u0080-\u00FF]/ },
  { name: 'double-encoded-arabic-mojibake', regex: /[\u0637\u0638\u0639\u063A\u0623][\u00A0-\u00FF]/ },
  { name: 'cp1252-mojibake', regex: /(?:\u00C3.|\u00C2.|\u00E2\u20AC|\u00EF\u00BB\u00BF|\u00EF\u00BF\u00BD)/ },
];

const trackedFiles = execSync('git ls-files -z', { cwd: projectRoot, encoding: 'buffer' })
  .toString('utf8')
  .split('\0')
  .filter(Boolean);

const isTextFile = (relativeFile) => {
  if (relativeFile.startsWith('.tmp_')) return true;
  const baseName = path.basename(relativeFile);
  if (baseName.startsWith('.env')) return true;
  const extension = path.extname(relativeFile).toLowerCase();
  return textFileExtensions.has(extension);
};

const issues = [];

for (const relativeFile of trackedFiles) {
  if (skipPathPrefixes.some((prefix) => relativeFile.startsWith(prefix))) continue;
  if (!isTextFile(relativeFile)) continue;

  const filePath = path.join(projectRoot, relativeFile);
  const fileBytes = fs.readFileSync(filePath);

  let content = '';
  try {
    content = utf8StrictDecoder.decode(fileBytes);
  } catch {
    issues.push(`${relativeFile}: file is not valid UTF-8`);
    continue;
  }

  if (skipMojibakePatternCheckFiles.has(relativeFile)) continue;

  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const pattern of suspiciousPatterns) {
      if (pattern.regex.test(line)) {
        issues.push(`${relativeFile}:${index + 1} suspicious pattern \"${pattern.name}\"`);
        break;
      }
    }
  });
}

if (issues.length > 0) {
  console.error('Encoding check failed. Possible mojibake/encoding issues:');
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exit(1);
}

console.log(`Encoding check passed. Scanned ${trackedFiles.length} tracked files.`);
