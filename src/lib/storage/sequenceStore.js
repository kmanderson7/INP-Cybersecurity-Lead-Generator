import { createStore } from './baseStore';

const store = createStore('sequences', {
  sequences: []
});

export async function loadSequenceState() {
  return store.load();
}

export async function saveSequenceState(data) {
  return store.save(data);
}
