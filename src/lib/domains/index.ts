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
