'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CornerDownLeft,
  Grid2X2,
  List,
  LoaderCircle,
  MapPin,
  MessageSquarePlus,
  ScanLine,
  SkipForward,
  Sparkles,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '@/stores/workspace';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Badge, Dot, EmptyState, Kbd } from './ui/common';
import type { Dataset, Project, Sample } from '@/types';
interface Props {
  project: Project;
  samples: Sample[];
  datasets: Dataset[];
  onSubmit: () => void;
  stage: 'idle' | 'saving' | 'training' | 'complete';
  onQuery: () => void;
}
function SamplePatch({
  sample,
  dataset,
  onClick,
}: {
  sample: Sample;
  dataset: Dataset | undefined;
  onClick?: () => void;
}) {
  const b = dataset?.bounds;
  const x = b ? Math.max(0, Math.min(100, ((sample.lng - b[0]) / (b[2] - b[0])) * 100)) : 50;
  const y = b ? Math.max(0, Math.min(100, (1 - (sample.lat - b[1]) / (b[3] - b[1])) * 100)) : 50;
  return (
    <button
      className="sample-patch"
      style={{
        backgroundImage: dataset?.previewUrl ? `url("${dataset.previewUrl}")` : undefined,
        backgroundPosition: `${x}% ${y}%`,
      }}
      onClick={onClick}
      aria-label="Locate this sample on the map"
    >
      <span className="patch-crosshair" />
      <span className="patch-corner">
        <ScanLine size={14} />
      </span>
      <span className="patch-coordinate">
        <MapPin size={10} />
        {sample.lat.toFixed(4)}° N, {Math.abs(sample.lng).toFixed(4)}° W
      </span>
    </button>
  );
}
export function SampleReview({ project, samples, datasets, onSubmit, stage, onQuery }: Props) {
  const {
    selectedSampleId,
    selectSample,
    drafts,
    saveDraft,
    setActiveClass,
    setTool,
    selectedDatasetId,
  } = useWorkspace();
  const current = samples.filter(
    (s) => s.source === 'query' && (s.iteration === project.iteration || s.status === 'pending'),
  );
  const queue = current.length ? current : samples.filter((s) => s.source === 'query').slice(-12);
  const active = samples.find((s) => s.id === selectedSampleId) ?? queue[0];
  const index = Math.max(
    0,
    queue.findIndex((s) => s.id === active?.id),
  );
  const dataset = datasets.find((d) => d.id === selectedDatasetId) ?? datasets[0];
  const [chosenClass, setChosenClass] = useState('');
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const busy = stage === 'saving' || stage === 'training';
  const reviewed = queue.filter((s) => drafts[s.id] || s.status !== 'pending').length;
  const draftCount = Object.keys(drafts).length;
  const savedTrainable = samples.some(
    (s) => s.iteration === project.iteration && s.status === 'labeled',
  );
  const hasTrainable = Object.values(drafts).some((d) => d.status === 'labeled') || savedTrainable;
  const canSubmit = draftCount > 0 || savedTrainable;
  useEffect(() => {
    if (!selectedSampleId && queue[0]) selectSample(queue[0].id);
  }, [selectedSampleId, queue, selectSample]);
  useEffect(() => {
    if (!active) return;
    const draft = drafts[active.id];
    const label = draft?.label ?? active.label ?? active.prediction;
    setChosenClass(label);
    setActiveClass(label);
    setNote(draft?.note ?? active.note);
    setNoteOpen(!!(draft?.note ?? active.note));
  }, [active?.id]);
  const move = (direction: number) => {
    if (queue.length) selectSample(queue[(index + direction + queue.length) % queue.length].id);
  };
  const nextUnreviewed = () => {
    for (let n = 1; n < queue.length; n++) {
      const item = queue[(index + n) % queue.length];
      if (!drafts[item.id] && item.status === 'pending') {
        selectSample(item.id);
        return;
      }
    }
    toast.success('Batch reviewed. Ready for your next iteration.');
  };
  const accept = () => {
    if (!active || busy) return;
    saveDraft({
      sampleId: active.id,
      label: chosenClass || active.prediction,
      status: 'labeled',
      note,
    });
    nextUnreviewed();
  };
  const skip = () => {
    if (!active || busy) return;
    saveDraft({
      sampleId: active.id,
      label: null,
      status: 'skipped',
      note: note || 'Hard sample — revisit later.',
    });
    nextUnreviewed();
  };
  const choose = (id: string) => {
    setChosenClass(id);
    setActiveClass(id);
  };
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (
        document.querySelector('[role="dialog"]') ||
        ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes((e.target as HTMLElement).tagName) ||
        e.metaKey ||
        e.ctrlKey ||
        busy
      )
        return;
      if (e.key >= '1' && e.key <= '9') {
        const c = project.classes[Number(e.key) - 1];
        if (c) {
          e.preventDefault();
          choose(c.id);
        }
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        accept();
      }
      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        skip();
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        move(1);
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        move(-1);
      }
      if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setNoteOpen(true);
        setTimeout(() => noteRef.current?.focus(), 0);
      }
      if (e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setTool('point');
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  });
  const acceptAll = () => {
    queue
      .filter((s) => s.status === 'pending' && !drafts[s.id])
      .forEach((s) =>
        saveDraft({
          sampleId: s.id,
          label: s.prediction,
          status: 'labeled',
          note: 'Batch accepted prediction',
        }),
      );
    toast.success('Batch predictions accepted. Review any label before submitting.');
    setBatchMode(false);
  };
  const prediction = project.classes.find((c) => c.id === active?.prediction);
  const currentDraft = active ? drafts[active.id] : undefined;
  return (
    <aside className="review-card">
      <div className="review-header">
        <h3>
          Sample review <Badge>{queue.length} in batch</Badge>
        </h3>
        <button
          className={cn('icon-button', batchMode && 'active')}
          title={batchMode ? 'Individual review' : 'Batch labeling mode'}
          aria-label={batchMode ? 'Individual review' : 'Batch labeling mode'}
          onClick={() => setBatchMode(!batchMode)}
        >
          {batchMode ? <List size={17} /> : <Grid2X2 size={16} />}
        </button>
      </div>
      {queue.length > 0 && (
        <div className="batch-progress">
          <div>
            <span>Batch progress</span>
            <strong>
              {reviewed}
              <span> / {queue.length} reviewed</span>
            </strong>
          </div>
          <div className="progress-track">
            <span style={{ width: `${(reviewed / queue.length) * 100}%` }} />
          </div>
        </div>
      )}
      {!active ? (
        <div className="review-empty">
          <EmptyState
            title="A fresh perspective awaits"
            description="Query a batch to find the samples that need your expertise."
            action={
              <Button size="sm" variant="outline" onClick={onQuery}>
                <Sparkles size={15} />
                Query samples
              </Button>
            }
          />
        </div>
      ) : batchMode ? (
        <div className="batch-review">
          <div className="batch-review-heading">
            <span>Review the whole picture</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={acceptAll}
              disabled={busy || reviewed === queue.length}
            >
              <Check size={13} />
              Accept all
            </Button>
          </div>
          <div className="batch-samples">
            {queue.map((sample, i) => (
              <div className={cn('batch-sample', drafts[sample.id] && 'reviewed')} key={sample.id}>
                <button
                  className="batch-sample-number"
                  onClick={() => {
                    selectSample(sample.id);
                    setBatchMode(false);
                  }}
                >
                  {String(i + 1).padStart(2, '0')}
                </button>
                <div>
                  <strong>{Math.round(sample.confidence * 100)}% confidence</strong>
                  <select
                    aria-label={`Class for sample ${i + 1}`}
                    value={drafts[sample.id]?.label ?? sample.label ?? sample.prediction}
                    onChange={(e) =>
                      saveDraft({
                        sampleId: sample.id,
                        label: e.target.value,
                        status: 'labeled',
                        note: sample.note,
                      })
                    }
                  >
                    {project.classes.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  className="icon-button"
                  aria-label={`Accept sample ${i + 1}`}
                  onClick={() =>
                    saveDraft({
                      sampleId: sample.id,
                      label: drafts[sample.id]?.label ?? sample.prediction,
                      status: 'labeled',
                      note: sample.note,
                    })
                  }
                >
                  <CircleCheck size={18} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="review-body">
          <div className="sample-navigation">
            <div>
              <span className="sample-id">
                Sample #
                {active.id.startsWith('sample-') && active.id.length < 15
                  ? active.id.replace('sample-', '')
                  : String(842 + index)}
              </span>
              {(currentDraft || active.status !== 'pending') && (
                <span className="sample-reviewed" title="Reviewed">
                  <CircleCheck size={13} />
                </span>
              )}
            </div>
            <div>
              <span>
                {index + 1} <i>/ {queue.length || 1}</i>
              </span>
              <button className="icon-button" onClick={() => move(-1)} aria-label="Previous sample">
                <ChevronLeft size={16} />
              </button>
              <button className="icon-button" onClick={() => move(1)} aria-label="Next sample">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <SamplePatch
            sample={active}
            dataset={dataset}
            onClick={() => {
              selectSample(active.id);
              toast.info('Sample selected on the map. Use the crosshair control to zoom to it.');
            }}
          />
          <div className="prediction-row">
            <div>
              <span className="small-label">MODEL PREDICTION</span>
              <strong>
                <Dot color={prediction?.color ?? '#c5ad52'} />
                {prediction?.name ?? 'Unclassified'}
              </strong>
            </div>
            <span className="confidence-badge">
              {Math.round(active.confidence * 100)}% confidence
            </span>
          </div>
          <div className="uncertainty-row">
            <span>
              Uncertainty score{' '}
              <span
                title="Higher uncertainty means this sample is more informative for the model."
                className="info-circle"
              >
                i
              </span>
            </span>
            <span>
              <span className="uncertainty-bars">
                <i />
                <i />
                <i />
                <i />
              </span>
              {active.uncertainty.toFixed(2)}
              <strong>{active.uncertainty > 0.7 ? 'High' : 'Moderate'}</strong>
            </span>
          </div>
          <div className="assign-heading">
            <span>Assign a class</span>
            <span>
              Use keys <Kbd>1–{Math.min(project.classes.length, 9)}</Kbd>
            </span>
          </div>
          <div className="class-choices">
            {project.classes.map((c, i) => (
              <button
                key={c.id}
                disabled={busy}
                className={cn('class-choice', chosenClass === c.id && 'selected')}
                onClick={() => choose(c.id)}
              >
                <Dot color={c.color} />
                <span>{c.name}</span>
                {chosenClass === c.id ? (
                  <Check size={13} />
                ) : (
                  <span className="class-shortcut">{i + 1}</span>
                )}
              </button>
            ))}
          </div>
          {noteOpen ? (
            <div className="sample-note">
              <textarea
                ref={noteRef}
                className="input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                placeholder="What should we know about this sample?"
                rows={2}
                aria-label="Sample note"
              />
              <button
                className="icon-button"
                onClick={() => setNoteOpen(false)}
                aria-label="Close note"
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <button
              className="add-note"
              onClick={() => {
                setNoteOpen(true);
                setTimeout(() => noteRef.current?.focus(), 0);
              }}
            >
              <MessageSquarePlus size={14} />
              {note ? 'Edit sample note' : 'Add a note'}
              <span>Optional</span>
            </button>
          )}
          <div className="review-actions">
            <Button
              variant="outline"
              onClick={skip}
              disabled={busy}
              title="Mark as hard and skip (S)"
            >
              <SkipForward size={14} />
              Skip
            </Button>
            <Button variant="secondary" className="accept-button" onClick={accept} disabled={busy}>
              <Check size={15} />
              {currentDraft?.status === 'labeled' ? 'Update label' : 'Accept label'}
              <CornerDownLeft size={13} />
            </Button>
          </div>
        </div>
      )}
      <div className="submit-section">
        {busy ? (
          <>
            <div className="training-stage">
              <LoaderCircle className="spin" size={15} />
              <span>
                {stage === 'saving'
                  ? 'Saving your human insight…'
                  : project.demo
                    ? 'Updating the demo model…'
                    : 'Training the next model…'}
              </span>
            </div>
            <div className="progress-track training-track">
              <span style={{ width: stage === 'saving' ? '30%' : '78%' }} />
            </div>
          </>
        ) : (
          <Button className="submit-button" onClick={onSubmit} disabled={!canSubmit}>
            <Sparkles size={15} />
            {hasTrainable || !draftCount ? 'Submit labels & retrain' : 'Save review decisions'}
            <ArrowRight size={15} />
          </Button>
        )}
        <p>
          {busy
            ? 'Keep this workspace open. We’re on it.'
            : draftCount
              ? `${draftCount} review${draftCount === 1 ? '' : 's'} ready to submit`
              : 'Your expertise makes the difference.'}
        </p>
      </div>
    </aside>
  );
}
