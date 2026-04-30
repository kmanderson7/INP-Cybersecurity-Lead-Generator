import { createStore } from './baseStore';

const store = createStore('laminar', {
  contactsTabSegment: 'all',
  pilotViewSegment: null,
  prospectorSegment: null
});

export async function loadLaminarState() {
  return store.load();
}

export async function saveLaminarState(data) {
  return store.save(data);
}
