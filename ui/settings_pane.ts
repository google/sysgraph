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
import {css, html, LitElement, nothing, PropertyValues} from 'lit';
import {customElement, property, queryAll, state} from 'lit/decorators.js';
import {map} from 'lit/directives/map.js';
import {repeat} from 'lit/directives/repeat.js';
import {when} from 'lit/directives/when.js';
import type {ActionDisplayOptions} from './action.js';
import {defaultActionDisplayOptions} from './action.js';
import type {Action} from './graph.js';

const HIDDEN_COLUMN_INDEX = -1;

interface DraggedPane {
  paneId: string;
  fromColumnIndex: number;
  fromPaneIndex: number;
}

interface DraggedColumn {
  fromColumnIndex: number;
}

/**
 * A pane that allows users to configure the layout of panes in columns.
 */
@customElement('settings-pane')
export class SettingsPane extends LitElement {
  static override styles = css`
    :host {
      padding: 10px;
      display: block;
      font-family: var(--playground-font-family);
      font-size: 12px;
      width: 100%;
      height: 100%;
      overflow: auto;
      box-sizing: border-box;
      --settings-pane-bg: #f9f9f9;
      --settings-pane-border: #ccc;
      --settings-pane-item-bg: white;
      --settings-pane-item-border: #bbb;
      --settings-pane-drop-target-bg: #e0e0ff;
      --settings-pane-dragging-bg: #d0d0d0;
    }
    .layout-editor {
      display: flex;
      gap: 0;
      min-height: 150px;
      align-items: stretch;
      margin-top: 0;
    }
    .column {
      background-color: var(--settings-pane-bg);
      border: 1px solid var(--settings-pane-border);
      border-left-width: 0;
      padding: 0;
      width: 150px;
      display: flex;
      flex-direction: column;
      gap: 0;
      min-height: 100px;
      border-radius: 0;
      transition: background-color 0.2s ease;
    }
    .layout-editor > .column:first-child {
      border-left-width: 1px;
    }
    .column.hidden-column {
      background-color: transparent;
      border-style: dashed;
    }
    .column.drop-target-pane,
    .column.drop-target-column {
      background-color: var(--settings-pane-drop-target-bg);
      border-style: solid;
    }
    .column-placeholder {
      background-color: var(--settings-pane-dragging-bg);
      border: 1px solid #888;
      width: 150px;
      min-height: 100px;
      border-radius: 0;
      box-sizing: border-box;
    }
    .pane-item {
      background-color: var(--settings-pane-item-bg);
      border: 1px solid var(--settings-pane-item-border);
      border-top-width: 0;
      border-left-width: 0;
      border-right-width: 0;
      padding: 8px;
      cursor: grab;
      border-radius: 0;
      user-select: none;
      transition: opacity 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .pane-item-dragging {
      opacity: 0.4;
    }
    .hidden-column .pane-item {
      border-bottom-style: dashed;
    }
    .pane-item-placeholder {
      background-color: var(--settings-pane-dragging-bg);
      border: 1px dashed #888;
      border-top-width: 0;
      border-left-width: 0;
      border-right-width: 0;
      min-height: 30px;
      border-radius: 0;
      margin-bottom: 0;
    }
    .column-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0;
      border-bottom: 1px solid var(--settings-pane-border);
      padding: 4px 8px;
      height: 34px;
      box-sizing: border-box;
      cursor: grab;
    }
    .hidden-column .column-header {
      cursor: default;
    }
    .column-title {
      font-weight: bold;
      text-align: center;
      color: #333;
      flex-grow: 1;
    }
    .remove-button {
      background: none;
      border: none;
      color: #bbb;
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
      padding: 0;
      font-weight: normal;
      border-radius: 4px;
      width: 24px;
      height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .remove-button:hover {
      color: black;
      background-color: #ddd;
    }
    .pane-item .remove-button {
      margin-left: 5px;
    }
    .remove-button-placeholder {
      width: 24px;
      height: 24px;
      margin-left: 5px;
      flex-shrink: 0;
    }
    .controls {
      margin-bottom: 10px;
    }
    .controls button {
      padding: 5px 10px;
      cursor: pointer;
      border: 1px solid var(--playground-border-color);
      border-radius: 4px;
      background-color: #eee;
      margin-right: 5px;
    }
    .controls button:hover:not([disabled]) {
      background-color: #ddd;
    }
    .controls button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    h2 {
      margin-top: 0;
      margin-bottom: 10px;
    }
    h3 {
      font-size: 1em;
      font-weight: normal;
      color: #444;
      margin: 18px 0 2px 0;
    }
    p {
      margin: 0 0 10px 0;
    }
    .version-info {
      margin-top: 30px;
      padding-top: 10px;
      border-top: 1px solid var(--settings-pane-border);
      color: #777;
    }
    .version-info a {
      color: #777;
    }

    .checkbox-group input[type='checkbox'] {
      display: none;
    }
    .checkbox-group label {
      display: inline-block;
      padding: 1px 5px;
      margin: 0 1px;
      cursor: pointer;
      border-radius: 4px;
      border: 1px solid var(--playground-border-color);
    }
    .checkbox-group input[type='checkbox']:checked + label {
      background-color: var(--playground-active-control-bg);
      border-color: var(--playground-active-control-bg);
    }
    .checkbox-group label:hover {
      background-color: var(--playground-selected-bg);
    }
    .display-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 20px;
    }
    .preview-container {
      max-width: 500px;
    }
  `;

