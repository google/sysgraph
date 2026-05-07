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

import {
  css,
  html,
  LitElement,
  nothing,
  PropertyValues,
  TemplateResult,
} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';
import {createRef, ref} from 'lit/directives/ref.js';
import {repeat} from 'lit/directives/repeat.js';
import {styleMap} from 'lit/directives/style-map.js';
import {ActionSelectedEventDetail, highlightRanges} from './action.js';
import {countRunes, getCharacterSize, Graph, type CharSize} from './graph.js';
import {SearchController} from './search.js';
import './virtual_scrollbar.js';

interface SearchResult {
  type: 'process' | 'file';
  id: number; // actionId or fileId
  text: string;
  runes: number;
}

interface ItemLayout {
  top: number;
  height: number;
}

function calculateSearchItemHeight(
  runes: number,
  containerWidth: number,
  charSize: CharSize,
): number {
  const charsPerLine = Math.floor(containerWidth / charSize.width);
  if (charsPerLine === 0) {
    return 1 * charSize.height + 1; // 1 line + border
  }
  const numLines = Math.ceil(runes / charsPerLine);
  return numLines * charSize.height + 1;
}

/**
 * A pane that contains search controls.
 */
@customElement('search-pane')
export class SearchPane extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .search-bar {
      display: flex;
      padding: 4px;
      align-items: center;
      background-color: var(--playground-header-bg-alt);
      border-bottom: 1px solid var(--playground-border-color);
      flex-shrink: 0;
    }
    input {
      flex-grow: 1;
    }
    button {
      border: 1px solid var(--playground-button-border-color);
      background-color: var(--playground-bg-color);
      cursor: pointer;
      padding: 2px 6px;
      margin: 0 1px;
      min-width: 28px;
    }
    button.selected {
      background-color: var(--playground-active-control-bg);
    }
    .invalid {
      outline: 1px auto rgb(255, 91, 91);
    }
    .result-item {
      padding: 0;
      letter-spacing: 0;
      cursor: pointer;
      word-break: break-all;
      line-break: anywhere;
      border-bottom: 1px solid var(--playground-border-color);
      position: absolute;
      width: 100%;
      box-sizing: border-box;
    }
    .result-item:hover {
      background-color: var(--playground-hover-bg);
    }
    .highlight {
      background-color: var(--playground-highlight-bg);
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
    .results-list {
      word-break: break-all;
      line-break: anywhere;
      tab-size: 1;
      position: relative;
    }
  `;
  @property({type: Object}) graph: Graph = new Graph();
  @property({type: Boolean}) matchCase = false;
  @property({type: Boolean}) useRegex = false;
  private readonly searchInput = createRef<HTMLInputElement>();
  @state() searchController: SearchController;

  @query('#scroll-host') private readonly scrollHost!: HTMLElement;
  @query('#results-list') private readonly resultsList!: HTMLElement;
  private scrollUpdateQueued = false;
  @state() private visibleItems: SearchResult[] = [];
  @state() private listScrollTop = 0;
  @state() private listScrollHeight = 1;
  @state() private listClientHeight = 1;
  @state() itemLayouts = new Map<string, ItemLayout>();
  private charSize: CharSize | null = null;
  private readonly resizeObserver!: ResizeObserver;
  @state() searchResults: SearchResult[] = [];
  @state() private resultsListHeight = 0;

  get searchStatusString(): string {
    const totalMatches =
      this.searchController.getMatches().length +
      this.searchController.getFileMatches().length;
    return totalMatches.toLocaleString();
  }

  constructor() {
    super();
    this.searchController = new SearchController(this.graph, () => {
      this.collateSearchResults();
      this.updateView();
      this.dispatchEvent(
        new CustomEvent('search-updated', {bubbles: true, composed: true}),
      );
    });
    this.resizeObserver = new ResizeObserver(() => {
      this.updateView();
    });
  }

  override connectedCallback() {
    super.connectedCallback();
    this.resizeObserver.observe(this);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.resizeObserver.disconnect();
  }

  override updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.has('graph')) {
      this.searchController = new SearchController(this.graph, () => {
        this.collateSearchResults();
        this.updateView();
        this.dispatchEvent(
          new CustomEvent('search-updated', {bubbles: true, composed: true}),
        );
      });
      this.requestUpdate();
    }

    if (
      changedProperties.has('graph') ||
      changedProperties.has('matchCase') ||
      changedProperties.has('useRegex')
    ) {
      this.searchController.matchCase = this.matchCase;
      this.searchController.useRegex = this.useRegex;
    }

    if (
      changedProperties.has('matchCase') ||
      changedProperties.has('useRegex')
    ) {
      const query = this.searchInput.value?.value ?? '';
      this.searchController.setQuery(query);
    }
  }

  setSearchQuery(query: string) {
    if (this.searchInput.value) {
      this.searchInput.value.value = query;
      this.searchController.setQuery(query);
    }
  }

  private handleInput(e: Event) {
    this.searchController.setQuery((e.target as HTMLInputElement).value);
  }

  private handleProcessClick(e: PointerEvent) {
    const target = e.currentTarget as HTMLElement;
    const id = target?.dataset['id'];
    if (!id) {
      return;
    }
    const actionId = Number(id);
    const action = this.graph.actionsById.get(actionId);
    if (!action) {
      return;
    }
    const event = new CustomEvent<ActionSelectedEventDetail>(
      'action-selected',
      {
        detail: {action},
        bubbles: true,
        composed: true,
      },
    );
    this.dispatchEvent(event);
  }

  override render() {
    const inputClasses = {
      'invalid': this.searchController.invalid,
    };
    return html`
      <div class="search-bar">
        <input
          id="search-input"
          ${ref(this.searchInput)}
          class=${classMap(inputClasses)}
          type="text"
          placeholder="Search commands, files, or IDs"
          @input=${this.handleInput}
          autocomplete="off" />
      </div>
      ${this.renderSearchResults()}
    `;
  }

  private collateSearchResults() {
    const processMatches = this.searchController.getMatches();
    const fileMatches = this.searchController.getFileMatches();
    const results: SearchResult[] = [];
    for (const actionId of processMatches) {
      const action = this.graph.actionsById.get(actionId);
      const text =
        action && action.args.length > 0
          ? action.args.join(' ')
          : String(actionId);
      results.push({
        type: 'process',
        id: actionId,
        text,
        runes: countRunes(action?.args ?? [String(actionId)]),
      });
    }
    for (const fileId of fileMatches) {
      const text = this.graph.files[fileId];
      results.push({
        type: 'file',
        id: fileId,
        text,
        runes: countRunes([text]),
      });
    }
    this.searchResults = results;
  }

  private renderSearchResults(): TemplateResult | typeof nothing {
    if (this.searchResults.length === 0) {
      return nothing;
    }

    return html`
      <div class="list-wrapper">
        <div
          id="scroll-host"
          class="scroll-host"
          tabindex="0"
          @scroll=${this.handleScrollEvent}>
          <div
            id="results-list"
            class="results-list"
            style=${styleMap({
              'height': `${this.resultsListHeight}px`,
            })}>
            ${repeat(
              this.visibleItems,
              (item) => `${item.type}-${item.id}`,
              (item) => {
                const layout = this.itemLayouts.get(`${item.type}-${item.id}`);
                if (!layout) return '';
                const styles = styleMap({
                  'top': `${layout.top}px`,
                  'height': `${layout.height}px`,
                });
                if (item.type === 'process') {
                  return html`<div
                    class="result-item"
                    style=${styles}
                    data-id=${item.id}
                    @click=${this.handleProcessClick}>
                    ${highlightRanges(
                      item.text,
                      this.searchController.matchRanges(item.text),
                    )}
                  </div>`;
                } else {
                  return html`<div
                    class="result-item"
                    style=${styles}
                    title=${item.text}>
                    ${highlightRanges(
                      item.text,
                      this.searchController.matchRanges(item.text),
                    )}
                  </div>`;
                }
              },
            )}
          </div>
        </div>
        <virtual-scrollbar
          .virtualScrollTop=${this.listScrollTop}
          .contentHeight=${this.listScrollHeight}
          .viewportHeight=${this.listClientHeight}
          @scroll-to=${this.handleScrollbarScrollTo}></virtual-scrollbar>
      </div>
    `;
  }

  override firstUpdated() {
    this.updateView();
  }

  calculateLayout() {
    if (!this.scrollHost || this.scrollHost.clientWidth === 0) {
      this.itemLayouts = new Map();
      return;
    }

    let charSize = this.charSize;
    if (!charSize) {
      charSize = getCharacterSize(this.resultsList);
      if (charSize.width === 0 || charSize.height === 0) {
        this.itemLayouts = new Map();
        return;
      }
      this.charSize = charSize;
    }

    let top = 0;
    const layouts = new Map<string, ItemLayout>();
    for (const item of this.searchResults) {
      const height = calculateSearchItemHeight(
        item.runes,
        this.scrollHost.clientWidth,
        charSize,
      );
      layouts.set(`${item.type}-${item.id}`, {top, height});
      top += height;
    }
    this.itemLayouts = layouts;
  }

  updateView() {
    if (!this.scrollHost) return;
    this.calculateLayout();
    if (this.searchResults.length > 0 && this.itemLayouts.size > 0) {
      const lastItem = this.searchResults[this.searchResults.length - 1];
      const layout = this.itemLayouts.get(`${lastItem.type}-${lastItem.id}`)!;
      const totalHeight = layout.top + layout.height;
      this.resultsListHeight = totalHeight;
    } else {
      this.resultsListHeight = 0;
    }
    this.listScrollTop = this.scrollHost.scrollTop;
    this.listScrollHeight = this.scrollHost.scrollHeight;
    this.listClientHeight = this.scrollHost.clientHeight;
    this.updateVisibleItems();
  }

  private handleScrollEvent(_event: Event) {
    if (!this.scrollUpdateQueued) {
      this.scrollUpdateQueued = true;
      requestAnimationFrame(() => {
        if (this.scrollHost) {
          this.listScrollTop = this.scrollHost.scrollTop;
          this.listScrollHeight = this.scrollHost.scrollHeight;
          this.listClientHeight = this.scrollHost.clientHeight;
        }
        this.updateVisibleItems();
        this.scrollUpdateQueued = false;
      });
    }
  }

  private handleScrollbarScrollTo(e: CustomEvent<{scrollTop: number}>) {
    if (!this.scrollHost) return;
    this.scrollHost.scrollTop = e.detail.scrollTop;
  }

  private updateVisibleItems() {
    if (!this.scrollHost) return;
    this.visibleItems = this.calcVisibleItems();
  }

  private calcVisibleItems(): SearchResult[] {
    if (!this.scrollHost) {
      return [];
    }
    const buffer = 200; // pixels
    const top = this.scrollHost.scrollTop;
    const bottom = top + this.scrollHost.clientHeight;
    const items = this.searchResults;
    if (items.length === 0) {
      return [];
    }

    let low = 0;
    let high = items.length;
    let firstVisibleIndex = items.length;

    while (low < high) {
      const mid = Math.floor(low + (high - low) / 2);
      const layout = this.itemLayouts.get(
        `${items[mid].type}-${items[mid].id}`,
      );
      if (layout && layout.top + layout.height + buffer >= top) {
        firstVisibleIndex = mid;
        high = mid;
      } else {
        low = mid + 1;
      }
    }

    const visible: SearchResult[] = [];
    for (let i = firstVisibleIndex; i < items.length; i++) {
      const item = items[i];
      const layout = this.itemLayouts.get(`${item.type}-${item.id}`);
      if (layout && layout.top - buffer <= bottom) {
        visible.push(item);
      } else if (layout && layout.top - buffer > bottom) {
        break;
      }
    }
    return visible;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'search-pane': SearchPane;
  }
}
