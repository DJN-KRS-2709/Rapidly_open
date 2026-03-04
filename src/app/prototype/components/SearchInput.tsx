'use client';

import { TextField, InputAdornment } from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';

interface SearchInputProps {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  width?: number;
}

export function SearchInput({ placeholder = 'Search...', value = '', onChange, width = 240 }: SearchInputProps) {
  return (
    <TextField
      size="small"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      sx={{
        width,
        '& .MuiOutlinedInput-root': {
          backgroundColor: '#0d1117',
          fontSize: 13,
          '& fieldset': { borderColor: '#30363d' },
        },
      }}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
