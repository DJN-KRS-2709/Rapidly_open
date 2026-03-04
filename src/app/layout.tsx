import { Metadata } from 'next';
import React from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Rapidly', template: '%s | Rapidly' },
  description: 'Turn PRDs into visual prototypes in minutes',
};

export default function RootLayout({ children }: React.PropsWithChildren<{}>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
