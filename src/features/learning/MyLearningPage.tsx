import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Eye, Save, Check } from 'lucide-react';
import { getCatalogRepository } from '../../repositories/catalogRepository';
import { useUserStore } from '../../stores/userStore';
import ConfirmDialog from '../../components/ConfirmDialog';

type Filter = 'all' | 'saved' | 'planned' | 'viewed' | 'completed';
type LearningState = Pick<ReturnType<typeof useUserStore.getState>, 'savedResourceIds' | 'plannedResourceIds' | 'viewedResourceIds' | 'completedResourceIds'>;
const repo = getCatalogRepository();

export function createSerialNoteSaveQueue(save: (note: string) => Promise<void | boolean>) {
  let tail: Promise<void> = Promise.resolve();
  return (note: string) => {
    const current = tail.catch(() => undefined).then(async () => {
      if (await save(note) === false) throw new Error('Ghi chú chưa được lưu.');
    });
    tail = current.catch(() => undefined);
    return current;
  };
}

export function requiresUnsaveConfirmation(id: string, state: LearningState) {
  return state.savedResourceIds.includes(id) &&
    !state.plannedResourceIds.includes(id) &&
    !state.viewedResourceIds.includes(id) &&
    !state.completedResourceIds.includes(id);
}

export function shouldQueueNoteSave(note: string, savedValue: string, pendingSaves: number) {
  return note !== savedValue || pendingSaves > 0;
}

export function filterLearningResources<T extends { id: string }>(items: T[], state: LearningState, filter: Filter) {
  const statuses = {
    saved: state.savedResourceIds,
    planned: state.plannedResourceIds,
    viewed: state.viewedResourceIds,
    completed: state.completedResourceIds,
  };
  const tracked = new Set(Object.values(statuses).flat());
  return items.filter((item) => tracked.has(item.id) && (filter === 'all' || statuses[filter].includes(item.id)));
}

function NoteEditor({
  resourceId, title, value, draftValue, setDraftValue, onSave,
}: {
  resourceId: string;
  title: string;
  value: string;
  draftValue?: string;
  setDraftValue: (id: string, note: string, preserve?: boolean) => void;
  onSave: (id: string, note: string) => Promise<boolean>;
}) {
  const initialDraft = draftValue ?? value;
  const [draft, setDraft] = useState(initialDraft);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const editedRef = useRef(initialDraft !== value);
  const draftRef = useRef(initialDraft);
  const pendingCountRef = useRef(0);
  const lastRequestedRef = useRef<string | null>(null);
  const saveQueueRef = useRef<((note: string) => Promise<void>) | null>(null);

  if (!saveQueueRef.current) {
    saveQueueRef.current = createSerialNoteSaveQueue(async (note) => onSave(resourceId, note));
  }

  useEffect(() => {
    if (!editedRef.current) {
      const next = draftValue ?? value;
      draftRef.current = next;
      setDraft(next);
      setStatus('idle');
    }
  }, [value, draftValue]);

  const saveDraft = () => {
    const note = draftRef.current;
    if (pendingCountRef.current > 0 && lastRequestedRef.current === note) return;
    if (!shouldQueueNoteSave(note, value, pendingCountRef.current)) {
      editedRef.current = false;
      setDraftValue(resourceId, note);
      return;
    }
    pendingCountRef.current += 1;
    lastRequestedRef.current = note;
    setStatus('saving');
    void saveQueueRef.current!(note)
      .then(() => {
        if (draftRef.current === note) {
          editedRef.current = false;
          setStatus('saved');
        }
      })
      .catch(() => {
        if (draftRef.current === note) setStatus('error');
      })
      .finally(() => {
        pendingCountRef.current -= 1;
        if (pendingCountRef.current === 0) lastRequestedRef.current = null;
        else setStatus('saving');
      });
  };

  return <div className="learning-note-editor">
    <textarea
      aria-label={'Ghi chú cho ' + title}
      value={draft}
      maxLength={5000}
      onChange={(event) => {
        const next = event.target.value;
        editedRef.current = true;
        draftRef.current = next;
        setDraft(next);
        setDraftValue(resourceId, next, true);
        setStatus('idle');
      }}
      onBlur={saveDraft}
      placeholder="Ghi chú riêng trên hồ sơ của bạn…"
    />
    <div className="learning-note-actions">
      <small>Tự lưu khi rời khỏi ô ghi chú.</small>
      <button type="button" disabled={status === 'saving' || draft === value} onClick={saveDraft}>
        {status === 'saving' ? 'Đang lưu…' : 'Lưu ghi chú'}
      </button>
    </div>
    {status === 'saving' && <small role="status">Đang lưu ghi chú…</small>}
    {status === 'saved' && <small role="status">Ghi chú đã lưu.</small>}
    {status === 'idle' && draft !== value && <small role="status">Có thay đổi chưa được lưu.</small>}
    {status === 'error' && <div role="alert" className="learning-note-error">Chưa lưu được. Ghi chú vẫn được giữ để thử lại. <button type="button" onClick={saveDraft}>Thử lại</button></div>}
  </div>;
}

