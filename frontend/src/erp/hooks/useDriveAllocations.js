/**
 * useDriveAllocations — Phase P1.2 Slice 4 (May 06 2026).
 *
 * Wraps /erp/drive-allocations endpoints for the AllocationPanel on the
 * Capture Hub. Mirrors useCaptureSubmissions shape so the BDM hub can use
 * either hook with the same loading/error contract.
 */
import { useCallback } from 'react';
import useErpApi from './useErpApi';

export default function useDriveAllocations() {
  const api = useErpApi();

  const getUnallocatedWorkdays = useCallback(
    () => api.get('/drive-allocations/unallocated-workdays'),
    [api]
  );

  const getMyAllocations = useCallback(
    (params) => api.get('/drive-allocations/my', { params }),
    [api]
  );

  const allocate = useCallback(
    (data) => api.post('/drive-allocations/allocate', data),
    [api]
  );

  const markNoDrive = useCallback(
    (data) => api.post('/drive-allocations/no-drive', data),
    [api]
  );

  return {
    ...api,
    getUnallocatedWorkdays,
    getMyAllocations,
    allocate,
    markNoDrive,
  };
}
