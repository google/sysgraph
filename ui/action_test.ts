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

import {timestampFromMs} from '@bufbuild/protobuf/wkt';
import {html, nothing, render} from 'lit';
import {
  ActionElement,
  defaultActionDisplayOptions,
  formatNanoseconds,
  replaceControlCharsWithSymbols,
} from './action.js';
import {Action} from './graph.js';
import {SearchController} from './search.js';
import {createTestAction, createTestGraph} from './test_utils.js';

describe('ActionElement', () => {
  let container: HTMLDivElement;
  let sampleAction: Action;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    sampleAction = createTestAction({
      id: 123,
      parentId: 789,
      pid: 456,
      ppid: 999,
      start: timestampFromMs(10000),
      end: timestampFromMs(11500),
      workingDirectory: '/tmp',
      args: ['echo', 'hello', 'world'],
      fileReadIds: [],
      fileWriteIds: [],
      startElapsedNanos: BigInt(10_000_000_000),
      endElapsedNanos: BigInt(11_500_000_000),
      runes: 13,
      depth: 0,
      isClone: false,
    });
  });

  afterEach(() => {
    render(nothing, container);
    if (container && container.parentNode) {
      document.body.removeChild(container);
    }
  });

  it('should create an action element with correct classes and attributes', async () => {
    render(
      html`<action-element .action=${sampleAction}></action-element>`,
      container,
    );
    const element = container.querySelector<ActionElement>('action-element');
    await element!.updateComplete;

    expect(element!.getAttribute('data-id')).toBe(String(sampleAction.id));
  });

  it('should display PID and action ID in the header', async () => {
    render(
      html`<action-element .action=${sampleAction}></action-element>`,
      container,
    );
    const element = container.querySelector<ActionElement>('action-element')!;
    await element.updateComplete;

    const header = element.shadowRoot!.querySelector('.action-header');
    const pidElement = header!.querySelector('.action-header-pid');
    expect(pidElement!.textContent!.trim()).toBe(`456 (exec)`);
  });

  it('should display formatted timestamps in the header', async () => {
    render(
      html`<action-element .action=${sampleAction}></action-element>`,
      container,
    );
    const element = container.querySelector<ActionElement>('action-element')!;
    await element.updateComplete;

    const header = element.shadowRoot!.querySelector('.action-header');
    const tsElement = header!.querySelector('.timing');
    expect(tsElement!.textContent).toBe(
      `${formatNanoseconds(
        sampleAction.startElapsedNanos,
      )} - ${formatNanoseconds(sampleAction.endElapsedNanos)}`,
    );
  });

  it('should display action arguments', async () => {
    render(
      html`<action-element .action=${sampleAction}></action-element>`,
      container,
    );
    const element = container.querySelector<ActionElement>('action-element')!;
    await element.updateComplete;

    const argsElement = element.shadowRoot!.querySelector('.action-args');
    expect(argsElement!.textContent).toBe('echo hello world');
  });

  it('should handle actions with no arguments', async () => {
    const noArgsAction = {...sampleAction, args: []};

    render(
      html`<action-element .action=${noArgsAction}></action-element>`,
      container,
    );
    const element = container.querySelector<ActionElement>('action-element')!;
    await element.updateComplete;

    const argsElement = element.shadowRoot!.querySelector('.action-args');
    expect(argsElement).toBeNull();
  });

  it('should not display arguments if isClone is true', async () => {
    const cloneAction = {...sampleAction, isClone: true};

    render(
      html`<action-element .action=${cloneAction}></action-element>`,
      container,
    );
    const element = container.querySelector<ActionElement>('action-element')!;
    await element.updateComplete;

    const argsElement = element.shadowRoot!.querySelector('.action-args');
    expect(argsElement).toBeNull();
  });

  it('should display clone of text in header if isClone is true', async () => {
    const cloneAction: Action = {
      ...sampleAction,
      isClone: true,
      parentId: 789,
    };

    render(
      html`<action-element .action=${cloneAction}></action-element>`,
      container,
    );
    const element = container.querySelector<ActionElement>('action-element')!;
    await element.updateComplete;

    const header = element.shadowRoot!.querySelector('.action-header');
    const pidElement = header!.querySelector('.action-header-pid');
    expect(pidElement!.textContent!.trim()).toBe(`456 (clone)`);
  });

  it('should hide aid when aid is false', async () => {
    render(
      html`<action-element
        .action=${sampleAction}
        .displayOptions=${{
          ...defaultActionDisplayOptions,
          aid: false,
        }}></action-element>`,
      container,
    );
    const element = container.querySelector<ActionElement>('action-element')!;
    await element.updateComplete;
    const header = element.shadowRoot!.querySelector('.action-header');
    const pidElement = header!.querySelector('.action-header-pid');
    expect(pidElement!.textContent!.trim()).toBe(`456 (exec)`);
  });

  it('should display PID and AID when aid is true', async () => {
    render(
      html`<action-element
        .action=${sampleAction}
        .displayOptions=${{
          ...defaultActionDisplayOptions,
          aid: true,
        }}></action-element>`,
      container,
    );
    const element = container.querySelector<ActionElement>('action-element')!;
    await element.updateComplete;
    const header = element.shadowRoot!.querySelector('.action-header');
    const pidElement = header!.querySelector('.action-header-pid');
    expect(pidElement!.textContent!.trim()).toBe(`456 aid:123 (exec)`);
  });

  it('should hide time when startTime and endTime are false', async () => {
    render(
      html`<action-element
        .action=${sampleAction}
        .displayOptions=${{
          ...defaultActionDisplayOptions,
          startTime: false,
          endTime: false,
        }}></action-element>`,
      container,
    );
    const element = container.querySelector<ActionElement>('action-element')!;
    await element.updateComplete;
    const header = element.shadowRoot!.querySelector('.action-header');
    const tsElement = header!.querySelector('.timing');
    expect(tsElement!.textContent).toBe('');
  });

  it('should display warning icon if ruleMatch is true', async () => {
    const ruleMatchAction = {
      ...sampleAction,
      ruleMatch: true,
      ruleName: 'test-rule',
    };

    render(
      html`<action-element .action=${ruleMatchAction}></action-element>`,
      container,
    );
    const element = container.querySelector<ActionElement>('action-element')!;
    await element.updateComplete;

    const header = element.shadowRoot!.querySelector('.action-header');
    const warningIcon = header!.querySelector('.warning-icon');
    expect(warningIcon!.textContent).toBe('⚠️');
    const ruleNameElement = header!.querySelector('.action-rule-name');
    expect(ruleNameElement!.textContent).toBe('test-rule');
  });

  it('should not display warning icon if ruleMatch is false', async () => {
    render(
      html`<action-element .action=${sampleAction}></action-element>`,
      container,
    );
    const element = container.querySelector<ActionElement>('action-element')!;
    await element.updateComplete;

    const header = element.shadowRoot!.querySelector('.action-header');
    const warningIcon = header!.querySelector('.warning-icon');
    expect(warningIcon).toBeNull();
  });

  it('should hide warning icon if findings is false', async () => {
    const ruleMatchAction = {
      ...sampleAction,
      ruleMatch: true,
      ruleName: 'test-rule',
    };

    render(
      html`<action-element
        .action=${ruleMatchAction}
        .displayOptions=${{
          ...defaultActionDisplayOptions,
          findings: false,
        }}></action-element>`,
      container,
    );
    const element = container.querySelector<ActionElement>('action-element')!;
    await element.updateComplete;

    const header = element.shadowRoot!.querySelector('.action-header');
    const warningIcon = header!.querySelector('.warning-icon');
    expect(warningIcon).toBeNull();
  });

  describe('argument search highlighting', () => {
    const actionWithArgs = createTestAction({
      id: 1,
      args: ['some', 'example', 'arguments', 'example'],
    });

    function setupSearchController(
      action: Action,
      query: string,
    ): SearchController {
      const graph = createTestGraph({actions: [action]});
      const controller = new SearchController(graph, () => {});
      controller.setQuery(query);
      return controller;
    }

    it('should not highlight when search controller is null', async () => {
      render(
        html`<action-element .action=${actionWithArgs}></action-element>`,
        container,
      );
      const element = container.querySelector<ActionElement>('action-element')!;
      await element.updateComplete;

      const argsElement = element.shadowRoot!.querySelector('.action-args');
      expect(argsElement!.textContent).toBe('some example arguments example');
    });

    it('should not highlight when there is no match', async () => {
      const searchController = setupSearchController(actionWithArgs, 'nomatch');

      render(
        html`<action-element
          .action=${actionWithArgs}
          .searchController=${searchController}></action-element>`,
        container,
      );
      const element = container.querySelector<ActionElement>('action-element')!;
      await element.updateComplete;

      const argsElement = element.shadowRoot!.querySelector('.action-args');
      expect(argsElement!.textContent).toBe('some example arguments example');
    });

    it('should highlight a single match', async () => {
      const searchController = setupSearchController(actionWithArgs, 'some');

      render(
        html`<action-element
          .action=${actionWithArgs}
          .searchController=${searchController}></action-element>`,
        container,
      );
      const element = container.querySelector<ActionElement>('action-element')!;
      await element.updateComplete;

      const argsElement = element.shadowRoot!.querySelector('.action-args');
      const highlights = argsElement!.querySelectorAll('.highlight');
      expect(highlights.length).toBe(1);
      expect(highlights[0].textContent).toBe('some');
      expect(argsElement!.textContent).toBe('some example arguments example');
    });

    it('should highlight multiple matches', async () => {
      const searchController = setupSearchController(actionWithArgs, 'example');

      render(
        html`<action-element
          .action=${actionWithArgs}
          .searchController=${searchController}></action-element>`,
        container,
      );
      const element = container.querySelector<ActionElement>('action-element')!;
      await element.updateComplete;

      const argsElement = element.shadowRoot!.querySelector('.action-args');
      const highlights = argsElement!.querySelectorAll('.highlight');
      expect(highlights.length).toBe(2);
      expect(highlights[0].textContent).toBe('example');
      expect(highlights[1].textContent).toBe('example');
      expect(argsElement!.textContent).toBe('some example arguments example');
    });

    it('should highlight matches at the beginning and end', async () => {
      const action = createTestAction({
        id: 2,
        args: ['start', 'middle', 'ends'],
      });
      const searchController = setupSearchController(action, 's');

      render(
        html`<action-element
          .action=${action}
          .searchController=${searchController}></action-element>`,
        container,
      );
      const element = container.querySelector<ActionElement>('action-element')!;
      await element.updateComplete;

      const argsElement = element.shadowRoot!.querySelector('.action-args');
      const highlights = argsElement!.querySelectorAll('.highlight');
      expect(highlights.length).toBe(2);
      expect(highlights[0].textContent).toBe('s');
      expect(highlights[1].textContent).toBe('s');
      expect(argsElement!.textContent).toBe('start middle ends');
    });

    it('should handle overlapping matches (regex only, non-greedy)', async () => {
      // This case is more relevant for regex, but good to test string search
      const searchController = setupSearchController(actionWithArgs, 'exa');

      render(
        html`<action-element
          .action=${actionWithArgs}
          .searchController=${searchController}></action-element>`,
        container,
      );
      const element = container.querySelector<ActionElement>('action-element')!;
      await element.updateComplete;

      const argsElement = element.shadowRoot!.querySelector('.action-args');
      const highlights = argsElement!.querySelectorAll('.highlight');
      expect(highlights.length).toBe(2);
      expect(highlights[0].textContent).toBe('exa');
      expect(highlights[1].textContent).toBe('exa');
      expect(argsElement!.textContent).toBe('some example arguments example');
    });
  });
});