  @property({type: Array}) columns: string[][] = [];
  @property({type: Array}) allPaneIds: string[] = [];
  @property({type: Object}) displayOptions: ActionDisplayOptions =
    defaultActionDisplayOptions;

  private static readonly SAMPLE_ACTION: Action = {
    id: 123,
    parentId: 45,
    pid: 6789,
    ppid: 456,
    start: timestampFromMs(0),
    end: timestampFromMs(0),
    workingDirectory: '/usr/local/google/home/escholtz/workspace',
    args: ['/usr/bin/python3', 'myscript.py', '--arg1=value1', '--arg2=value2'],
    fileReadIds: [1, 2, 3],
    fileWriteIds: [4, 5],
    pipeReadFromActionId: 0,
    pipeWriteToActionId: 0,
    exitSignal: '',
    exitStatus: 0,
    isClone: false,
    startElapsedNanos: BigInt(1000000000),
    endElapsedNanos: BigInt(2500000000),
    runes: 50,
    depth: 2,
    ruleMatch: true,
    ruleName: 'Suspicious Operation',
  };

  private static readonly MAX_COLUMNS = 6;

  @state() hiddenPanes: string[] = [];
  @state() private draggedPane: DraggedPane | null = null;
  @state() private draggedColumn: DraggedColumn | null = null;
  @state() private dropTarget: {
    columnIndex: number;
    paneIndex: number | null;
  } | null = null;

  @queryAll('.pane-item') paneElements!: NodeListOf<HTMLElement>;
  private readonly paneElementById = new Map<string, HTMLElement>();

