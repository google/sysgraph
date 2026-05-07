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

/**
 * A LitElement custom element that displays a scrollable list of processes
 * (actions) from a sysgraph.
 */
@customElement('process-list-pane')
export class ProcessListPane extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
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
      scrollbar-width: none; /* Firefox */
      -ms-overflow-style: none; /* IE and Edge */
      outline: none;
    }
    .scroll-host::-webkit-scrollbar {
      display: none; /* Chrome, Safari, Opera */
    }
    .processes {
      word-break: break-all;
      line-break: anywhere;
      tab-size: 1;
    }
  `;
  @property({type: Object}) graph: Graph = new Graph();
  @property({type: Number}) selectedActionID = -1;
  @property({type: Number}) scrollToActionId = -1;
  @property({type: Object}) displayOptions = defaultActionDisplayOptions;

  @query('#scroll-host') private readonly scrollHost!: HTMLElement;
  @query('#processes') processes!: HTMLElement;

  private scrollUpdateQueued = false;
  @state() private visibleActions: Action[] = [];
  @state() private listScrollTop = 0;
  @state() private listScrollHeight = 1;
  @state() private listClientHeight = 1;
  @state() private indicatorTops: number[] = [];
  @state() private totalHeight = 0;
  // public for testing
  @state() actionLayouts = new Map<number, ActionLayout>();
  private charSize: CharSize | null = null;
  private resizeObserver!: ResizeObserver;

  override connectedCallback() {
    super.connectedCallback();
    this.resizeObserver = new ResizeObserver(() => {
      this.updateView();
    });
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.resizeObserver.disconnect();
  }

  override render() {
    // Set tabindex="0" on scroll-host to make it focusable, allowing it to
    // receive keyboard events for scrolling.
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
            ${map(this.visibleActions, (action) => {
              const layout = this.actionLayouts.get(action.id) ?? {
                top: 0,
                height: 0,
              };
              return html`
                <action-element
                  .action=${action}
                  .displayOptions=${this.displayOptions}
                  .searchController=${null}
                  .isSelected=${action.id === this.selectedActionID}
                  .absPositioned=${true}
                  style=${styleMap({
                    'top': `${layout.top}px`,
                    'height': `${layout.height}px`,
                  })}>
                </action-element>
              `;
            })}
          </div>
        </div>
        <virtual-scrollbar
          .virtualScrollTop=${this.listScrollTop}
          .contentHeight=${this.listScrollHeight}
          .viewportHeight=${this.listClientHeight}
          .indicatorTops=${this.indicatorTops}
          @scroll-to=${this.handleScrollbarScrollTo}></virtual-scrollbar>
      </div>
    `;
  }

  override firstUpdated() {
    this.resizeObserver.observe(this.scrollHost);
    this.updateView();
  }

  calculateLayout() {
    if (!this.scrollHost || this.scrollHost.clientWidth === 0) {
      this.actionLayouts = new Map();
      this.indicatorTops = [];
      return;
    }

    let charSize = this.charSize;
    if (!charSize) {
      charSize = getCharacterSize(this.processes);
      // Cannot calculate layout if char size is 0.
      if (charSize.width === 0 || charSize.height === 0) {
        this.actionLayouts = new Map();
        this.indicatorTops = [];
        return;
      }
      this.charSize = charSize;
    }

    let top = 0;
    const layouts = new Map<number, ActionLayout>();
    for (const action of this.graph.actions) {
      // Header row plus 1 for the 1px border
      let height = Number(charSize.height + 1);
      if (!action.isClone) {
        height = calculateActionHeight(
          action.runes,
          this.scrollHost.clientWidth,
          charSize,
        );
      }
      layouts.set(action.id, {top, height});
      top += height;
    }
    this.actionLayouts = layouts;
    this.indicatorTops = getIndicatorTops(this.graph, this.actionLayouts);
  }

  updateView() {
    if (!this.scrollHost || this.scrollHost.offsetHeight === 0) return;

    const anchor = this.getAnchorAction(this.listScrollTop);

    this.calculateLayout();
    if (this.graph.actions.length > 0 && this.actionLayouts.size > 0) {
      const lastAction = this.graph.actions[this.graph.actions.length - 1];
      const layout = this.actionLayouts.get(lastAction.id)!;
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
      const newLayout = this.actionLayouts.get(anchor.action.id);
      if (newLayout) {
        this.scrollHost.scrollTop =
          newLayout.top + anchor.ratio * newLayout.height;
      }
    }

    this.listScrollTop = this.scrollHost.scrollTop;
    this.listScrollHeight = this.totalHeight;
    this.listClientHeight = this.scrollHost.clientHeight;
    this.updateProcessView();
  }

  private getAnchorAction(
    scrollTop: number,
  ): {action: Action; ratio: number} | null {
    const actions = this.graph.actions;
    if (actions.length === 0 || this.actionLayouts.size === 0) return null;

    let low = 0;
    let high = actions.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const action = actions[mid];
      const layout = this.actionLayouts.get(action.id);
      if (!layout) {
        return null;
      }

      if (scrollTop >= layout.top && scrollTop < layout.top + layout.height) {
        const ratio =
          layout.height > 0 ? (scrollTop - layout.top) / layout.height : 0;
        return {action, ratio};
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
    const layout = this.actionLayouts.get(id);
    if (!layout || !this.scrollHost) {
      return;
    }
    this.scrollHost.scrollTo({
      top: layout.top - 100,
    });
  }

  private handleScrollEvent(_event: Event) {
    if (!this.scrollUpdateQueued) {
      this.scrollUpdateQueued = true;
      requestAnimationFrame(() => {
        if (this.scrollHost && this.scrollHost.offsetHeight > 0) {
          this.listScrollTop = this.scrollHost.scrollTop;
          this.listScrollHeight = this.scrollHost.scrollHeight;
          this.listClientHeight = this.scrollHost.clientHeight;
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
    this.visibleActions = this.calcVisibleActions(this.graph);
  }

  private calcVisibleActions(graph: Graph): Action[] {
    if (!this.scrollHost) {
      return [];
    }
    const buffer = 1000;
    const top = this.scrollHost.scrollTop;
    const bottom = top + this.scrollHost.clientHeight;
    const actions = graph.actions;
    if (actions.length === 0) {
      return [];
    }

    // The binary search assumes graph.actions are sorted by layout.top.
    //
    // Binary search to find the first action that might be visible.
    // We are looking for the first action where:
    // layout.top + layout.height + buffer >= top
    let low = 0;
    let high = actions.length;
    let firstVisibleIndex = actions.length;

    while (low < high) {
      const mid = Math.floor(low + (high - low) / 2);
      const layout = this.actionLayouts.get(actions[mid].id);
      if (layout && layout.top + layout.height + buffer >= top) {
        firstVisibleIndex = mid;
        high = mid;
      } else {
        low = mid + 1;
      }
    }

    const visible: Action[] = [];

    // Iterate from the first potentially visible action until actions are
    // outside the visible range.
    for (let i = firstVisibleIndex; i < actions.length; i++) {
      const a = actions[i];
      const layout = this.actionLayouts.get(a.id);
      if (layout && layout.top - buffer <= bottom) {
        visible.push(a);
      } else if (layout && layout.top - buffer > bottom) {
        // If this action is below the visible range, all subsequent actions
        // will also be, so we can stop.
        break;
      }
    }

    return visible;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'process-list-pane': ProcessListPane;
  }
}
