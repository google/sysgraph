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

import {create, toJson} from '@bufbuild/protobuf';
import {
  SysGraphSchema,
  ProcessSchema,
  SysGraphResponseSchema,
} from './proto/playground_pb.js';
import {TimestampSchema} from '@bufbuild/protobuf/wkt';

import {
  calculateActionHeight,
  countRunes,
  getCharacterSize,
  getEarliestTime,
  Graph,
  nanosecondsBetweenTimestamps,
} from './graph.js';

describe('Graph', () => {
  describe('fromPath', () => {
    let fetchSpy: jasmine.Spy;
    let originalBody: HTMLBodyElement;

    beforeEach(() => {
      originalBody = document.body.cloneNode(true) as HTMLBodyElement;
      fetchSpy = spyOn(window, 'fetch');

      const processesElement = document.createElement('div');
      processesElement.id = 'processes';
      document.body.appendChild(processesElement);
    });

    afterEach(() => {
      document.body.replaceWith(originalBody);
    });

    it('should fetch and create a Graph object', async () => {
      const mockGraph = create(SysGraphResponseSchema, {
        graph: {
          processes: [
            {
              id: 1n,
              pid: 100n,
              startTime: create(TimestampSchema, {seconds: 10n, nanos: 0}),
              endTime: create(TimestampSchema, {seconds: 11n, nanos: 0}),
            },
          ],
          files: ['file1.txt'],
        },
      });

      fetchSpy.and.resolveTo(
        new Response(
          JSON.stringify(toJson(SysGraphResponseSchema, mockGraph)),
          {status: 200},
        ),
      );

      const graph = await Graph.fromPath('gs://bucket/object');

      expect(fetchSpy).toHaveBeenCalledWith(
        new URL(
          'api/sysgraph/?path=gs%3A%2F%2Fbucket%2Fobject',
          window.location.origin,
        ),
        {method: 'GET'},
      );
      expect(graph).toBeInstanceOf(Graph);
      expect(graph.actions.length).toBe(1);
      expect(graph.actions[0].id).toBe(1);
      expect(graph.files).toEqual(['file1.txt']);
    });

    it('should throw an error if fetch fails', async () => {
      fetchSpy.and.resolveTo(
        new Response('Not Found', {status: 404, statusText: 'Not Found'}),
      );

      await expectAsync(
        Graph.fromPath('gs://bucket/object'),
      ).toBeRejectedWithError('HTTP 404 - Not Found');
    });
  });

  describe('constructor', () => {
    let originalBody: HTMLBodyElement;
    beforeEach(() => {
      originalBody = document.body.cloneNode(true) as HTMLBodyElement;
      const processesElement = document.createElement('div');
      processesElement.id = 'processes';
      document.body.appendChild(processesElement);
    });

    afterEach(() => {
      document.body.replaceWith(originalBody);
    });

    it('should process a simple graph proto', () => {
      const graphProto = create(SysGraphSchema, {
        processes: [
          {
            id: 1n,
            pid: 100n,
            args: ['echo', 'hello'],
            startTime: create(TimestampSchema, {seconds: 10n, nanos: 0}),
            endTime: create(TimestampSchema, {seconds: 11n, nanos: 0}),
            exitStatus: 0,
            exitSignal: 'SIGKILL',
          },
          {
            id: 2n,
            pid: 101n,
            parentId: 1n,
            startTime: create(TimestampSchema, {seconds: 12n, nanos: 0}),
            endTime: create(TimestampSchema, {seconds: 13n, nanos: 0}),
          },
        ],
        files: ['file0', 'file1'],
      });

      const graph = new Graph(graphProto);

      expect(graph.actions.length).toBe(2);
      expect(graph.files).toEqual(['file0', 'file1']);
      expect(graph.actionsById.size).toBe(2);
      expect(graph.actionsById.get(1)).toBeDefined();
      expect(graph.actionsById.get(2)).toBeDefined();
      expect(graph.actionsByPid.size).toBe(2);
      expect(graph.actionsByPid.get(100)!.length).toBe(1);
      expect(graph.actionsByPid.get(101)!.length).toBe(1);

      const action1 = graph.actionsById.get(1)!;
      expect(action1.id).toBe(1);
      expect(action1.pid).toBe(100);
      expect(action1.args).toEqual(['echo', 'hello']);
      expect(action1.depth).toBe(0);
      expect(action1.startElapsedNanos).toBe(0n);
      expect(action1.endElapsedNanos).toBe(1_000_000_000n);
      expect(action1.exitStatus).toBe(0);
      expect(action1.exitSignal).toBe('SIGKILL');

      const action2 = graph.actionsById.get(2)!;
      expect(action2.id).toBe(2);
      expect(action2.pid).toBe(101);
      expect(action2.parentId).toBe(1);
      expect(action2.depth).toBe(1);
      expect(action2.startElapsedNanos).toBe(2_000_000_000n);
      expect(action2.endElapsedNanos).toBe(3_000_000_000n);
    });

    it('should handle pipe connections', () => {
      const graphProto = create(SysGraphSchema, {
        processes: [
          {
            id: 1n,
            pid: 100n,
            startTime: create(TimestampSchema, {seconds: 10n, nanos: 0}),
          },
          {
            id: 2n,
            pid: 101n,
            pipeReadFromActionId: 1n,
            startTime: create(TimestampSchema, {seconds: 10n, nanos: 0}),
          },
        ],
      });
      const graph = new Graph(graphProto);
      expect(graph.actionsById.get(1)!.pipeWriteToActionId).toBe(2);
      expect(graph.actionsById.get(2)!.pipeReadFromActionId).toBe(1);
    });

    it('should compute pipeline groups', () => {
      const graphProto = create(SysGraphSchema, {
        processes: [
          {
            id: 5n,
            pid: 103n,
            pipeReadFromActionId: 2n,
            startTime: create(TimestampSchema, {seconds: 13n, nanos: 0}),
          },
          {
            id: 1n,
            pid: 100n,
            startTime: create(TimestampSchema, {seconds: 10n, nanos: 0}),
          },
          {
            id: 2n,
            pid: 101n,
            pipeReadFromActionId: 1n,
            startTime: create(TimestampSchema, {seconds: 10n, nanos: 0}),
          },
          {
            id: 3n,
            pid: 101n,
            startTime: create(TimestampSchema, {seconds: 11n, nanos: 0}),
          },
          {
            id: 4n,
            pid: 102n,
            startTime: create(TimestampSchema, {seconds: 12n, nanos: 0}),
          },
        ],
      });
      const graph = new Graph(graphProto);
      expect(graph.actionsById.get(1)!.pipeWriteToActionId).toBe(2);
      expect(graph.actionsById.get(2)!.pipeReadFromActionId).toBe(1);
      expect(graph.actionsById.get(2)!.pipeWriteToActionId).toBe(5);
      expect(graph.actionsById.get(5)!.pipeReadFromActionId).toBe(2);

      // Actions 1, 2, 5 are connected by pipe. Action 3 is a sibling of 2
      // because it has pid 101. So 1, 2, 3, 5 should be in a group.
      // Action 4 is not connected and not a sibling, so it's not in a group.
      expect(graph.actionIdToPipelineGroup.has(1)).toBeTrue();
      expect(graph.actionIdToPipelineGroup.has(2)).toBeTrue();
      expect(graph.actionIdToPipelineGroup.has(3)).toBeTrue();
      expect(graph.actionIdToPipelineGroup.has(4)).toBeFalse();
      expect(graph.actionIdToPipelineGroup.has(5)).toBeTrue();
      const group1 = graph.actionIdToPipelineGroup.get(1)!;
      expect(group1.length).toBe(3);
      expect(group1[0].map((a) => a.id)).toEqual([1]);
      expect(group1[1].map((a) => a.id)).toEqual([2, 3]);
      expect(group1[2].map((a) => a.id)).toEqual([5]);

      const group2 = graph.actionIdToPipelineGroup.get(2)!;
      expect(group2).toBe(group1);

      const group3 = graph.actionIdToPipelineGroup.get(3)!;
      expect(group3).toBe(group1);

      const group5 = graph.actionIdToPipelineGroup.get(5)!;
      expect(group5).toBe(group1);
    });

    it('should handle cyclic pipe connections gracefully', () => {
      const graphProto = create(SysGraphSchema, {
        processes: [
          {
            id: 1n,
            pid: 100n,
            pipeReadFromActionId: 2n,
            startTime: create(TimestampSchema, {seconds: 10n, nanos: 0}),
          },
          {
            id: 2n,
            pid: 100n,
            pipeReadFromActionId: 1n,
            startTime: create(TimestampSchema, {seconds: 11n, nanos: 0}),
          },
        ],
      });

      spyOn(console, 'warn');

      // This should not hang.
      const graph = new Graph(graphProto);

      expect(graph).toBeDefined();
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('ancestors', () => {
    let graph: Graph;

    beforeAll(() => {
      const graphProto = create(SysGraphSchema, {
        processes: [
          {
            id: 1n,
            pid: 100n,
            startTime: create(TimestampSchema, {seconds: 10n, nanos: 0}),
          },
          {
            id: 2n,
            pid: 101n,
            parentId: 1n,
            startTime: create(TimestampSchema, {seconds: 11n, nanos: 0}),
          },
          {
            id: 3n,
            pid: 102n,
            parentId: 2n,
            startTime: create(TimestampSchema, {seconds: 12n, nanos: 0}),
          },
          {
            id: 4n,
            pid: 103n,
            parentId: 99n,
            startTime: create(TimestampSchema, {seconds: 13n, nanos: 0}),
          },
        ],
      });
      graph = new Graph(graphProto);
    });

    it('should return only the action itself if it has no parent', () => {
      const action1 = graph.actionsById.get(1)!;
      const ancestors = graph.ancestors(action1);
      expect(ancestors.map((a) => a.id)).toEqual([1]);
    });

    it('should return the action and its parent', () => {
      const action2 = graph.actionsById.get(2)!;
      const ancestors = graph.ancestors(action2);
      expect(ancestors.map((a) => a.id)).toEqual([1, 2]);
    });

    it('should return all ancestors in order', () => {
      const action3 = graph.actionsById.get(3)!;
      const ancestors = graph.ancestors(action3);
      expect(ancestors.map((a) => a.id)).toEqual([1, 2, 3]);
    });

    it('should stop searching if parent is not found', () => {
      const action4 = graph.actionsById.get(4)!;
      const ancestors = graph.ancestors(action4);
      expect(ancestors.map((a) => a.id)).toEqual([4]);
    });
  });
});

describe('Graph Utilities', () => {
  describe('getEarliestTime', () => {
    it('should return default instance for no processes', () => {
      expect(getEarliestTime([])).toEqual(
        create(TimestampSchema, {seconds: 0n, nanos: 0}),
      );
    });

    it('should return earliest time from start and end times', () => {
      const processes = [
        create(ProcessSchema, {
          startTime: create(TimestampSchema, {seconds: 10n, nanos: 0}),
          endTime: create(TimestampSchema, {seconds: 11n, nanos: 0}),
        }),
        create(ProcessSchema, {
          startTime: create(TimestampSchema, {seconds: 8n, nanos: 0}),
          endTime: create(TimestampSchema, {seconds: 9n, nanos: 0}),
        }),
      ];
      expect(getEarliestTime(processes)).toEqual(
        create(TimestampSchema, {seconds: 8n, nanos: 0}),
      );
    });

    it('should ignore zero timestamps', () => {
      const processes = [
        create(ProcessSchema, {
          startTime: create(TimestampSchema, {seconds: 0n, nanos: 0}),
          endTime: create(TimestampSchema, {seconds: 11n, nanos: 0}),
        }),
        create(ProcessSchema, {
          startTime: create(TimestampSchema, {seconds: 8n, nanos: 0}),
          endTime: create(TimestampSchema, {seconds: 9n, nanos: 0}),
        }),
      ];
      expect(getEarliestTime(processes)).toEqual(
        create(TimestampSchema, {seconds: 8n, nanos: 0}),
      );
    });

    it('should return earliest time when end time is earliest', () => {
      const processes = [
        create(ProcessSchema, {
          startTime: create(TimestampSchema, {seconds: 10n, nanos: 0}),
          endTime: create(TimestampSchema, {seconds: 11n, nanos: 0}),
        }),
        create(ProcessSchema, {
          startTime: create(TimestampSchema, {seconds: 8n, nanos: 0}),
          endTime: create(TimestampSchema, {seconds: 7n, nanos: 0}),
        }),
      ];
      expect(getEarliestTime(processes)).toEqual(
        create(TimestampSchema, {seconds: 7n, nanos: 0}),
      );
    });

    it('should return earliest with only one timestamp', () => {
      const processes = [
        create(ProcessSchema, {
          startTime: create(TimestampSchema, {seconds: 10n, nanos: 0}),
        }),
      ];
      expect(getEarliestTime(processes)).toEqual(
        create(TimestampSchema, {seconds: 10n, nanos: 0}),
      );
    });
  });

  describe('nanosecondsBetweenTimestamps', () => {
    it("should calculate difference when it's the same timestamp", () => {
      const start = create(TimestampSchema, {seconds: 10n, nanos: 100_000_000});
      expect(nanosecondsBetweenTimestamps(start, start)).toBe(0n);
    });

    it('should calculate difference within the same second', () => {
      const start = create(TimestampSchema, {seconds: 10n, nanos: 100_000_000});
      const end = create(TimestampSchema, {
        seconds: 10n,
        nanos: 500_000_000,
      });
      expect(nanosecondsBetweenTimestamps(start, end)).toBe(
        BigInt(400_000_000),
      );
    });

    it('should calculate difference across seconds', () => {
      const start = create(TimestampSchema, {
        seconds: 10n,
        nanos: 800_000_000,
      });
      const end = create(TimestampSchema, {
        seconds: 12n,
        nanos: 100_000_000,
      });
      // 200ms in first sec + 1 full sec + 100ms in last sec = 1.3s
      expect(nanosecondsBetweenTimestamps(start, end)).toBe(
        BigInt(1_300_000_000),
      );
    });

    it('should calculate difference when start is later than end', () => {
      const start = create(TimestampSchema, {seconds: 11n, nanos: 0});
      const end = create(TimestampSchema, {seconds: 10n, nanos: 0});
      expect(nanosecondsBetweenTimestamps(start, end)).toBe(
        BigInt(-1_000_000_000),
      );
    });
  });

  describe('countRunes', () => {
    it('should return 0 for empty array', () => {
      expect(countRunes([])).toBe(0);
    });

    it('should count runes for single argument', () => {
      expect(countRunes(['hello'])).toBe(5);
    });

    it('should count runes for multiple arguments', () => {
      expect(countRunes(['echo', 'hello', 'world'])).toBe(16); // 4 + 1 + 5 + 1 + 5
    });

    it('should handle empty strings in arguments', () => {
      expect(countRunes(['a', '', 'b'])).toBe(4); // 1 + 1 + 0 + 1 + 1
    });

    it('should handle arguments with spaces', () => {
      expect(countRunes(['hello world'])).toBe(11);
    });

    it('should handle special characters', () => {
      expect(countRunes(['a␀b'])).toBe(3);
    });
  });

  describe('getCharacterSize', () => {
    it('should return valid dimensions', () => {
      const charSize = getCharacterSize();
      expect(charSize.width).toBeGreaterThan(0);
      expect(charSize.height).toBeGreaterThan(0);
    });

    it('should reflect changes in font size', () => {
      const originalFontSize = document.body.style.fontSize;
      document.body.style.fontSize = '10px';
      const size10 = getCharacterSize();
      document.body.style.fontSize = '20px';
      const size20 = getCharacterSize();
      document.body.style.fontSize = originalFontSize; // Reset

      expect(size20.width).toBeGreaterThan(size10.width);
      expect(size20.height).toBeGreaterThan(size10.height);
    });
  });

  describe('calculateActionHeight', () => {
    const charSize = {width: 10, height: 15};
    const containerWidth = 100; // Allows 10 characters per line

    it('should calculate height for a single line', () => {
      const runes = 5;
      // Expected: (ceil(5 / 10) + 1) * 15 + 1 = (1 + 1) * 15 + 1 = 31
      expect(calculateActionHeight(runes, containerWidth, charSize)).toBe(31);
    });

    it('should calculate height for multiple lines', () => {
      const runes = 25;
      // Expected: (ceil(25 / 10) + 1) * 15 + 1 = (3 + 1) * 15 + 1 = 61
      expect(calculateActionHeight(runes, containerWidth, charSize)).toBe(61);
    });

    it('should calculate height when runes exactly fill lines', () => {
      const runes = 20;
      // Expected: (ceil(20 / 10) + 1) * 15 + 1 = (2 + 1) * 15 + 1 = 46
      expect(calculateActionHeight(runes, containerWidth, charSize)).toBe(46);
    });

    it('should handle zero runes', () => {
      const runes = 0;
      // Expected: (ceil(0 / 10) + 1) * 15 + 1 = (0 + 1) * 15 + 1 = 16
      expect(calculateActionHeight(runes, containerWidth, charSize)).toBe(16);
    });

    it('should handle container width smaller than character width', () => {
      const smallContainerWidth = 5;
      const runes = 10;
      // Expected: 2 * 15 + 1 = 31
      expect(calculateActionHeight(runes, smallContainerWidth, charSize)).toBe(
        31,
      );
    });
  });
});
