import { createStore } from './baseStore';

const store = createStore('outreach', {
  templates: [],
  variantsByCompany: {},
  history: []
});

export async function loadOutreachState() {
  return store.load();
}

export async function saveOutreachState(data) {
  return store.save(data);
}
