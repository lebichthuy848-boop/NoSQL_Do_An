export type AdminCollection = 'users' | 'careers' | 'skills' | 'providers' | 'courses' | 'teaches' | 'offered_by' | 'requires_skill' | 'prerequisite';
export type ReviewState = 'pending' | 'approved' | 'rejected';
export type AdminRecord = Record<string, unknown> & { _key: string };
export type AdminLog = { id: string; actor: string; action: string; target: string; at: string; result: 'Thành công' | 'Thất bại'; before?: unknown; after?: unknown; reason?: string };
export type AdminNotice = { id: string; title: string; detail: string; kind: 'review' | 'quality' | 'system'; read: boolean; at: string; to: string };
export type FieldSpec = { key: string; label: string; multiline?: boolean; type?: 'url' | 'number' | 'select'; options?: string[]; required?: boolean };
