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

import {fromJson} from '@bufbuild/protobuf';
import {
  SysGraphResponseSchema,
  SysGraph,
  Process,
} from './proto/playground_pb.js';

import {timestampFromMs, type Timestamp} from '@bufbuild/protobuf/wkt';

/**
 * ActionLayout stores position and size of a rendered action.
 */
export interface ActionLayout {
  top: number;
  height: number;
}

/**
 * Action represents a single action in the sysgraph.
 * It contains metadata about the action, such as its ID, parent ID, start and end times,
 * arguments, and file IO.
 */
export interface Action {
  readonly id: number;
  readonly parentId: number;
  readonly pid: number;
  readonly ppid: number;
  readonly start: Timestamp;
  readonly end: Timestamp;
  readonly workingDirectory: string;
  readonly args: readonly string[];
  readonly fileReadIds: readonly number[];
  readonly fileWriteIds: readonly number[];
  readonly pipeReadFromActionId: number;
  readonly pipeWriteToActionId: number;
  readonly exitSignal: string;
  readonly exitStatus: number;

  readonly isClone: boolean;
  readonly startElapsedNanos: bigint;
  readonly endElapsedNanos: bigint;
  readonly runes: number;

  readonly depth: number;
  readonly ruleMatch: boolean;
  readonly ruleName: string | null;
}

/**
 * RuleMatch represents the nodes in a sysgraph relevant to a rule violation.
 */
export interface RuleMatch {
  readonly processIds: readonly number[];
  readonly resourceIds: readonly number[];
}

/**
 * Rule represents an invariant rule for a sysgraph.
 */
export interface Rule {
  readonly ruleName: string;
  readonly description: string;
  readonly matches: readonly RuleMatch[];
}

/**
 * Analysis represents the analysis results for a sysgraph.
 */
export interface Analysis {
  readonly rules: readonly Rule[];
}

/**
 * Represents the dimensions (width and height) of a single character.
 * This interface is used to store the result of `getCharacterSize`, which
 * measures the size of a character in a given font, enabling calculations
 * related to text layout and sizing within UI elements.
 */
export interface CharSize {
  readonly width: number;
  readonly height: number;
}

/**
 * getCharacterSize measures the width and height of a character in the current
 * font. This is useful for calculating how many characters can fit in a given
 * element.
 */
export function getCharacterSize(parent?: HTMLElement): CharSize {
  const parentEl = parent || document.body;
  const element = document.createElement('span');
  element.style.position = 'absolute';
  element.style.left = '-9999px';
  element.textContent = 'a'; // Use any character for fixed-width fonts
  parentEl.appendChild(element);
  const r = element.getBoundingClientRect();
  const width = r.width;
  const height = r.height;
  parentEl.removeChild(element);
  return {width, height};
}

/**
 * Calculates the duration between two timestamps in nanoseconds.
 * @param startTime The start timestamp.
 * @param endTime The end timestamp.
 * @return The duration in nanoseconds.
 */
export function nanosecondsBetweenTimestamps(
  startTime: Timestamp,
  endTime: Timestamp,
): bigint {
  const diffSec = endTime.seconds - startTime.seconds;
  const diffNano = BigInt(endTime.nanos - startTime.nanos);

  return diffSec * 1000000000n + diffNano;
}

/**
 * countRunes calculates the number of runes in a list of arguments.
 * It adds one rune for each argument separator, and the number of runes for each argument.
 * This is used to estimate how much space an action will take when rendered.
 */
export function countRunes(args: readonly string[]): number {
  let runes = 0;
  if (args.length > 1) {
    runes = args.length - 1;
  }
  for (const arg of args) {
    runes += [...arg].length;
  }
  return runes;
}

/**
 * Calculates the height of an action element based on the number of runes,
 * the width of the container, and the character size.
 * @param runes The number of runes in the action's arguments.
 * @param containerWidth The width of the container element.
 * @param charSize The size of a single character.
 * @return The calculated height of the action element.
 */
export function calculateActionHeight(
  runes: number,
  containerWidth: number,
  charSize: CharSize,
): number {
  const charsPerLine = Math.floor(containerWidth / charSize.width);
  if (charsPerLine === 0) {
    return 2 * charSize.height + 1;
  }
  const numLines = Math.ceil(runes / charsPerLine);
  return (numLines + 1) * charSize.height + 1; // Plus 1 for the 1px border
}

/**
 * Returns a list of middle-point scroll positions for actions that have a
 * rule match and are present in actionLayouts.
 */
export function getIndicatorTops(
  graph: Graph,
  actionLayouts: Map<number, ActionLayout>,
): number[] {
  const tops: number[] = [];
  if (!graph) return tops;
  for (const actionId of actionLayouts.keys()) {
    const action = graph.actionsById.get(actionId);
    if (action && action.ruleMatch) {
      const layout = actionLayouts.get(actionId)!;
      tops.push(layout.top + layout.height / 2);
    }
  }
  return tops;
}

/**
 * PipelineGroup represents a group of actions that are part of the same
 * pipeline. It is a list of action groups, where each inner group contains
 * actions with the same PID, and the list of groups is ordered by pipe order.
 */
