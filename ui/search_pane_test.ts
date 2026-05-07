/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {Graph} from './graph.js';
import {SearchPane} from './search_pane.js';
import {createTestAction, createTestGraph} from './test_utils.js';

function createTestGraphWithFiles(numFiles: number, query: string): Graph {
  const files: string[] = [];
  for (let i = 0; i < numFiles; i++) {
    files.push(`${query}_file_${i}.txt`);
  }
  const graph = createTestGraph({
    files,
    actions: [],
  });
  return graph;
}

describe('SearchPane', () => {
  let component: SearchPane;

  beforeEach(async () => {
    component = new SearchPane();
    component.style.height = '500px';
    document.body.appendChild(component);
    await component.updateComplete;
  });

  afterEach(() => {
    if (component && component.parentNode) {
      document.body.removeChild(component);
    }
  });

  async function setScrollTopAndWait(scrollTop: number) {
    const scrollHost = component.shadowRoot!.querySelector(
      '#scroll-host',
    ) as HTMLElement;
    scrollHost.scrollTop = scrollTop;
    scrollHost.dispatchEvent(new Event('scroll'));
    // wait for requestAnimationFrame in handleScrollEvent
    await new Promise(requestAnimationFrame);
    // wait for lit update
    await component.updateComplete;
  }

  it('should create search controller on graph update', async () => {
    component.graph = createTestGraph({
      actions: [createTestAction({id: 1, args: ['foo']})],
      files: ['bar.txt'],
    });
    await component.updateComplete;
    expect(component.searchController).toBeDefined();
  });

  it('should render search results for processes and files', async () => {
    component.graph = createTestGraph({
      actions: [createTestAction({id: 1, args: ['foo-process']})],
      files: ['foo-file.txt'],
    });
    await component.updateComplete;
    const input = component.shadowRoot!.querySelector(
      '#search-input',
    ) as HTMLInputElement;
    input.value = 'foo';
    input.dispatchEvent(new Event('input'));
    await component.updateComplete;
    // Wait for async search to complete. SearchController uses setTimeout(200)
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
    await component.updateComplete;

    const results = component.shadowRoot!.querySelector('#results-list');
    expect(results).not.toBeNull();
    const items = results!.querySelectorAll('.result-item');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('foo-process');
    expect(items[1].textContent).toContain('foo-file.txt');
  });

  it('should dispatch action-selected when a process result is clicked', async () => {
    const actionSelectedSpy = jasmine.createSpy('action-selected');
    component.addEventListener('action-selected', actionSelectedSpy);
    component.graph = createTestGraph({
      actions: [createTestAction({id: 1, args: ['clickable']})],
      files: [],
    });
    await component.updateComplete;
    const input = component.shadowRoot!.querySelector(
      '#search-input',
    ) as HTMLInputElement;
    input.value = 'clickable';
    input.dispatchEvent(new Event('input'));
    await component.updateComplete;
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
    await component.updateComplete;

    const resultItem = component.shadowRoot!.querySelector(
      '.result-item',
    ) as HTMLElement;
    expect(resultItem).not.toBeNull();
    resultItem.click();
    expect(actionSelectedSpy).toHaveBeenCalledTimes(1);
    const event = actionSelectedSpy.calls.mostRecent().args[0] as CustomEvent;
    expect(event.detail.action.id).toBe(1);
  });

  it('should highlight matches in results', async () => {
    component.graph = createTestGraph({
      actions: [createTestAction({id: 1, args: ['highlight-this']})],
      files: ['highlight-file.txt'],
    });
    await component.updateComplete;
    const input = component.shadowRoot!.querySelector(
      '#search-input',
    ) as HTMLInputElement;
    input.value = 'highlight';
    input.dispatchEvent(new Event('input'));
    await component.updateComplete;
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
    await component.updateComplete;

    const results = component.shadowRoot!.querySelector('#results-list');
    expect(results).not.toBeNull();
    const highlights = results!.querySelectorAll('.highlight');
    expect(highlights.length).toBe(2);
    expect(highlights[0].textContent).toBe('highlight');
    expect(highlights[1].textContent).toBe('highlight');
  });

  describe('Virtual scrolling', () => {
    beforeEach(async () => {
      component.graph = createTestGraphWithFiles(200, 'foo');
      await component.updateComplete;
      const input = component.shadowRoot!.querySelector(
        '#search-input',
      ) as HTMLInputElement;
      input.value = 'foo';
      input.dispatchEvent(new Event('input'));
      await component.updateComplete;
      await new Promise((resolve) => {
        setTimeout(resolve, 200);
      });
      await component.updateComplete;
      await component.updateComplete;
    });

    it('should only render visible items when scrolled to top', async () => {
      await setScrollTopAndWait(0);
      const itemElements =
        component.shadowRoot!.querySelectorAll('.result-item');
      expect(itemElements.length).toBeLessThan(100);
      expect(itemElements.length).toBeGreaterThan(10);
      expect(itemElements[0].textContent).toContain('foo_file_0.txt');
    });

    it('should only render visible items when scrolled to bottom', async () => {
      const scrollHost = component.shadowRoot!.querySelector(
        '#scroll-host',
      ) as HTMLElement;
      await setScrollTopAndWait(scrollHost.scrollHeight);

      const itemElements =
        component.shadowRoot!.querySelectorAll('.result-item');
      expect(itemElements.length).toBeLessThan(100);
      expect(itemElements.length).toBeGreaterThan(10);
      expect(itemElements[itemElements.length - 1].textContent).toContain(
        'foo_file_199.txt',
      );
    });
  });
});
