import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, queryString } from '../lib/api.js';
import { formatDate, formatDateTime } from '../lib/format.js';
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  Field,
  LoadingScreen,
  Modal,
  PageHeader,
  Pagination,
  SectionCard,
  Spinner,
  useDebounced,
  useToast,
} from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.gif,.csv,.txt,.doc,.docx,.xls,.xlsx';

const EMPTY_FORM = {
  title: '',
  category: 'policy',
  doc_type: 'other',
  version: '1.0',
  description: '',
  review_date: '',
  status: 'active',
  revision_note: '',
};

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.readAsDataURL(file);
  });
}

function fileSize(bytes) {
  const value = Number(bytes || 0);
  if (!value) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

export default function DocumentsPage() {
  const { canWrite } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(1);
  const search = useDebounced(q, 350);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
  const [fields, setFields] = useState({});
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.get(`/documents/${queryString({ q: search, category, status, page, pageSize: 12 })}`);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, category, status, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, category, status]);

  const categories = data?.categories || [];
  const docTypes = data?.docTypes || [];
  const items = data?.items || [];

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFile(null);
    setFields({});
    setFormOpen(true);
  };

  const openEdit = (doc) => {
    setEditing(doc);
    setForm({
      title: doc.title || '',
      category: doc.category || 'policy',
      doc_type: doc.doc_type || 'other',
      version: doc.version || '1.0',
      description: doc.description || '',
      review_date: doc.review_date || '',
      status: doc.status || 'active',
      revision_note: '',
    });
    setFile(null);
    setFields({});
    setFormOpen(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    setFields({});
    if (!form.title.trim() || form.title.trim().length < 3) {
      setFields({ title: 'Enter a document title (at least 3 characters).' });
      return;
    }
    if (file && file.size > MAX_BYTES) {
      setFields({ file: 'Files must be 5 MB or smaller.' });
      return;
    }
    setSaving(true);
    try {
      let payload = { ...form };
      if (file) {
        const dataUrl = await readFile(file);
        payload.file = { dataUrl, fileName: file.name, mime: file.type || 'application/octet-stream' };
      }
      if (editing) {
        await api.put(`/documents/${editing.id}`, payload);
        toast.success('Document updated.');
      } else {
        await api.post('/documents/', payload);
        toast.success('Document saved.');
      }
      setFormOpen(false);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (err) {
      setFields(err.fields || {});
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (doc) => {
    setDetail({ item: doc, revisions: [] });
    setDetailLoading(true);
    try {
      const result = await api.get(`/documents/${doc.id}`);
      setDetail(result);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const download = async (doc, revisionId) => {
    try {
      const name = await api.download(
        `/documents/${doc.id}/download${revisionId ? `?revision=${encodeURIComponent(revisionId)}` : ''}`,
        doc.file_name || `${doc.title}.pdf`,
      );
      toast.success(`Downloaded ${name}.`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.del(`/documents/${confirmDelete.id}`);
      toast.success('Document deleted.');
      setConfirmDelete(null);
      setDetail(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const categoryLabel = useMemo(() => {
    const map = {};
    categories.forEach((c) => {
      map[c.value] = c.label;
    });
    return map;
  }, [categories]);

  return (
    <>
      <PageHeader
        title="Document Management"
        subtitle="Safety policies, SOPs, risk assessments, method statements and inspection checklists with revision history."
        actions={
          canWrite ? (
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              <Icon name="upload" size={16} /> Upload document
            </button>
          ) : null
        }
      />

      <SectionCard
        title="Document library"
        subtitle={`${data?.total || 0} document(s) stored`}
        actions={
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <div className="search-wrap">
              <Icon name="search" size={15} className="search-icon" />
              <input
                className="input"
                placeholder="Search title or file"
                value={q}
                onChange={(event) => setQ(event.target.value)}
                aria-label="Search documents"
              />
            </div>
            <select className="select" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter category">
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <select className="select" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter status">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="superseded">Superseded</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        }
        bodyClass="card-body flush"
      >
        {error ? (
          <div className="card-body">
            <div className="alert alert-danger">
              <Icon name="alert" size={16} /> {error}
            </div>
            <button type="button" className="btn btn-ghost" onClick={load}>
              Retry
            </button>
          </div>
        ) : loading ? (
          <LoadingScreen label="Loading documents…" />
        ) : !items.length ? (
          <EmptyState
            icon="documents"
            title="No documents yet"
            message="Upload safety policies, SOPs, risk assessments and method statements to build your controlled document library."
            action={
              canWrite ? (
                <button type="button" className="btn btn-primary" onClick={openCreate}>
                  <Icon name="upload" size={16} /> Upload document
                </button>
              ) : null
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Category</th>
                  <th>Version</th>
                  <th>Review date</th>
                  <th>Status</th>
                  <th style={{ width: 150 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <button type="button" className="link-btn strong" onClick={() => openDetail(doc)}>
                        {doc.title}
                      </button>
                      <div className="tiny muted">
                        {doc.file_name ? `${doc.file_name} · ${fileSize(doc.file_size)}` : 'No file attached'}
                      </div>
                    </td>
                    <td>{categoryLabel[doc.category] || doc.category}</td>
                    <td className="mono">v{doc.version}</td>
                    <td>{doc.review_date ? formatDate(doc.review_date) : '—'}</td>
                    <td>
                      <Badge value={doc.status} />
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => openDetail(doc)}>
                          Open
                        </button>
                        {doc.has_file ? (
                          <button type="button" className="icon-btn" onClick={() => download(doc)} aria-label={`Download ${doc.title}`} title="Download">
                            <Icon name="download" size={15} />
                          </button>
                        ) : null}
                        {canWrite ? (
                          <button type="button" className="icon-btn" onClick={() => openEdit(doc)} aria-label={`Edit ${doc.title}`} title="New revision / edit">
                            <Icon name="edit" size={15} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {items.length ? (
          <Pagination page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} pageSize={data?.pageSize || 12} onPage={setPage} />
        ) : null}
      </SectionCard>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit · ${editing.title}` : 'Upload document'}
        subtitle={editing ? 'Uploading a file creates a new revision and keeps the previous version.' : 'Attach a PDF, Excel, Word or image file up to 5 MB.'}
        footer={
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form="document-form" className="btn btn-primary" disabled={saving}>
              {saving ? <Spinner /> : <Icon name="check" size={16} />} {editing ? 'Save changes' : 'Save document'}
            </button>
          </div>
        }
      >
        <form id="document-form" onSubmit={submit} className="form-grid" noValidate>
          <Field label="Title" required error={fields.title} className="span-2">
            <input
              className={`input ${fields.title ? 'invalid' : ''}`}
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              maxLength={200}
              required
            />
          </Field>
          <Field label="Category" required>
            <select className="select" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Document type">
            <select className="select" value={form.doc_type} onChange={(event) => setForm({ ...form, doc_type: event.target.value })}>
              {docTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Version" hint={editing ? 'Leave as-is to auto-increment when a file is attached.' : 'Starting version'}>
            <input className="input" value={form.version} onChange={(event) => setForm({ ...form, version: event.target.value })} maxLength={20} />
          </Field>
          <Field label="Next review date">
            <input type="date" className="input" value={form.review_date} onChange={(event) => setForm({ ...form, review_date: event.target.value })} />
          </Field>
          <Field label="Status">
            <select className="select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              <option value="active">Active</option>
              <option value="superseded">Superseded</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
          <Field label="File" error={fields.file} hint="PDF, Excel, Word, CSV or images. Maximum 5 MB." className="span-2">
            <input
              ref={fileRef}
              type="file"
              className="input"
              accept={ACCEPT}
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </Field>
          {editing ? (
            <Field label="Revision note" className="span-2">
              <input
                className="input"
                value={form.revision_note}
                onChange={(event) => setForm({ ...form, revision_note: event.target.value })}
                placeholder="What changed in this revision?"
                maxLength={500}
              />
            </Field>
          ) : null}
          <Field label="Description" className="span-2">
            <textarea
              className="textarea"
              rows={4}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              maxLength={4000}
              placeholder="Scope, purpose and applicability of this document."
            />
          </Field>
        </form>
      </Modal>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.item?.title || 'Document'}
        subtitle={
          detail?.item
            ? `${categoryLabel[detail.item.category] || detail.item.category} · v${detail.item.version} · uploaded by ${detail.item.uploaded_by || 'system'}`
            : ''
        }
        size="lg"
        footer={
          <div className="row" style={{ justifyContent: 'space-between', gap: 8, width: '100%' }}>
            <div className="row" style={{ gap: 8 }}>
              {detail?.item?.has_file ? (
                <button type="button" className="btn btn-primary" onClick={() => download(detail.item)}>
                  <Icon name="download" size={16} /> Download current
                </button>
              ) : null}
              {canWrite ? (
                <button type="button" className="btn btn-ghost" onClick={() => { openEdit(detail.item); setDetail(null); }}>
                  <Icon name="edit" size={16} /> Edit / new revision
                </button>
              ) : null}
            </div>
            {canWrite ? (
              <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(detail.item)}>
                <Icon name="trash" size={16} /> Delete
              </button>
            ) : null}
          </div>
        }
      >
        {detailLoading ? (
          <LoadingScreen label="Loading document…" />
        ) : detail?.item ? (
          <div className="stack">
            <div className="detail-grid">
              <div>
                <div className="tiny muted">Document type</div>
                <div className="strong small">{detail.item.doc_type || '—'}</div>
              </div>
              <div>
                <div className="tiny muted">Status</div>
                <Badge value={detail.item.status} />
              </div>
              <div>
                <div className="tiny muted">File</div>
                <div className="strong small">{detail.item.file_name || 'No file'}</div>
              </div>
              <div>
                <div className="tiny muted">Size</div>
                <div className="strong small">{fileSize(detail.item.file_size)}</div>
              </div>
              <div>
                <div className="tiny muted">Uploaded</div>
                <div className="strong small">{formatDateTime(detail.item.created_at)}</div>
              </div>
              <div>
                <div className="tiny muted">Next review</div>
                <div className="strong small">{detail.item.review_date ? formatDate(detail.item.review_date) : 'Not scheduled'}</div>
              </div>
            </div>
            {detail.item.description ? (
              <div>
                <div className="tiny muted" style={{ marginBottom: 4 }}>
                  Description
                </div>
                <p className="small" style={{ whiteSpace: 'pre-wrap' }}>
                  {detail.item.description}
                </p>
              </div>
            ) : null}
            <div>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <div className="strong small">Revision history</div>
                <span className="tiny muted">{detail.revisions?.length || 0} revision(s)</span>
              </div>
              {detail.revisions?.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Version</th>
                        <th>File</th>
                        <th>Note</th>
                        <th>By</th>
                        <th>Date</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {detail.revisions.map((rev) => (
                        <tr key={rev.id}>
                          <td className="mono">v{rev.version}</td>
                          <td className="small">{rev.file_name || '—'}</td>
                          <td className="small muted">{rev.notes || '—'}</td>
                          <td className="small">{rev.uploaded_by || '—'}</td>
                          <td className="small">{formatDateTime(rev.created_at)}</td>
                          <td>
                            <button type="button" className="icon-btn" onClick={() => download(detail.item, rev.id)} aria-label={`Download version ${rev.version}`}>
                              <Icon name="download" size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="small muted">No revisions recorded for this document.</p>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete document"
        message={`Delete "${confirmDelete?.title || ''}" and all of its revisions? This cannot be undone.`}
        confirmLabel="Delete document"
        busy={deleting}
        onConfirm={remove}
        onClose={() => setConfirmDelete(null)}
      />
    </>
  );
}
