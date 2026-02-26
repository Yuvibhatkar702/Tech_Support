/**
 * imageClassificationService.js
 * GrievancePortal/server/services/imageClassificationService.js
 *
 * Sends the complaint image to the Python FastAPI /classify endpoint and
 * returns the predicted category.
 *
 * Uses ONLY built-in Node.js modules (http / https / fs / path / crypto)
 * — no extra npm packages required.
 *
 * Add this to GrievancePortal/server/.env:
 *   AI_CLASSIFIER_URL=http://localhost:8000
 */

'use strict';

const http   = require('http');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const CLASSIFIER_URL = process.env.AI_CLASSIFIER_URL || 'http://localhost:8000';
const TIMEOUT_MS     = 15000; // 15 seconds

const VALID_CATEGORIES = new Set([
  'Damaged Road Issue',
  'Fallen Trees',
  'Garbage and Trash Issue',
  'Illegal Drawing on Walls',
  'Street Light Issue',
  'Other',
]);

// Default fallback category when classification fails (must be in VALID_CATEGORIES)
const DEFAULT_CATEGORY = 'Other';

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a multipart/form-data body buffer from a file on disk.
 * Returns { buffer, boundary }.
 */
function buildMultipartBody(fieldName, filePath) {
  const boundary  = '----FormBoundary' + crypto.randomBytes(12).toString('hex');
  const filename  = path.basename(filePath);
  const fileData  = fs.readFileSync(filePath);          // sync is fine — file already on disk

  const head = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
    `Content-Type: image/jpeg\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);

  return {
    buffer:   Buffer.concat([head, fileData, tail]),
    boundary,
  };
}

/**
 * Fire an HTTP/HTTPS POST request and resolve with the parsed JSON body.
 */
function postRequest(urlString, body, headers) {
  return new Promise((resolve, reject) => {
    const url      = new URL(urlString);
    const driver   = url.protocol === 'https:' ? https : http;
    const options  = {
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname + url.search,
      method:   'POST',
      headers,
      timeout:  TIMEOUT_MS,
    };

    const req = driver.request(options, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(new Error(`Non-JSON response from classifier: ${raw.slice(0, 200)}`));
          }
        } else {
          reject(new Error(`Classifier returned HTTP ${res.statusCode}: ${raw.slice(0, 200)}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Classifier request timed out after ${TIMEOUT_MS / 1000}s`));
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * classifyImage
 * ------------------------------------------------------------------
 * @param  {string} imagePath  Absolute path to the (compressed) image on disk
 * @returns {Promise<{ category: string, rawLabel: string, confidence: string }>}
 *
 * Always resolves — falls back to DEFAULT_CATEGORY on any error so the
 * complaint submission is never blocked.
 */
async function classifyImage(imagePath) {
  // Guard: file must exist
  if (!imagePath || !fs.existsSync(imagePath)) {
    console.warn('[imageClassification] File not found:', imagePath);
    return { category: DEFAULT_CATEGORY, rawLabel: 'unknown', confidence: 'low' };
  }

  try {
    const { buffer, boundary } = buildMultipartBody('image', imagePath);

    const data = await postRequest(
      `${CLASSIFIER_URL}/classify`,
      buffer,
      {
        'Content-Type':   `multipart/form-data; boundary=${boundary}`,
        'Content-Length': buffer.length,
      }
    );

    const rawLabel      = data.raw_label  || 'unknown';
    const confidence    = data.confidence || 'high';
    const rawCategory   = (data.category  || '').trim();  // Don't lowercase - preserve PascalCase!
    const safeCategory  = VALID_CATEGORIES.has(rawCategory) ? rawCategory : DEFAULT_CATEGORY;

    console.log(
      `[imageClassification] ✓  raw="${rawLabel}"  →  category="${safeCategory}"  confidence="${confidence}"`
    );

    return { category: safeCategory, rawLabel, confidence };

  } catch (err) {
    console.error('[imageClassification] ✗  Classification failed:', err.message);
    return { category: DEFAULT_CATEGORY, rawLabel: 'error', confidence: 'none' };
  }
}

module.exports = { classifyImage };