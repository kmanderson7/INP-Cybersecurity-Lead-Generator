import { createStore } from './baseStore';

const store = createStore('leads', {
  companies: [],
  selectedCompanyId: null,
  activityTimeline: [],
  lastEmailResult: null
});

export async function loadLeadState() {
  return store.load();
}

export async function saveLeadState(data) {
  return store.save(data);
}
