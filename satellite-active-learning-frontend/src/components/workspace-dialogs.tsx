'use client';
import { useState } from 'react';
import {
  ArrowRight,
  Check,
  Database,
  FolderPlus,
  Keyboard,
  Leaf,
  LoaderCircle,
  Moon,
  ScanLine,
  Sparkles,
  Sun,
  Tags,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Kbd } from './ui/common';
import { CLASS_COLORS, DEMO_CLASSES } from '@/lib/demo';
import { useCreateProject, useQueryBatch } from '@/hooks/use-projects';
import { useWorkspace } from '@/stores/workspace';
import type { Project } from '@/types';
export function CreateProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [count, setCount] = useState(5);
  const [names, setNames] = useState<string[]>(DEMO_CLASSES.map((c) => c.name));
  const [colors, setColors] = useState<string[]>(CLASS_COLORS);
  const create = useCreateProject();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const project = await create.mutateAsync({
        name,
        description,
        classes: Array.from({ length: count }, (_, i) => ({
          id: `class-${i + 1}`,
          name: names[i] ?? '',
          color: colors[i],
        })),
      });
      toast.success('Project created. Let’s add your imagery.');
      setName('');
      setDescription('');
      onOpenChange(false);
      onCreated(project.id);
    } catch {
      /* Mutation displays the error. */
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <span className="dialog-icon">
            <FolderPlus size={23} />
          </span>
          <DialogTitle>A new perspective starts here.</DialogTitle>
          <DialogDescription>
            Create a project and define the land-cover classes you want to understand.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="project-form">
          <label className="field-label">
            Project name
            <input
              className="input"
              placeholder="e.g. Sacramento land cover"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              autoFocus
            />
          </label>
          <label className="field-label">
            Description <span className="optional">Optional</span>
            <textarea
              className="input textarea"
              placeholder="What would you like to explore?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={2}
            />
          </label>
          <div className="class-config-header">
            <label className="field-label" htmlFor="class-count">
              Classification classes
            </label>
            <select
              id="class-count"
              className="input compact-select"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            >
              {Array.from({ length: 11 }, (_, i) => (
                <option value={i + 2} key={i}>
                  {i + 2} classes
                </option>
              ))}
            </select>
          </div>
          <div className="class-inputs">
            {Array.from({ length: count }, (_, i) => (
              <div className="class-input" key={i}>
                <input
                  type="color"
                  aria-label={`Class ${i + 1} color`}
                  value={colors[i]}
                  onChange={(e) =>
                    setColors((c) => c.map((v, j) => (j === i ? e.target.value : v)))
                  }
                />
                <input
                  className="input"
                  placeholder={`Class ${i + 1} name`}
                  aria-label={`Class ${i + 1} name`}
                  value={names[i] ?? ''}
                  onChange={(e) =>
                    setNames((current) => {
                      const next = [...current];
                      next[i] = e.target.value;
                      return next;
                    })
                  }
                  required
                  maxLength={40}
                />
                <Kbd>{i + 1}</Kbd>
              </div>
            ))}
          </div>
          <div className="dialog-footer">
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? <LoaderCircle className="spin" size={16} /> : <PlusIcon />}Create
              project
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function PlusIcon() {
  return <FolderPlus size={16} />;
}
export function HelpDialog({
  open,
  onOpenChange,
  shortcuts = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortcuts?: boolean;
}) {
  const steps = [
    {
      icon: Database,
      title: 'Bring your own perspective',
      text: 'Upload one or more GeoTIFFs. We’ll read their spectral bands, coordinate system, and resolution.',
    },
    {
      icon: ScanLine,
      title: 'Find the most valuable samples',
      text: 'Query a batch of uncertain predictions. Explore each location on the interactive map.',
    },
    {
      icon: Tags,
      title: 'Add your human insight',
      text: 'Accept the model’s prediction, assign a different class, or skip a difficult sample. Draw your own samples, too.',
    },
    {
      icon: TrendingUp,
      title: 'Learn. Measure. Repeat.',
      text: 'Submit your labels and retrain. Follow accuracy, class balance, and every iteration in Analytics.',
    },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={shortcuts ? 'shortcuts-dialog' : ''}>
        <DialogHeader>
          <span className="dialog-icon">
            {shortcuts ? <Keyboard size={23} /> : <Leaf size={23} />}
          </span>
          <DialogTitle>
            {shortcuts ? 'Stay in the labeling flow.' : 'Human insight. Earth intelligence.'}
          </DialogTitle>
          <DialogDescription>
            {shortcuts
              ? 'Less clicking, more understanding. Shortcuts are active in the labeling workspace.'
              : 'A simple, thoughtful workflow for better land-cover models.'}
          </DialogDescription>
        </DialogHeader>
        {!shortcuts && (
          <div className="workflow-steps">
            {steps.map(({ icon: Icon, title, text }, i) => (
              <div key={title}>
                <span className="workflow-number">
                  <Icon size={18} />
                </span>
                <div>
                  <small>STEP 0{i + 1}</small>
                  <h4>{title}</h4>
                  <p>{text}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="shortcut-list">
          {[
            ['1 – 9', 'Assign a class'],
            ['Enter', 'Accept label & move to next'],
            ['S', 'Skip the current sample'],
            ['← / →', 'Previous / next sample'],
            ['N', 'Add a sample note'],
            ['P', 'Draw a point on the map'],
            ['Escape', 'Cancel drawing'],
            ['?', 'Open keyboard shortcuts'],
          ].map(([key, label]) => (
            <div key={key}>
              <span>{label}</span>
              <Kbd>{key}</Kbd>
            </div>
          ))}
        </div>
        {!shortcuts && (
          <div className="info-callout">
            <Sparkles size={17} />
            <p>
              <strong>You’re in a demo workspace.</strong> Imagery and model results are
              illustrative. Upload real GeoTIFFs to explore your data, or set{' '}
              <code>SATELLITE_API_URL</code> to connect your classification backend.
            </p>
          </div>
        )}
        <Button className="full-width" onClick={() => onOpenChange(false)}>
          Let’s explore <ArrowRight size={16} />
        </Button>
      </DialogContent>
    </Dialog>
  );
}
export function PreferencesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { theme, toggleTheme } = useWorkspace();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <span className="dialog-icon">
            <Leaf size={23} />
          </span>
          <DialogTitle>Your workspace</DialogTitle>
          <DialogDescription>A comfortable place to see the bigger picture.</DialogDescription>
        </DialogHeader>
        <div className="preference-row">
          <div>
            <strong>Appearance</strong>
            <p>Choose the theme that works for you.</p>
          </div>
          <Button variant="outline" onClick={toggleTheme}>
            {theme === 'light' ? <Sun size={16} /> : <Moon size={16} />}{' '}
            {theme === 'light' ? 'Light' : 'Dark'} mode
          </Button>
        </div>
        <div className="preference-info">
          <strong>Backend connection</strong>
          <p>
            This workspace includes a PostgreSQL-backed demo. To enable real model inference and
            training, configure the server environment:
          </p>
          <code>SATELLITE_API_URL=http://localhost:8000</code>
          <p>
            Your API token, if configured, stays on the server. Restart the application after
            changing environment variables.
          </p>
        </div>
        <div className="info-callout">
          <Check size={17} />
          <p>
            Projects, uploads, labels, and iteration history are saved to the database. Unsubmitted
            reviews are saved locally in this browser.
          </p>
        </div>
        <Button className="full-width" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      </DialogContent>
    </Dialog>
  );
}
export function QueryBatchDialog({
  project,
  open,
  onOpenChange,
}: {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [batchSize, setBatchSize] = useState(12);
  const [strategy, setStrategy] = useState('entropy');
  const query = useQueryBatch(project.id);
  const selectSample = useWorkspace((s) => s.selectSample);
  const run = async () => {
    try {
      const result = await query.mutateAsync({ batchSize, strategy });
      if (result.samples[0]) selectSample(result.samples[0].id);
      toast.success(
        result.existing
          ? 'Your current batch is ready to review.'
          : `${result.samples.length} samples added to the review queue.`,
        {
          description: result.existing
            ? 'Complete or skip this batch before requesting another.'
            : project.demo
              ? 'Demo candidates · connect a backend for real uncertainty sampling.'
              : undefined,
        },
      );
      onOpenChange(false);
    } catch {
      /* Mutation displays errors. */
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <span className="dialog-icon">
            <Sparkles size={23} />
          </span>
          <DialogTitle>Make your next labels count.</DialogTitle>
          <DialogDescription>
            Find the samples where your expertise makes the biggest difference.
          </DialogDescription>
        </DialogHeader>
        <label className="field-label">
          Batch size
          <select
            className="input"
            value={batchSize}
            onChange={(e) => setBatchSize(Number(e.target.value))}
          >
            {[6, 12, 24, 48].map((n) => (
              <option key={n} value={n}>
                {n} samples
              </option>
            ))}
          </select>
        </label>
        <div className="field-label strategy-label">Sampling strategy</div>
        <div className="strategy-options">
          {[
            {
              id: 'entropy',
              title: 'Predictive entropy',
              text: 'Review predictions with the most overall uncertainty.',
              tag: 'Recommended',
            },
            {
              id: 'margin',
              title: 'Margin sampling',
              text: 'Focus on samples with two equally likely classes.',
            },
            {
              id: 'least-confidence',
              title: 'Least confidence',
              text: 'Review the model’s least confident predictions.',
            },
          ].map((s) => (
            <label
              key={s.id}
              className={strategy === s.id ? 'strategy-option selected' : 'strategy-option'}
            >
              <input
                type="radio"
                name="strategy"
                checked={strategy === s.id}
                onChange={() => setStrategy(s.id)}
              />
              <span>
                <strong>
                  {s.title}
                  {s.tag && <small>{s.tag}</small>}
                </strong>
                <p>{s.text}</p>
              </span>
            </label>
          ))}
        </div>
        {project.demo && (
          <p className="fine-print">
            Demo mode uses simulated uncertainty scores. Your real backend will perform model-based
            sampling.
          </p>
        )}
        <div className="dialog-footer">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={run} disabled={query.isPending}>
            {query.isPending ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}{' '}
            {query.isPending ? 'Finding samples…' : 'Query next batch'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
