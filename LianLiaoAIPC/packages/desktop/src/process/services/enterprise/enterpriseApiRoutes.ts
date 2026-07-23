/** Fixed relative paths for the allowlisted enterprise cloud API operations. */
export const ENTERPRISE_API_ROUTES = Object.freeze({
  'company.list': 'cloud-api/CompanyController/getQiYeMaCompanyList',
  'company.detail': 'cloud-api/CompanyController/getDetailcompany',
  'product.list': 'cloud-api/CompanyController/getFindProducts',
  'product.detail': 'cloud-api/CompanyController/FindProduct',
  'project.dashboard': 'cloud-api/OpportunityController/getAiMaterialDashboard',
  'project.drill': 'cloud-api/OpportunityController/getAiMaterialDrillList',
  'project.list': 'cloud-api/OpportunityController/getAiMaterialProjectList',
  'project.detail': 'cloud-api/OpportunityController/getAiMaterialProjectDetail',
  'demand.types': 'cloud-api/DemandQueryController/types',
  'demand.list': 'cloud-api/DemandQueryController/list',
  'demand.detail': 'cloud-api/DemandQueryController/detail',
  'auth.create': 'cloud-api/CommonWxGZHQrCodeLogIn/desktop/create',
  'auth.poll': 'cloud-api/CommonWxGZHQrCodeLogIn/desktop/poll',
  'auth.userContext': 'cloud-api/DesktopEnterpriseController/userContext',
} as const);

export type EnterpriseApiRouteKey = keyof typeof ENTERPRISE_API_ROUTES;
