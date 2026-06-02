export interface AdminScope {
  role: string;
  scopeAllCompanies: boolean;
  scopedCompanyIds: string[];
}

/** SUPER_ADMIN ou scopeAllCompanies => todas. Senão, só as da lista. */
export function canAccessCompany(admin: AdminScope, companyId: string): boolean {
  if (admin.role === "SUPER_ADMIN" || admin.scopeAllCompanies) return true;
  return admin.scopedCompanyIds.includes(companyId);
}