export default function MyLearningPage() {
  const state = useUserStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [notice, setNotice] = useState('');
  const [pendingUnsave, setPendingUnsave] = useState<{ id: string; title: string } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  const items = filterLearningResources(repo.getCourses(), state, filter);
  const filters: Filter[] = ['all', 'saved', 'planned', 'viewed', 'completed'];
  const runAction = async (successMessage: string, action: () => Promise<boolean>) => {
    setNotice('');
    if (await action()) setNotice(successMessage);
  };

  if (state.loading && !state.initialized) return <div className="container" role="status">Đang tải học liệu cá nhân…</div>;
  if (!state.initialized && state.error) return <div className="container"><div className="warning" role="alert">Không tải được dữ liệu học liệu: {state.error}</div><button className="btn secondary" onClick={() => void state.hydrate()}>Thử tải lại</button></div>;

  return <div className="container">
    <div className="page-head"><div className="eyebrow">HỌC LIỆU CÁ NHÂN</div><h1>Học liệu của tôi</h1><p>Đã xem và đã hoàn thành là hai trạng thái riêng. Hoàn thành học liệu không xác nhận thành thạo kỹ năng.</p></div>
    {state.error && <div className="warning" role="alert">{state.error}</div>}
    {notice && <div role="status" className="admin-toast"><Check size={16} />{notice}<button type="button" onClick={() => setNotice('')} aria-label="Đóng thông báo">×</button></div>}
    <div className="tabs">{filters.map((value) => <button className={filter === value ? 'active' : ''} onClick={() => setFilter(value)} key={value}>{value === 'all' ? 'Tất cả' : value === 'saved' ? 'Đã lưu' : value === 'planned' ? 'Dự định học' : value === 'viewed' ? 'Đã xem' : 'Đã hoàn thành'}</button>)}</div>
    {repo.status === 'error' ? <div className="warning" role="alert">Chưa thể hiển thị học liệu vì catalog chưa tải được. Hãy thử tải lại catalog ở thông báo phía trên.</div> : items.length ? <div className="learning-list">{items.map((item) => {
      const id = item.id;
      const saving = state.savingResourceIds.includes(id);
      const saved = state.savedResourceIds.includes(id);
      const planned = state.plannedResourceIds.includes(id);
      const viewed = state.viewedResourceIds.includes(id);
      const completed = state.completedResourceIds.includes(id);
      const toggleSaved = () => {
        if (saved && requiresUnsaveConfirmation(id, state)) { setPendingUnsave({ id, title: item.title }); return; }
        void runAction(saved ? 'Đã bỏ lưu học liệu.' : 'Đã lưu học liệu.', () => state.toggleSaved(id));
      };
      return <article key={id}><span className="card-icon"><BookOpen /></span><div><Link to={'/resources/' + encodeURIComponent(id)}><h3>{item.title}</h3></Link><p>{item.providerName}</p><div className="learning-actions">
        <button disabled={saving} aria-pressed={saved} onClick={toggleSaved} className={saved ? 'active' : ''}><Save /> {saving ? 'Đang lưu…' : saved ? 'Đã lưu · Bỏ lưu' : 'Lưu học liệu'}</button>
        <button disabled={saving} aria-pressed={planned} onClick={() => void runAction(planned ? 'Đã bỏ trạng thái dự định học.' : 'Đã đánh dấu dự định học.', () => state.setStatus(id, 'planned'))}>{planned ? 'Bỏ dự định' : 'Dự định học'}</button>
        <button disabled={saving} aria-pressed={viewed} onClick={() => void runAction(viewed ? 'Đã bỏ trạng thái đã xem.' : 'Đã đánh dấu đã xem.', () => state.setStatus(id, 'viewed'))}><Eye /> {viewed ? 'Bỏ trạng thái đã xem' : 'Đánh dấu đã xem'}</button>
        <button disabled={saving} aria-pressed={completed} onClick={() => void runAction(completed ? 'Đã bỏ trạng thái hoàn thành.' : 'Đã đánh dấu hoàn thành.', () => state.setCompleted(id, !completed))}><Check /> {completed ? 'Bỏ hoàn thành' : 'Hoàn thành'}</button>
      </div><NoteEditor key={id} resourceId={id} title={item.title} value={state.notes[id] || ''} draftValue={state.noteDrafts[id]} setDraftValue={state.setNoteDraft} onSave={state.setNote} /></div></article>;
    })}</div> : <div className="empty"><BookOpen /><h3>{state.initialized ? 'Chưa có học liệu trong mục này' : 'Đang đồng bộ hồ sơ'}</h3><Link className="btn primary" to="/resources">Khám phá học liệu</Link></div>}
    {pendingUnsave && <ConfirmDialog
      title="Bỏ lưu học liệu?"
      description={`“${pendingUnsave.title}” sẽ rời khỏi mục “Tất cả” vì hiện không còn trạng thái học nào khác.`}
      confirmLabel="Bỏ lưu"
      busy={confirmBusy}
      onCancel={() => setPendingUnsave(null)}
      onConfirm={() => {
        if (confirmBusy || !pendingUnsave) return;
        setConfirmBusy(true);
        setNotice('');
        void state.toggleSaved(pendingUnsave.id).then((success) => {
          if (success) { setNotice('Đã bỏ lưu học liệu.'); setPendingUnsave(null); }
        }).finally(() => setConfirmBusy(false));
      }}
    />}
  </div>;
}
