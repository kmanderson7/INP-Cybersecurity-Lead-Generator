import { createStore } from './baseStore';

const store = createStore('segments', {
  savedSegments: [],
  activeSegment: null
});

export async function loadSegmentState() {
  return store.load();
}

export async function saveSegmentState(data) {
  return store.save(data);
}