export type PipelineGroup = Action[][];

/**
 * getEarliestTime returns the earliest non-zero timestamp in the sysgraph.
 */
export function getEarliestTime(processes: readonly Process[]): Timestamp {
  let start = timestampFromMs(0);
  let minNanos: bigint | null = null;
  for (const process of processes) {
    if (process.startTime) {
      const startTime = process.startTime;
      const startNanos =
        BigInt(startTime.seconds) * BigInt(1_000_000_000) +
        BigInt(startTime.nanos);
      if (startNanos > 0 && (minNanos === null || startNanos < minNanos)) {
        minNanos = startNanos;
        start = startTime;
      }
    }
    if (process.endTime) {
      const endTime = process.endTime;
      const endNanos =
        BigInt(endTime.seconds) * BigInt(1_000_000_000) + BigInt(endTime.nanos);
      if (endNanos > 0 && (minNanos === null || endNanos < minNanos)) {
        minNanos = endNanos;
        start = endTime;
      }
    }
  }
  return start;
}

/**
 * Graph represents the full sysgraph, including all actions and files.
 * It's the main data structure used to render the sysgraph.
 */
export class Graph {
  readonly actions: readonly Action[];
  readonly files: readonly string[];
  readonly analysis: Analysis | null;
  readonly analysisError: string | null;
  readonly actionsById: Map<number, Action>;
  readonly actionsByPid: Map<number, Action[]>;
  readonly actionIdToPipelineGroup: Map<number, PipelineGroup>;

