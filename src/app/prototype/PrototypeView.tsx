'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  Container,
  Typography,
  IconButton,
  FormControlLabel,
  Switch,
} from '@mui/material';
import { Settings as SettingsIcon } from '@mui/icons-material';
import type { UiBlueprint, UiBlueprintScreen } from '@/lib/prototypeBlueprint/types';
import {
  SideNav,
  TopBar,
  Tabs,
  DataTableDense,
  SearchInput,
  Breadcrumb,
  Pagination,
  Modal,
} from './components';

type ExtendedScreen = UiBlueprintScreen & {
  flowType?: string;
  tableColumns?: string[];
  tableRows?: Record<string, unknown>[];
  sortableCols?: number[];
  searchPlaceholder?: string;
  rowCount?: number;
  subtitle?: string;
  flow?: { name?: string; steps?: Array<{ actor_id?: string; action?: string; result?: string }>; job?: unknown };
  showFlowSteps?: boolean;
  steps?: Array<{ actor_id?: string; action?: string; result?: string }>;
};

interface PrototypeViewProps {
  blueprint: UiBlueprint;
  flowsJson?: string;
}

function getColumnKeys(columns: string[], rows: Record<string, unknown>[]): string[] {
  if (rows.length === 0) return columns.map((c) => c.toLowerCase().replace(/\s+/g, ''));
  return Object.keys(rows[0]!);
}

function ModalField({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.25 }}>{value}</Typography>
    </Box>
  );
}