  override willUpdate(changedProperties: PropertyValues<this>) {
    if (
      changedProperties.has('columns') ||
      changedProperties.has('allPaneIds')
    ) {
      const displayedPanes = new Set(this.columns.flat());
      this.hiddenPanes = this.allPaneIds
        .filter((id) => !displayedPanes.has(id))
        .sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}));
    }
  }

  override updated(changedProperties: PropertyValues<this>) {
    super.updated(changedProperties);
    // After render, cache pane elements by ID. This avoids expensive
    // `querySelector` calls in `handleDragOver`, which fires frequently.
    this.paneElementById.clear();
    for (const el of this.paneElements) {
      if (el.dataset['paneId']) {
        this.paneElementById.set(el.dataset['paneId'], el);
      }
    }
  }

  private getPaneTitle(paneId: string): string {
    return paneId
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private handlePaneDragStart(
    e: DragEvent,
    paneId: string,
    fromColIdx: number,
    fromPaneIdx: number,
  ) {
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', paneId);
    // Defer updating `draggedPane` until the next macrotask. This allows the
    // browser to capture the drag image *before* we apply opacity styles via
    // the `pane-item-dragging` class, preventing the ghost image from being
    // semi-transparent.
    setTimeout(() => {
      this.draggedPane = {
        paneId,
        fromColumnIndex: fromColIdx,
        fromPaneIndex: fromPaneIdx,
      };
      this.draggedColumn = null;
    }, 0);
  }

  private handleColumnDragStart(e: DragEvent, fromColumnIndex: number) {
    // Hidden column cannot be dragged
    if (fromColumnIndex === HIDDEN_COLUMN_INDEX) {
      e.preventDefault();
      return;
    }
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', `column-${fromColumnIndex}`);
    // Defer updating `draggedColumn` until the next macrotask. This allows the
    // browser to capture the drag image *before* we apply opacity styles via
    // the `pane-item-dragging` class, preventing the ghost image from being
    // semi-transparent.
    setTimeout(() => {
      this.draggedColumn = {fromColumnIndex};
      this.draggedPane = null;
    }, 0);
  }

  private handleDragEnd() {
    this.draggedPane = null;
    this.draggedColumn = null;
    this.dropTarget = null;
  }

  private handleDragOver(
    e: DragEvent,
    targetColumnIndex: number,
    targetPaneIndex: number | null,
  ) {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';

    if (this.draggedPane) {
      let index = targetPaneIndex;
      const list =
        targetColumnIndex === HIDDEN_COLUMN_INDEX
          ? this.hiddenPanes
          : this.columns[targetColumnIndex];
      if (index === null) {
        // If not dragging over a specific item in a column (e.g., hovering in
        // an empty area), calculate the insertion index based on the mouse's
        // vertical position relative to the midpoints of other panes in the
        // list.
        index = list.length;
        for (let i = 0; i < list.length; i++) {
          const paneId = list[i];
          const paneElement = this.paneElementById.get(paneId);
          if (paneElement) {
            const rect = paneElement.getBoundingClientRect();
            if (e.clientY < rect.top + rect.height / 2) {
              index = i;
              break;
            }
          }
        }
      }

      if (
        this.dropTarget?.columnIndex !== targetColumnIndex ||
        this.dropTarget?.paneIndex !== index
      ) {
        this.dropTarget = {
          columnIndex: targetColumnIndex,
          paneIndex: index,
        };
      }
    } else if (this.draggedColumn) {
      if (targetColumnIndex === HIDDEN_COLUMN_INDEX) {
        e.dataTransfer!.dropEffect = 'none';
        this.dropTarget = null;
        return;
      }
      // When dragging a column, the drop target is always the column itself.
      if (this.dropTarget?.columnIndex !== targetColumnIndex) {
        this.dropTarget = {columnIndex: targetColumnIndex, paneIndex: null};
      }
    }
  }

  private handleDragLeaveColumn(e: DragEvent) {
    if (this.draggedColumn) return; // For column drags, leave doesn't clear target
    const currentTarget = e.currentTarget as Node;
    const relatedTarget = e.relatedTarget as Node;
    // This handler fires when the pointer leaves the column area or one of its
    // children. We only clear the drop target if `relatedTarget` (the element
    // being entered) is *not* a descendant of `currentTarget` (the column),
    // to prevent flickering when moving between pane items.
    if (relatedTarget && currentTarget.contains(relatedTarget)) {
      return;
    }
    this.dropTarget = null;
  }

  private handleDrop(e: DragEvent) {
    e.preventDefault();
    if (!this.dropTarget) {
      this.handleDragEnd();
      return;
    }

    if (this.draggedPane) {
      this.handlePaneDrop();
    } else if (this.draggedColumn) {
      this.handleColumnDrop();
    }
    this.handleDragEnd();
  }

  private handlePaneDrop() {
    if (!this.draggedPane || !this.dropTarget) return;
    const {fromColumnIndex, fromPaneIndex} = this.draggedPane;
    const {columnIndex: toColumnIndex, paneIndex: toPaneIndex} =
      this.dropTarget;

    if (
      fromColumnIndex === toColumnIndex &&
      toPaneIndex !== null &&
      (fromPaneIndex === toPaneIndex || fromPaneIndex === toPaneIndex - 1)
    ) {
      return;
    }

    const newColumns = this.columns.map((col) => [...col]);
    const newHiddenPanes = [...this.hiddenPanes];
    let pane: string;

    if (fromColumnIndex === HIDDEN_COLUMN_INDEX) {
      pane = newHiddenPanes.splice(fromPaneIndex, 1)[0];
    } else {
      pane = newColumns[fromColumnIndex].splice(fromPaneIndex, 1)[0];
    }

    const targetList =
      toColumnIndex === HIDDEN_COLUMN_INDEX
        ? newHiddenPanes
        : newColumns[toColumnIndex];
    let insertIndex = toPaneIndex === null ? targetList.length : toPaneIndex;
    // If moving an item downwards *within the same list*, the target index
    // must be adjusted because removing the item shifts the indices of items
    // below it.
    if (
      fromColumnIndex === toColumnIndex &&
      toPaneIndex !== null &&
      fromPaneIndex < toPaneIndex
    ) {
      insertIndex--;
    }
    targetList.splice(insertIndex, 0, pane);

    this.columns = newColumns;
    newHiddenPanes.sort((a, b) =>
      a.localeCompare(b, undefined, {sensitivity: 'base'}),
    );
    this.hiddenPanes = newHiddenPanes;
    this.notifyColumnsChanged();
  }

  private handleColumnDrop() {
    if (!this.draggedColumn || !this.dropTarget) return;
    const fromIndex = this.draggedColumn.fromColumnIndex;
    const toIndex = this.dropTarget.columnIndex;

    // Cannot drop on hidden column
    if (toIndex === HIDDEN_COLUMN_INDEX) return;

    if (fromIndex !== toIndex) {
      const newColumns = [...this.columns];
      const [movedColumn] = newColumns.splice(fromIndex, 1);
      newColumns.splice(toIndex, 0, movedColumn);
      this.columns = newColumns;
      this.notifyColumnsChanged();
    }
  }

  private notifyColumnsChanged() {
    this.dispatchEvent(
      new CustomEvent('columns-changed', {
        detail: {columns: this.columns},
        bubbles: true,
        composed: true,
      }),
    );
  }

  private addColumn() {
    if (this.columns.length < SettingsPane.MAX_COLUMNS) {
      this.columns = [...this.columns, []];
      this.notifyColumnsChanged();
    }
  }

  private removeColumn(colIdx: number) {
    if (this.columns.length <= 1 || colIdx === HIDDEN_COLUMN_INDEX) return;
    const newColumns = [...this.columns];
    const removedPanes = newColumns.splice(colIdx, 1).flat();
    this.hiddenPanes = [...this.hiddenPanes, ...removedPanes].sort((a, b) =>
      a.localeCompare(b, undefined, {sensitivity: 'base'}),
    );
    this.columns = newColumns;
    this.notifyColumnsChanged();
  }

  private removePane(paneId: string, colIdx: number, paneIdx: number) {
    if (colIdx === HIDDEN_COLUMN_INDEX) {
      return;
    }
    const newColumns = this.columns.map((col) => [...col]);
    newColumns[colIdx].splice(paneIdx, 1);
    this.columns = newColumns;
    this.hiddenPanes = [...this.hiddenPanes, paneId].sort((a, b) =>
      a.localeCompare(b, undefined, {sensitivity: 'base'}),
    );
    this.notifyColumnsChanged();
  }

  private resetLayout() {
    this.dispatchEvent(
      new CustomEvent('layout-reset', {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private renderPane(paneId: string, colIdx: number, paneIdx: number) {
    const isDragging =
      this.draggedPane?.paneId === paneId &&
      this.draggedPane?.fromColumnIndex === colIdx &&
      this.draggedPane?.fromPaneIndex === paneIdx;

    return html`
      <div
        class="pane-item ${isDragging ? 'pane-item-dragging' : ''}"
        data-pane-id=${paneId}
        draggable="true"
        @dragstart=${(e: DragEvent) => {
          this.handlePaneDragStart(e, paneId, colIdx, paneIdx);
        }}>
        <span>${this.getPaneTitle(paneId)}</span>
        ${when(
          colIdx !== HIDDEN_COLUMN_INDEX,
          () => html`
            <button
              class="remove-button"
              @click=${() => {
                this.removePane(paneId, colIdx, paneIdx);
              }}
              title="Remove pane">
              ×
            </button>
          `,
          () => html`<div class="remove-button-placeholder"></div>`,
        )}
      </div>
    `;
  }

  private shouldShowPlaceholder(
    colIdx: number,
    paneIdx: number | null,
    currentColumnPanes: string[],
  ): boolean {
    if (
      !this.draggedPane ||
      !this.dropTarget ||
      this.dropTarget.columnIndex !== colIdx ||
      this.dropTarget.paneIndex !== paneIdx
    ) {
      return false;
    }
    // If dragging and dropping in same column, don't show placeholder if
    // dropping the item in its current position or the position immediately
    // following it, as this results in no change to the order.
    if (this.draggedPane.fromColumnIndex === colIdx) {
      // don't show placeholder if target is item's current position or position after.
      if (
        paneIdx !== null &&
        (paneIdx === this.draggedPane.fromPaneIndex ||
          paneIdx === this.draggedPane.fromPaneIndex + 1)
      ) {
        return false;
      }
      // If dragging last item in column to end of same column.
      if (
        paneIdx === null &&
        this.draggedPane.fromPaneIndex === currentColumnPanes.length - 1
      ) {
        return false;
      }
    }
    return true;
  }

  private renderColumn(panes: string[], colIdx: number, title: string) {
    const isColumnTarget =
      this.draggedColumn &&
      this.dropTarget?.columnIndex === colIdx &&
      colIdx !== -1;
    const isPaneTarget =
      this.draggedPane && this.dropTarget?.columnIndex === colIdx;

    return html`
      <div
        class="column ${isPaneTarget ? 'drop-target-pane' : ''} ${
          isColumnTarget ? 'drop-target-column' : ''
        } ${colIdx === HIDDEN_COLUMN_INDEX ? 'hidden-column' : ''}"
        @dragover=${(e: DragEvent) => {
          this.handleDragOver(e, colIdx, null);
        }}
        @dragleave=${(e: DragEvent) => {
          this.handleDragLeaveColumn(e);
        }}
        @drop=${(e: DragEvent) => {
          this.handleDrop(e);
        }}>
        <div
          class="column-header"
          draggable=${colIdx !== HIDDEN_COLUMN_INDEX}
          @dragstart=${(e: DragEvent) => {
            this.handleColumnDragStart(e, colIdx);
          }}>
          <div class="column-title"> ${title} </div>
          ${when(
            colIdx !== HIDDEN_COLUMN_INDEX && this.columns.length > 1,
            () => html`
              <button
                class="remove-button"
                @click=${() => {
                  this.removeColumn(colIdx);
                }}
                title="Remove column">
                ×
              </button>
            `,
          )}
        </div>
        ${repeat(
          panes,
          (paneId) => paneId,
          (paneId, paneIdx) => html`
            <div
              @dragover=${(e: DragEvent) => {
                e.stopPropagation();
                this.handleDragOver(e, colIdx, paneIdx);
              }}>
              ${
                this.shouldShowPlaceholder(colIdx, paneIdx, panes)
                  ? html`<div class="pane-item-placeholder"></div>`
                  : nothing
              }
              ${this.renderPane(paneId, colIdx, paneIdx)}
            </div>
          `,
        )}
        ${
          this.shouldShowPlaceholder(colIdx, panes.length, panes)
            ? html`<div class="pane-item-placeholder"></div>`
            : nothing
        }
      </div>
    `;
  }

  private onDisplayOptionChange(e: Event) {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    const newOptions = {
      ...this.displayOptions,
      [target.name]: target.checked,
    };

    this.dispatchEvent(
      new CustomEvent('display-options-changed', {
        detail: {displayOptions: newOptions},
        bubbles: true,
        composed: true,
      }),
    );
  }

  private renderDisplayOptionCheckbox(
    name: keyof ActionDisplayOptions,
    label: string,
    checked: boolean,
  ) {
    return html`
      <input
        type="checkbox"
        id="settings-${name}"
        name=${name}
        .checked=${checked}
        @change=${this.onDisplayOptionChange} />
      <label for="settings-${name}">${label}</label>
    `;
  }

  private renderDisplayOptionControls() {
    return html`
      <div class="display-controls checkbox-group">
        ${this.renderDisplayOptionCheckbox(
          'pid',
          'Process ID',
          this.displayOptions.pid,
        )}
        ${this.renderDisplayOptionCheckbox(
          'ppid',
          'Parent Process ID',
          this.displayOptions.ppid,
        )}
        ${this.renderDisplayOptionCheckbox(
          'aid',
          'Action ID',
          this.displayOptions.aid,
        )}
        ${this.renderDisplayOptionCheckbox(
          'paid',
          'Parent Action ID',
          this.displayOptions.paid,
        )}
        ${this.renderDisplayOptionCheckbox(
          'startTime',
          'Start Time',
          this.displayOptions.startTime,
        )}
        ${this.renderDisplayOptionCheckbox(
          'endTime',
          'End Time',
          this.displayOptions.endTime,
        )}
        ${this.renderDisplayOptionCheckbox(
          'syscall',
          'Syscall',
          this.displayOptions.syscall,
        )}
        ${this.renderDisplayOptionCheckbox(
          'findings',
          'Findings',
          this.displayOptions.findings,
        )}
      </div>
    `;
  }

  override render() {
    return html`
      <h2>Settings</h2>
      <h3>Layout</h3>
      <p>Drag and drop panes or column headers to rearrange the layout.</p>
      <div class="controls">
        <button
          @click=${() => {
            this.addColumn();
          }}
          ?disabled=${this.columns.length >= SettingsPane.MAX_COLUMNS}>
          Add Column
        </button>
        <button
          @click=${() => {
            this.resetLayout();
          }}
          >Reset</button
        >
      </div>
      <div
        class="layout-editor"
        @dragend=${() => {
          this.handleDragEnd();
        }}>
        ${map(this.columns, (col, i) => this.renderColumn(col, i, `${i + 1}`))}
        ${this.renderColumn(this.hiddenPanes, HIDDEN_COLUMN_INDEX, 'Hidden')}
      </div>

      <h3>Display</h3>
      <p>Configure what process data is displayed.</p>
      ${this.renderDisplayOptionControls()}

      <div class="preview-container">
        <action-element
          .action=${SettingsPane.SAMPLE_ACTION}
          .displayOptions=${this.displayOptions}
          .isSelected=${false}></action-element>
      </div>

    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-pane': SettingsPane;
  }
}