  /**
   * Fetches the sysgraph data from the server and creates a Graph object.
   * @param sysGraphPath The path to the sysgraph data.
   * @return The sysgraph data, or null if not found.
   */
  static async fromPath(sysGraphPath: string): Promise<Graph> {
    const reqUrl = new URL('api/sysgraph/', window.location.origin);
    reqUrl.searchParams.set('path', sysGraphPath);
    const response = await fetch(reqUrl, {
      method: 'GET',
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status} - ${text}`);
    }
    const json = await response.json();
    const resp = fromJson(SysGraphResponseSchema, json).graph;
    return new Graph(resp);
  }

  /**
   * Creates a Graph object from the raw sysgraph proto.
   * This function processes the raw sysgraph data and populates internal data structures.
   * @param resp The sysgraph data to load.
   */
  constructor(resp?: SysGraph) {
    if (!resp) {
      this.actions = [];
      this.files = [];
      this.analysis = null;
      this.analysisError = null;
      this.actionsById = new Map();
      this.actionsByPid = new Map();
      this.actionIdToPipelineGroup = new Map();
      return;
    }
    this.actionsById = new Map<number, Action>();
    this.actionsByPid = new Map<number, Action[]>();
    this.files = resp.files;
    this.actionIdToPipelineGroup = new Map<number, PipelineGroup>();

    // Convert the analysis from the proto to a plain javascript object.
    let analysis: Analysis | null = null;
    const rules: Rule[] = [];
    if (resp.analysis) {
      for (const ruleProto of resp.analysis.rules) {
        const matches: RuleMatch[] = [];
        for (const matchProto of ruleProto.matches) {
          matches.push({
            processIds: matchProto.processIds.map((id) => Number(id)),
            resourceIds: matchProto.resourceIds.map((id) => Number(id)),
          });
        }
        rules.push({
          ruleName: ruleProto.ruleName,
          description: ruleProto.description,
          matches,
        });
        analysis = {rules};
      }
    }
    this.analysis = analysis;
    this.analysisError = resp.analysisError;

    const start = getEarliestTime(resp.processes);

    const pidParentActionID = new Set<string>();

    const actions: Action[] = [];

    const filteredFileIds = new Set<number>();
    for (let i = 0; i < resp.files.length; i++) {
      if (resp.files[i].startsWith('/tmp/mmdebstrap.')) {
        filteredFileIds.add(i);
      }
    }

    const pipeWriteToActionIdMap = new Map<number, number>();
    for (const process of resp.processes) {
      const pipeReadFromActionId = Number(process.pipeReadFromActionId);
      if (pipeReadFromActionId !== 0) {
        pipeWriteToActionIdMap.set(pipeReadFromActionId, Number(process.id));
      }
    }

    const ruleMatchIds = new Map<number, string>();
    if (this.analysis) {
      for (const rule of this.analysis.rules) {
        for (const match of rule.matches) {
          if (match.processIds.length > 0) {
            const actionId = match.processIds[0];
            ruleMatchIds.set(actionId, rule.ruleName);
          }
        }
      }
    }

    for (const process of resp.processes) {
      const args = [...process.args];
      const runes = countRunes(args);

      const p = this.actionsById.get(Number(process.parentId));
      const depth = p ? p.depth + 1 : 0;

      const key = process.pid.toString() + ',' + process.parentId.toString();
      const isClone =
        !pidParentActionID.has(key) &&
        Number(process.parentId) !== 0 &&
        p?.pid !== Number(process.pid);
      pidParentActionID.add(key);

      let endElapsedNanos = BigInt(0);
      if (process.endTime) {
        endElapsedNanos = nanosecondsBetweenTimestamps(start, process.endTime);
      }

      const fileReadIds = [
        ...process.fileReadIds.map((id) => Number(id)),
      ].filter((id) => !filteredFileIds.has(id));
      const fileWriteIds = [
        ...process.fileWriteIds.map((id) => Number(id)),
      ].filter((id) => !filteredFileIds.has(id));

      const action: Action = {
        id: Number(process.id),
        parentId: Number(process.parentId),
        pid: Number(process.pid),
        ppid: p?.pid ?? 0,
        start: process.startTime || timestampFromMs(0),
        end: process.endTime || timestampFromMs(0),
        workingDirectory: process.workingDirectory,
        args,
        fileReadIds,
        fileWriteIds,
        pipeReadFromActionId: Number(process.pipeReadFromActionId),
        pipeWriteToActionId:
          pipeWriteToActionIdMap.get(Number(process.id)) || 0,
        exitSignal: process.exitSignal,
        exitStatus: process.exitStatus,
        isClone,
        startElapsedNanos: process.startTime
          ? nanosecondsBetweenTimestamps(start, process.startTime)
          : BigInt(0),
        endElapsedNanos,
        runes,
        depth,
        ruleMatch: ruleMatchIds.has(Number(process.id)),
        ruleName: ruleMatchIds.get(Number(process.id)) || null,
      };
      actions.push(action);
      this.actionsById.set(action.id, action);
      if (!this.actionsByPid.has(action.pid)) {
        this.actionsByPid.set(action.pid, []);
      }
      this.actionsByPid.get(action.pid)!.push(action);
    }
    this.actions = actions;
    this.computePipelineGroups();
  }

  computePipelineGroups() {
    // Keep track of actions that have already been assigned to a pipeline group.
    const visited = new Set<number>();
    for (const action of this.actions) {
      if (visited.has(action.id)) {
        continue;
      }

      // If action is part of a pipeline, trace back to the start of pipe chain.
      let startAction = action;
      const seenBackward = new Set<number>();
      while (startAction.pipeReadFromActionId !== 0) {
        if (seenBackward.has(startAction.pipeReadFromActionId)) {
          console.warn(
            `Cycle detected in pipeReadFromActionId chain. Action ID: ${startAction.id}, PipeReadFromActionId: ${startAction.pipeReadFromActionId}`,
            startAction,
          );
          break;
        }
        seenBackward.add(startAction.pipeReadFromActionId);
        const prev = this.actionsById.get(startAction.pipeReadFromActionId);
        if (!prev) {
          break;
        }
        startAction = prev;
      }

      // If startAction is not head of a pipe, we are not interested in processing it here.
      if (startAction.pipeWriteToActionId === 0) {
        continue;
      }

      // Follow pipe connections to build the sequence of pipeline actions.
      const pipelineSequence: Action[] = [];
      let current: Action | undefined = startAction;
      const seenForward = new Set<number>();
      while (current) {
        if (seenForward.has(current.id)) {
          console.warn(
            `Cycle detected in pipeWriteToActionId chain. Action ID: ${current.id}, PipeWriteToActionId: ${current.pipeWriteToActionId}`,
            current,
          );
          break;
        }
        seenForward.add(current.id);
        pipelineSequence.push(current);
        current = this.actionsById.get(current.pipeWriteToActionId);
      }

      // Build the pipeline group, which is a list of action groups, where each
      // inner group contains actions with the same PID, and the list of groups
      // is ordered by pipe order.
      const pipelineGroup: PipelineGroup = [];
      const pidsInPipeline = new Set<number>();
      for (const p of pipelineSequence) {
        // If we've already processed this PID, skip it.
        if (pidsInPipeline.has(p.pid)) {
          continue;
        }
        pidsInPipeline.add(p.pid);
        // Get all siblings with the same PID and sort them by start time.
        const siblings = this.actionsByPid.get(p.pid);
        if (!siblings) {
          continue;
        }
        const sortedSiblings = siblings.slice();
        sortedSiblings.sort((a, b) =>
          Number(a.startElapsedNanos - b.startElapsedNanos),
        );
        pipelineGroup.push(sortedSiblings);
      }

      // Mark all actions in the group as visited and map them to this
      // pipeline group.
      for (const group of pipelineGroup) {
        for (const action of group) {
          visited.add(action.id);
          this.actionIdToPipelineGroup.set(action.id, pipelineGroup);
        }
      }
    }
  }

  /**
   * Returns the list of ancestors of the given action, including the action
   * itself, in order from root to the given action.
   * @param action The action to get ancestors for.
   * @return The list of ancestors.
   */
  ancestors(action: Action): Action[] {
    let currentAction: Action | undefined = action;
    const actions: Action[] = [];
    while (currentAction) {
      actions.push(currentAction);
      currentAction = this.actionsById.get(currentAction.parentId);
    }
    actions.reverse();
    return actions;
  }
}
