/**
 * Theme detection for document-driven prototypes.
 * Exports detectTheme, buildThemeCorpus, detectThemeFromCpm.
 */

export interface JtbdToolMapping {
  jtbd: string;
  toolName: string;
  toolDescription: string;
  uiPatterns: string[];
  terminology: Record<string, string>;
}

export interface UiTheme {
  name: 'enterprise' | 'consumer' | 'neutral';
  background: string;
  surface: string;
  primary: string;
  secondary: string;
  text: string;
  textSecondary: string;
  isDark: boolean;
  description: string;
  jtbdTool?: JtbdToolMapping;
}

// Detect job-to-be-done and map to real-world SaaS tools
function detectJtbdTool(allText: string): JtbdToolMapping | null {
  const lower = allText.toLowerCase();
  
  // Cash Application / Payment Matching -> HighRadius
  if (/cash\s*application|payment\s*match|cash\s*receipt|remittance|lockbox|unapplied\s*cash|cash\s*posting/i.test(lower)) {
    return {
      jtbd: 'Cash Application',
      toolName: 'HighRadius',
      toolDescription: 'AI-powered cash application and payment matching',
      uiPatterns: ['data-grid-with-suggestions', 'match-panel', 'exception-queue', 'ai-confidence-score'],
      terminology: {
        item: 'remittance',
        match: 'apply',
        queue: 'worklist',
        approve: 'post',
        reject: 'return',
        review: 'investigate',
      },
    };
  }
  
  // Settlement Matching / Reconciliation -> BlackLine
  if (/settlement\s*match|reconcil|bank\s*rec|account\s*rec|balance\s*match|intercompany|cert|variance/i.test(lower)) {
    return {
      jtbd: 'Reconciliation',
      toolName: 'BlackLine',
      toolDescription: 'Financial close and account reconciliation',
      uiPatterns: ['cert-grid', 'variance-panel', 'task-list', 'approval-chain', 'balance-comparison'],
      terminology: {
        item: 'reconciliation',
        approve: 'certify',
        complete: 'close',
        exception: 'variance',
        review: 'substantiate',
        submit: 'submit for review',
      },
    };
  }
  
  // Month-End Close -> FloQast
  if (/month[\s-]*end|mec\b|close\s*process|period\s*close|financial\s*close|close\s*checklist|close\s*management/i.test(lower)) {
    return {
      jtbd: 'Month-End Close',
      toolName: 'FloQast',
      toolDescription: 'Close management and workflow automation',
      uiPatterns: ['checklist-grid', 'status-timeline', 'signoff-panel', 'flux-analysis', 'dependency-tracker'],
      terminology: {
        item: 'checklist item',
        approve: 'sign off',
        status: 'close status',
        review: 'flux review',
        complete: 'mark complete',
        exception: 'variance',
      },
    };
  }
  
  // Revenue Recognition -> Zuora RevPro
  if (/rev\s*rec|revenue\s*recognition|asc\s*606|deferred\s*revenue|contract\s*revenue|performance\s*obligation/i.test(lower)) {
    return {
      jtbd: 'Revenue Recognition',
      toolName: 'Zuora RevPro',
      toolDescription: 'Automated revenue recognition and compliance',
      uiPatterns: ['waterfall-chart', 'schedule-grid', 'journal-preview', 'rule-builder', 'contract-timeline'],
      terminology: {
        item: 'performance obligation',
        schedule: 'rev schedule',
        approve: 'recognize',
        post: 'post to GL',
        review: 'review allocation',
      },
    };
  }
  
  // Billing / Invoicing -> Zuora Billing
  if (/billing|invoice|subscription|recurring\s*charge|usage\s*based|bill\s*run|dunning/i.test(lower)) {
    return {
      jtbd: 'Subscription Billing',
      toolName: 'Zuora Billing',
      toolDescription: 'Subscription billing and invoicing platform',
      uiPatterns: ['invoice-builder', 'subscription-timeline', 'charge-grid', 'dunning-queue', 'usage-meter'],
      terminology: {
        item: 'subscription',
        charge: 'rate plan charge',
        invoice: 'bill run',
        create: 'generate invoice',
        approve: 'finalize',
      },
    };
  }
  
  // Approval Workflows -> Coupa
  if (/approval\s*workflow|procurement|purchase\s*request|spend\s*management|requisition|purchase\s*order/i.test(lower)) {
    return {
      jtbd: 'Approval Workflows',
      toolName: 'Coupa',
      toolDescription: 'Business spend management and approvals',
      uiPatterns: ['request-form', 'approval-chain', 'budget-check', 'supplier-grid', 'spend-analytics'],
      terminology: {
        item: 'requisition',
        approve: 'approve',
        reject: 'send back',
        submit: 'submit for approval',
        review: 'review request',
      },
    };
  }
  
  // Configuration / Setup -> Salesforce Setup
  if (/config|setup|rule\s*builder|product\s*config|entity\s*setup|mapping|admin\s*console/i.test(lower)) {
    return {
      jtbd: 'Configuration Management',
      toolName: 'Salesforce Setup',
      toolDescription: 'Enterprise configuration and setup wizard',
      uiPatterns: ['setup-tree', 'config-form', 'test-panel', 'deployment-status', 'object-builder'],
      terminology: {
        item: 'configuration',
        save: 'save',
        deploy: 'activate',
        test: 'validate',
        create: 'new record',
      },
    };
  }
  
  // Anomaly Detection / Analytics -> Kount/Signifyd style
  if (/anomaly|exception|outlier|fraud|unusual\s*pattern|alert|risk\s*score|detection/i.test(lower)) {
    return {
      jtbd: 'Anomaly Detection',
      toolName: 'Signifyd',
      toolDescription: 'Transaction monitoring and anomaly detection',
      uiPatterns: ['alert-queue', 'risk-score-panel', 'investigation-form', 'trend-chart', 'case-timeline'],
      terminology: {
        item: 'alert',
        approve: 'clear',
        reject: 'flag',
        review: 'investigate',
        escalate: 'escalate to manager',
      },
    };
  }
  
  // Ageing Analysis / AR Management -> HighRadius style
  if (/ageing|aging|ar\s*analysis|receivable|outstanding|overdue|collection/i.test(lower)) {
    return {
      jtbd: 'AR Management',
      toolName: 'HighRadius',
      toolDescription: 'Accounts receivable and collections management',
      uiPatterns: ['aging-buckets', 'customer-grid', 'collection-queue', 'promise-tracker', 'dispute-panel'],
      terminology: {
        item: 'invoice',
        action: 'collect',
        review: 'review account',
        escalate: 'escalate to collections',
        resolve: 'mark resolved',
      },
    };
  }
  
  return null;
}


