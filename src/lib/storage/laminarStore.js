import { createStore } from './baseStore';

const store = createStore('laminar', {
  contactsTabSegment: 'all',
  pilotViewSegment: null,
  prospectorSegment: null,
  sortBySegment: { energy_traders: 'heat', banks: 'heat', midstream: 'heat', inspection: 'heat' }
});

export async function loadLaminarState() {
  return store.load();
}

export async function saveLaminarState(data) {
  return store.save(data);
}
