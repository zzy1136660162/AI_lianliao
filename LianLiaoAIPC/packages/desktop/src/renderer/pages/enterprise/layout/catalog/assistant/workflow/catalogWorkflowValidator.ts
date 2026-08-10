import type { CatalogWorkflowPlan } from '@/common/enterprise/catalog-assistant/contracts';
import { catalogWorkflowPlanResponseSchema } from '@/common/enterprise/catalog-assistant/schemas';

/** Revalidates the model-produced plan immediately before any business tool is executed. */
export const validateCatalogWorkflowPlan = (plan: CatalogWorkflowPlan): CatalogWorkflowPlan =>
  catalogWorkflowPlanResponseSchema.parse(plan) as CatalogWorkflowPlan;
