export const $ = (selector, parent = document) => parent.querySelector(selector);

export const $$ = (selector, parent = document) => Array.from(parent.querySelectorAll(selector));

export function setText(selector, value, parent = document) {
  const element = $(selector, parent);
  if (element) {
    element.textContent = value;
  }
}
