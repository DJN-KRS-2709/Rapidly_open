'use client';

import {
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material';
import {
  AccountBalance as LicensorsIcon,
  Description as ContractsIcon,
  Calculate as CalculationsIcon,
  FactCheck as MecChecksIcon,
  TrendingUp as UpliftsIcon,
  Assessment as ReportingIcon,
  Folder as LibrariesIcon,
  ChevronLeft as CollapseIcon,
  Dashboard as DashboardIcon,
} from '@mui/icons-material';
import Image from 'next/image';

const logoHeader = { src: '/rapid-header.svg' };

export interface NavItem {
  id: string;
  label: string;
}

const NAV_ICONS: Record<string, React.ComponentType<{ sx?: object }>> = {
  licensors: LicensorsIcon,
  contracts: ContractsIcon,
  calculations: CalculationsIcon,
  'mec checks': MecChecksIcon,
  uplifts: UpliftsIcon,
  reporting: ReportingIcon,
  libraries: LibrariesIcon,
};

function getIconForLabel(label: string) {
  const key = label.toLowerCase();
  return NAV_ICONS[key] ?? DashboardIcon;
}

interface SideNavProps {
  items: NavItem[];
  activeId: number;
  appName: string;
  onNavigate: (index: number) => void;
}

const DRAWER_WIDTH = 240;

export function SideNav({ items, activeId, appName, onNavigate }: SideNavProps) {
  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
          borderRight: '1px solid',
          borderColor: 'divider',
        },
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Logo / branding - like Rapidly header */}
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Image
              src={logoHeader.src}
              alt="Prototype"
              width={40}
              height={40}
              style={{ flexShrink: 0 }}
            />
            <Box>
              <Typography variant="body1" fontWeight={600} color="text.primary">
                {appName}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Prototype
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Nav items with icons */}
        <List sx={{ flex: 1, overflowY: 'auto', py: 1 }}>
          {items.length > 0 ? (
            items.map((item, i) => {
              const Icon = getIconForLabel(item.label);
              const isActive = i === activeId;
              return (
                <ListItemButton
                  key={item.id}
                  selected={isActive}
                  onClick={() => onNavigate(i)}
                  sx={{
                    mx: 1,
                    borderRadius: 1,
                    borderLeft: isActive ? '2px solid' : '2px solid transparent',
                    borderLeftColor: isActive ? 'primary.main' : 'transparent',
                    pl: 1.5,
                    '&.Mui-selected': {
                      bgcolor: '#161b22',
                      color: 'primary.main',
                      '& .MuiListItemIcon-root': { color: 'primary.main' },
                    },
                    '&:hover': {
                      bgcolor: '#161b22',
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}>
                    <Icon sx={{ fontSize: 20 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{ fontSize: 13 }}
                  />
                </ListItemButton>
              );
            })
          ) : (
            <ListItemButton disabled>
              <ListItemText primary="No sections" />
            </ListItemButton>
          )}
        </List>

        {/* Footer - collapse + user */}
        <Box sx={{ borderTop: 1, borderColor: 'divider', p: 1.5 }}>
          <ListItemButton sx={{ borderRadius: 1 }}>
            <ListItemIcon sx={{ minWidth: 36 }}>
              <CollapseIcon sx={{ fontSize: 18 }} />
            </ListItemIcon>
            <ListItemText primary="Collapse sidebar" primaryTypographyProps={{ fontSize: 12 }} />
          </ListItemButton>
          <Typography variant="caption" color="text.secondary" sx={{ px: 2, display: 'block' }}>
            DK Dejan Krstic
          </Typography>
        </Box>
      </Box>
    </Drawer>
  );
}
