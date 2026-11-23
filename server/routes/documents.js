import { Router } from 'express';
import { get, query, run } from '../db.js';
import { audit, requireAuth } from '../auth.js';
import { asyncHandler, badRequest, clampInt, cleanText, forbidden, newId, notFound, nowIso } from '../util.js';

export const documentsRouter = Router();

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/csv',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export const DOC_CATEGORIES = [
  ['policy', 'Safety Policy'],
  ['sop', 'SOP / Procedure'],
  ['risk_assessment', 'Risk Assessment'],
  ['method_statement', 'Method Statement'],
  ['checklist', 'Inspection Checklist'],
  ['emergency_plan', 'Emergency Plan'],
  ['training', 'Training Material'],
  ['statutory', 'Statutory / Legal'],
  ['other', 'Other'],
];

export const DOC_TYPES = [
  ['pdf', 'PDF'],
  ['spreadsheet', 'Excel'],
  ['image', 'Image'],
  ['word', 'Word Document'],
  ['other', 'Other'],
];

function sanitiseFileName(name) {
  return String(name || 'document')
    .replace(/[\\/\r\n\t]/g, '-')
    .replace(/[^\w.\-() ]+/g, '_')
    .slice(0, 120);
}

function decodeFile(input) {
  if (!input || typeof input !== 'object') return null;
  const raw = String(input.data || '');
  if (!raw) return null;
  const base64 = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) throw badRequest('The uploaded file is empty.');
  if (buffer.length > MAX_FILE_BYTES) throw badRequest('Files must be 5 MB or smaller.');
  const mime = String(input.mime || 'application/octet-stream').toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    throw badRequest('Unsupported file type. Upload a PDF, Excel, Word, CSV or image file.');
  }
  return {
    fileName: sanitiseFileName(input.name),
    mime,
    size: buffer.length,
    data: buffer.toString('base64'),
  };
}

function requireWriter(req) {
  if (req.user.permissions.readOnly) throw forbidden('Your role has read-only access.');
}

documentsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const page = clampInt(req.query.page, 1, 100000, 1);
    const pageSize = clampInt(req.query.pageSize, 1, 100, 20);
    const clauses = [];
    const params = [];
    if (req.query.q) {
      const term = `%${cleanText(req.query.q, 100)}%`;
      clauses.push('(title LIKE ? OR description LIKE ? OR file_name LIKE ?)');
      params.push(term, term, term);
    }
    if (req.query.category && req.query.category !== 'all') {
      clauses.push('category = ?');
      params.push(String(req.query.category));
    }
    if (req.query.status && req.query.status !== 'all') {
      clauses.push('status = ?');
      params.push(String(req.query.status));
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const totalRow = await get(`SELECT COUNT(*) AS total FROM documents ${where}`, params);
    const rows = await query(
      `SELECT id, title, category, doc_type, version, description, file_name, mime_type, file_size,
              review_date, status, uploaded_by, created_at, updated_at,
              CASE WHEN file_data IS NULL THEN 0 ELSE 1 END AS has_file
       FROM documents ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize],
    );
    const total = Number(totalRow?.total || 0);
    res.json({
      items: rows,
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      categories: DOC_CATEGORIES.map(([value, label]) => ({ value, label })),
      docTypes: DOC_TYPES.map(([value, label]) => ({ value, label })),
    });
  }),
);

documentsRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const doc = await get(
      `SELECT id, title, category, doc_type, version, description, file_name, mime_type, file_size,
              review_date, status, uploaded_by, created_at, updated_at,
              CASE WHEN file_data IS NULL THEN 0 ELSE 1 END AS has_file
       FROM documents WHERE id = ?`,
      [req.params.id],
    );
    if (!doc) throw notFound('Document not found.');
    const revisions = await query(
      `SELECT id, version, file_name, mime_type, file_size, notes, uploaded_by, created_at
       FROM document_revisions WHERE document_id = ? ORDER BY created_at DESC`,
      [doc.id],
    );
    res.json({ item: doc, revisions });
  }),
);

documentsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    requireWriter(req);
    const body = req.body || {};
    const title = cleanText(body.title, 200).trim();
    if (title.length < 3) throw badRequest('Document title is required.', { fields: { title: 'Title is required.' } });
    const category = DOC_CATEGORIES.some(([v]) => v === body.category) ? body.category : 'other';
    const file = decodeFile(body.file);
    const now = nowIso();
    const id = newId();
    await run(
      `INSERT INTO documents (id, title, category, doc_type, version, description, file_name, mime_type, file_size,
        file_data, review_date, status, uploaded_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        title,
        category,
        DOC_TYPES.some(([v]) => v === body.doc_type) ? body.doc_type : 'other',
        cleanText(body.version, 20).trim() || '1.0',
        cleanText(body.description, 4000).trim() || null,
        file?.fileName || null,
        file?.mime || null,
        file?.size || null,
        file?.data || null,
        cleanText(body.review_date, 10) || null,
        ['active', 'superseded', 'archived'].includes(body.status) ? body.status : 'active',
        req.user.username,
        now,
        now,
      ],
    );
    if (file) {
      await run(
        `INSERT INTO document_revisions (id, document_id, version, file_name, mime_type, file_size, file_data, notes, uploaded_by, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          newId(),
          id,
          cleanText(body.version, 20).trim() || '1.0',
          file.fileName,
          file.mime,
          file.size,
          file.data,
          'Initial upload',
          req.user.username,
          now,
        ],
      );
    }
    await audit(req, 'create', 'document', id, { title, category, file: file?.fileName || null });
    res.status(201).json({ item: await get('SELECT id, title, version FROM documents WHERE id = ?', [id]), message: 'Document saved.' });
  }),
);

documentsRouter.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    requireWriter(req);
    const doc = await get('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (!doc) throw notFound('Document not found.');
    const body = req.body || {};
    const updates = {};
    if (body.title !== undefined) {
      const title = cleanText(body.title, 200).trim();
      if (title.length < 3) throw badRequest('Document title is required.', { fields: { title: 'Title is required.' } });
      updates.title = title;
    }
    if (body.category !== undefined && DOC_CATEGORIES.some(([v]) => v === body.category)) updates.category = body.category;
    if (body.doc_type !== undefined && DOC_TYPES.some(([v]) => v === body.doc_type)) updates.doc_type = body.doc_type;
    if (body.description !== undefined) updates.description = cleanText(body.description, 4000).trim() || null;
    if (body.review_date !== undefined) updates.review_date = cleanText(body.review_date, 10) || null;
    if (body.status !== undefined && ['active', 'superseded', 'archived'].includes(body.status)) updates.status = body.status;

    const file = decodeFile(body.file);
    if (file) {
      const nextVersion = cleanText(body.version, 20).trim() || bumpVersion(doc.version);
      updates.file_name = file.fileName;
      updates.mime_type = file.mime;
      updates.file_size = file.size;
      updates.file_data = file.data;
      updates.version = nextVersion;
      await run(
        `INSERT INTO document_revisions (id, document_id, version, file_name, mime_type, file_size, file_data, notes, uploaded_by, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          newId(),
          doc.id,
          nextVersion,
          file.fileName,
          file.mime,
          file.size,
          file.data,
          cleanText(body.revision_note, 500).trim() || 'Revision uploaded',
          req.user.username,
          nowIso(),
        ],
      );
    } else if (body.version !== undefined && cleanText(body.version, 20).trim()) {
      updates.version = cleanText(body.version, 20).trim();
    }

    const columns = Object.keys(updates);
    if (!columns.length) throw badRequest('No changes were submitted.');
    await run(
      `UPDATE documents SET ${columns.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
      [...columns.map((c) => updates[c]), nowIso(), doc.id],
    );
    await audit(req, 'update', 'document', doc.id, { changed: columns });
    res.json({ message: file ? `New revision ${updates.version} saved.` : 'Document updated.' });
  }),
);

function bumpVersion(version) {
  const parts = String(version || '1.0').split('.');
  const major = Number.parseInt(parts[0], 10) || 1;
  const minor = Number.parseInt(parts[1], 10) || 0;
  return `${major}.${minor + 1}`;
}

documentsRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const doc = await get('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (!doc) throw notFound('Document not found.');
    const canDelete =
      ['super_admin', 'admin', 'hse_manager'].includes(req.user.role) || doc.uploaded_by === req.user.username;
    if (!canDelete || req.user.permissions.readOnly) throw forbidden('You cannot delete this document.');
    await run('DELETE FROM document_revisions WHERE document_id = ?', [doc.id]);
    await run('DELETE FROM documents WHERE id = ?', [doc.id]);
    await audit(req, 'delete', 'document', doc.id, { title: doc.title });
    res.json({ message: 'Document deleted.' });
  }),
);

documentsRouter.get(
  '/:id/download',
  requireAuth,
  asyncHandler(async (req, res) => {
    const doc = await get('SELECT id, title, file_name, mime_type FROM documents WHERE id = ?', [req.params.id]);
    if (!doc) throw notFound('Document not found.');
    let row = null;
    if (req.query.revision) {
      row = await get('SELECT file_name, mime_type, file_data FROM document_revisions WHERE id = ? AND document_id = ?', [
        req.query.revision,
        doc.id,
      ]);
    } else {
      row = await get('SELECT file_name, mime_type, file_data FROM documents WHERE id = ?', [doc.id]);
    }
    if (!row?.file_data) throw notFound('No file is attached to this document.');
    const buffer = Buffer.from(row.file_data, 'base64');
    res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${sanitiseFileName(row.file_name || `${doc.title}.pdf`)}"`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buffer);
  }),
);

export { requireWriter };
