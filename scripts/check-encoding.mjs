import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();

const protectedFiles = [
  'components/moduleShow/HeroSection.tsx',
  'components/RecordFilesManager.tsx',
  'pages/FilesGalleryPage.tsx',
];

const suspiciousTokens = [
  'Ã',
  'Â',
  'â€',
  '�',
  'ط§',
  'ط¢',
  'ط®',
  'ط¯',
  'ط±',
  'ط²',
  'ط³',
  'ط´',
  'ط·',
  'ط¸',
  'ظ…',
  'ظ†',
  'ظˆ',
  'غŒ',
];

const issues = [];

for (const relativeFile of protectedFiles) {
  const filePath = path.join(projectRoot, relativeFile);
  if (!fs.existsSync(filePath)) continue;

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const token of suspiciousTokens) {
      if (line.includes(token)) {
        issues.push(`${relativeFile}:${index + 1} suspicious token "${token}"`);
        break;
      }
    }
  });
}

if (issues.length > 0) {
  console.error('Encoding check failed. Possible mojibake detected:');
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exit(1);
}

console.log('Encoding check passed.');
