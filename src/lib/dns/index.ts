// DNS Module Exports
// Central export point for all DNS-related functionality

export * from './spf';
export * from './dkim';
export * from './dmarc';
export * from './health-check';

// Re-export commonly used items
export {
  generateSPFRecord,
  generateMinimalSPFRecord,
  validateSPFRecord,
  createSPFRecord,
  verifySPFRecord,
  getSPFRecommendations,
  DEFAULT_SPF_INCLUDES,
} from './spf';

export {
  generateDKIMKeyPair,
  generateDKIMDNSRecord,
  generateDKIMSetup,
  validateDKIMRecord,
  createDKIMRecord,
  verifyDKIMRecord,
  getDKIMPrivateKey,
  rotateDKIMKey,
  signEmailWithDKIM,
} from './dkim';

export {
  generateDMARCRecord,
  generateColdEmailDMARC,
  getDMARCUpgradePath,
  validateDMARCRecord,
  createDMARCRecord,
  verifyDMARCRecord,
  upgradeDMARCPolicy,
  calculateDMARCAlignment,
} from './dmarc';

export {
  checkDomainHealth,
  runFullDomainHealthCheck,
  getDomainHealthHistory,
  getDomainHealthSummary,
  monitorDomainsHealth,
  getDomainAgeInfo,
  getDomainsNeedingAttention,
} from './health-check';
