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

import {css, html, LitElement, PropertyValues} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';
import {map} from 'lit/directives/map.js';
import {styleMap} from 'lit/directives/style-map.js';
import './action.js';
import {defaultActionDisplayOptions} from './action.js';
import {
  Action,
  ActionLayout,
  calculateActionHeight,
  CharSize,
  getCharacterSize,
  getIndicatorTops,
  Graph,
} from './graph.js';
import './virtual_scrollbar.js';

function compareActions(a: Action, b: Action): number {
  if (a.startElapsedNanos === b.startElapsedNanos) {
    return a.id - b.id;
  }
  return a.startElapsedNanos < b.startElapsedNanos ? -1 : 1;
}

interface TreeNode {
  action: Action;
  children: TreeNode[];
  expanded: boolean;
  depth: number;
  isLastChild: boolean;
  useVerticalLine: boolean[]; // For node of depth=d, array of length d.
}

/**
 * A LitElement custom element that displays a scrollable tree of processes
 * (actions) from a sysgraph.
 */
@customElement('process-tree-pane')
export class ProcessTreePane extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;

      --tree-conn-color: var(--playground-tree-connector-color);
      --tree-expand-button-color: var(--playground-tree-expand-button-color);
    }
    .list-wrapper {
      flex: 1;
      display: flex;
      overflow: hidden;
      position: relative;
    }
    .scroll-host {
      flex: 1;
      min-width: 0;
      overflow-y: scroll;
      position: relative;
      outline: none;
      scrollbar-width: none; /* Firefox */
      -ms-overflow-style: none; /* IE and Edge */
    }
    .scroll-host::-webkit-scrollbar {
      display: none; /* Chrome, Safari, Opera */
    }
    .processes {
      word-break: break-all;
      line-break: anywhere;
      tab-size: 1;
      position: relative;
    }
    .tree-node-wrapper {
      position: absolute;
      display: flex;
      align-items: stretch;
      width: 100%;
    }
    .tree-controls {
      flex-shrink: 0;
      user-select: none;
      box-sizing: border-box;
      text-align: right;
      position: relative;
      margin-left: 6px;
      display: flex;
      align-items: stretch;
    }

    .conn {
      width: 12px;
      flex-shrink: 0;
      position: relative;
    }

    /*
     * Tree connectors
     * -----------------
     * | - vertical line
     * L - elbow connector
     * T - tee connector
     * - - horizontal line
     */

    /* vertical line for | and T */
    .conn.v-line::before,
    .conn.t-elbow::before {
      content: '';
      position: absolute;
      border-left: 1px solid var(--tree-conn-color);
      left: 6px;
      top: 0;
      bottom: 0;
    }

    /* top vertical bar for L */
    .conn.l-elbow::before {
      content: '';
      position: absolute;
      border-left: 1px solid var(--tree-conn-color);
      left: 6px;
      top: 0;
      height: 8px;
    }

    /* horizontal bar for L and T */
    .conn.l-elbow::after,
    .conn.t-elbow::after {
      content: '';
      position: absolute;
      border-top: 1px solid var(--tree-conn-color);
      top: 7px;
      left: 6px;
      right: -6px;
    }

    /* horizontal line for - */
    .conn.h-line::before {
      content: '';
      position: absolute;
      border-top: 1px solid var(--tree-conn-color);
      top: 7px;
      left: 0;
      right: 0;
    }

    .expand-button {
      cursor: pointer;
      width: 12px;
      display: block;
      text-align: center;
      z-index: 1;
      position: relative;
      box-sizing: border-box;
    }
    .expand-button::before {
      content: '';
      position: absolute;
      width: 0;
      height: 0;
      /* ▶ */
      border-top: 6px solid transparent;
      border-bottom: 6px solid transparent;
      border-left: 8px solid var(--tree-expand-button-color);
      left: 2px;
      top: 1px;
    }
    .expand-button.expanded::before {
      /* ▼ */
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-top: 8px solid var(--tree-expand-button-color);
      border-bottom: none;
      left: 0.5px;
      top: 7px;
    }
    /* This pseudo element is for the node connecting line */
    .expand-button.expanded::after {
      content: '';
      position: absolute;
      border-left: 1px solid var(--tree-conn-color);
      left: 6px;
      top: 15px; /* below ▼ */
      bottom: 0;
    }
    action-element {
      flex-grow: 1;
      min-width: 0;
      border-bottom: none;
    }
  `;
  @property({type: Object}) graph: Graph = new Graph();
  @property({type: Number}) selectedActionID = -1;
  @property({type: Number}) scrollToActionId = -1;
  @property({type: Object}) displayOptions = defaultActionDisplayOptions;

  @query('#scroll-host') scrollHost!: HTMLElement;
  @query('#processes') processes!: HTMLElement;

  private scrollUpdateQueued = false;
  @state() private visibleNodes: TreeNode[] = [];
  @state() treeScrollTop = 0;
  @state() treeScrollHeight = 1;
  @state() treeClientHeight = 1;
  @state() private totalHeight = 0;
  @state() actionLayouts = new Map<number, ActionLayout>();
  private charSize: CharSize | null = null;
  private readonly resizeObserver = new ResizeObserver(() => {
    this.updateView();
  });

  @state() private flatTree: TreeNode[] = [];
  private readonly nodeStates = new Map<number, {expanded: boolean}>();

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.resizeObserver.disconnect();
  }

  override render() {
    return html`
      <div class="list-wrapper">
        <div
          id="scroll-host"
          class="scroll-host"
          tabindex="0"
          @scroll=${this.handleScrollEvent}>
          <div
            id="processes"
            class="processes"
            style=${styleMap({'height': `${this.totalHeight}px`})}>
            ${map(this.visibleNodes, (node) => {
              const layout = this.actionLayouts.get(node.action.id);
              if (!layout) return '';
              return html`
                <div
                  class="tree-node-wrapper ${classMap({
                    'is-last-child': node.isLastChild,
                  })}"
                  style="top: ${layout.top}px; height: ${layout.height}px;">
                  <div class="tree-controls">
                    ${node.useVerticalLine.map(
                      (use) =>
                        html`<div
                          class=${classMap({
                            'conn': true,
                            'v-line': use,
                          })}></div>`,
                    )}
                    <div
                      class="conn ${
                        node.isLastChild ? 'l-elbow' : 't-elbow'
                      }"></div>
                    ${
                      node.children.length > 0
                        ? html`<span
                          class="expand-button ${
                            node.expanded ? 'expanded' : ''
                          }"
                          @click=${() => {
                            this.toggleNode(node);
                          }}></span>`
                        : html`<div class="conn h-line"></div>`
                    }
                  </div>
                  <action-element
                    .action=${node.action}
                    .displayOptions=${this.displayOptions}
                    .searchController=${null}
                    .isSelected=${node.action.id === this.selectedActionID}>
                  </action-element>
                </div>
              `;
            })}
          </div>
        </div>
        <virtual-scrollbar
          .virtualScrollTop=${this.treeScrollTop}
          .contentHeight=${this.treeScrollHeight}
          .viewportHeight=${this.treeClientHeight}
          .indicatorTops=${getIndicatorTops(this.graph, this.actionLayouts)}
          @scroll-to=${this.handleScrollbarScrollTo}></virtual-scrollbar>
      </div>
    `;
  }

  override firstUpdated() {
    this.resizeObserver.observe(this.scrollHost);
    this.updateView();
  }

  private buildTree() {
    const childrenByParentId = new Map<number, Action[]>();
    for (const action of this.graph.actions) {
      const parentId = action.parentId;
      if (!childrenByParentId.has(parentId)) {
        childrenByParentId.set(parentId, []);
      }
      childrenByParentId.get(parentId)!.push(action);
    }

    const tree: TreeNode[] = [];
    const build = (
      action: Action,
      isLastChild: boolean,
      parentUseVerticalLine: boolean[],
    ): TreeNode => {
      const childrenActions = childrenByParentId.get(action.id) ?? [];
      // Lit doesn't like it if we sort in place.
      const sortedChildren = [...childrenActions].sort(compareActions);
      const node: TreeNode = {
        action,
        children: [],
        expanded: this.nodeStates.get(action.id)?.expanded ?? true,
        depth: action.depth,
        isLastChild,
        useVerticalLine: parentUseVerticalLine,
      };
      node.children = sortedChildren.map((child, i) =>
        build(
          child,
          i === sortedChildren.length - 1,
          parentUseVerticalLine.concat([!isLastChild]),
        ),
      );
      return node;
    };

    const rootActions = this.graph.actions.filter(
      (a) => a.parentId === 0 || !this.graph.actionsById.has(a.parentId),
    );
    rootActions.sort(compareActions);
    for (let i = 0; i < rootActions.length; i++) {
      tree.push(build(rootActions[i], i === rootActions.length - 1, []));
    }

    const flat: TreeNode[] = [];
    const flatten = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        flat.push(node);
        if (node.expanded) {
          flatten(node.children);
        }
      }
    };
    flatten(tree);
    this.flatTree = flat;
  }

  toggleNode(node: TreeNode) {
    const expanded = !(this.nodeStates.get(node.action.id)?.expanded ?? true);
    this.nodeStates.set(node.action.id, {expanded});
    this.buildTree();
    this.updateView();
  }

  updateView() {
    if (!this.scrollHost || this.scrollHost.offsetHeight === 0) return;

    const anchor = this.getAnchorNode(this.treeScrollTop);

    this.calculateLayout();
    if (this.flatTree.length > 0 && this.actionLayouts.size > 0) {
      const lastNode = this.flatTree[this.flatTree.length - 1];
      const layout = this.actionLayouts.get(lastNode.action.id)!;
      this.totalHeight = layout.top + layout.height;
    } else {
      this.totalHeight = 0;
    }

    // We need to update the height of the processes element immediately so that
    // the scrollHeight of the scrollHost is updated before we try to restore
    // the scroll position. If we rely solely on Lit's reactive update, the
    // height might not be updated yet when we set scrollTop, causing it to be
    // clamped to the old height.
    if (this.processes) {
      this.processes.style.height = `${this.totalHeight}px`;
    }

    if (anchor) {
      const newLayout = this.actionLayouts.get(anchor.node.action.id);
      if (newLayout) {
        this.scrollHost.scrollTop =
          newLayout.top + anchor.ratio * newLayout.height;
      }
    }

    this.treeScrollHeight = this.totalHeight;
    if (!this.scrollUpdateQueued) {
      this.scrollUpdateQueued = true;
      requestAnimationFrame(() => {
        if (this.scrollHost) {
          this.treeScrollTop = this.scrollHost.scrollTop;
          this.treeScrollHeight = this.scrollHost.scrollHeight;
          this.treeClientHeight = this.scrollHost.clientHeight;
        }
        this.updateProcessView();
        this.scrollUpdateQueued = false;
      });
    }
  }

  private getAnchorNode(
    scrollTop: number,
  ): {node: TreeNode; ratio: number} | null {
    const nodes = this.flatTree;
    if (nodes.length === 0 || this.actionLayouts.size === 0) return null;

    let low = 0;
    let high = nodes.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const node = nodes[mid];
      const layout = this.actionLayouts.get(node.action.id);
      if (!layout) return null;

      if (scrollTop >= layout.top && scrollTop < layout.top + layout.height) {
        const ratio =
          layout.height > 0 ? (scrollTop - layout.top) / layout.height : 0;
        return {node, ratio};
      } else if (scrollTop < layout.top) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
    return null;
  }

  override updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.has('graph')) {
      this.buildTree();
      this.updateView();
    }
    if (
      changedProperties.has('scrollToActionId') &&
      this.scrollToActionId !== -1
    ) {
      this.show(this.scrollToActionId);
    }
  }

  show(id: number) {
    // If a node is hidden due to parent collapsed, we need to expand parents.
    let action: Action | undefined = this.graph.actionsById.get(id);
    if (!action) return;
    let needsRebuild = false;
    while (action) {
      const parent: Action | undefined = this.graph.actionsById.get(
        action.parentId,
      );
      if (!parent) break;
      const parentState = this.nodeStates.get(parent.id);
      if (parentState && !parentState.expanded) {
        parentState.expanded = true;
        this.nodeStates.set(parent.id, parentState);
        needsRebuild = true;
      }
      action = parent;
    }

    if (needsRebuild) {
      this.buildTree();
      this.updateView();
    }

    const layout = this.actionLayouts.get(id);
    if (!layout || !this.scrollHost) {
      return;
    }
    this.scrollHost.scrollTo({
      top: layout.top - 100,
    });
  }

  calculateLayout() {
    if (!this.scrollHost || this.scrollHost.clientWidth === 0) {
      this.actionLayouts = new Map();
      return;
    }

    let charSize = this.charSize;
    if (!charSize) {
      charSize = getCharacterSize(this.processes);
      if (charSize.width === 0 || charSize.height === 0) {
        this.actionLayouts = new Map();
        return;
      }
      this.charSize = charSize;
    }

    let top = 0;
    const layouts = new Map<number, ActionLayout>();
    for (const node of this.flatTree) {
      const action = node.action;
      // Header row
      let height = charSize.height;
      if (!action.isClone) {
        const controlsWidth = 6 + 12 * (node.depth + 2);
        const actionWidth = this.scrollHost.clientWidth - controlsWidth;
        // Subtract 1 for the 1px border that is hidden.
        height = calculateActionHeight(action.runes, actionWidth, charSize) - 1;
      }
      layouts.set(action.id, {top, height});
      top += height;
    }
    this.actionLayouts = layouts;
  }

  private handleScrollEvent(_event: Event) {
    if (!this.scrollUpdateQueued) {
      this.scrollUpdateQueued = true;
      requestAnimationFrame(() => {
        if (this.scrollHost && this.scrollHost.offsetHeight > 0) {
          this.treeScrollTop = this.scrollHost.scrollTop;
          this.treeScrollHeight = this.scrollHost.scrollHeight;
          this.treeClientHeight = this.scrollHost.clientHeight;
        }
        this.updateProcessView();
        this.scrollUpdateQueued = false;
      });
    }
  }

  private handleScrollbarScrollTo(e: CustomEvent<{scrollTop: number}>) {
    if (!this.scrollHost) return;
    this.scrollHost.scrollTop = e.detail.scrollTop;
  }

  private updateProcessView() {
    if (!this.scrollHost) return;
    this.visibleNodes = this.calcVisibleNodes();
  }

  private calcVisibleNodes(): TreeNode[] {
    if (!this.scrollHost || this.flatTree.length === 0) {
      return [];
    }
    const buffer = 1000;
    const top = this.scrollHost.scrollTop;
    const bottom = top + this.scrollHost.clientHeight;

    // The binary search assumes flatTree is sorted by layout.top.
    //
    // Binary search to find the first node that might be visible.
    // We are looking for the first node where:
    // layout.top + layout.height + buffer >= top
    let low = 0;
    let high = this.flatTree.length;
    let firstVisibleIndex = this.flatTree.length;

    while (low < high) {
      const mid = Math.floor(low + (high - low) / 2);
      const layout = this.actionLayouts.get(this.flatTree[mid].action.id);
      if (layout && layout.top + layout.height + buffer >= top) {
        firstVisibleIndex = mid;
        high = mid;
      } else {
        low = mid + 1;
      }
    }

    const visible: TreeNode[] = [];

    // Iterate from the first potentially visible node until nodes are
    // outside the visible range.
    for (let i = firstVisibleIndex; i < this.flatTree.length; i++) {
      const node = this.flatTree[i];
      const layout = this.actionLayouts.get(node.action.id);
      if (layout && layout.top - buffer <= bottom) {
        visible.push(node);
      } else if (layout && layout.top - buffer > bottom) {
        // If this node is below the visible range, all subsequent nodes
        // will also be, so we can stop.
        break;
      }
    }
    return visible;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'process-tree-pane': ProcessTreePane;
  }
}
