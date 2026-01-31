// Domain Module Exports
// Central export point for domain management functionality

export * from './domain-service';

export {
  searchDomains,
  bulkCheckDomains,
  purchaseDomain,
  bulkPurchaseDomains,
  verifyDomainDNS,
  getWorkspaceDomains,
  getDomainDetails,
} from './domain-service';

export type {
  DomainSearchResult,
  BulkDomainCheck,
  DomainPurchaseResult,
} from './domain-service';

// Orchestrator functions (alternative API with step tracking)
export {
  setupDomain,
  configureDomainDNS,
  verifyDomainDNS as verifyDNSPropagation,
  searchDomains as searchDomainsOrchestrator,
  getDomainSetupStatus,
} from './orchestrator';

export type {
  DomainSetupRequest,
  DomainSetupResult,
} from './orchestrator';

// Low-level purchase functions
export {
  checkDomainAvailability,
  purchaseDomain as purchaseDomainDirect,
  configureDomainDns,
  getDomainStatus,
} from './purchase';

export type {
  DomainPurchaseRequest,
  PurchaseResult,
  DomainAvailability,
  DomainStatus,
  DnsRecord,
} from './purchase';
