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
import {customElement, property, state} from 'lit/decorators.js';
import {map} from 'lit/directives/map.js';
import {Graph} from './graph.js';

interface Arg0Count {
  readonly arg0: string;
  readonly count: number;
}

/** Detail for the histogram-row-clicked event. */
export interface HistogramRowClickedEventDetail {
  query: string;
}

function compareArg0Count(
  sortColumn: 'arg0' | 'count',
  sortDirection: 'asc' | 'desc',
) {
  return (a: Arg0Count, b: Arg0Count): number => {
    if (sortColumn === 'arg0') {
      const res = a.arg0.localeCompare(b.arg0, undefined, {
        sensitivity: 'base',
      });
      return sortDirection === 'asc' ? res : -res;
    }
    // sort by count
    const dir = sortDirection === 'asc' ? 1 : -1;
    if (a.count === b.count) {
      // Secondary sort by arg0 when counts are equal.
      return a.arg0.localeCompare(b.arg0, undefined, {sensitivity: 'base'});
    }
    return (a.count - b.count) * dir;
  };
}

/**
 * A pane that displays a histogram of arg0 counts.
 */
@customElement('histogram-pane')
export class HistogramPane extends LitElement {
  static override styles = css`
    :host {
      overflow-y: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th,
    td {
      padding: 2px 4px;
      border-bottom: 1px solid var(--playground-border-color);
      text-align: left;
    }
    th {
      position: sticky;
      top: 0;
      background-color: var(--playground-header-bg);
      cursor: pointer;
      user-select: none;
    }
    tr:hover {
      background-color: var(--playground-hover-bg);
    }
    tr {
      cursor: pointer;
    }
    th.count,
    td.count {
      text-align: right;
    }
    th.count {
      white-space: nowrap;
    }
    td.arg0 {
      word-break: break-all;
    }
    :host::-webkit-scrollbar {
      width: var(--playground-scrollbar-width);
      height: var(--playground-scrollbar-height);
      border-left: var(--playground-scrollbar-border);
    }
    :host::-webkit-scrollbar-track {
      background: var(--playground-scrollbar-track-bg);
    }
    :host::-webkit-scrollbar-thumb {
      background: var(--playground-scrollbar-thumb-bg);
    }
    :host::-webkit-scrollbar-thumb:hover {
      background: var(--playground-scrollbar-thumb-hover-bg);
    }
    :host::-webkit-scrollbar-thumb:active {
      background: var(--playground-scrollbar-thumb-active-bg);
    }
  `;

  @property({type: Object}) graph: Graph = new Graph();
  @property({type: Boolean}) showBasename = false;
  @state() private sortColumn: 'arg0' | 'count' = 'count';
  @state() private sortDirection: 'asc' | 'desc' = 'desc';
  @state() private counts: Arg0Count[] = [];

  private readonly handleRowClick = (item: Arg0Count) => {
    let query = item.arg0;
    if (this.showBasename) {
      query = `/${item.arg0}`;
    }
    this.dispatchEvent(
      new CustomEvent<HistogramRowClickedEventDetail>('histogram-row-clicked', {
        detail: {query},
        bubbles: true,
        composed: true,
      }),
    );
  };

  private getArg0Counts(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const action of this.graph.actions) {
      if (action.args.length > 0) {
        let key = action.args[0];
        if (this.showBasename) {
          let effectivePath = key;
          if (effectivePath.endsWith('/') && effectivePath.length > 1) {
            effectivePath = effectivePath.slice(0, -1);
          }
          if (effectivePath === '/') {
            key = '/';
          } else {
            key = effectivePath.substring(effectivePath.lastIndexOf('/') + 1);
          }
        }
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return counts;
  }

  private generateCountTable(): Arg0Count[] {
    const counts = this.getArg0Counts();
    return Array.from(counts.entries(), ([arg0, count]) => ({arg0, count}));
  }

  private handleSort(column: 'arg0' | 'count') {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = column === 'count' ? 'desc' : 'asc';
    }
    this.counts = this.generateCountTable().toSorted(
      compareArg0Count(this.sortColumn, this.sortDirection),
    );
  }

  private renderSortIndicator(column: 'arg0' | 'count'): string {
    if (this.sortColumn !== column) {
      return '';
    }
    return this.sortDirection === 'asc' ? ' ▲' : ' ▼';
  }

  override willUpdate(changedProperties: PropertyValues<this>) {
    if (
      changedProperties.has('graph') ||
      changedProperties.has('showBasename')
    ) {
      this.counts = this.generateCountTable().toSorted(
        compareArg0Count(this.sortColumn, this.sortDirection),
      );
      this.dispatchCountChanged();
    }
  }

  private dispatchCountChanged() {
    this.dispatchEvent(
      new CustomEvent('count-changed', {
        detail: {count: this.counts.length},
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    return html`
      <table>
        <thead>
          <tr>
            <th
              class="arg0"
              @click=${() => {
                this.handleSort('arg0');
              }}
              >Argv[0]${this.renderSortIndicator('arg0')}</th
            >
            <th
              class="count"
              @click=${() => {
                this.handleSort('count');
              }}
              >Count${this.renderSortIndicator('count')}</th
            >
          </tr>
        </thead>
        <tbody>
          ${map(
            this.counts,
            (item) => html`
              <tr
                @click=${() => {
                  this.handleRowClick(item);
                }}>
                <td class="arg0">${item.arg0}</td>
                <td class="count">${item.count.toLocaleString()}</td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'histogram-pane': HistogramPane;
  }
}