export function PrototypeView({ blueprint, flowsJson }: PrototypeViewProps) {
  const [activeScreen, setActiveScreen] = useState(0);
  const [activeTabs, setActiveTabs] = useState<Record<number, string>>({});
  const [searchFilters, setSearchFilters] = useState<Record<number, string>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalContent, setModalContent] = useState<React.ReactNode>(null);
  const [activeStepIndex, setActiveStepIndex] = useState<Record<number, number>>({});

  const screens = blueprint.screens ?? [];
  const navItems = screens.map((s, i) => ({ id: String(i), label: s.title }));

  const getActiveTab = (scrIdx: number) => {
    const screen = screens[scrIdx] as ExtendedScreen | undefined;
    const tabs = screen?.tabs;
    if (!tabs || tabs.length === 0) return '';
    return activeTabs[scrIdx] ?? tabs[0]!.id;
  };

  const setActiveTab = useCallback((scrIdx: number, tabId: string) => {
    setActiveTabs((prev) => ({ ...prev, [scrIdx]: tabId }));
  }, []);

  const setSearchFilter = useCallback((scrIdx: number, value: string) => {
    setSearchFilters((prev) => ({ ...prev, [scrIdx]: value }));
  }, []);

  const openRowDetail = useCallback((row: Record<string, unknown>, columns: string[], columnKeys: string[]) => {
    setModalTitle('Row details');
    setModalContent(
      <Box>
        {columnKeys.map((k, i) => (
          <ModalField
            key={k}
            label={columns[i] ?? k}
            value={
              typeof row[k] === 'object' && row[k] != null && 'label' in (row[k] as object)
                ? String((row[k] as { label: string }).label)
                : String(row[k] ?? '—')
            }
          />
        ))}
      </Box>
    );
    setModalOpen(true);
  }, []);

  const openStepModal = useCallback(
    (scrIdx: number, stepIdx: number) => {
      const flows = flowsJson ? (JSON.parse(flowsJson) as Array<{ n: string; s: Array<{ a: string; x: string; r: string }> }>) : [];
      const flow = flows[scrIdx];
      if (!flow?.s?.[stepIdx]) return;
      const st = flow.s[stepIdx]!;
      setModalTitle(`Step ${stepIdx + 1}`);
      setModalContent(
        <Box>
          <ModalField label="Actor" value={st.a} />
          <ModalField label="Action" value={st.x} />
          <ModalField label="Result" value={st.r} />
        </Box>
      );
      setModalOpen(true);
      setActiveStepIndex((prev) => ({ ...prev, [scrIdx]: stepIdx }));
    },
    [flowsJson]
  );

  const renderScreen = (screen: ExtendedScreen, scrIdx: number) => {
    const title = screen.title;
    const subtitle = (screen.subtitle ?? '') as string;
    const searchPlaceholder = (screen.searchPlaceholder ?? 'Search...') as string;
    const showFlowSteps = screen.showFlowSteps ?? false;
    const flow = screen.flow;
    const steps = (screen.steps ?? flow?.steps ?? []) as Array<{ actor_id?: string; action?: string; result?: string }>;
    const hasSteps = steps.length > 0;
    const currentStep = activeStepIndex[scrIdx] ?? 0;

    const breadcrumbItems = ['Home', title, hasSteps ? `Step ${currentStep + 1}` : ''].filter(Boolean);

    const tabs = screen.tabs;
    const activeTab = getActiveTab(scrIdx);
    const searchFilter = searchFilters[scrIdx] ?? '';

    let mainContent: React.ReactNode;

    if (tabs && tabs.length > 0) {
      const activeTabData = tabs.find((t) => t.id === activeTab) ?? tabs[0]!;
      const content = activeTabData.content;

      if (content?.tableColumns && content?.tableRows) {
        const cols = content.tableColumns;
        const rows = content.tableRows;
        const colKeys = content.columnKeys ?? getColumnKeys(cols, rows);
        const sortableCols =
          tabs.indexOf(activeTabData) === 0 && (screen.flowType === 'calculation' || screen.flowType === 'reporting')
            ? [0, 1]
            : [];

        mainContent = (
          <>
            <DataTableDense
              columns={cols}
              columnKeys={colKeys}
              rows={rows}
              sortable={sortableCols}
              filter={searchFilter}
              onRowClick={(row) => openRowDetail(row, cols, colKeys)}
            />
            <Pagination total={rows.length} rowsPerPage={25} page={1} />
          </>
        );
      } else {
        mainContent = (
          <Box sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>
            <Typography>{content?.placeholder ?? activeTabData.label}</Typography>
          </Box>
        );
      }
    } else {
      const tableColumns = screen.tableColumns ?? [];
      const tableRows = screen.tableRows ?? [];
      const sortableCols = screen.sortableCols ?? [];
      const rowCount = screen.rowCount ?? 0;

      if (tableColumns.length > 0 && tableRows.length > 0) {
        const colKeys = getColumnKeys(tableColumns, tableRows);
        mainContent = (
          <>
            <DataTableDense
              columns={tableColumns}
              columnKeys={colKeys}
              rows={tableRows}
              sortable={sortableCols}
              filter={searchFilter}
              onRowClick={(row) => openRowDetail(row, tableColumns, colKeys)}
            />
            <Pagination total={rowCount} rowsPerPage={25} page={1} />
          </>
        );
      } else {
        mainContent = (
          <Box sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>
            <Typography>No user flows extracted.</Typography>
            <Typography variant="body2" sx={{ mt: 0.5, opacity: 0.8 }}>
              Add flows to your PRD to see them here.
            </Typography>
          </Box>
        );
      }
    }

    const mecDevMode =
      screen.flowType === 'mec' ? (
        <FormControlLabel
          control={<Switch size="small" />}
          label="Dev mode"
          sx={{ mt: 1, '& .MuiFormControlLabel-label': { fontSize: 12, color: 'text.secondary' } }}
        />
      ) : null;

    const stepsPanel =
      showFlowSteps && hasSteps ? (
        <Box sx={{ borderTop: 1, borderColor: 'divider', p: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Flow steps
          </Typography>
          <Box sx={{ mt: 1 }}>
            {steps.map((st, si) => (
              <Box
                key={si}
                onClick={() => openStepModal(scrIdx, si)}
                sx={{
                  display: 'flex',
                  gap: 1,
                  py: 1,
                  px: 1.5,
                  borderRadius: 1,
                  cursor: 'pointer',
                  borderLeft: '2px solid',
                  borderLeftColor: si === (activeStepIndex[scrIdx] ?? 0) ? 'primary.main' : 'transparent',
                  bgcolor: si === (activeStepIndex[scrIdx] ?? 0) ? '#161b22' : 'transparent',
                  '&:hover': { bgcolor: '#161b22' },
                }}
              >
                <Typography sx={{ color: 'primary.main', fontSize: 12 }}>{si <= (activeStepIndex[scrIdx] ?? 0) ? '●' : '○'}</Typography>
                <Box>
                  <Typography component="span" variant="caption" sx={{ color: 'primary.main', fontWeight: 600, textTransform: 'uppercase' }}>
                    {st.actor_id ?? ''}
                  </Typography>
                  <Typography variant="body2" sx={{ display: 'block' }}>{st.action ?? ''}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>→ {st.result ?? ''}</Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      ) : null;

    return (
      <Box
        key={screen.id}
        sx={{
          display: scrIdx === activeScreen ? 'flex' : 'none',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        <Container maxWidth="lg" sx={{ flex: 1, py: 3, overflow: 'auto' }}>
          <Breadcrumb items={breadcrumbItems} />
          <TopBar title={title} subtitle={subtitle} badge="Music" />
          {tabs && tabs.length > 0 && (
            <Tabs tabs={tabs.map((t) => ({ id: t.id, label: t.label }))} activeId={activeTab} onSwitchTab={(id) => setActiveTab(scrIdx, id)} />
          )}
          {mecDevMode}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 2 }}>
            <SearchInput
              placeholder={searchPlaceholder}
              value={searchFilter}
              onChange={(v) => setSearchFilter(scrIdx, v)}
            />
            <IconButton size="small" sx={{ ml: 'auto' }} aria-label="Settings">
              <SettingsIcon />
            </IconButton>
          </Box>
          <Box sx={{ mt: 2 }}>{mainContent}</Box>
          {stepsPanel}
        </Container>
      </Box>
    );
  };

  if (screens.length === 0) {
    return (
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Container maxWidth="lg" sx={{ flex: 1, py: 5, textAlign: 'center', color: 'text.secondary' }}>
          <Typography>No user flows extracted.</Typography>
          <Typography variant="body2" sx={{ mt: 0.5, opacity: 0.8 }}>Add flows to your PRD to see them here.</Typography>
        </Container>
      </Box>
    );
  }

  return (
    <>
      <SideNav items={navItems} activeId={activeScreen} appName={blueprint.appName} onNavigate={setActiveScreen} />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {screens.map((screen, i) => renderScreen(screen as ExtendedScreen, i))}
      </Box>
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={modalTitle}>
        {modalContent}
      </Modal>
    </>
  );
}
