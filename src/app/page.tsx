'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { RapidlyWrapper } from '@/components/RapidlyWrapper';
import {
  Box,
  Typography,
  Button,
  IconButton,
  TextField,
  Select,
  MenuItem,
  Card,
  CardContent,
  Alert,
  Chip,
  Stack,
  Fade,
  Tooltip,
  Radio,
  RadioGroup,
  FormControlLabel,
  Divider,
  alpha,
  Stepper,
  Step,
  StepLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  KeyboardArrowUp as ArrowUpIcon,
  KeyboardArrowDown as ArrowDownIcon,
  Close as CloseIcon,
  Add as AddIcon,
  Check as CheckIcon,
  Refresh as RefreshIcon,
  ContentCopy as CopyIcon,
  Edit as EditIcon,
  Lock as LockIcon,
  TouchApp as ClickableUiIcon,
  AccountTree as DataFlowIcon,
  Hub as ArchitectureIcon,
  Layers as HybridIcon,
  AutoAwesome as AutoDetectIcon,
  Info as InfoIcon,
  ArrowForward as NextIcon,
  ArrowBack as BackIcon,
  Flag as FlagIcon,
  Work as WorkIcon,
  Route as RouteIcon,
  Rocket as RocketIcon,
  History as HistoryIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';

type CpmResponse = { runId: string; sourceFile: string; isFinal: boolean; cpm: any };
type ValidationResult = { valid: boolean; errors: any[] };
type OutputsStatus = { prototypePlan: boolean; figmaMakePrompt: boolean; reviewedOutput: boolean; prototypeHtml: boolean };

// Decision log types
type DecisionLogEntry = {
  question: string;
  answer: string;
  resolved_at: string;
  resolved_by: string;
};

const STEPS = [
  { label: 'Intent & Type', description: 'Define the problem and select prototype type', icon: FlagIcon },
  { label: 'Jobs to be Done', description: 'Review the jobs this solution addresses', icon: WorkIcon },
  { label: 'User Flows', description: 'Review the step-by-step flows', icon: RouteIcon },
  { label: 'Generate', description: 'Generate and export prototype outputs', icon: RocketIcon },
];

function prettyErrors(errors: any[]): string {
  if (!errors || errors.length === 0) return '';
  return errors.map(e => `${e.instancePath || '(root)'} ${e.message}`).join('\n');
}

export default function ReviewPage() {
  const [selectedRun, setSelectedRun] = useState<string>('');
  const [cpm, setCpm] = useState<any>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [status, setStatus] = useState<string>('');
  const [outputs, setOutputs] = useState<OutputsStatus | null>(null);
  const [figmaPrompt, setFigmaPrompt] = useState<string>('');
  const [reviewedOutput, setReviewedOutput] = useState<string>('');
  const [selectedFlowId, setSelectedFlowId] = useState<string>('');
  const [isFinal, setIsFinal] = useState<boolean>(false);
  const [activeStep, setActiveStep] = useState<number>(0);
  const locked = isFinal;
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const openQuestionsRef = useRef<HTMLDivElement | null>(null);
  const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null);
  
  // Decision log state
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolvingQuestionIndex, setResolvingQuestionIndex] = useState<number | null>(null);
  const [resolveAnswer, setResolveAnswer] = useState('');
  const [resolveApprover, setResolveApprover] = useState('');
  const [showDecisionLog, setShowDecisionLog] = useState(false);
  
  // Prototype approval state
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [approvalComment, setApprovalComment] = useState('');
  const [approvalApprover, setApprovalApprover] = useState('');

  // Design system override for prototype
  const [designSystem, setDesignSystem] = useState<string>('auto');

  // Listen for run changes from layout
  useEffect(() => {
    const handleRunChange = (e: CustomEvent) => {
      setSelectedRun(e.detail.runId);
    };
    window.addEventListener('runChanged', handleRunChange as EventListener);
    
    // Load initial run from localStorage
    const saved = localStorage.getItem('cpm_ui_last_run');
    if (saved) setSelectedRun(saved);
    
    return () => window.removeEventListener('runChanged', handleRunChange as EventListener);
  }, []);

  // Load CPM when run changes
  useEffect(() => {
    if (!selectedRun) return;
    setStatus('Loading...');
    fetch(`/api/run/${selectedRun}/cpm`)
      .then(r => r.json())
      .then((data: CpmResponse) => {
        setCpm(data.cpm);
        setIsFinal(Boolean(data.isFinal));
        setValidation(null);
        setStatus('');
        refreshOutputs();
        setActiveStep(0);
      })
      .catch(e => setStatus(String(e)));
  }, [selectedRun]);

  // CPM Data
  const intentProblem = useMemo(() => cpm?.intent?.problem?.statement ?? '', [cpm]);
  const intentOutcome = useMemo(() => cpm?.intent?.goal?.primary_outcome ?? '', [cpm]);
  const openQuestions = useMemo(() => cpm?.review?.open_questions ?? [], [cpm]);
  const decisionLog = useMemo<DecisionLogEntry[]>(() => cpm?.review?.decision_log ?? [], [cpm]);
  const jobs = useMemo(() => cpm?.jobs ?? [], [cpm]);
  const flows = useMemo(() => cpm?.flows ?? [], [cpm]);

  // Classification & Prototype Type
  const classification = useMemo(() => cpm?.classification ?? {}, [cpm]);
  const initiativeType = useMemo(() => classification?.initiative_type ?? 'ui', [classification]);
  const classificationConfidence = useMemo(() => classification?.confidence ?? 'low', [classification]);
  const classificationSignals = useMemo(() => classification?.signals ?? [], [classification]);
  const prototypeStrategy = useMemo(() => cpm?.prototype?.strategy ?? {}, [cpm]);
  const recommendedPrototypeType = useMemo(() => prototypeStrategy?.recommended_type ?? 'clickable_ui', [prototypeStrategy]);

  const jobIssueCount = useMemo(() => (jobs ?? []).filter((j: any) => jobIssues(j).length > 0).length, [jobs]);
  const stepIssueCount = useMemo(() => {
    const allSteps = (flows ?? []).flatMap((f: any) => f?.steps ?? []);
    return allSteps.filter((s: any) => stepIssues(s).length > 0).length;
  }, [flows]);

  useEffect(() => {
    if (flows?.length > 0 && !selectedFlowId) setSelectedFlowId(flows[0].flow_id);
  }, [flows, selectedFlowId]);

  const selectedFlowIndex = useMemo(() => flows.findIndex((f: any) => f.flow_id === selectedFlowId), [flows, selectedFlowId]);
  const selectedFlow = selectedFlowIndex >= 0 ? flows[selectedFlowIndex] : null;
  const steps = selectedFlow?.steps ?? [];

  // Field update functions
  const setField = useCallback((path: string[], value: any) => {
    setCpm((prev: any) => {
      const next = structuredClone(prev);
      let cur: any = next;
      for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (key === undefined) continue;
        if (cur[key] === undefined || cur[key] === null) cur[key] = {};
        cur = cur[key];
      }
      const lastKey = path[path.length - 1];
      if (lastKey !== undefined) {
        cur[lastKey] = value;
      }
      return next;
    });
  }, []);

  const setFlows = useCallback((nextFlows: any[]) => setField(['flows'], nextFlows), [setField]);
  
  const updateFlowField = useCallback((flowIndex: number, field: string, value: any) => {
    const next = structuredClone(flows);
    next[flowIndex] = { ...next[flowIndex], [field]: value };
    setFlows(next);
  }, [flows, setFlows]);

  const updateStep = useCallback((flowIndex: number, stepIndex: number, field: string, value: any) => {
    const next = structuredClone(flows);
    const flow = next[flowIndex];
    const nextSteps = structuredClone(flow.steps ?? []);
    nextSteps[stepIndex] = { ...nextSteps[stepIndex], [field]: value };
    next[flowIndex] = { ...flow, steps: nextSteps };
    setFlows(next);
  }, [flows, setFlows]);

  const addStep = useCallback((flowIndex: number) => {
    const next = structuredClone(flows);
    const flow = next[flowIndex];
    const nextSteps = structuredClone(flow.steps ?? []);
    nextSteps.push({ step_id: `step_${String(nextSteps.length + 1).padStart(2, '0')}`, actor_id: 'actor_user', action: '', result: '' });
    next[flowIndex] = { ...flow, steps: nextSteps };
    setFlows(next);
  }, [flows, setFlows]);

  const addFlow = useCallback(() => {
    const next = structuredClone(flows);
    const newFlowId = `flow_${next.length + 1}`;
    next.push({
      flow_id: newFlowId,
      name: 'New Flow',
      type: 'happy_path',
      actors: ['actor_user'],
      steps: [{ step_id: 'step_01', actor_id: 'actor_user', action: '', result: '' }],
      linked_jobs: [],
    });
    setFlows(next);
  }, [flows, setFlows]);

  const deleteFlow = useCallback((flowIndex: number) => {
    const next = structuredClone(flows).filter((_: any, i: number) => i !== flowIndex);
    setFlows(next);
  }, [flows, setFlows]);

  const deleteStep = useCallback((flowIndex: number, stepIndex: number) => {
    const next = structuredClone(flows);
    const flow = next[flowIndex];
    next[flowIndex] = { ...flow, steps: (flow.steps ?? []).filter((_: any, i: number) => i !== stepIndex) };
    setFlows(next);
  }, [flows, setFlows]);

  const moveStep = useCallback((flowIndex: number, stepIndex: number, direction: 'up' | 'down') => {
    const next = structuredClone(flows);
    const flow = next[flowIndex];
    const nextSteps = structuredClone(flow.steps ?? []);
    const target = direction === 'up' ? stepIndex - 1 : stepIndex + 1;
    if (target < 0 || target >= nextSteps.length) return;
    [nextSteps[stepIndex], nextSteps[target]] = [nextSteps[target], nextSteps[stepIndex]];
    next[flowIndex] = { ...flow, steps: nextSteps };
    setFlows(next);
  }, [flows, setFlows]);

  const updateJob = useCallback((index: number, field: string, value: any) => {
    const next = structuredClone(jobs);
    next[index] = { ...next[index], [field]: value };
    setField(['jobs'], next);
  }, [jobs, setField]);

  const addJob = useCallback(() => {
    const next = structuredClone(jobs);
    next.push({ job_id: `job_${String(next.length + 1).padStart(2, '0')}`, description: '', trigger: '', success_outcome: '', priority: 'should' });
    setField(['jobs'], next);
  }, [jobs, setField]);

  const deleteJob = useCallback((index: number) => {
    setField(['jobs'], jobs.filter((_: any, i: number) => i !== index));
  }, [jobs, setField]);

  // Open Questions
  const addOpenQuestion = useCallback(() => {
    const next = [...openQuestions, 'New question to resolve'];
    setField(['review', 'open_questions'], next);
    setEditingQuestionIndex(next.length - 1);
  }, [openQuestions, setField]);

  const updateOpenQuestion = useCallback((index: number, value: string) => {
    const next = [...openQuestions];
    next[index] = value;
    setField(['review', 'open_questions'], next);
  }, [openQuestions, setField]);

  const deleteOpenQuestion = useCallback((index: number) => {
    const next = openQuestions.filter((_: any, i: number) => i !== index);
    setField(['review', 'open_questions'], next);
    setEditingQuestionIndex(null);
  }, [openQuestions, setField]);

  // Open the resolve dialog for a question
  const openResolveDialog = useCallback((index: number) => {
    setResolvingQuestionIndex(index);
    setResolveAnswer('');
    setResolveApprover('');
    setResolveDialogOpen(true);
  }, []);

  // Submit the resolution with answer
  const submitResolution = useCallback(() => {
    if (resolvingQuestionIndex === null || !resolveAnswer.trim() || !resolveApprover.trim()) return;
    
    const questionText = openQuestions[resolvingQuestionIndex];
    
    // Create decision log entry
    const newEntry: DecisionLogEntry = {
      question: questionText,
      answer: resolveAnswer.trim(),
      resolved_at: new Date().toISOString(),
      resolved_by: resolveApprover.trim(),
    };
    
    // Add to decision log
    const newDecisionLog = [...decisionLog, newEntry];
    setField(['review', 'decision_log'], newDecisionLog);
    
    // Remove from open questions
    const newOpenQuestions = openQuestions.filter((_: any, i: number) => i !== resolvingQuestionIndex);
    setField(['review', 'open_questions'], newOpenQuestions);
    
    // Close dialog and reset
    setResolveDialogOpen(false);
    setResolvingQuestionIndex(null);
    setResolveAnswer('');
    setResolveApprover('');
    setEditingQuestionIndex(null);
    setStatus(`Question resolved! ${newOpenQuestions.length} remaining.`);
    
    // Auto-save and regenerate output document to capture the resolution
    setTimeout(async () => {
      try {
        await doSave();
        await doRegenerate();
      } catch { /* silent - output doc update is best-effort */ }
    }, 100);
  }, [resolvingQuestionIndex, resolveAnswer, resolveApprover, openQuestions, decisionLog, setField]);

  // Format date for display
  const formatDate = (isoDate: string) => {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Submit prototype approval
  const submitApproval = useCallback(async () => {
    if (!approvalComment.trim() || !approvalApprover.trim()) return;
    
    // Create approval entry in decision log
    const approvalEntry: DecisionLogEntry = {
      question: '✅ PROTOTYPE APPROVED',
      answer: approvalComment.trim(),
      resolved_at: new Date().toISOString(),
      resolved_by: approvalApprover.trim(),
    };
    
    // Add to decision log
    const newDecisionLog = [...decisionLog, approvalEntry];
    setField(['review', 'decision_log'], newDecisionLog);
    
    // Close dialog and reset
    setApprovalDialogOpen(false);
    setApprovalComment('');
    setApprovalApprover('');
    setStatus('Prototype approved and logged! Regenerating output document...');
    
    // Save the updated CPM with approval, then regenerate output document
    // Need a small delay to let state update propagate before saving
    setTimeout(async () => {
      try {
        await doSave();
        await doRegenerate();
        setStatus('Prototype approved! Output document updated.');
      } catch { setStatus('Prototype approved. Click Generate to update output document.'); }
    }, 100);
  }, [approvalComment, approvalApprover, decisionLog, setField]);

  function isBlank(v: any): boolean { return String(v ?? '').trim().length === 0; }

  function jobIssues(job: any): string[] {
    const issues: string[] = [];
    if (isBlank(job?.job_id)) issues.push('job_id');
    if (isBlank(job?.description)) issues.push('description');
    if (isBlank(job?.trigger)) issues.push('trigger');
    if (isBlank(job?.success_outcome)) issues.push('success_outcome');
    if (isBlank(job?.priority)) issues.push('priority');
    return issues;
  }

  function stepIssues(step: any): string[] {
    const issues: string[] = [];
    if (isBlank(step?.step_id)) issues.push('step_id');
    if (isBlank(step?.actor_id)) issues.push('actor_id');
    if (isBlank(step?.action)) issues.push('action');
    if (isBlank(step?.result)) issues.push('result');
    return issues;
  }

  // API Functions
  async function doSave() {
    if (!cpm) return;
    setStatus('Saving...');
    const res = await fetch(`/api/run/${selectedRun}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpm }),
    });
    const data = await res.json();
    if (!res.ok) { setValidation(data.validation); setStatus('Save failed'); return; }
    setStatus('Saved successfully');
  }

  const [generating, setGenerating] = useState(false);

  async function doRegenerate() {
    setGenerating(true);
    setStatus('Generating outputs...');
    try {
      const qs = designSystem && designSystem !== 'auto' ? `?designSystem=${encodeURIComponent(designSystem)}` : '';
      const res = await fetch(`/api/run/${selectedRun}/regenerate${qs}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setStatus(data.message ?? 'Failed'); return; }
      await refreshOutputs();
      if (data.outputs?.includes('figma_make_prompt.txt')) await loadFigmaPrompt({ silent: true });
      if (data.outputs?.includes('reviewed_output.txt')) await loadReviewedOutput({ silent: true });
      setStatus('Generated successfully');
    } finally {
      setGenerating(false);
    }
  }

  async function refreshOutputs() {
    if (!selectedRun) return;
    const res = await fetch(`/api/run/${selectedRun}/outputs`);
    const data = await res.json();
    setOutputs(data);
    // Auto-load the output document if it exists
    if (data.reviewedOutput) {
      loadReviewedOutput({ silent: true });
    }
  }

  async function loadFigmaPrompt(opts?: { silent?: boolean }): Promise<string> {
    if (!selectedRun) return '';
    if (!opts?.silent) setStatus('Loading prompt...');
    const res = await fetch(`/api/run/${selectedRun}/file?name=figma_make_prompt.txt`);
    const data = await res.json();
    if (!res.ok || !data.ok) { if (!opts?.silent) setStatus('Failed to load'); return ''; }
    setFigmaPrompt(String(data.content ?? ''));
    if (!opts?.silent) setStatus('');
    return String(data.content ?? '');
  }

  async function copyPrompt() {
    try { await navigator.clipboard.writeText(figmaPrompt); setStatus('Copied!'); }
    catch { setStatus('Copy failed'); }
  }

  async function loadReviewedOutput(opts?: { silent?: boolean }): Promise<string> {
    if (!selectedRun) return '';
    if (!opts?.silent) setStatus('Loading output document...');
    const res = await fetch(`/api/run/${selectedRun}/file?name=reviewed_output.txt`);
    const data = await res.json();
    const content = String(data.content ?? '');
    setReviewedOutput(content);
    if (!opts?.silent) setStatus('');
    return content;
  }

  function downloadReviewedOutput() {
    if (!reviewedOutput) return;
    const blob = new Blob([reviewedOutput], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reviewed_output_${selectedRun ?? 'document'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus('Downloaded!');
  }

  async function markAligned() {
    if (!cpm) { setStatus('No CPM'); return; }
    setStatus('Marking aligned...');
    try {
      const res = await fetch(`/api/run/${selectedRun}/mark_aligned`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpm }),
      });
      const data = await res.json();
      if (!res.ok) { setStatus(data.message ?? 'Failed'); return; }
      setStatus('Aligned successfully');
      setIsFinal(true);
      // Re-generate output document to capture alignment status
      await doRegenerate();
    } catch (e: any) { setStatus(`Error: ${e.message}`); }
  }

  async function reopenForEdits() {
    setStatus('Reopening...');
    const res = await fetch(`/api/run/${selectedRun}/reopen`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { setStatus(data.message ?? 'Failed'); return; }
    setStatus('Reopened');
    setIsFinal(false);
  }

  // Navigation
  const handleNext = async () => {
    if (!locked && cpm) await doSave();
    setActiveStep((prev) => Math.min(prev + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    setActiveStep((prev) => Math.max(prev - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goToStep = (index: number) => {
    if (!locked) {
      setActiveStep(index);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const canProceed = (step: number): boolean => {
    switch (step) {
      case 0: return !isBlank(intentProblem) && !isBlank(intentOutcome);
      case 1: return jobs.length > 0 && jobIssueCount === 0;
      case 2: return flows.length > 0 && stepIssueCount === 0;
      default: return true;
    }
  };

  // Render step content
  const renderStepContent = (step: number) => {
    switch (step) {
      case 0: return renderIntentStep();
      case 1: return renderJobsStep();
      case 2: return renderFlowsStep();
      case 3: return renderGenerateStep();
      default: return null;
    }
  };

  // Step 1: Intent & Classification
  const renderIntentStep = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Card>
        <CardContent>
          <Typography variant="h3" sx={{ mb: 3 }}>What problem are we solving?</Typography>
          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Problem Statement</Typography>
            <TextField
              fullWidth
              multiline
              rows={4}
              value={intentProblem}
              onChange={e => setField(['intent', 'problem', 'statement'], e.target.value)}
              disabled={locked}
              placeholder="Describe the problem this initiative addresses..."
              error={isBlank(intentProblem)}
            />
          </Box>
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Primary Outcome</Typography>
            <TextField
              fullWidth
              multiline
              rows={3}
              value={intentOutcome}
              onChange={e => setField(['intent', 'goal', 'primary_outcome'], e.target.value)}
              disabled={locked}
              placeholder="What is the main outcome we want to achieve?"
              error={isBlank(intentOutcome)}
            />
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h3" sx={{ mb: 2 }}>What type of prototype should we create?</Typography>
          <Box sx={{ mb: 3, p: 2, bgcolor: (theme) => alpha(theme.palette.primary.main, 0.05), borderRadius: 1, border: 1, borderColor: 'divider' }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <AutoDetectIcon color="primary" fontSize="small" />
              <Typography variant="body2" fontWeight={500}>Auto-detected from PRD</Typography>
              <Chip
                label={classificationConfidence}
                size="small"
                color={classificationConfidence === 'high' ? 'success' : classificationConfidence === 'medium' ? 'warning' : 'default'}
              />
            </Stack>
            {classificationSignals.length > 0 && (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {classificationSignals.map((sig: any, idx: number) => (
                  <Tooltip key={idx} title={sig.evidence || 'No evidence'} arrow>
                    <Chip icon={<InfoIcon sx={{ fontSize: 14 }} />} label={sig.signal} size="small" variant="outlined" sx={{ cursor: 'help' }} />
                  </Tooltip>
                ))}
              </Stack>
            )}
          </Box>

          <RadioGroup value={recommendedPrototypeType} onChange={(e) => setField(['prototype', 'strategy', 'recommended_type'], e.target.value)}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              {[
                { value: 'clickable_ui', label: 'Clickable UI', desc: 'Interactive screens with navigation', icon: ClickableUiIcon, recommended: initiativeType === 'ui' },
                { value: 'data_flow_diagram', label: 'Data Flow', desc: 'Pipelines and data transformations', icon: DataFlowIcon, recommended: initiativeType === 'data' },
                { value: 'architecture_diagram', label: 'Architecture', desc: 'System components and APIs', icon: ArchitectureIcon, recommended: initiativeType === 'backend' },
                { value: 'hybrid_bundle', label: 'Hybrid Bundle', desc: 'All diagram types combined', icon: HybridIcon, recommended: initiativeType === 'hybrid' },
              ].map((opt) => (
                <Card
                  key={opt.value}
                  variant="outlined"
                  sx={{
                    position: 'relative',
                    cursor: locked ? 'not-allowed' : 'pointer',
                    opacity: locked ? 0.6 : 1,
                    border: 2,
                    borderColor: recommendedPrototypeType === opt.value ? 'primary.main' : 'divider',
                    bgcolor: recommendedPrototypeType === opt.value ? (theme) => alpha(theme.palette.primary.main, 0.08) : 'transparent',
                    transition: 'all 0.15s ease',
                    '&:hover': locked ? {} : { borderColor: 'primary.light' },
                  }}
                  onClick={() => !locked && setField(['prototype', 'strategy', 'recommended_type'], opt.value)}
                >
                  <CardContent sx={{ py: 2, px: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                    <opt.icon sx={{ fontSize: 32, color: recommendedPrototypeType === opt.value ? 'primary.main' : 'text.secondary' }} />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body1" fontWeight={600}>{opt.label}</Typography>
                      <Typography variant="caption" color="text.secondary">{opt.desc}</Typography>
                    </Box>
                    <FormControlLabel value={opt.value} control={<Radio size="small" disabled={locked} />} label="" sx={{ m: 0 }} />
                    {opt.recommended && <Chip label="Suggested" size="small" color="success" sx={{ position: 'absolute', top: 8, right: 8, height: 20, fontSize: '0.65rem' }} />}
                  </CardContent>
                </Card>
              ))}
            </Box>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Open Questions */}
      <Card ref={openQuestionsRef} sx={{ border: openQuestions.length > 0 ? '1px solid' : '1px solid', borderColor: openQuestions.length > 0 ? 'warning.main' : 'divider' }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h3">Open Questions</Typography>
              {openQuestions.length > 0 ? (
                <Chip label={openQuestions.length} size="small" color="warning" />
              ) : (
                <Chip label="All resolved ✓" size="small" color="success" />
              )}
            </Box>
            <Button size="small" variant="outlined" color="secondary" onClick={addOpenQuestion} disabled={locked} startIcon={<AddIcon />}>
              Add Question
            </Button>
          </Box>
          {openQuestions.length === 0 ? (
            <Alert severity="success" sx={{ mt: 1 }}>All open questions have been resolved. You can now mark as aligned.</Alert>
          ) : (
            <Stack spacing={1.5}>
              {openQuestions.map((q: string, i: number) => (
                <Card key={i} variant="outlined" sx={{ bgcolor: alpha('#f59e0b', 0.05) }}>
                  <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                    <Stack direction="row" spacing={1} alignItems="flex-start">
                      <Typography variant="caption" color="warning.main" sx={{ mt: 0.5, fontWeight: 600, minWidth: 20 }}>{i + 1}.</Typography>
                      {editingQuestionIndex === i ? (
                        <TextField fullWidth size="small" multiline value={q} onChange={e => updateOpenQuestion(i, e.target.value)} onBlur={() => setEditingQuestionIndex(null)} autoFocus sx={{ flex: 1 }} />
                      ) : (
                        <Typography variant="body2" sx={{ flex: 1, cursor: locked ? 'default' : 'pointer', '&:hover': locked ? {} : { color: 'primary.main' } }} onClick={() => !locked && setEditingQuestionIndex(i)}>
                          {q}
                        </Typography>
                      )}
                      <Stack direction="row" spacing={0.5}>
                        <Tooltip title="Edit question"><IconButton size="small" onClick={() => setEditingQuestionIndex(i)} disabled={locked}><EditIcon fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title="Resolve with answer">
                          <Button size="small" variant="contained" color="success" onClick={() => openResolveDialog(i)} disabled={locked} sx={{ minWidth: 0, px: 1, fontSize: '0.7rem' }}>Resolve</Button>
                        </Tooltip>
                        <Tooltip title="Delete"><IconButton size="small" onClick={() => deleteOpenQuestion(i)} disabled={locked} color="error"><CloseIcon fontSize="small" /></IconButton></Tooltip>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
          {openQuestions.length > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>Resolve all questions before marking as aligned on the Generate step.</Typography>
          )}
        </CardContent>
      </Card>

      {/* Decision Log */}
      {decisionLog.length > 0 && (
        <Card sx={{ border: '1px solid', borderColor: 'success.main', bgcolor: alpha('#10b981', 0.02) }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: showDecisionLog ? 2 : 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }} onClick={() => setShowDecisionLog(!showDecisionLog)}>
                <HistoryIcon sx={{ color: 'success.main', fontSize: 20 }} />
                <Typography variant="h3" sx={{ color: 'success.main' }}>Decision Log</Typography>
                <Chip label={decisionLog.length} size="small" color="success" />
                {showDecisionLog ? <ExpandLessIcon sx={{ color: 'text.secondary' }} /> : <ExpandMoreIcon sx={{ color: 'text.secondary' }} />}
              </Box>
            </Box>
            {showDecisionLog && (
              <Stack spacing={1.5}>
                {decisionLog.map((entry, i) => (
                  <Card key={i} variant="outlined" sx={{ bgcolor: alpha('#10b981', 0.05) }}>
                    <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                      <Stack spacing={1}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{entry.question}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', ml: 2 }}>
                            {formatDate(entry.resolved_at)}
                          </Typography>
                        </Box>
                        <Box sx={{ pl: 2, borderLeft: 2, borderColor: 'success.main' }}>
                          <Typography variant="body2" color="text.secondary">{entry.answer}</Typography>
                        </Box>
                        <Typography variant="caption" color="success.main">
                          Resolved by: {entry.resolved_by}
                        </Typography>
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );

  // Resolve Question Dialog - rendered outside of steps so it's always available
  const renderResolveDialog = () => (
    <Dialog 
      open={resolveDialogOpen} 
      onClose={() => setResolveDialogOpen(false)} 
      maxWidth="sm" 
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: 'background.paper',
          backgroundImage: 'none',
          border: 1,
          borderColor: 'divider',
        }
      }}
    >
      <DialogTitle sx={{ borderBottom: 1, borderColor: 'divider', pb: 2 }}>
        <Typography variant="h3" component="span">Resolve Question</Typography>
      </DialogTitle>
      <DialogContent sx={{ pt: 3 }}>
        <Stack spacing={3}>
          {/* Question being resolved */}
          <Card variant="outlined" sx={{ bgcolor: 'transparent' }}>
            <CardContent sx={{ py: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Question to Resolve
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {resolvingQuestionIndex !== null ? openQuestions[resolvingQuestionIndex] : ''}
              </Typography>
            </CardContent>
          </Card>

          {/* Answer field */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Answer / Resolution
            </Typography>
            <TextField
              placeholder="Provide the decision, answer, or outcome..."
              multiline
              rows={3}
              fullWidth
              value={resolveAnswer}
              onChange={e => setResolveAnswer(e.target.value)}
              size="small"
              sx={{
                '& .MuiOutlinedInput-root': {
                  '& fieldset': { borderColor: 'divider' },
                  '&:hover fieldset': { borderColor: 'primary.main' },
                  '&.Mui-focused fieldset': { borderColor: 'primary.main' },
                }
              }}
            />
          </Box>

          {/* Approver field */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Approved By
            </Typography>
            <TextField
              placeholder="Name of person who approved this decision"
              fullWidth
              value={resolveApprover}
              onChange={e => setResolveApprover(e.target.value)}
              size="small"
              sx={{
                '& .MuiOutlinedInput-root': {
                  '& fieldset': { borderColor: 'divider' },
                  '&:hover fieldset': { borderColor: 'primary.main' },
                  '&.Mui-focused fieldset': { borderColor: 'primary.main' },
                }
              }}
            />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, borderTop: 1, borderColor: 'divider' }}>
        <Button onClick={() => setResolveDialogOpen(false)} variant="outlined" color="inherit" sx={{ borderColor: 'divider' }}>
          Cancel
        </Button>
        <Button 
          onClick={submitResolution} 
          variant="contained" 
          color="primary"
          disabled={!resolveAnswer.trim() || !resolveApprover.trim()}
          startIcon={<CheckIcon />}
        >
          Resolve Question
        </Button>
      </DialogActions>
    </Dialog>
  );

  // Prototype Approval Dialog
  const renderApprovalDialog = () => (
    <Dialog 
      open={approvalDialogOpen} 
      onClose={() => setApprovalDialogOpen(false)} 
      maxWidth="sm" 
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: 'background.paper',
          backgroundImage: 'none',
          border: 1,
          borderColor: 'primary.main',
        }
      }}
    >
      <DialogTitle sx={{ borderBottom: 1, borderColor: 'divider', pb: 2 }}>
        <Typography variant="h3" component="span">Prototype Approval</Typography>
      </DialogTitle>
      <DialogContent sx={{ pt: 3 }}>
        <Stack spacing={3}>
          <Alert severity="info" sx={{ bgcolor: alpha('#00d4aa', 0.1), border: 1, borderColor: 'primary.main' }}>
            This approval will be recorded in the decision log as a permanent record of prototype sign-off.
          </Alert>

          {/* Approval Comment */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Approval Comment
            </Typography>
            <TextField
              placeholder="e.g., 'Prototype approved for development. All requirements validated and stakeholders aligned.'"
              multiline
              rows={3}
              fullWidth
              value={approvalComment}
              onChange={e => setApprovalComment(e.target.value)}
              size="small"
              sx={{
                '& .MuiOutlinedInput-root': {
                  '& fieldset': { borderColor: 'divider' },
                  '&:hover fieldset': { borderColor: 'primary.main' },
                  '&.Mui-focused fieldset': { borderColor: 'primary.main' },
                }
              }}
            />
          </Box>

          {/* Approver Name */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Approved By
            </Typography>
            <TextField
              placeholder="Name of person approving the prototype"
              fullWidth
              value={approvalApprover}
              onChange={e => setApprovalApprover(e.target.value)}
              size="small"
              sx={{
                '& .MuiOutlinedInput-root': {
                  '& fieldset': { borderColor: 'divider' },
                  '&:hover fieldset': { borderColor: 'primary.main' },
                  '&.Mui-focused fieldset': { borderColor: 'primary.main' },
                }
              }}
            />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, borderTop: 1, borderColor: 'divider' }}>
        <Button onClick={() => setApprovalDialogOpen(false)} variant="outlined" color="inherit" sx={{ borderColor: 'divider' }}>
          Cancel
        </Button>
        <Button 
          onClick={submitApproval} 
          variant="contained" 
          color="primary"
          disabled={!approvalComment.trim() || !approvalApprover.trim()}
          startIcon={<CheckIcon />}
        >
          Confirm Approval
        </Button>
      </DialogActions>
    </Dialog>
  );

  // Step 2: Jobs
  const renderJobsStep = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Box>
              <Typography variant="h3">Jobs to be Done</Typography>
              <Typography variant="body2" color="text.secondary">What jobs will this solution help users accomplish?</Typography>
            </Box>
            <Button size="small" variant="contained" color="secondary" onClick={addJob} disabled={locked} startIcon={<AddIcon />}>Add Job</Button>
          </Box>
          <Stack spacing={2}>
            {jobs.map((j: any, i: number) => {
              const issues = jobIssues(j);
              return (
                <Card key={`${j.job_id ?? 'job'}_${i}`} variant="outlined" sx={{ bgcolor: issues.length > 0 ? alpha('#ef4444', 0.05) : 'transparent' }}>
                  <CardContent sx={{ py: 2 }}>
                    <Stack direction="row" spacing={2} alignItems="flex-start">
                      <Box sx={{ flex: 1 }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                          <TextField size="small" value={j.job_id ?? ''} onChange={e => updateJob(i, 'job_id', e.target.value)} disabled={locked} error={isBlank(j.job_id)} placeholder="job_id" sx={{ width: 140 }} />
                          <Select size="small" value={j.priority ?? 'should'} onChange={e => updateJob(i, 'priority', e.target.value)} disabled={locked} sx={{ width: 100 }}>
                            <MenuItem value="must">Must</MenuItem>
                            <MenuItem value="should">Should</MenuItem>
                            <MenuItem value="could">Could</MenuItem>
                          </Select>
                        </Stack>
                        <TextField fullWidth size="small" value={j.description ?? ''} onChange={e => updateJob(i, 'description', e.target.value)} disabled={locked} error={isBlank(j.description)} placeholder="Job description..." sx={{ mb: 1 }} />
                        <Stack direction="row" spacing={1}>
                          <TextField size="small" value={j.trigger ?? ''} onChange={e => updateJob(i, 'trigger', e.target.value)} disabled={locked} error={isBlank(j.trigger)} placeholder="Trigger" sx={{ flex: 1 }} />
                          <TextField size="small" value={j.success_outcome ?? ''} onChange={e => updateJob(i, 'success_outcome', e.target.value)} disabled={locked} error={isBlank(j.success_outcome)} placeholder="Success outcome" sx={{ flex: 1 }} />
                        </Stack>
                      </Box>
                      <IconButton size="small" onClick={() => deleteJob(i)} disabled={locked}><CloseIcon fontSize="small" /></IconButton>
                    </Stack>
                    {issues.length > 0 && <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>Missing: {issues.join(', ')}</Typography>}
                  </CardContent>
                </Card>
              );
            })}
          </Stack>
          {jobs.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography color="text.secondary">No jobs defined yet</Typography>
              <Button size="small" onClick={addJob} disabled={locked} sx={{ mt: 1 }}>Add your first job</Button>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );

  // Step 3: Flows
  const renderFlowsStep = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h3">User Flows</Typography>
          <Typography variant="body2" color="text.secondary">Define step-by-step interactions for each user journey</Typography>
        </Box>
        <Button variant="contained" color="primary" onClick={addFlow} disabled={locked} startIcon={<AddIcon />}>Add Flow</Button>
      </Box>
      {flows.map((flow: any, flowIndex: number) => {
        const flowSteps = flow.steps ?? [];
        return (
          <Card key={flow.flow_id}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ flex: 1 }}>
                  <TextField size="small" label="Flow Name" value={flow.name ?? ''} onChange={e => updateFlowField(flowIndex, 'name', e.target.value)} disabled={locked} sx={{ minWidth: 250 }} />
                  <Select size="small" value={flow.type ?? 'happy_path'} onChange={e => updateFlowField(flowIndex, 'type', e.target.value)} disabled={locked} sx={{ minWidth: 130 }}>
                    <MenuItem value="happy_path">Happy Path</MenuItem>
                    <MenuItem value="alternate_path">Alternate</MenuItem>
                    <MenuItem value="error_path">Error</MenuItem>
                  </Select>
                </Stack>
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="outlined" onClick={() => addStep(flowIndex)} disabled={locked} startIcon={<AddIcon />}>Add Step</Button>
                  <IconButton size="small" onClick={() => deleteFlow(flowIndex)} disabled={locked || flows.length <= 1}><CloseIcon fontSize="small" /></IconButton>
                </Stack>
              </Box>
              <Stack spacing={1}>
                {flowSteps.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>No steps defined. Click "Add Step" to create one.</Typography>
                ) : flowSteps.map((s: any, stepIndex: number) => {
                  const issues = stepIssues(s);
                  return (
                    <Card key={s.step_id ?? stepIndex} variant="outlined" sx={{ bgcolor: issues.length > 0 ? alpha('#ef4444', 0.05) : 'transparent' }}>
                      <CardContent sx={{ py: 1.5, px: 2 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="caption" color="text.secondary" sx={{ width: 24 }}>{stepIndex + 1}</Typography>
                          <TextField size="small" value={s.actor_id ?? ''} onChange={e => updateStep(flowIndex, stepIndex, 'actor_id', e.target.value)} disabled={locked} error={isBlank(s.actor_id)} placeholder="Actor" sx={{ width: 140 }} />
                          <TextField size="small" value={s.action ?? ''} onChange={e => updateStep(flowIndex, stepIndex, 'action', e.target.value)} disabled={locked} error={isBlank(s.action)} placeholder="Action" sx={{ flex: 1 }} />
                          <TextField size="small" value={s.result ?? ''} onChange={e => updateStep(flowIndex, stepIndex, 'result', e.target.value)} disabled={locked} error={isBlank(s.result)} placeholder="Result" sx={{ flex: 1 }} />
                          <IconButton size="small" onClick={() => moveStep(flowIndex, stepIndex, 'up')} disabled={stepIndex === 0 || locked}><ArrowUpIcon fontSize="small" /></IconButton>
                          <IconButton size="small" onClick={() => moveStep(flowIndex, stepIndex, 'down')} disabled={stepIndex === flowSteps.length - 1 || locked}><ArrowDownIcon fontSize="small" /></IconButton>
                          <IconButton size="small" onClick={() => deleteStep(flowIndex, stepIndex)} disabled={locked}><CloseIcon fontSize="small" /></IconButton>
                        </Stack>
                      </CardContent>
                    </Card>
                  );
                })}
              </Stack>
            </CardContent>
          </Card>
        );
      })}
      {flows.length === 0 && (
        <Card><CardContent sx={{ textAlign: 'center', py: 4 }}><Typography variant="body2" color="text.secondary">No flows defined. Click "Add Flow" to create one.</Typography></CardContent></Card>
      )}
    </Box>
  );

  // Step 4: Generate
  const renderGenerateStep = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Card>
        <CardContent>
          <Typography variant="h3" sx={{ mb: 2 }}>Review Summary</Typography>
          <Stack spacing={2}>
            <Box><Typography variant="caption" color="text.secondary">Problem</Typography><Typography variant="body2">{intentProblem || 'Not defined'}</Typography></Box>
            <Box><Typography variant="caption" color="text.secondary">Primary Outcome</Typography><Typography variant="body2">{intentOutcome || 'Not defined'}</Typography></Box>
            <Divider />
            <Stack direction="row" spacing={3}>
              <Box><Typography variant="caption" color="text.secondary">Prototype Type</Typography><Typography variant="body2">{recommendedPrototypeType.replace(/_/g, ' ')}</Typography></Box>
              <Box><Typography variant="caption" color="text.secondary">Jobs</Typography><Typography variant="body2">{jobs.length} defined</Typography></Box>
              <Box><Typography variant="caption" color="text.secondary">Flow Steps</Typography><Typography variant="body2">{steps.length} steps</Typography></Box>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {/* Generate Section */}
      <Card sx={{ border: generating ? '2px solid' : '1px solid', borderColor: generating ? 'primary.main' : 'divider', position: 'relative', overflow: 'visible' }}>
        {generating && (
          <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, bgcolor: 'primary.main', borderRadius: '4px 4px 0 0', animation: 'pulse 1.5s ease-in-out infinite', '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.4 } } }} />
        )}
        <CardContent>
          <Typography variant="h3" sx={{ mb: 1 }}>Generate Outputs</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Choose your output type and generate based on your reviewed content.</Typography>

          {/* Design system override */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Design system (HTML prototype)</Typography>
            <Select value={designSystem} onChange={(e) => setDesignSystem(e.target.value)} size="small" sx={{ minWidth: 200 }}>
              <MenuItem value="auto">Auto (detect from content)</MenuItem>
              <MenuItem value="enterprise_dark">Enterprise Dark</MenuItem>
              <MenuItem value="enterprise_light">Enterprise Light</MenuItem>
              <MenuItem value="consumer">Consumer</MenuItem>
              <MenuItem value="erp">ERP (NetSuite)</MenuItem>
            </Select>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>Override the prototype look when Auto does not match your product.</Typography>
          </Box>

          {/* Output type selector */}
          <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
            <Card variant="outlined" sx={{ flex: 1, cursor: 'pointer', border: '2px solid', borderColor: 'primary.main', bgcolor: alpha('#00d4aa', 0.05), transition: 'all 0.15s' }} onClick={doRegenerate}>
              <CardContent sx={{ textAlign: 'center', py: 2, '&:last-child': { pb: 2 } }}>
                <RefreshIcon sx={{ fontSize: 28, color: 'primary.main', mb: 0.5 }} />
                <Typography variant="body2" fontWeight={600}>Prompt</Typography>
                <Typography variant="caption" color="text.secondary">Generate text prompt</Typography>
                {outputs?.figmaMakePrompt && <Chip label="✓ Ready" size="small" color="success" sx={{ mt: 1 }} />}
              </CardContent>
            </Card>
            <Card variant="outlined" sx={{ flex: 1, cursor: 'pointer', border: '2px solid', borderColor: outputs?.prototypeHtml ? 'success.main' : 'divider', bgcolor: outputs?.prototypeHtml ? alpha('#10b981', 0.05) : 'transparent', transition: 'all 0.15s', '&:hover': { borderColor: 'primary.main' } }} onClick={doRegenerate}>
              <CardContent sx={{ textAlign: 'center', py: 2, '&:last-child': { pb: 2 } }}>
                <ClickableUiIcon sx={{ fontSize: 28, color: outputs?.prototypeHtml ? 'success.main' : 'text.secondary', mb: 0.5 }} />
                <Typography variant="body2" fontWeight={600}>HTML Prototype</Typography>
                <Typography variant="caption" color="text.secondary">Generate clickable interactive prototype</Typography>
                {outputs?.prototypeHtml && <Chip label="✓ Ready" size="small" color="success" sx={{ mt: 1 }} />}
              </CardContent>
            </Card>
          </Stack>

          {/* Generating indicator */}
          {generating && (
            <Alert severity="info" sx={{ mb: 2, animation: 'pulse 1.5s ease-in-out infinite' }}>
              Generating outputs... This may take a moment.
            </Alert>
          )}

          {/* Action buttons */}
          <Stack spacing={2}>
            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
              <Button variant="contained" color="primary" size="large" onClick={doRegenerate} disabled={generating} startIcon={<RefreshIcon />}>
                {generating ? 'Generating...' : 'Generate All'}
              </Button>
              {outputs?.prototypeHtml && (
                <Button variant="contained" color="secondary" size="large" onClick={() => { if (selectedRun) window.open(`/prototype/${selectedRun}`, '_blank'); }} startIcon={<ClickableUiIcon />}>
                  Open Prototype
                </Button>
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {/* Prompt Output */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h3">Prompt</Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="contained" color="secondary" onClick={() => loadFigmaPrompt()} disabled={!outputs?.figmaMakePrompt}>Load</Button>
              <Button size="small" variant="contained" color="primary" onClick={copyPrompt} disabled={!figmaPrompt} startIcon={<CopyIcon />}>Copy to Clipboard</Button>
            </Stack>
          </Box>
          <TextField inputRef={promptRef} fullWidth multiline rows={10} value={figmaPrompt} onChange={e => setFigmaPrompt(e.target.value)} placeholder="Click load to view the prompt..." sx={{ '& .MuiInputBase-input': { fontFamily: 'ui-monospace, monospace', fontSize: '0.75rem' } }} />
        </CardContent>
      </Card>

      {/* Open Questions */}
      <Card sx={{ border: openQuestions.length > 0 ? '1px solid' : '1px solid', borderColor: openQuestions.length > 0 ? 'warning.main' : locked ? 'success.main' : 'divider' }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h3">Open Questions</Typography>
              {openQuestions.length > 0 ? (
                <Chip label={openQuestions.length} size="small" color="warning" />
              ) : (
                <Chip label="All resolved ✓" size="small" color="success" />
              )}
            </Box>
            <Button size="small" variant="outlined" color="secondary" onClick={addOpenQuestion} disabled={locked} startIcon={<AddIcon />}>
              Add Question
            </Button>
          </Box>
          {openQuestions.length === 0 ? (
            <Alert severity="success" sx={{ mb: 2 }}>All open questions have been resolved. You can now mark as aligned.</Alert>
          ) : (
            <Stack spacing={1.5} sx={{ mb: 2 }}>
              {openQuestions.map((q: string, i: number) => (
                <Card key={i} variant="outlined" sx={{ bgcolor: alpha('#f59e0b', 0.05) }}>
                  <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                    <Stack direction="row" spacing={1} alignItems="flex-start">
                      <Typography variant="caption" color="warning.main" sx={{ mt: 0.5, fontWeight: 600, minWidth: 20 }}>{i + 1}.</Typography>
                      {editingQuestionIndex === i ? (
                        <TextField fullWidth size="small" multiline value={q} onChange={e => updateOpenQuestion(i, e.target.value)} onBlur={() => setEditingQuestionIndex(null)} autoFocus sx={{ flex: 1 }} />
                      ) : (
                        <Typography variant="body2" sx={{ flex: 1, cursor: locked ? 'default' : 'pointer', '&:hover': locked ? {} : { color: 'primary.main' } }} onClick={() => !locked && setEditingQuestionIndex(i)}>
                          {q}
                        </Typography>
                      )}
                      <Stack direction="row" spacing={0.5}>
                        <Tooltip title="Edit question"><IconButton size="small" onClick={() => setEditingQuestionIndex(i)} disabled={locked}><EditIcon fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title="Resolve with answer">
                          <Button size="small" variant="contained" color="success" onClick={() => openResolveDialog(i)} disabled={locked} sx={{ minWidth: 0, px: 1, fontSize: '0.7rem' }}>Resolve</Button>
                        </Tooltip>
                        <Tooltip title="Delete"><IconButton size="small" onClick={() => deleteOpenQuestion(i)} disabled={locked} color="error"><CloseIcon fontSize="small" /></IconButton></Tooltip>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}

          {/* Decision Log in Generate Step */}
          {decisionLog.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer', mb: showDecisionLog ? 1.5 : 0 }} onClick={() => setShowDecisionLog(!showDecisionLog)}>
                <HistoryIcon sx={{ color: 'success.main', fontSize: 18 }} />
                <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 500 }}>Decision Log ({decisionLog.length})</Typography>
                {showDecisionLog ? <ExpandLessIcon sx={{ color: 'text.secondary', fontSize: 18 }} /> : <ExpandMoreIcon sx={{ color: 'text.secondary', fontSize: 18 }} />}
              </Box>
              {showDecisionLog && (
                <Stack spacing={1}>
                  {decisionLog.map((entry, i) => (
                    <Card key={i} variant="outlined" sx={{ bgcolor: alpha('#10b981', 0.05) }}>
                      <CardContent sx={{ py: 1, px: 2, '&:last-child': { pb: 1 } }}>
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>{entry.question}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', pl: 1, borderLeft: 2, borderColor: 'success.main', mt: 0.5 }}>{entry.answer}</Typography>
                        <Typography variant="caption" color="success.main">— {entry.resolved_by}, {formatDate(entry.resolved_at)}</Typography>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              )}
            </Box>
          )}

          {/* Download Output */}
          {reviewedOutput && (
            <>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Button variant="contained" color="primary" onClick={downloadReviewedOutput} startIcon={<DownloadIcon />} size="large">Download Output</Button>
                <Typography variant="body2" color="text.secondary">
                  Includes all changes, decisions, and approval trail.
                </Typography>
              </Box>
            </>
          )}

          <Divider sx={{ my: 2 }} />
          {locked ? (
            <Alert severity="success" icon={<LockIcon />}>
              <strong>Aligned and frozen</strong> — This CPM has been validated with stakeholders.
              <Button size="small" color="inherit" onClick={reopenForEdits} sx={{ ml: 2 }}>Reopen for Edits</Button>
            </Alert>
          ) : (
            <Box>
              <Button variant="outlined" onClick={markAligned} disabled={openQuestions.length > 0} startIcon={<CheckIcon />}>Mark as Aligned</Button>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Only mark as aligned after stakeholder review and confirmation.</Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Prototype Approval */}
      <Card sx={{ border: '1px solid', borderColor: 'primary.main', bgcolor: alpha('#00d4aa', 0.02) }}>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <Box sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: 'primary.main', color: 'primary.contrastText', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600 }}>
              <CheckIcon sx={{ fontSize: 14 }} />
            </Box>
            <Typography variant="h3">Prototype Approval</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3, ml: 4 }}>
            Once the prototype has been reviewed and approved by stakeholders, record the final approval here. This will be logged in the decision log for future reference.
          </Typography>
          <Box sx={{ ml: 4 }}>
            <Button 
              variant="contained" 
              color="primary" 
              onClick={() => setApprovalDialogOpen(true)}
              disabled={!locked}
              startIcon={<CheckIcon />}
              size="large"
            >
              Prototype Approved
            </Button>
            {!locked && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Mark as aligned first before recording prototype approval.
              </Typography>
            )}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );

  if (!cpm) {
    return (
      <RapidlyWrapper>
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h5" sx={{ fontWeight: 600, mb: 0.5 }}>
              Turn PRDs into visual prototypes in minutes
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mb: 2 }}>
              Make product intent visible early
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 520, mx: 'auto', mb: 3 }}>
              Rapidly helps teams align early by translating product documents into clear, reviewable prototypes before implementation starts.
            </Typography>
            <Button
              variant="contained"
              color="primary"
              size="large"
              sx={{ color: '#ffffff' }}
              onClick={() => {
                const uploadBtn = document.querySelector('input[type="file"]') as HTMLInputElement;
                uploadBtn?.click();
              }}
            >
              Upload a PRD
            </Button>
          </CardContent>
        </Card>
      </RapidlyWrapper>
    );
  }

  return (
    <RapidlyWrapper>
    <Box>
      {/* Locked Alert */}
      {locked && (
        <Alert severity="info" icon={<LockIcon />} sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={reopenForEdits} startIcon={<EditIcon />}>Reopen for Edits</Button>}>
          This run is <strong>aligned and frozen</strong>. You can view but not edit. Click "Reopen for Edits" to make changes.
        </Alert>
      )}

      {/* Status */}
      <Fade in={Boolean(status)}><Alert severity="info" sx={{ mb: 2 }}>{status}</Alert></Fade>

      {validation && (
        <Alert severity={validation.valid ? 'success' : 'error'} sx={{ mb: 2 }}>
          <strong>Schema {validation.valid ? 'valid ✓' : 'invalid ✗'}</strong>
          {!validation.valid && <Box component="pre" sx={{ mt: 1, fontSize: '0.75rem', whiteSpace: 'pre-wrap', m: 0 }}>{prettyErrors(validation.errors)}</Box>}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 4 }}>
        {/* Stepper Sidebar */}
        <Box sx={{ width: 240, flexShrink: 0 }}>
          <Stepper activeStep={activeStep} orientation="vertical">
            {STEPS.map((step, index) => (
              <Step key={step.label}>
                <StepLabel
                  onClick={() => goToStep(index)}
                  sx={{ cursor: locked ? 'default' : 'pointer' }}
                  StepIconComponent={() => (
                    <Box sx={{
                      width: 32, height: 32, borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      bgcolor: activeStep === index ? 'primary.main' : activeStep > index ? alpha('#00d4aa', 0.2) : 'background.paper',
                      border: 1, borderColor: activeStep >= index ? 'primary.main' : 'divider',
                      color: activeStep === index ? 'primary.contrastText' : activeStep > index ? 'primary.main' : 'text.secondary',
                    }}>
                      {activeStep > index ? <CheckIcon sx={{ fontSize: 16 }} /> : <step.icon sx={{ fontSize: 16 }} />}
                    </Box>
                  )}
                >
                  <Typography variant="body2" fontWeight={activeStep === index ? 600 : 400}>{step.label}</Typography>
                  <Typography variant="caption" color="text.secondary">{step.description}</Typography>
                </StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>

        {/* Step Content */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {renderStepContent(activeStep)}

          {/* Navigation */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4, pt: 3, borderTop: 1, borderColor: 'divider' }}>
            <Button variant="outlined" onClick={handleBack} disabled={activeStep === 0} startIcon={<BackIcon />}>Back</Button>
            <Stack direction="row" spacing={2}>
              {!locked && <Button variant="contained" color="secondary" onClick={doSave}>Save Progress</Button>}
              {activeStep < STEPS.length - 1 ? (
                <Button variant="contained" color="primary" onClick={handleNext} disabled={!canProceed(activeStep)} endIcon={<NextIcon />}>Continue</Button>
              ) : (
                <Button variant="contained" color="primary" onClick={markAligned} disabled={locked || openQuestions.length > 0} startIcon={<CheckIcon />}>Mark Aligned</Button>
              )}
            </Stack>
          </Box>
        </Box>
      </Box>

      {/* Resolve Question Dialog - always rendered */}
      {renderResolveDialog()}
      
      {/* Prototype Approval Dialog */}
      {renderApprovalDialog()}
    </Box>
    </RapidlyWrapper>
  );
}