describe('formatNanoseconds', () => {
  it('should format zero nanoseconds', () => {
    expect(formatNanoseconds(BigInt(0))).toBe('0.000s');
  });

  it('should format less than a second', () => {
    expect(formatNanoseconds(BigInt(123_456_789))).toBe('0.123s');
  });

  it('should format exactly one second', () => {
    expect(formatNanoseconds(BigInt(1_000_000_000))).toBe('1.000s');
  });

  it('should format seconds and milliseconds', () => {
    expect(formatNanoseconds(BigInt(5_678_000_000))).toBe('5.678s');
  });

  it('should format minutes, seconds, and milliseconds', () => {
    expect(formatNanoseconds(BigInt(83_123_456_000))).toBe('1m23.123s'); // 60 + 23 = 83 seconds
  });

  it('should handle large numbers', () => {
    expect(formatNanoseconds(BigInt(3661_999_000_000))).toBe('61m1.999s'); // 1 hour, 1 minute, 1 second, 999ms
  });

  it('should pad milliseconds correctly', () => {
    expect(formatNanoseconds(BigInt(1_005_000_000))).toBe('1.005s');
    expect(formatNanoseconds(BigInt(1_050_000_000))).toBe('1.050s');
  });
});

describe('replaceControlCharsWithSymbols', () => {
  it('should replace NUL character', () => {
    expect(replaceControlCharsWithSymbols('Hello\x00World')).toBe(
      'Hello\u2400World',
    ); // ␀
  });

  it('should replace SOH character', () => {
    expect(replaceControlCharsWithSymbols('Start\x01End')).toBe(
      'Start\u2401End',
    ); // ␁
  });

  it('should replace ETX character', () => {
    expect(replaceControlCharsWithSymbols('Text\x03More')).toBe(
      'Text\u2403More',
    ); // ␃
  });

  it('should replace LF character', () => {
    expect(replaceControlCharsWithSymbols('Line1\x0ALine2')).toBe(
      'Line1\u240ALine2',
    ); // ␊
  });

  it('should replace CR character', () => {
    expect(replaceControlCharsWithSymbols('Return\x0DHere')).toBe(
      'Return\u240DHere',
    ); // ␍
  });

  it('should replace US character', () => {
    expect(replaceControlCharsWithSymbols('Unit\x1FSeparator')).toBe(
      'Unit\u241FSeparator',
    ); // ␟
  });

  it('should replace DEL character', () => {
    expect(replaceControlCharsWithSymbols('Delete\x7FThis')).toBe(
      'Delete\u2421This',
    ); // ␡
  });

  it('should handle multiple control characters', () => {
    expect(replaceControlCharsWithSymbols('\x01\x02\x03\x7F')).toBe(
      '\u2401\u2402\u2403\u2421',
    );
  });

  it('should not replace regular characters', () => {
    const input =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
    expect(replaceControlCharsWithSymbols(input)).toBe(input);
  });

  it('should handle empty string', () => {
    expect(replaceControlCharsWithSymbols('')).toBe('');
  });
});
