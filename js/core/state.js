
export const state = {
  tracks: [],
  view: [],
  queue: null,
  queueName: '',
  upNext: [],
  lastCtx: null,
  cur: -1,
  shuffleOn: false,
  repeatMode: 'off'
};

export const audio = new Audio();
audio.crossOrigin = 'anonymous';
audio.preload = 'metadata';

const handlers = {};
export function on(evt, fn) {
  (handlers[evt] = handlers[evt] || []).push(fn);
}
export function emit(evt, data) {
  (handlers[evt] || []).forEach((fn) => fn(data));
}
