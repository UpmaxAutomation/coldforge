// White-Label & Agency Module Exports

// Types
export * from './types';

// Agency Management
export {
  createAgency,
  getAgency,
  getAgencyBySlug,
  getUserAgencies,
  updateAgency,
  updateAgencyPlan,
  suspendAgency,
  reactivateAgency,
  getAgencyMembers,
  getAgencyMember,
  hasAgencyPermission,
  updateAgencyMember,
  removeAgencyMember,
  createAgencyInvitation,
  acceptAgencyInvitation,
  revokeAgencyInvitation,
  getPendingInvitations,
  getAgencyAnalytics,
} from './agency';

// Sub-Account Management
export {
  createSubAccount,
  getSubAccount,
  getSubAccountBySlug,
  getAgencySubAccounts,
  updateSubAccount,
  updateSubAccountUsage,
  suspendSubAccount,
  reactivateSubAccount,
  cancelSubAccount,
  transferSubAccount,
  checkSubAccountLimits,
  getSubAccountBranding,
  createSubAccountInvitation,
  acceptSubAccountInvitation,
  revokeSubAccountInvitation,
  getSubAccountPendingInvitations,
  getSubAccountMembers,
  removeSubAccountMember,
} from './subaccount';

// Custom Domain Management
export {
  createCustomDomain,
  getCustomDomain,
  getCustomDomainByName,
  getAgencyDomains,
  getWorkspaceDomains,
  verifyDomain,
  updateDomainSettings,
  deleteCustomDomain,
  refreshDomainVerification,
  getDnsInstructions,
  checkDomainHealth,
  resolveDomain,
} from './domains';

// Branding System
export {
  updateAgencyBranding,
  getBranding,
  uploadLogo,
  deleteLogo,
  validateColor,
  generateCssVariables,
  getEmailConfig,
  upsertEmailConfig,
  renderBrandedEmail,
  previewBranding,
} from './branding';

// Reseller Functionality
export {
  getResellerConfig,
  upsertResellerConfig,
  setCustomPlanPricing,
  removeCustomPlanPricing,
  calculateResellerPrice,
  getResellerCommissions,
  recordCommission,
  processResellerPayout,
  getPayoutHistory,
  updatePayoutDetails,
  getResellerAnalytics,
  getResellerPlans,
} from './reseller';
