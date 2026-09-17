import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';

export const PORT = Number(process.env.PORT || 3000);
export const SITE_PASSWORD = String(process.env.SITE_PASSWORD || 'letmein');
export const SESSION_SECRET = String(process.env.SESSION_SECRET || 'dev-secret-change-me');
export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const DB_PATH = path.join(DATA_DIR, 'chirper.db');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB
