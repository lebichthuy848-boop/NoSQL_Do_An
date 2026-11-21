import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Eye, Save, Check } from 'lucide-react';
import { getCatalogRepository } from '../../repositories/catalogRepository';
import { useUserStore } from '../../stores/userStore';

type Filter = 'all' | 'saved' | 'planned' | 'viewed' | 'completed';
const repo = getCatalogRepository();

export function createSerialNoteSaveQueue(save: (note: string) => Promise<void>) {
  let tail: Promise<void> = Promise.resolve();
  return (note: string) => {
    const current = tail.catch(() => undefined).then(() => save(note));
    tail = current.catch(() => undefined);
    return current;
  };
}

function NoteEditor({ resourceId, title, value, onSave }: { resourceId: string; title: string; value: string; onSave: (id: string, note: string) => Promise<void> }) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const editedRef = useRef(false);
  const pendingCountRef = useRef(0);
  const saveQueueRef = useRef<((note: string) => Promise<void>) | null>(null);

  if (!saveQueueRef.current) {
    saveQueueRef.current = createSerialNoteSaveQueue((note) => onSave(resourceId, note));
  }

  useEffect(() => {
    if (!editedRef.current) setDraft(value);
  }, [value]);

  const saveDraft = () => {
    const note = draft;
    if (note === value && pendingCountRef.current === 0) return;
    pendingCountRef.current += 1;
    setSaving(true);
    void saveQueueRef.current!(note)
      .catch(() => undefined)
      .finally(() => {
        pendingCountRef.current -= 1;
        if (pendingCountRef.current === 0) setSaving(false);
      });
  };

  return <>
    <textarea
      aria-label={'Ghi chú cho ' + title}
      value={draft}
      maxLength={5000}
      onChange={(event) => { editedRef.current = true; setDraft(event.target.value); }}
      onBlur={saveDraft}
      placeholder="Ghi chú riêng trên hồ sơ của bạn…"
    />
    {saving && <small role="status">Đang lưu ghi chú…</small>}
  </>;
}

export default function MyLearningPage() {
  const state = useUserStore();
  const [filter, setFilter] = useState<Filter>('all');
  const tracked = new Set([...state.savedResourceIds, ...state.plannedResourceIds, ...state.viewedResourceIds, ...state.completedResourceIds]);
  const items = repo.getCourses().filter((item) => tracked.has(item.id) && (
    filter === 'all' ||
    (filter === 'saved' && state.savedResourceIds.includes(item.id)) ||
    (filter === 'planned' && state.plannedResourceIds.includes(item.id)) ||
    (filter === 'viewed' && state.viewedResourceIds.includes(item.id)) ||
    (filter === 'completed' && state.completedResourceIds.includes(item.id))
  ));
  const filters: Filter[] = ['all', 'saved', 'planned', 'viewed', 'completed'];
  if (state.loading && !state.initialized) return <div className="container" role="status">Đang tải học liệu cá nhân…</div>;
  return <div className="container">
    <div className="page-head"><div className="eyebrow">HỌC LIỆU CÁ NHÂN</div><h1>Học liệu của tôi</h1><p>Đã xem và đã hoàn thành là hai trạng thái riêng. Hoàn thành học liệu không xác nhận thành thạo kỹ năng.</p></div>
    {state.error && <div className="warning" role="alert">{state.error}</div>}
    <div className="tabs">{filters.map((value) => <button className={filter === value ? 'active' : ''} onClick={() => setFilter(value)} key={value}>{value === 'all' ? 'Tất cả' : value === 'saved' ? 'Đã lưu' : value === 'planned' ? 'Dự định học' : value === 'viewed' ? 'Đã xem' : 'Đã hoàn thành'}</button>)}</div>
    {items.length ? <div className="learning-list">{items.map((item) => <article key={item.id}><span className="card-icon"><BookOpen /></span><div><Link to={'/resources/' + encodeURIComponent(item.id)}><h3>{item.title}</h3></Link><p>{item.providerName}</p><div className="learning-actions"><button onClick={() => void state.toggleSaved(item.id)} className={state.savedResourceIds.includes(item.id) ? 'active' : ''}><Save /> Lưu</button><button onClick={() => void state.setStatus(item.id, 'planned')} className={state.plannedResourceIds.includes(item.id) ? 'active' : ''}>Dự định học</button><button onClick={() => void state.setStatus(item.id, 'viewed')} className={state.viewedResourceIds.includes(item.id) ? 'active' : ''}><Eye /> Đã xem</button><button onClick={() => void state.setCompleted(item.id, !state.completedResourceIds.includes(item.id))} className={state.completedResourceIds.includes(item.id) ? 'active' : ''}><Check /> {state.completedResourceIds.includes(item.id) ? 'Bỏ hoàn thành' : 'Hoàn thành'}</button></div><NoteEditor key={item.id} resourceId={item.id} title={item.title} value={state.notes[item.id] || ''} onSave={state.setNote} /></div></article>)}</div> : <div className="empty"><BookOpen /><h3>{state.initialized ? 'Chưa có học liệu trong mục này' : 'Đang đồng bộ hồ sơ'}</h3><Link className="btn primary" to="/resources">Khám phá học liệu</Link></div>}
  </div>;
}