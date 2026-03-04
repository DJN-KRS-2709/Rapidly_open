'use client';

import { Tabs as MuiTabs, Tab } from '@mui/material';

export interface TabItem {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: TabItem[];
  activeId: string;
  onSwitchTab: (tabId: string) => void;
}

export function Tabs({ tabs, activeId, onSwitchTab }: TabsProps) {
  return (
    <MuiTabs
      value={activeId}
      onChange={(_, v) => onSwitchTab(v)}
      sx={{
        mt: 1,
        minHeight: 36,
        '& .MuiTab-root': { py: 0.75, minHeight: 36 },
        '& .MuiTabs-indicator': { height: 2 },
      }}
    >
      {tabs.map((tab) => (
        <Tab key={tab.id} value={tab.id} label={tab.label} />
      ))}
    </MuiTabs>
  );
}
