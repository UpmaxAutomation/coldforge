export const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'InstantScale API',
    version: '1.0.0',
    description: 'Email outreach automation API'
  },
  servers: [
    { url: '/api', description: 'API Server' }
  ],
  paths: {
    '/campaigns': {
      get: { summary: 'List campaigns', tags: ['Campaigns'], responses: { '200': { description: 'List of campaigns' } } },
      post: { summary: 'Create campaign', tags: ['Campaigns'], responses: { '201': { description: 'Created' } } }
    },
    '/leads': {
      get: { summary: 'List leads', tags: ['Leads'], responses: { '200': { description: 'List of leads' } } },
      post: { summary: 'Create lead', tags: ['Leads'], responses: { '201': { description: 'Created' } } }
    },
    '/email-accounts': {
      get: { summary: 'List email accounts', tags: ['Email Accounts'], responses: { '200': { description: 'List of accounts' } } }
    },
    '/domains': {
      get: { summary: 'List domains', tags: ['Domains'], responses: { '200': { description: 'List of domains' } } }
    },
    '/warmup/dashboard': {
      get: { summary: 'Get warmup dashboard', tags: ['Warmup'], responses: { '200': { description: 'Warmup stats' } } }
    },
    '/health': {
      get: { summary: 'Health check', tags: ['System'], responses: { '200': { description: 'Health status' } } }
    }
  },
  tags: [
    { name: 'Campaigns', description: 'Campaign management' },
    { name: 'Leads', description: 'Lead management' },
    { name: 'Email Accounts', description: 'Email account management' },
    { name: 'Domains', description: 'Domain management' },
    { name: 'Warmup', description: 'Email warmup' },
    { name: 'System', description: 'System endpoints' }
  ]
}
