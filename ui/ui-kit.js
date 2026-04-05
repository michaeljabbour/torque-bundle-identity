// Local ui-kit stub — pure descriptor creators, no external dependencies

function createElement(type, props = {}, children = null) {
  return { type, props, children };
}

export function Stack(props = {}, children = null) {
  return createElement('stack', props, children);
}

export function Grid(props = {}, children = null) {
  return createElement('grid', props, children);
}

export function Divider(props = {}) {
  return createElement('divider', props);
}

export function Text(props = {}, children = null) {
  return createElement('text', props, children);
}

export function TextField(props = {}) {
  return createElement('text-field', props);
}

export function Button(props = {}, children = null) {
  return createElement('button', props, children);
}

export function Alert(props = {}) {
  return createElement('alert', props);
}
