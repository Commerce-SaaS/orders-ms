// Mirrors organization-ms/src/organization/patterns/organization_patterns.ts.
// Only FIND_ONE is used here (request/response over the RPC queue) to read
// scheduling config for an organization.
export const ORGANIZATION_PATTERNS = {
  FIND_ONE: 'organization.find_one',
} as const;
