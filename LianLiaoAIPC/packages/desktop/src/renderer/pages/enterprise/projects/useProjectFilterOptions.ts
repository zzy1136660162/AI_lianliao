import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  EnterpriseProjectFilterDimension,
  EnterpriseProjectFilterOption,
  ProjectFilterOptionsQuery,
} from '@/common/enterprise/contracts';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

const ROOT_OPTION_LIMIT = 500;

type OptionState = {
  options: EnterpriseProjectFilterOption[];
  loading: boolean;
  failed: boolean;
};

export type ProjectFilterOptionStates = Record<EnterpriseProjectFilterDimension, OptionState>;

const DIMENSIONS: EnterpriseProjectFilterDimension[] = [
  'province',
  'city',
  'categoryL1',
  'categoryL2',
  'materialShortName',
  'materialName',
];

const emptyOptionState = (): OptionState => ({ options: [], loading: false, failed: false });

const createInitialStates = (): ProjectFilterOptionStates =>
  Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, emptyOptionState()])) as ProjectFilterOptionStates;

const createGenerationMap = (): Record<EnterpriseProjectFilterDimension, number> =>
  Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, 0])) as Record<EnterpriseProjectFilterDimension, number>;

/**
 * Loads one database-backed dimension at a time. A generation counter discards stale responses after a
 * parent filter changes, while failures remain local to the affected select and never block the project list.
 */
export const useProjectFilterOptions = (client: Pick<EnterpriseClient, 'request'>) => {
  const [states, setStates] = useState<ProjectFilterOptionStates>(createInitialStates);
  const generations = useRef(createGenerationMap());
  const mounted = useRef(true);

  const clear = useCallback((dimensions: EnterpriseProjectFilterDimension[]) => {
    setStates((current) => {
      const next = { ...current };
      for (const dimension of dimensions) {
        generations.current[dimension] += 1;
        next[dimension] = emptyOptionState();
      }
      return next;
    });
  }, []);

  const load = useCallback(
    async (query: ProjectFilterOptionsQuery) => {
      const dimension = query.dimension;
      const generation = generations.current[dimension] + 1;
      generations.current[dimension] = generation;
      setStates((current) => ({
        ...current,
        [dimension]: { ...current[dimension], loading: true, failed: false },
      }));

      try {
        const response = await client.request({
          operation: 'project.filterOptions',
          payload: { ...query, limit: query.limit ?? ROOT_OPTION_LIMIT },
        });
        if (!mounted.current || generations.current[dimension] !== generation) return;
        if (response.operation !== 'project.filterOptions') throw new Error('Unexpected project filter response');
        setStates((current) => ({
          ...current,
          [dimension]: { options: response.data, loading: false, failed: false },
        }));
      } catch {
        if (!mounted.current || generations.current[dimension] !== generation) return;
        setStates((current) => ({
          ...current,
          [dimension]: { ...current[dimension], loading: false, failed: true },
        }));
      }
    },
    [client]
  );

  const reset = useCallback(() => {
    clear(DIMENSIONS);
    void load({ dimension: 'province' });
    void load({ dimension: 'categoryL1' });
  }, [clear, load]);

  useEffect(() => {
    mounted.current = true;
    void load({ dimension: 'province' });
    void load({ dimension: 'categoryL1' });
    return () => {
      mounted.current = false;
      for (const dimension of DIMENSIONS) generations.current[dimension] += 1;
    };
  }, [load]);

  return { states, load, clear, reset };
};
