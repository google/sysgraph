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
import {SearchController} from './search.js';
import {createTestAction, createTestGraph} from './test_utils.js';

describe('SearchController', () => {
  let graph: Graph;
  let show: (id: number) => void;
  let controller: SearchController;

  beforeEach(() => {
    show = jasmine.createSpy('show');

    // Mock graph data
    graph = createTestGraph({
      actions: [
        createTestAction({id: 1, pid: 100, args: ['echo', 'hello', 'world']}),
        createTestAction({id: 2, pid: 101, args: ['ls', '-l', 'HELLO']}),
        createTestAction({
          id: 3,
          pid: 102,
          args: ['find', '.', '-name', '*.ts'],
        }),
        createTestAction({id: 4, pid: 103, args: ['clone'], isClone: true}),
      ],
      files: ['hello.txt'],
    });

    controller = new SearchController(graph, () => {});
  });

  it('should initialize with default values', () => {
    expect(controller.getMatches().length).toBe(0);
    expect(controller.getFileMatches().length).toBe(0);
    expect(controller.useRegex).toBeFalse();
    expect(controller.matchCase).toBeFalse();
  });

  it('should find matches with text search (case insensitive)', () => {
    controller.setQuery('hello');

    expect(
      controller.getMatches().length + controller.getFileMatches().length,
    ).toBe(3);
  });

  it('should find matches with text search (case sensitive)', () => {
    controller.matchCase = true; // Turn on case sensitive
    controller.setQuery('hello');

    expect(
      controller.getMatches().length + controller.getFileMatches().length,
    ).toBe(2);
  });

  it('should find matches with regex search (case insensitive)', () => {
    controller.useRegex = true; // Turn on regex
    controller.setQuery('h[a-z]+o');

    expect(
      controller.getMatches().length + controller.getFileMatches().length,
    ).toBe(3);
  });

  it('should find matches with regex search (case sensitive)', () => {
    controller.useRegex = true; // Turn on regex
    controller.matchCase = true; // Turn on case sensitive
    controller.setQuery('H[A-Z]+O');

    expect(
      controller.getMatches().length + controller.getFileMatches().length,
    ).toBe(1);
  });

  it('should handle invalid regex', () => {
    controller.useRegex = true; // Turn on regex
    controller.setQuery('[');

    expect(
      controller.getMatches().length + controller.getFileMatches().length,
    ).toBe(0);
    expect(controller.invalid).toBeTrue();
  });

  it('should find matches by PID or ID exactly', () => {
    controller.setQuery('101');
    expect(
      controller.getMatches().length + controller.getFileMatches().length,
    ).toBe(1);

    controller.setQuery('2');
    expect(
      controller.getMatches().length + controller.getFileMatches().length,
    ).toBe(1);
  });

  it('should handle no matches found', () => {
    controller.setQuery('nonexistentstring');

    expect(
      controller.getMatches().length + controller.getFileMatches().length,
    ).toBe(0);
    expect(show).not.toHaveBeenCalled();
  });

  it('should merge ranges with regex', () => {
    controller.useRegex = true;
    controller.setQuery('.*');
    const ranges = controller.matchRanges('hello world');
    expect(ranges).toEqual([{start: 0, end: 11}]);
  });

  it('should merge ranges without regex', () => {
    controller.setQuery('a');
    const ranges = controller.matchRanges('aa');
    expect(ranges).toEqual([{start: 0, end: 2}]);
  });

  it('should not merge non-overlapping ranges with regex', () => {
    controller.useRegex = true;
    controller.setQuery('o');
    const ranges = controller.matchRanges('hello world');
    expect(ranges).toEqual([
      {start: 4, end: 5},
      {start: 7, end: 8},
    ]);
  });

  it('should not merge non-overlapping ranges without regex', () => {
    controller.setQuery('o');
    const ranges = controller.matchRanges('hello world');
    expect(ranges).toEqual([
      {start: 4, end: 5},
      {start: 7, end: 8},
    ]);
  });
});
