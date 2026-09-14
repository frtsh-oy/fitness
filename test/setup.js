import { JSDOM } from 'jsdom';

export function makeDom(html = '<!doctype html><html><body></body></html>') {
  const dom = new JSDOM(html, { url: 'https://example.test/' });
  return { window: dom.window, document: dom.window.document };
}
