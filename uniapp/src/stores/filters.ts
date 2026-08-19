import { reactive, readonly } from 'vue'
import type { EstateFilters } from '@/domain/types'

const defaults: EstateFilters = {
  district: '',
  street: '',
  keyword: '',
  pricedOnly: true,
  missingRefPrice: false,
  minWan: 2,
  maxWan: 32,
  sort: 'price-desc',
}

const draft = reactive<EstateFilters>({ ...defaults })
const applied = reactive<EstateFilters>({ ...defaults })

function updateDraft(patch: Partial<EstateFilters>) {
  Object.assign(draft, patch)
}

function applyDraft() {
  Object.assign(applied, draft)
}

function resetDraft() {
  Object.assign(draft, defaults)
}

function setAppliedSort(sort: EstateFilters['sort']) {
  draft.sort = sort
  applied.sort = sort
}

export function useEstateFilters() {
  return {
    draft,
    applied: readonly(applied),
    updateDraft,
    applyDraft,
    resetDraft,
    setAppliedSort,
  }
}
