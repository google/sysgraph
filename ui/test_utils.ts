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
import {Action, Graph, PipelineGroup} from './graph.js';

/**
 * Helper function to create action objects with default values for testing.
 * @param overrides A partial Action object to override default values.
 * @return A complete Action object.
 */
export function createTestAction(overrides: Partial<Action>): Action {
  const defaults: Action = {
    id: 0,
    parentId: 0,
    pid: 0,
    ppid: 0,
    start: timestampFromMs(0),
    end: timestampFromMs(0),
    workingDirectory: '',
    args: [],
    fileReadIds: [],
    fileWriteIds: [],
    isClone: false,
    startElapsedNanos: BigInt(0),
    endElapsedNanos: BigInt(0),
    runes: 0,
    depth: 0,
    pipeReadFromActionId: 0,
    pipeWriteToActionId: 0,
    ruleMatch: false,
    ruleName: null,
    exitSignal: '',
    exitStatus: 0,
  };
  return {...defaults, ...overrides};
}

/**
 * Helper function to create graph objects with default values for testing.
 * @param overrides A partial Graph object to override default values.
 * @return A complete Graph object.
 */
export function createTestGraph(overrides: Partial<Graph>): Graph {
  const actions = overrides.actions ?? [];
  const actionsById = new Map<number, Action>();
  for (const action of actions) {
    actionsById.set(action.id, action);
  }
  const actionsByPid = new Map<number, Action[]>();
  for (const action of actions) {
    if (!actionsByPid.has(action.pid)) {
      actionsByPid.set(action.pid, []);
    }
    actionsByPid.get(action.pid)!.push(action);
  }

  const graph: Graph = {
    actions: overrides.actions ?? actions,
    files: overrides.files ?? [],
    analysis: overrides.analysis ?? null,
    analysisError: overrides.analysisError ?? null,
    actionsById: overrides.actionsById ?? actionsById,
    actionsByPid: overrides.actionsByPid ?? actionsByPid,
    actionIdToPipelineGroup:
      overrides.actionIdToPipelineGroup ?? new Map<number, PipelineGroup>(),
    ancestors: overrides.ancestors ?? Graph.prototype.ancestors,
    computePipelineGroups:
      overrides.computePipelineGroups ?? Graph.prototype.computePipelineGroups,
  };
  return graph;
}