export function detectTheme(allText: string): UiTheme {
  const lower = allText.toLowerCase();
  
  // NetSuite ERP - classic light theme dashboard
  if (/netsuite|oracle\s*erp|inventory\s*management|purchase\s*order|accounts\s*(?:payable|receivable)|general\s*ledger/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#FFFFFF',
      surface: '#F5F5F5',
      primary: '#1A5276',
      secondary: '#D4E6F1',
      text: '#2C3E50',
      textSecondary: '#7F8C8D',
      isDark: false,
      description: 'NetSuite ERP - Light theme with KPI cards, indicator tables, gauge widgets',
    };
  }
  
  // ============ MUSIC & AUDIO ============
  // Apple Music
  if (/apple\s*music|itunes|apple\s*podcast/i.test(lower)) {
    return {
      name: 'consumer',
      background: '#000000',
      surface: '#1C1C1E',
      primary: '#FA2D48',
      secondary: '#2C2C2E',
      text: '#FFFFFF',
      textSecondary: '#8E8E93',
      isDark: true,
      description: 'Apple Music - Dark theme with red accent (#FA2D48)',
    };
  }
  
  // SoundCloud
  if (/soundcloud/i.test(lower)) {
    return {
      name: 'consumer',
      background: '#FFFFFF',
      surface: '#F2F2F2',
      primary: '#FF5500',
      secondary: '#F2F2F2',
      text: '#333333',
      textSecondary: '#999999',
      isDark: false,
      description: 'SoundCloud - Light theme with orange accent (#FF5500)',
    };
  }
  
  // ============ SOCIAL MEDIA ============
  // Instagram
  if (/instagram|insta|reels|stories/i.test(lower)) {
    return {
      name: 'consumer',
      background: '#FFFFFF',
      surface: '#FAFAFA',
      primary: '#E1306C',
      secondary: '#EFEFEF',
      text: '#262626',
      textSecondary: '#8E8E8E',
      isDark: false,
      description: 'Instagram - Clean white with gradient pink/purple accent',
    };
  }
  
  // TikTok
  if (/tiktok|tik\s*tok/i.test(lower)) {
    return {
      name: 'consumer',
      background: '#000000',
      surface: '#121212',
      primary: '#FE2C55',
      secondary: '#25F4EE',
      text: '#FFFFFF',
      textSecondary: '#8A8B91',
      isDark: true,
      description: 'TikTok - Dark theme with red/cyan accents',
    };
  }
  
  // Twitter/X
  if (/twitter|tweet|x\.com/i.test(lower)) {
    return {
      name: 'consumer',
      background: '#FFFFFF',
      surface: '#F7F9FA',
      primary: '#1DA1F2',
      secondary: '#E8F5FE',
      text: '#14171A',
      textSecondary: '#657786',
      isDark: false,
      description: 'Twitter/X - Light theme with signature blue (#1DA1F2)',
    };
  }
  
  // Facebook/Meta (use word boundary to avoid matching "metadata")
  if (/facebook|\bmeta\b|messenger/i.test(lower) && !/metadata/i.test(lower)) {
    return {
      name: 'consumer',
      background: '#FFFFFF',
      surface: '#F0F2F5',
      primary: '#1877F2',
      secondary: '#E4E6EB',
      text: '#050505',
      textSecondary: '#65676B',
      isDark: false,
      description: 'Facebook - Light theme with blue accent (#1877F2)',
    };
  }
  
  // LinkedIn
  if (/linkedin/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#FFFFFF',
      surface: '#F3F2EF',
      primary: '#0A66C2',
      secondary: '#E9E5DF',
      text: '#000000',
      textSecondary: '#666666',
      isDark: false,
      description: 'LinkedIn - Professional blue theme (#0A66C2)',
    };
  }
  
  // Snapchat
  if (/snapchat|snap/i.test(lower)) {
    return {
      name: 'consumer',
      background: '#FFFFFF',
      surface: '#F7F7F7',
      primary: '#FFFC00',
      secondary: '#000000',
      text: '#000000',
      textSecondary: '#666666',
      isDark: false,
      description: 'Snapchat - Light theme with yellow accent (#FFFC00)',
    };
  }
  
  // Discord
  if (/discord/i.test(lower)) {
    return {
      name: 'consumer',
      background: '#36393F',
      surface: '#2F3136',
      primary: '#5865F2',
      secondary: '#40444B',
      text: '#FFFFFF',
      textSecondary: '#B9BBBE',
      isDark: true,
      description: 'Discord - Dark theme with blurple accent (#5865F2)',
    };
  }
  
  // Slack
  if (/slack/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#FFFFFF',
      surface: '#F8F8F8',
      primary: '#4A154B',
      secondary: '#ECE7EC',
      text: '#1D1C1D',
      textSecondary: '#616061',
      isDark: false,
      description: 'Slack - Light theme with purple accent (#4A154B)',
    };
  }
  
  // WhatsApp
  if (/whatsapp/i.test(lower)) {
    return {
      name: 'consumer',
      background: '#ECE5DD',
      surface: '#FFFFFF',
      primary: '#25D366',
      secondary: '#DCF8C6',
      text: '#303030',
      textSecondary: '#667781',
      isDark: false,
      description: 'WhatsApp - Light theme with green accent (#25D366)',
    };
  }
  
  // ============ E-COMMERCE & MARKETPLACE ============
  // Airbnb
  if (/airbnb|vacation\s*rental|host|listing/i.test(lower)) {
    return {
      name: 'consumer',
      background: '#FFFFFF',
      surface: '#F7F7F7',
      primary: '#FF5A5F',
      secondary: '#00A699',
      text: '#484848',
      textSecondary: '#767676',
      isDark: false,
      description: 'Airbnb - Clean white with coral red accent (#FF5A5F)',
    };
  }
  
  // Uber
  if (/uber(?!.*eats)/i.test(lower)) {
    return {
      name: 'consumer',
      background: '#000000',
      surface: '#1A1A1A',
      primary: '#FFFFFF',
      secondary: '#333333',
      text: '#FFFFFF',
      textSecondary: '#8D8D8D',
      isDark: true,
      description: 'Uber - Dark theme with white/black contrast',
    };
  }
  
  // Uber Eats / DoorDash / Food Delivery
  if (/uber\s*eats|doordash|grubhub|food\s*delivery/i.test(lower)) {
    return {
      name: 'consumer',
      background: '#FFFFFF',
      surface: '#F6F6F6',
      primary: '#06C167',
      secondary: '#EEEEEE',
      text: '#000000',
      textSecondary: '#6B6B6B',
      isDark: false,
      description: 'Food Delivery - Light theme with green accent (#06C167)',
    };
  }
  
  // Amazon
  if (/amazon/i.test(lower)) {
    return {
      name: 'consumer',
      background: '#FFFFFF',
      surface: '#F3F3F3',
      primary: '#FF9900',
      secondary: '#232F3E',
      text: '#0F1111',
      textSecondary: '#565959',
      isDark: false,
      description: 'Amazon - Light theme with orange accent (#FF9900)',
    };
  }
  
  // eBay
  if (/ebay/i.test(lower)) {
    return {
      name: 'consumer',
      background: '#FFFFFF',
      surface: '#F7F7F7',
      primary: '#E53238',
      secondary: '#0064D2',
      text: '#191919',
      textSecondary: '#707070',
      isDark: false,
      description: 'eBay - Light theme with multicolor branding',
    };
  }
  
  // Shopify
  if (/shopify/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#F6F6F7',
      surface: '#FFFFFF',
      primary: '#5C6AC4',
      secondary: '#006FBB',
      text: '#212B36',
      textSecondary: '#637381',
      isDark: false,
      description: 'Shopify - Light theme with purple accent (#5C6AC4)',
    };
  }
  
  // Etsy
  if (/etsy/i.test(lower)) {
    return {
      name: 'consumer',
      background: '#FFFFFF',
      surface: '#FDEBD2',
      primary: '#F56400',
      secondary: '#232347',
      text: '#222222',
      textSecondary: '#595959',
      isDark: false,
      description: 'Etsy - Light theme with orange accent (#F56400)',
    };
  }
  
  // ============ FINTECH & PAYMENTS ============
  // Stripe
  if (/stripe/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#F6F9FC',
      surface: '#FFFFFF',
      primary: '#635BFF',
      secondary: '#0A2540',
      text: '#0A2540',
      textSecondary: '#425466',
      isDark: false,
      description: 'Stripe - Clean theme with purple accent (#635BFF)',
    };
  }
  
  // PayPal
  if (/paypal/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#FFFFFF',
      surface: '#F5F7FA',
      primary: '#003087',
      secondary: '#009CDE',
      text: '#2C2E2F',
      textSecondary: '#687173',
      isDark: false,
      description: 'PayPal - Light theme with blue accent (#003087)',
    };
  }
  
  // Square
  if (/square(?!\s*space)/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#FFFFFF',
      surface: '#F7F7F7',
      primary: '#006AFF',
      secondary: '#1A1A1A',
      text: '#1A1A1A',
      textSecondary: '#666666',
      isDark: false,
      description: 'Square - Minimal theme with blue accent (#006AFF)',
    };
  }
  
  // Robinhood
  if (/robinhood/i.test(lower)) {
    return {
      name: 'consumer',
      background: '#000000',
      surface: '#1E1E1E',
      primary: '#00C805',
      secondary: '#1E2124',
      text: '#FFFFFF',
      textSecondary: '#9DA0A5',
      isDark: true,
      description: 'Robinhood - Dark theme with green accent (#00C805)',
    };
  }
  
  // Venmo
  if (/venmo/i.test(lower)) {
    return {
      name: 'consumer',
      background: '#FFFFFF',
      surface: '#F7F7F7',
      primary: '#008CFF',
      secondary: '#3D95CE',
      text: '#2F3033',
      textSecondary: '#6D6E71',
      isDark: false,
      description: 'Venmo - Light theme with blue accent (#008CFF)',
    };
  }
  
  // ============ ENTERPRISE & CRM ============
  // Salesforce
  if (/salesforce|sfdc/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#FFFFFF',
      surface: '#F3F3F3',
      primary: '#0176D3',
      secondary: '#032D60',
      text: '#181818',
      textSecondary: '#444444',
      isDark: false,
      description: 'Salesforce - Lightning Design System blue (#0176D3)',
    };
  }
  
  // HubSpot
  if (/hubspot/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#FFFFFF',
      surface: '#F5F8FA',
      primary: '#FF7A59',
      secondary: '#00BDA5',
      text: '#33475B',
      textSecondary: '#7C98B6',
      isDark: false,
      description: 'HubSpot - Light theme with orange accent (#FF7A59)',
    };
  }
  
  // NetSuite / Oracle
  if (/netsuite|oracle/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#FFFFFF',
      surface: '#F2F2F2',
      primary: '#C74634',
      secondary: '#312D2A',
      text: '#312D2A',
      textSecondary: '#666666',
      isDark: false,
      description: 'Oracle/NetSuite - Enterprise theme with red accent (#C74634)',
    };
  }
  
  // SAP
  if (/\bsap\b/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#F7F7F7',
      surface: '#FFFFFF',
      primary: '#0A6ED1',
      secondary: '#354A5F',
      text: '#32363A',
      textSecondary: '#6A6D70',
      isDark: false,
      description: 'SAP Fiori - Enterprise blue theme (#0A6ED1)',
    };
  }
  
  // ============ ENTERPRISE FINANCE & OPERATIONS ============
  // BlackLine (Close/Reconciliation)
  if (/blackline/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#FFFFFF',
      surface: '#F5F6FA',
      primary: '#00263E',
      secondary: '#0070BA',
      text: '#1A1A1A',
      textSecondary: '#666666',
      isDark: false,
      description: 'BlackLine - Enterprise finance close and reconciliation',
    };
  }
  
  // FloQast (Month-End Close)
  if (/floqast/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#FFFFFF',
      surface: '#F8F9FA',
      primary: '#00B4D8',
      secondary: '#023E8A',
      text: '#212529',
      textSecondary: '#6C757D',
      isDark: false,
      description: 'FloQast - Month-end close management',
    };
  }
  
  // HighRadius (Cash Application/AR)
  if (/highradius/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#FFFFFF',
      surface: '#F4F7FA',
      primary: '#1E3A5F',
      secondary: '#00A3E0',
      text: '#333333',
      textSecondary: '#666666',
      isDark: false,
      description: 'HighRadius - Cash application and AR automation',
    };
  }
  
  // Workiva (Financial Reporting)
  if (/workiva/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#FFFFFF',
      surface: '#F5F5F5',
      primary: '#009FDA',
      secondary: '#002E5D',
      text: '#333333',
      textSecondary: '#767676',
      isDark: false,
      description: 'Workiva - Connected reporting and compliance',
    };
  }
  
  // Zuora (Subscription Billing/RevRec)
  if (/zuora/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#FFFFFF',
      surface: '#F7F8FA',
      primary: '#0033A0',
      secondary: '#00B2A9',
      text: '#1A1A1A',
      textSecondary: '#666666',
      isDark: false,
      description: 'Zuora - Subscription billing and revenue',
    };
  }
  
  // Coupa (Procurement/Approvals)
  if (/coupa/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#FFFFFF',
      surface: '#F5F7FA',
      primary: '#0072CE',
      secondary: '#E31837',
      text: '#333333',
      textSecondary: '#666666',
      isDark: false,
      description: 'Coupa - Business spend management',
    };
  }
  
  // ServiceNow (Workflows/ITSM)
  if (/servicenow/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#FFFFFF',
      surface: '#F1F5F6',
      primary: '#81B5A1',
      secondary: '#293E40',
      text: '#293E40',
      textSecondary: '#636B6F',
      isDark: false,
      description: 'ServiceNow - Digital workflows',
    };
  }
  
  // Trintech (Reconciliation)
  if (/trintech|cadency|adra/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#FFFFFF',
      surface: '#F5F7F9',
      primary: '#00539B',
      secondary: '#7AB800',
      text: '#333333',
      textSecondary: '#666666',
      isDark: false,
      description: 'Trintech - Financial close and reconciliation',
    };
  }
  
  // Workday (HCM/Finance)
  if (/workday/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#FFFFFF',
      surface: '#F5F7FA',
      primary: '#005CB9',
      secondary: '#F68D2E',
      text: '#2D2D2D',
      textSecondary: '#6D6D6D',
      isDark: false,
      description: 'Workday - Enterprise finance and HR',
    };
  }
  
  // Zendesk
  if (/zendesk/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#FFFFFF',
      surface: '#F8F9F9',
      primary: '#03363D',
      secondary: '#17494D',
      text: '#2F3941',
      textSecondary: '#68737D',
      isDark: false,
      description: 'Zendesk - Garden design system (#03363D)',
    };
  }
  
  // Jira / Atlassian
  if (/jira|atlassian|confluence|trello/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#FFFFFF',
      surface: '#F4F5F7',
      primary: '#0052CC',
      secondary: '#DFE1E6',
      text: '#172B4D',
      textSecondary: '#5E6C84',
      isDark: false,
      description: 'Atlassian - Design system blue (#0052CC)',
    };
  }
  
  // Notion
  if (/notion/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#FFFFFF',
      surface: '#F7F6F3',
      primary: '#000000',
      secondary: '#E9E9E7',
      text: '#37352F',
      textSecondary: '#9B9A97',
      isDark: false,
      description: 'Notion - Minimal black and white theme',
    };
  }
  
  // Figma
  if (/figma/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#FFFFFF',
      surface: '#F5F5F5',
      primary: '#A259FF',
      secondary: '#1ABCFE',
      text: '#000000',
      textSecondary: '#666666',
      isDark: false,
      description: 'Figma - Light theme with purple accent (#A259FF)',
    };
  }
  
  // Asana
  if (/asana/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#FFFFFF',
      surface: '#F6F8F9',
      primary: '#F06A6A',
      secondary: '#796EFF',
      text: '#151B26',
      textSecondary: '#6D6E6F',
      isDark: false,
      description: 'Asana - Light theme with coral accent (#F06A6A)',
    };
  }
  
  // Monday.com
  if (/monday\.com|monday\s*board/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#FFFFFF',
      surface: '#F5F6F8',
      primary: '#0073EA',
      secondary: '#00C875',
      text: '#323338',
      textSecondary: '#676879',
      isDark: false,
      description: 'Monday.com - Colorful work OS theme (#0073EA)',
    };
  }
  
  // ============ PRODUCTIVITY & CLOUD ============
  // Google / Gmail / Google Drive
  if (/google|gmail|gdrive|google\s*drive|google\s*docs/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#FFFFFF',
      surface: '#F8F9FA',
      primary: '#1A73E8',
      secondary: '#E8F0FE',
      text: '#202124',
      textSecondary: '#5F6368',
      isDark: false,
      description: 'Google Material - Light theme with blue accent (#1A73E8)',
    };
  }
  
  // Microsoft / Office 365 / Teams
  if (/microsoft|office\s*365|teams|outlook|azure/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#FFFFFF',
      surface: '#FAF9F8',
      primary: '#0078D4',
      secondary: '#EDEBE9',
      text: '#323130',
      textSecondary: '#605E5C',
      isDark: false,
      description: 'Microsoft Fluent - Light theme with blue accent (#0078D4)',
    };
  }
  
  // Dropbox
  if (/dropbox/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#FFFFFF',
      surface: '#F7F5F2',
      primary: '#0061FF',
      secondary: '#B4DC19',
      text: '#1E1919',
      textSecondary: '#637282',
      isDark: false,
      description: 'Dropbox - Clean theme with blue accent (#0061FF)',
    };
  }
  
  // Zoom
  if (/zoom/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#FFFFFF',
      surface: '#F6F6F6',
      primary: '#2D8CFF',
      secondary: '#0B5CFF',
      text: '#232333',
      textSecondary: '#747487',
      isDark: false,
      description: 'Zoom - Light theme with blue accent (#2D8CFF)',
    };
  }
  
  // ============ TRAVEL & TRANSPORTATION ============
  // Generic booking / reservation / scheduling (before Booking.com)
  if (/booking\s*system|reservation\s*system|appointment\s*book|schedule\s*management|availability\s*calendar|hotel\s*booking|room\s*booking/i.test(lower) && !/booking\s*journal/i.test(lower)) {
    return {
      name: 'consumer',
      background: '#FFFFFF',
      surface: '#F5F5F5',
      primary: '#003580',
      secondary: '#FEBB02',
      text: '#262626',
      textSecondary: '#6B6B6B',
      isDark: false,
      description: 'Booking - Reservation system with calendar, availability, navy blue accent (#003580)',
    };
  }

  // Booking.com
  if (/booking\.com|booking\s*com/i.test(lower)) {
    return {
      name: 'consumer',
      background: '#FFFFFF',
      surface: '#F5F5F5',
      primary: '#003580',
      secondary: '#FEBB02',
      text: '#262626',
      textSecondary: '#6B6B6B',
      isDark: false,
      description: 'Booking.com - Light theme with navy blue (#003580)',
    };
  }
  
  // Expedia
  if (/expedia/i.test(lower)) {
    return {
      name: 'consumer',
      background: '#FFFFFF',
      surface: '#F8F5F1',
      primary: '#FFCC00',
      secondary: '#1668E3',
      text: '#1A1A1A',
      textSecondary: '#505050',
      isDark: false,
      description: 'Expedia - Light theme with yellow accent (#FFCC00)',
    };
  }
  
  // ============ HEALTH & FITNESS ============
  // Peloton
  if (/peloton/i.test(lower)) {
    return {
      name: 'consumer',
      background: '#181A1D',
      surface: '#232629',
      primary: '#DF1C2F',
      secondary: '#FFFFFF',
      text: '#FFFFFF',
      textSecondary: '#9B9B9B',
      isDark: true,
      description: 'Peloton - Dark theme with red accent (#DF1C2F)',
    };
  }
  
  // Strava
  if (/strava/i.test(lower)) {
    return {
      name: 'consumer',
      background: '#FFFFFF',
      surface: '#F7F7FA',
      primary: '#FC4C02',
      secondary: '#FC4C02',
      text: '#242428',
      textSecondary: '#606065',
      isDark: false,
      description: 'Strava - Light theme with orange accent (#FC4C02)',
    };
  }
  
  // ============ GAMING ============
  // Twitch
  if (/twitch/i.test(lower)) {
    return {
      name: 'consumer',
      background: '#0E0E10',
      surface: '#18181B',
      primary: '#9146FF',
      secondary: '#772CE8',
      text: '#EFEFF1',
      textSecondary: '#ADADB8',
      isDark: true,
      description: 'Twitch - Dark theme with purple accent (#9146FF)',
    };
  }
  
  // Steam
  if (/steam/i.test(lower)) {
    return {
      name: 'consumer',
      background: '#1B2838',
      surface: '#171A21',
      primary: '#66C0F4',
      secondary: '#2A475E',
      text: '#C7D5E0',
      textSecondary: '#8F98A0',
      isDark: true,
      description: 'Steam - Dark blue theme with light blue accent (#66C0F4)',
    };
  }
  
  // Netflix
  if (/netflix/i.test(lower)) {
    return {
      name: 'consumer',
      background: '#141414',
      surface: '#181818',
      primary: '#E50914',
      secondary: '#333333',
      text: '#FFFFFF',
      textSecondary: '#808080',
      isDark: true,
      description: 'Netflix - Dark theme with red accent (#E50914)',
    };
  }
  
  // YouTube
  if (/youtube/i.test(lower)) {
    return {
      name: 'consumer',
      background: '#FFFFFF',
      surface: '#F9F9F9',
      primary: '#FF0000',
      secondary: '#065FD4',
      text: '#030303',
      textSecondary: '#606060',
      isDark: false,
      description: 'YouTube - Light theme with red accent (#FF0000)',
    };
  }
  
  // ============ GENERIC PATTERNS ============
  // Generic music/audio (fallback) - require explicit music context, not just "track"
  // "track" alone can mean "track progress" or "tracking" in non-music contexts
  const explicitMusicTerms = /\bmusic\b|\baudio\b|\bpodcast\b|\bplaylist\b|\bsong\b|\balbum\b|\bstreaming\b/i.test(lower);
  const musicContextTrack = /\btrack\b/.test(lower) && /play|listen|stream|shuffle|skip/i.test(lower);
  if (explicitMusicTerms || musicContextTrack) {
    return {
      name: 'consumer',
      background: '#121212',
      surface: '#1E1E1E',
      primary: '#1DB954',
      secondary: '#282828',
      text: '#FFFFFF',
      textSecondary: '#B3B3B3',
      isDark: true,
      description: 'Music/Audio app - Dark theme with green accent',
    };
  }
  
  // Generic social (fallback)
  if (/social|share|friend|follow|like|comment|post|feed|story|photo/i.test(lower)) {
    return {
      name: 'consumer',
      background: '#FFFFFF',
      surface: '#F7F7F7',
      primary: '#0095F6',
      secondary: '#EFEFEF',
      text: '#262626',
      textSecondary: '#8E8E8E',
      isDark: false,
      description: 'Social app - Clean light theme with blue accent',
    };
  }
  
  // ============ JTBD-BASED TOOL DETECTION ============
  // If no specific tool mentioned, detect by job-to-be-done and use appropriate tool's UI
  const jtbdTool = detectJtbdTool(lower);
  if (jtbdTool) {
    // Map JTBD to known tool themes with the tool mapping attached
    switch (jtbdTool.toolName) {
      case 'HighRadius':
        return {
          name: 'enterprise',
          background: '#FFFFFF',
          surface: '#F4F7FA',
          primary: '#1E3A5F',
          secondary: '#00A3E0',
          text: '#333333',
          textSecondary: '#666666',
          isDark: false,
          description: `${jtbdTool.toolName}-style UI for ${jtbdTool.jtbd}`,
          jtbdTool,
        };
      case 'BlackLine':
        return {
          name: 'enterprise',
          background: '#FFFFFF',
          surface: '#F5F6FA',
          primary: '#00263E',
          secondary: '#0070BA',
          text: '#1A1A1A',
          textSecondary: '#666666',
          isDark: false,
          description: `${jtbdTool.toolName}-style UI for ${jtbdTool.jtbd}`,
          jtbdTool,
        };
      case 'FloQast':
        return {
          name: 'enterprise',
          background: '#FFFFFF',
          surface: '#F8F9FA',
          primary: '#00B4D8',
          secondary: '#023E8A',
          text: '#212529',
          textSecondary: '#6C757D',
          isDark: false,
          description: `${jtbdTool.toolName}-style UI for ${jtbdTool.jtbd}`,
          jtbdTool,
        };
      case 'Zuora RevPro':
        return {
          name: 'enterprise',
          background: '#FFFFFF',
          surface: '#F7F8FA',
          primary: '#0033A0',
          secondary: '#00B2A9',
          text: '#1A1A1A',
          textSecondary: '#666666',
          isDark: false,
          description: `${jtbdTool.toolName}-style UI for ${jtbdTool.jtbd}`,
          jtbdTool,
        };
      case 'Zuora Billing':
        return {
          name: 'enterprise',
          background: '#FFFFFF',
          surface: '#F7F8FA',
          primary: '#0033A0',
          secondary: '#00B2A9',
          text: '#1A1A1A',
          textSecondary: '#666666',
          isDark: false,
          description: `${jtbdTool.toolName}-style UI for ${jtbdTool.jtbd}`,
          jtbdTool,
        };
      case 'Coupa':
        return {
          name: 'enterprise',
          background: '#FFFFFF',
          surface: '#F5F7FA',
          primary: '#0072CE',
          secondary: '#E31837',
          text: '#333333',
          textSecondary: '#666666',
          isDark: false,
          description: `${jtbdTool.toolName}-style UI for ${jtbdTool.jtbd}`,
          jtbdTool,
        };
      case 'Salesforce Setup':
        return {
          name: 'enterprise',
          background: '#FFFFFF',
          surface: '#F3F3F3',
          primary: '#0176D3',
          secondary: '#032D60',
          text: '#181818',
          textSecondary: '#444444',
          isDark: false,
          description: `${jtbdTool.toolName}-style UI for ${jtbdTool.jtbd}`,
          jtbdTool,
        };
      case 'Signifyd':
        return {
          name: 'enterprise',
          background: '#FFFFFF',
          surface: '#F5F6F8',
          primary: '#6366F1',
          secondary: '#EC4899',
          text: '#1F2937',
          textSecondary: '#6B7280',
          isDark: false,
          description: `${jtbdTool.toolName}-style UI for ${jtbdTool.jtbd}`,
          jtbdTool,
        };
      default:
        // Generic enterprise with JTBD tool info
        return {
          name: 'enterprise',
          background: '#F9FAFB',
          surface: '#FFFFFF',
          primary: '#3B82F6',
          secondary: '#E5E7EB',
          text: '#111827',
          textSecondary: '#6B7280',
          isDark: false,
          description: `Enterprise UI for ${jtbdTool.jtbd}`,
          jtbdTool,
        };
    }
  }

  // Generic enterprise/business (fallback)
  if (/enterprise|business|revenue|finance|admin|dashboard|report|analytics|compliance|crm|erp/i.test(lower)) {
    return {
      name: 'enterprise',
      background: '#F9FAFB',
      surface: '#FFFFFF',
      primary: '#3B82F6',
      secondary: '#E5E7EB',
      text: '#111827',
      textSecondary: '#6B7280',
      isDark: false,
      description: 'Enterprise app - Professional light theme with blue accent',
    };
  }
  
  // Default neutral theme
  return {
    name: 'neutral',
    background: '#FFFFFF',
    surface: '#F9FAFB',
    primary: '#3B82F6',
    secondary: '#E5E7EB',
    text: '#111827',
    textSecondary: '#6B7280',
    isDark: false,
    description: 'Neutral - Clean light theme suitable for most applications',
  };
}


export function buildThemeCorpus(cpm: unknown): string {
  const jobs = (cpm as { jobs?: unknown[] })?.jobs ?? [];
  const flows = (cpm as { flows?: unknown[] })?.flows ?? [];
  const c = cpm as {
    intent?: { problem?: { statement?: string }; goal?: { primary_outcome?: string } };
  };
  return [
    c?.intent?.problem?.statement ?? '',
    c?.intent?.goal?.primary_outcome ?? '',
    ...(jobs as any[]).map((j: any) => `${j?.description ?? ''} ${j?.success_outcome ?? ''}`),
    ...(flows as any[]).map((f: any) => `${f?.name ?? ''} ${(f?.steps ?? []).map((s: any) => s?.action ?? '').join(' ')}`),
  ].join(' ');
}

export function detectThemeFromCpm(cpm: unknown): UiTheme {
  return detectTheme(buildThemeCorpus(cpm));
}
