'use client';

import { Box, Container, Typography, Stack, FormControl, Select, MenuItem, Button, Chip, Tooltip, IconButton } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import { useEffect, useRef, useState, useCallback } from 'react';

type RunInfo = { runId: string; documentName: string | null; isFinal: boolean };

export function RapidlyHeader() {
  const [runsDetailed, setRunsDetailed] = useState<RunInfo[]>([]);
  const [selectedRun, setSelectedRun] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshRuns = useCallback(async (): Promise<RunInfo[]> => {
    try {
      const res = await fetch('/api/runs');
      if (!res.ok) return [];
      const data = await res.json();
      return data.runsDetailed ?? [];
    } catch {
      return [];
    }
  }, []);

  // Fetch runs on mount
  useEffect(() => {
    refreshRuns().then(detailed => {
      setRunsDetailed(detailed);
      // Load last run from localStorage or use first run
      const saved = localStorage.getItem('cpm_ui_last_run');
      if (saved && detailed.some((r: RunInfo) => r.runId === saved)) {
        setSelectedRun(saved);
      } else if (detailed.length > 0) {
        setSelectedRun(detailed[0]!.runId);
      }
    });
  }, [refreshRuns]);

  // Store selected run in localStorage and dispatch event
  useEffect(() => {
    if (selectedRun) {
      localStorage.setItem('cpm_ui_last_run', selectedRun);
      window.dispatchEvent(new CustomEvent('runChanged', { detail: { runId: selectedRun } }));
    }
  }, [selectedRun]);

  const handleUploadPrd = useCallback(async (file: File) => {
    setUploading(true);
    setStatus('Uploading PRD...');
    try {
      const content = await file.text();
      const res = await fetch('/api/upload-prd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, filename: file.name }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus(`Upload failed: ${data.error || 'Unknown error'}`);
        return;
      }
      // Refresh runs list (gracefully handle failure)
      const detailed = await refreshRuns();
      if (detailed.length > 0) {
        setRunsDetailed(detailed);
      } else {
        // Fallback: add the new run manually if runs list fetch failed
        setRunsDetailed(prev => [
          { runId: data.runId, documentName: file.name.replace(/\.[^.]+$/, ''), isFinal: false },
          ...prev,
        ]);
      }
      setSelectedRun(data.runId);
      setStatus(`Created new run: ${data.runId}`);
    } catch (e: any) {
      setStatus(`Upload error: ${e?.message || 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  }, [refreshRuns]);

  const handleClearRuns = useCallback(async () => {
    if (!confirm('Clear all runs? This cannot be undone.')) return;
    
    setStatus('Clearing runs...');
    try {
      const res = await fetch('/api/clear-runs', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus(`Clear failed: ${data.error || 'Unknown error'}`);
        return;
      }
      // Clear localStorage and state
      localStorage.removeItem('cpm_ui_last_run');
      setRunsDetailed([]);
      setSelectedRun('');
      setStatus(`Cleared ${data.cleared} run(s)`);
      // Dispatch event to reset the review page
      window.dispatchEvent(new CustomEvent('runChanged', { detail: { runId: '' } }));
    } catch (e: any) {
      setStatus(`Clear error: ${e?.message || 'Unknown error'}`);
    }
  }, []);

  const currentRunInfo = runsDetailed.find(r => r.runId === selectedRun);

  return (
    <>
      {/* Header */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', height: 80 }}>
        <Container maxWidth="lg" sx={{ height: '100%' }}>
          <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Box
                component="img"
                src="/rapid-header.svg"
                alt="Rapidly logo"
                title="Make product intent visible early"
                sx={{ width: 56, height: 56, cursor: 'default', flexShrink: 0 }}
              />
              <Typography 
                variant="h5" 
                sx={{ 
                  color: 'primary.main', 
                  fontWeight: 600, 
                  lineHeight: 1,
                  transform: 'translateY(-3px)',
                }}
              >
                Rapidly
              </Typography>
            </Box>
            <Stack direction="row" spacing={2} alignItems="center">
              <FormControl size="small" sx={{ minWidth: 300 }}>
                <Select
                  value={selectedRun}
                  onChange={e => setSelectedRun(e.target.value)}
                  displayEmpty
                  renderValue={(value) => {
                    const runInfo = runsDetailed.find(r => r.runId === value);
                    if (!runInfo) return value || 'Select a run...';
                    const docName = runInfo.documentName || 'Unknown PRD';
                    return (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" fontWeight={500}>{docName}</Typography>
                        {runInfo.isFinal && <Chip label="✓" size="small" color="success" sx={{ height: 18, fontSize: '0.65rem' }} />}
                      </Box>
                    );
                  }}
                >
                  {runsDetailed.map(r => (
                    <MenuItem key={r.runId} value={r.runId}>
                      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" fontWeight={500}>{r.documentName || 'Unknown PRD'}</Typography>
                          {r.isFinal && <Chip label="Aligned" size="small" color="success" sx={{ height: 18, fontSize: '0.6rem' }} />}
                        </Box>
                        <Typography variant="caption" color="text.secondary">{r.runId}</Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.markdown"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadPrd(file);
                  e.target.value = '';
                }}
              />
              <Tooltip title="Start by sharing the document you want to validate">
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<UploadFileIcon />}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  size="small"
                  sx={{ color: '#ffffff' }}
                >
                  {uploading ? 'Uploading...' : 'Upload PRD'}
                </Button>
              </Tooltip>
              {currentRunInfo && (
                <Chip label={currentRunInfo.isFinal ? 'cpmFinal.json' : 'cpmRaw.json'} size="small" variant="outlined" />
              )}
              {runsDetailed.length > 0 && (
                <Tooltip title="Clear all runs">
                  <IconButton
                    size="small"
                    onClick={handleClearRuns}
                    sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}
                  >
                    <DeleteSweepIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          </Box>
        </Container>
      </Box>

      {/* Progress bar */}
      <Box sx={{ height: 2, bgcolor: 'divider' }} />

      {/* Status message */}
      {status && (
        <Container maxWidth="lg" sx={{ mt: 2 }}>
          <Box sx={{ p: 1, bgcolor: 'background.paper', borderRadius: 1, border: 1, borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary">{status}</Typography>
          </Box>
        </Container>
      )}
    </>
  );
}
