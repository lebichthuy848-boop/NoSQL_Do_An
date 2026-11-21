import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function ConfirmDialog({
  title,
  description,
  children,
  confirmLabel = 'Xác nhận',
  busy = false,
  danger = true,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  children?: ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return <div className="admin-modal-backdrop" role="presentation">
    <section className="admin-modal admin-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-description">
      <span className="admin-modal-icon"><AlertTriangle size={19} /></span>
      <h2 id="confirm-dialog-title">{title}</h2>
      <p id="confirm-dialog-description">{description}</p>
      {children}
      <div className="admin-modal-actions">
        <button type="button" className="admin-btn" disabled={busy} onClick={onCancel}>Hủy</button>
        <button type="button" className={`admin-btn ${danger ? 'danger' : 'primary'}`} disabled={busy} onClick={onConfirm}>
          {busy ? 'Đang xử lý…' : confirmLabel}
        </button>
      </div>
    </section>
  </div>;
}
