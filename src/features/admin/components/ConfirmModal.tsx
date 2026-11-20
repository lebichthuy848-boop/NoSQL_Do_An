import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export default function ConfirmModal({ open, title, description, confirmText = 'Xác nhận', danger = false, requireReason = false, busy = false, children, onCancel, onConfirm }: {
  open: boolean; title: string; description?: string; confirmText?: string; danger?: boolean; requireReason?: boolean; busy?: boolean; children?: ReactNode; onCancel: () => void; onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) setReason(''); }, [open]);
  if (!open) return null;
  const submit = (event: FormEvent) => { event.preventDefault(); onConfirm(reason.trim()); };
  return <div className="admin-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
    <form className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title" onSubmit={submit}>
      <button className="admin-modal-close" type="button" aria-label="Đóng" onClick={onCancel}><X size={18} /></button>
      <span className={`admin-modal-icon ${danger ? 'danger' : ''}`}><AlertTriangle size={20} /></span>
      <h2 id="admin-modal-title">{title}</h2>{description && <p>{description}</p>}{children}
      {requireReason && <label className="admin-form-field">Lý do <textarea required minLength={5} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Nhập lý do để lưu vào nhật ký" /></label>}
      <div className="admin-modal-actions"><button type="button" className="admin-btn" disabled={busy} onClick={onCancel}>Hủy</button><button type="submit" disabled={busy} className={`admin-btn ${danger ? 'danger' : 'primary'}`}>{confirmText}</button></div>
    </form>
  </div>;
}
