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

import {HistogramPane} from './histogram_pane.js';
import {createTestAction, createTestGraph} from './test_utils.js';

describe('HistogramPane', () => {
  let component: HistogramPane;

  beforeEach(async () => {
    component = new HistogramPane();
    document.body.appendChild(component);
    await component.updateComplete;
  });

  afterEach(() => {
    if (component && component.parentNode) {
      document.body.removeChild(component);
    }
  });

  it('should be empty if graph is empty', async () => {
    component.graph = createTestGraph({actions: []});
    await component.updateComplete;
    const rows = component.shadowRoot!.querySelectorAll('tbody tr');
    expect(rows.length).toBe(0);
  });

  it('should display arg0 counts sorted by count descending by default', async () => {
    const graph = createTestGraph({
      actions: [
        createTestAction({args: ['a', '1']}),
        createTestAction({args: ['b', '2']}),
        createTestAction({args: ['a', '3']}),
        createTestAction({args: []}),
      ],
    });
    component.graph = graph;
    await component.updateComplete;
    const rows = component.shadowRoot!.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    const row0Cells = rows[0].querySelectorAll('td');
    expect(row0Cells[0].classList.contains('arg0')).toBeTrue();
    expect(row0Cells[0].textContent).toBe('a');
    expect(row0Cells[1].classList.contains('count')).toBeTrue();
    expect(row0Cells[1].textContent).toBe('2');
    const row1Cells = rows[1].querySelectorAll('td');
    expect(row1Cells[0].classList.contains('arg0')).toBeTrue();
    expect(row1Cells[0].textContent).toBe('b');
    expect(row1Cells[1].classList.contains('count')).toBeTrue();
    expect(row1Cells[1].textContent).toBe('1');
  });

  describe('sorting', () => {
    beforeEach(async () => {
      const graph = createTestGraph({
        actions: [
          createTestAction({args: ['a', '1']}),
          createTestAction({args: ['a', '2']}),
          createTestAction({args: ['a', '3']}),
          createTestAction({args: ['b', '4']}),
          createTestAction({args: ['C', '5']}),
          createTestAction({args: ['C', '6']}),
        ],
      });
      // Counts: a:3, b:1, C:2
      component.graph = graph;
      await component.updateComplete;
    });

    function getCell(row: number, col: number) {
      return component
        .shadowRoot!.querySelectorAll('tbody tr')
        [row].querySelectorAll('td')[col];
    }

    it('should sort by count desc by default', () => {
      expect(getCell(0, 0).textContent).toBe('a');
      expect(getCell(0, 1).textContent).toBe('3');
      expect(getCell(1, 0).textContent).toBe('C');
      expect(getCell(1, 1).textContent).toBe('2');
      expect(getCell(2, 0).textContent).toBe('b');
      expect(getCell(2, 1).textContent).toBe('1');
    });

    it('should sort by arg0 asc when arg0 header is clicked', async () => {
      const arg0Header = component.shadowRoot!.querySelector(
        'th.arg0',
      ) as HTMLElement;
      arg0Header.click();
      await component.updateComplete;
      expect(arg0Header.textContent).toContain('▲');
      expect(getCell(0, 0).textContent).toBe('a');
      expect(getCell(1, 0).textContent).toBe('b');
      expect(getCell(2, 0).textContent).toBe('C');
    });

    it('should sort by arg0 desc when arg0 header is clicked twice', async () => {
      const arg0Header = component.shadowRoot!.querySelector(
        'th.arg0',
      ) as HTMLElement;
      arg0Header.click();
      await component.updateComplete;
      arg0Header.click();
      await component.updateComplete;
      expect(arg0Header.textContent).toContain('▼');
      expect(getCell(0, 0).textContent).toBe('C');
      expect(getCell(1, 0).textContent).toBe('b');
      expect(getCell(2, 0).textContent).toBe('a');
    });

    it('should sort by count asc when count header is clicked', async () => {
      const countHeader = component.shadowRoot!.querySelector(
        'th.count',
      ) as HTMLElement;
      countHeader.click();
      await component.updateComplete;
      expect(countHeader.textContent).toContain('▲');
      expect(getCell(0, 0).textContent).toBe('b');
      expect(getCell(1, 0).textContent).toBe('C');
      expect(getCell(2, 0).textContent).toBe('a');
    });

    it('should sort by count desc when count header is clicked twice', async () => {
      const countHeader = component.shadowRoot!.querySelector(
        'th.count',
      ) as HTMLElement;
      countHeader.click();
      await component.updateComplete;
      countHeader.click();
      await component.updateComplete;
      expect(countHeader.textContent).toContain('▼');
      expect(getCell(0, 0).textContent).toBe('a');
      expect(getCell(1, 0).textContent).toBe('C');
      expect(getCell(2, 0).textContent).toBe('b');
    });
  });

  it('should use basenames when showBasename is true', async () => {
    const graph = createTestGraph({
      actions: [
        createTestAction({args: ['/usr/bin/gcc', '1']}),
        createTestAction({args: ['/bin/gcc', '2']}),
        createTestAction({args: ['/usr/bin/ld', '3']}),
        createTestAction({args: ['gcc', '4']}),
      ],
    });
    component.graph = graph;
    component.showBasename = true;
    await component.updateComplete;
    const rows = component.shadowRoot!.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    const getCell = (row: number, col: number) =>
      component
        .shadowRoot!.querySelectorAll('tbody tr')
        [row].querySelectorAll('td')[col];

    // Expect: gcc: 3, ld: 1. Default sort by count desc.
    expect(getCell(0, 0).textContent).toBe('gcc');
    expect(getCell(0, 1).textContent).toBe('3');
    expect(getCell(1, 0).textContent).toBe('ld');
    expect(getCell(1, 1).textContent).toBe('1');
  });

  it('should dispatch histogram-row-clicked event on row click', async () => {
    const graph = createTestGraph({
      actions: [createTestAction({args: ['a', '1']})],
    });
    component.graph = graph;
    await component.updateComplete;

    const spy = jasmine.createSpy('histogram-row-clicked');
    component.addEventListener('histogram-row-clicked', spy);

    const row = component.shadowRoot!.querySelector('tbody tr')! as HTMLElement;
    row.click();

    expect(spy).toHaveBeenCalledTimes(1);
    const event = spy.calls.mostRecent().args[0] as CustomEvent;
    expect(event.detail.query).toBe('a');
  });

  it('should dispatch histogram-row-clicked event with basename prefix when showBasename is true', async () => {
    const graph = createTestGraph({
      actions: [createTestAction({args: ['/usr/bin/gcc', '1']})],
    });
    component.graph = graph;
    component.showBasename = true;
    await component.updateComplete;

    const spy = jasmine.createSpy('histogram-row-clicked');
    component.addEventListener('histogram-row-clicked', spy);

    const row = component.shadowRoot!.querySelector('tbody tr')! as HTMLElement;
    row.click();

    expect(spy).toHaveBeenCalledTimes(1);
    const event = spy.calls.mostRecent().args[0] as CustomEvent;
    expect(event.detail.query).toBe('/gcc');
  });
});
