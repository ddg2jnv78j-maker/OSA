import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { runAndroidSha1Diagnostic } from './verify-android-sha1.mjs';

// 1. Run the standard Vite production build
console.log('Running Vite production build...');
execSync('npx vite build', { stdio: 'inherit' });

// 1b. Ensure CNAME, 404.html SPA fallback, and /OSA/ legacy path compatibility exist in ./dist
const distDir = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  fs.writeFileSync(path.join(distDir, 'CNAME'), 'osa-chat.com\n', 'utf8');
  const indexHtmlPath = path.join(distDir, 'index.html');
  if (fs.existsSync(indexHtmlPath)) {
    fs.copyFileSync(indexHtmlPath, path.join(distDir, '404.html'));
    const legacyOsaDir = path.join(distDir, 'OSA');
    fs.mkdirSync(legacyOsaDir, { recursive: true });
    fs.copyFileSync(indexHtmlPath, path.join(legacyOsaDir, 'index.html'));
    const assetsDir = path.join(distDir, 'assets');
    if (fs.existsSync(assetsDir)) {
      fs.cpSync(assetsDir, path.join(legacyOsaDir, 'assets'), { recursive: true });
    }
  }
}

// 2. Verify and report the Android APK signing certificate SHA-1 and SHA-256 fingerprints
runAndroidSha1Diagnostic();

// 2. When running inside GitHub Actions, wait for GitHub's legacy "pages build and deployment"
// workflow on the same commit to finish first, so that "Deploy Vite app to GitHub Pages"
// always deploys LAST and ./dist is never overwritten by the raw source branch.
async function waitForLegacyPagesWorkflow() {
  if (process.env.GITHUB_ACTIONS !== 'true') {
    return;
  }

  const repo = process.env.GITHUB_REPOSITORY || 'ddg2jnv78j-maker/OSA';
  const sha = process.env.GITHUB_SHA || '';
  if (!sha) return;

  console.log(
    `[GitHub Pages Sync] Ensuring legacy "pages build and deployment" for ${sha.slice(
      0,
      7
    )} completes before deploying ./dist...`
  );

  // Initial 6s wait to allow GitHub to register both workflow runs
  await new Promise((r) => setTimeout(r, 6000));

  const maxAttempts = 22; // up to ~110s max
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const url = `https://api.github.com/repos/${repo}/actions/runs?head_sha=${sha}&per_page=10`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'osa-gh-pages-sync',
          Accept: 'application/vnd.github+json',
        },
      });

      if (res.ok) {
        const data = await res.json();
        const runs = data.workflow_runs || [];
        const legacyRun = runs.find(
          (r) =>
            r.name === 'pages build and deployment' ||
            (r.path && r.path.includes('pages-build-deployment'))
        );

        if (!legacyRun) {
          if (attempt >= 3) {
            console.log('[GitHub Pages Sync] No legacy pages workflow detected. Proceeding.');
            break;
          }
        } else {
          console.log(
            `[GitHub Pages Sync] Attempt ${attempt}/${maxAttempts}: legacy workflow status=${legacyRun.status}`
          );
          if (legacyRun.status === 'completed') {
            console.log(
              '[GitHub Pages Sync] Legacy workflow completed. Waiting 5s buffer so ./dist deployment wins...'
            );
            await new Promise((r) => setTimeout(r, 5000));
            break;
          }
        }
      }
    } catch (err) {
      console.log('[GitHub Pages Sync] API check warning:', err?.message || err);
    }

    await new Promise((r) => setTimeout(r, 5000));
  }
}

await waitForLegacyPagesWorkflow();
