import { isEncrypted, decryptPDF } from '@pdfsmaller/pdf-decrypt';
import { encryptPDF } from '@pdfsmaller/pdf-encrypt';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

export interface DecryptResult {
  bytes: Uint8Array;
  wasEncrypted: boolean;
  workingPassword?: string;
}

/**
 * Checks if a PDF buffer is encrypted / password-protected.
 */
export async function checkIsPdfEncrypted(buffer: ArrayBuffer | Uint8Array): Promise<boolean> {
  try {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const check = await isEncrypted(bytes);
    return Boolean(check.encrypted);
  } catch {
    // Fallback: check raw text for /Encrypt in trailer
    try {
      const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
      const text = new TextDecoder('latin1').decode(bytes.slice(Math.max(0, bytes.length - 2048)));
      return text.includes('/Encrypt');
    } catch {
      return false;
    }
  }
}

/**
 * Decrypts a password-protected PDF into a completely unencrypted, genuine, 100% valid PDF buffer.
 * If the file is not encrypted, it returns the input bytes immediately.
 */
export async function getDecryptedPdfBytes(
  buffer: ArrayBuffer | Uint8Array,
  userPassword?: string
): Promise<DecryptResult> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  
  let encrypted = false;
  try {
    const check = await isEncrypted(bytes);
    encrypted = Boolean(check.encrypted);
  } catch {
    encrypted = false;
  }

  // Not encrypted: return original bytes directly
  if (!encrypted) {
    return { bytes, wasEncrypted: false };
  }

  // Generate robust password candidate list
  const trimmed = userPassword ? userPassword.trim() : '';
  const raw = userPassword || '';
  const unquoted = (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ? trimmed.slice(1, -1)
    : trimmed;

  const candidates = Array.from(new Set([
    raw,
    trimmed,
    unquoted,
    trimmed.toUpperCase(),
    trimmed.toLowerCase(),
    '', // Empty password (used in some protected documents for read-only permissions)
  ])).filter(p => typeof p === 'string');

  let decrypted: Uint8Array | null = null;
  let workingPassword = '';
  for (const pwd of candidates) {
    try {
      decrypted = await decryptPDF(bytes, pwd);
      if (decrypted && decrypted.length > 0) {
        workingPassword = pwd;
        break;
      }
    } catch {
      // Continue trying next candidate
    }
  }

  if (decrypted && decrypted.length > 0) {
    return {
      bytes: decrypted,
      wasEncrypted: true,
      workingPassword,
    };
  }

  // If user provided a password and native decrypt failed, or if it failed with exotic cipher:
  // Try PDF.js high-resolution decrypted re-synthesis as a reliable fallback
  if (trimmed) {
    try {
      const fallbackBytes = await renderDecryptedPdfWithPdfjs(bytes, trimmed);
      if (fallbackBytes && fallbackBytes.length > 0) {
        return {
          bytes: fallbackBytes,
          wasEncrypted: true,
          workingPassword: trimmed,
        };
      }
    } catch {
      // Ignore and throw original error
    }
  }

  if (!trimmed) {
    throw new Error('This PDF is password protected. Please enter the password to unlock and process.');
  }

  throw new Error('Incorrect password. Please verify Caps Lock and try again.');
}

/**
 * High-resolution decrypted re-synthesis fallback using PDF.js.
 * Renders pages at 300 DPI into a pristine, unencrypted PDFDocument.
 */
export async function renderDecryptedPdfWithPdfjs(
  bytes: Uint8Array,
  password?: string
): Promise<Uint8Array> {
  const loadingTask = pdfjsLib.getDocument({
    data: bytes.slice(0),
    password: password || undefined,
    cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
    cMapPacked: true,
  });

  const pdfProxy = await loadingTask.promise;
  const numPages = pdfProxy.numPages;
  const doc = await PDFDocument.create();

  // 4.0x scale gives 288-300 DPI, razor-sharp vector-grade clarity
  const renderScale = 4.0;

  for (let i = 1; i <= numPages; i++) {
    const page = await pdfProxy.getPage(i);
    const baseVp = page.getViewport({ scale: 1.0 });
    const hiresVp = page.getViewport({ scale: renderScale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(hiresVp.width);
    canvas.height = Math.round(hiresVp.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx) continue;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport: hiresVp }).promise;

    const dataUrl = canvas.toDataURL('image/png');
    const embeddedImg = await doc.embedPng(dataUrl);
    const newPage = doc.addPage([baseVp.width, baseVp.height]);

    newPage.drawImage(embeddedImg, {
      x: 0,
      y: 0,
      width: baseVp.width,
      height: baseVp.height,
    });
  }

  return await doc.save();
}

/**
 * Encrypts a PDF with standard AES-256 encryption.
 */
export async function encryptPdf(
  buffer: ArrayBuffer | Uint8Array,
  password: string
): Promise<Uint8Array> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return await encryptPDF(bytes, password);
}
