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

import {css, html, LitElement, nothing, TemplateResult} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';
import {
  ActionDisplayOptions,
  ActionSelectedEventDetail,
  defaultActionDisplayOptions,
} from './action.js';
import {AnalysisPane} from './analysis_pane.js';
import './analysis_pane.js';
import './ancestry_pane.js';
import './arguments_pane.js';
import './file_list_pane.js';
import './demo.js';
import {type Action, Graph} from './graph.js';
import './histogram_pane.js';
import {type HistogramRowClickedEventDetail} from './histogram_pane.js';
import {PaneView} from './pane.js';
import './pipeline_pane.js';
import {ProcessListPane} from './process_list_pane.js';
import {ProcessTreePane} from './process_tree_pane.js';
import './process_list_pane.js';
import './process_tree_pane.js';
import './search_pane.js';
import {SearchPane} from './search_pane.js';
import {
  DEFAULT_COLUMNS,
  loadLayoutSettings,
  PaneId,
  saveLayoutSettings,
} from './settings.js';
import './settings_pane.js';
import './split_view.js';

const HORIZONTAL_SPLIT_MIN_SIZE = 250;
const VERTICAL_SPLIT_MIN_SIZE = 120;

/**
 * Enum for header section identifiers.
 */
export enum HeaderSection {
  NAV = 'nav',
  SETTINGS = 'settings',
}

/**
 * Interface for header configuration.
 */
export interface HeaderConfig {
  enabled: boolean;
  sections: HeaderSection[];
}

/**
 * The header configuration for the playground app.
 */
export const HEADER_CONFIG: HeaderConfig = {
  enabled: true,
  sections: [HeaderSection.NAV, HeaderSection.SETTINGS],
};

/**
 * The root component for the Sysgraph Playground application.
 *
 * This component manages the overall layout and state of the application,
 * including loading status, error messages, and the main sysgraph data.
 * It orchestrates the various sub-panes (e.g., process list, Gemini, ancestry,
 * pipeline, file lists, arguments, and analysis) within a split-view layout,
 * passing down the graph data and managing the currently selected action.
 */
@customElement('playground-app')
export class PlaygroundApp extends LitElement {
  @property({type: Boolean}) loading = true;
  @property({type: String}) errorMessage = '';
  @property({type: Object}) graph: Graph = new Graph();
  @property({type: Object}) headerConfig: HeaderConfig = HEADER_CONFIG;
  @state() columns: PaneId[][] = loadLayoutSettings().columns;

  @state() selectedAction: Action | null = null;
  @state() selectedActionID = -1;
  @state() scrollToActionId = -1;
  @state() actionDisplayOptions = loadLayoutSettings().actionDisplayOptions;
  @state() private histogramShowBasename = false;
  @state() private histogramCount = 0;
  @state() private matchCase = false;
  @state() private useRegex = false;
  @state() showSettings = false;

  private toggleSettings() {
    if (this.showSettings) {
      const newColumns = this.columns.filter((col) => col.length > 0);
      if (newColumns.length === 0) {
        this.columns = DEFAULT_COLUMNS;
      } else {
        this.columns = newColumns;
      }
      saveLayoutSettings(this.columns, this.actionDisplayOptions);
    }
    this.showSettings = !this.showSettings;
  }

  private onHistogramShowBasenameChange(e: Event) {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    this.histogramShowBasename = target.checked;
  }

  @query('#processes') processListPane!: ProcessListPane;
  @query('#process-tree') processTreePane!: ProcessTreePane;
  @query('#analysis') analysisPane!: AnalysisPane;
  @query('#search') searchPane!: SearchPane;
  @query('#search-pane-view') searchPaneView!: PaneView;

  private onColumnsChanged(e: CustomEvent<{columns: PaneId[][]}>) {
    this.columns = e.detail.columns;
    saveLayoutSettings(this.columns, this.actionDisplayOptions);
  }

  private onDisplayOptionsChanged(
    e: CustomEvent<{displayOptions: ActionDisplayOptions}>,
  ) {
    this.actionDisplayOptions = e.detail.displayOptions;
    saveLayoutSettings(this.columns, this.actionDisplayOptions);
  }

  private onLayoutReset() {
    this.columns = DEFAULT_COLUMNS;
    this.actionDisplayOptions = defaultActionDisplayOptions;
    saveLayoutSettings(this.columns, this.actionDisplayOptions);
  }

  static override styles = css`
    :host {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .header {
      display: flex;
      align-items: center;
      margin: 5px;
      flex-shrink: 0;
    }

    .header-nav {
      flex: 1;
      display: flex;
      align-items: center;
    }
    .header-version {
      flex: 1;
      text-align: right;
    }

    .nav-link {
      margin-right: 10px;
      text-decoration: none;
      color: var(--playground-text-color);
    }

    .nav-link:hover {
      text-decoration: underline;
    }

    .main {
      display: flex;
      flex: 1;
      border-top: 1px solid var(--playground-border-color-strong);
      overflow: hidden;
      flex-direction: row;
    }

    .error-container {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;
      color: var(--playground-error-text-color);
      padding: 20px;
    }

    .spinner-container {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;
    }
    .spinner {
      border: 8px solid var(--playground-spinner-border);
      border-top: 8px solid var(--playground-active-control-bg);
      border-radius: 50%;
      width: 16px;
      height: 16px;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      0% {
        transform: rotate(0deg);
      }
      100% {
        transform: rotate(360deg);
      }
    }

    .proportional {
      font-family: var(--playground-font-family);
      font-size: 12px;
      letter-spacing: 0px;
      line-height: 20px;
    }
    .radio-group input[type='radio'],
    .checkbox-group input[type='checkbox'] {
      display: none;
    }
    .radio-group label {
      display: inline-block;
      padding: 1px 5px;
      margin: 0 1px;
      cursor: pointer;
      border-radius: 4px;
      border: 1px solid var(--playground-border-color);
    }
    .checkbox-group label {
      display: inline-block;
      padding: 1px 5px;
      margin: 0 1px;
      cursor: pointer;
      border-radius: 4px;
    }
    .radio-group input[type='radio']:checked + label,
    .checkbox-group input[type='checkbox']:checked + label {
      background-color: var(--playground-active-control-bg);
      border-color: var(--playground-active-control-bg);
    }
    .radio-group label:hover,
    .checkbox-group label:hover {
      background-color: var(--playground-selected-bg);
    }

    .item-count {
      min-width: 7ch;
      text-align: right;
      display: inline-block;
      padding-left: 4px;
    }
    #search-count {
      min-width: 8ch;
    }

    .hidden {
      display: none;
    }
    .control-button {
      display: inline-block;
      padding: 2px 6px;
      cursor: pointer;
      border-radius: 4px;
      border: none;
      background: none;
      margin: 0 1px;
      min-width: 28px;
      text-align: center;
      font-family: var(--playground-font-family);
      font-size: 12px;
      line-height: 20px;
    }
    .control-button.selected {
      background-color: var(--playground-active-control-bg);
    }
    .control-button:hover {
      background-color: var(--playground-selected-bg);
    }
  `;

  private handleProcessActionSelected(
    e: CustomEvent<ActionSelectedEventDetail>,
  ) {
    const action = e.detail.action;
    if (!action || action.id === this.selectedActionID) {
      return;
    }
    this.selectAction(action);

    if (e.target === this.processListPane) {
      this.processTreePane?.show(action.id);
    } else if (e.target === this.processTreePane) {
      this.processListPane?.show(action.id);
    }
  }

  private handleActionSelected(e: CustomEvent<ActionSelectedEventDetail>) {
    const action = e.detail.action;
    if (!action || action.id === this.selectedActionID) {
      return;
    }
    this.selectAction(action);
    this.scrollToActionId = action.id;
  }

  private readonly onHistogramRowClicked = (
    e: CustomEvent<HistogramRowClickedEventDetail>,
  ) => {
    if (!this.searchPane || !this.searchPaneView) {
      return;
    }
    this.searchPane.setSearchQuery(e.detail.query);
    if (!this.searchPaneView.open) {
      this.searchPaneView.toggle();
    }
  };

  applyActionIdFromUrl(actionIdString: string) {
    const actionId = Number(actionIdString);
    if (isNaN(actionId)) {
      return;
    }
    this.scrollToActionId = actionId;
    const action = this.graph.actionsById.get(actionId);
    if (!action) {
      return;
    }
    this.selectAction(action);
  }

  private selectAction(action: Action) {
    this.selectedAction = action;
    this.selectedActionID = action.id;

    // Update URL
    const url = new URL(window.location.href);
    url.searchParams.set('aid', action.id.toString());
    window.history.replaceState({}, '', url.toString());
  }

  private onMatchCaseClick(e: Event) {
    e.stopPropagation();
    this.matchCase = !this.matchCase;
  }
  private onUseRegexClick(e: Event) {
    e.stopPropagation();
    this.useRegex = !this.useRegex;
  }

  private renderSearchPaneView() {
    return html`
      <pane-view id="search-pane-view" pane-title="Search" open>
        <div slot="header" class="search-header-controls">
          <button
            id="pg-match-case-button"
            title="Match Case"
            class=${classMap({
              'control-button': true,
              'selected': this.matchCase,
            })}
            @click=${this.onMatchCaseClick}
            >Aa</button
          >
          <button
            id="pg-use-regex-button"
            title="Use Regex"
            class=${classMap({
              'control-button': true,
              'selected': this.useRegex,
            })}
            @click=${this.onUseRegexClick}
            >.*</button
          >
        </div>
        <span slot="header" id="search-count" class="item-count">
          ${
            this.searchPane?.searchController.invalid
              ? 'Bad Regex'
              : (this.searchPane?.searchStatusString ?? '0')
          }
        </span>
        <search-pane
          id="search"
          .graph=${this.graph}
          .matchCase=${this.matchCase}
          .useRegex=${this.useRegex}
          @action-selected=${this.handleActionSelected}
          @search-updated=${() => {
            this.requestUpdate();
          }}></search-pane>
      </pane-view>
    `;
  }

  private renderProcessListPaneView() {
    return html`
      <pane-view pane-title="Process List" open>
        <span slot="header" class="item-count">
          ${this.graph.actions.length.toLocaleString()}
        </span>
        <process-list-pane
          id="processes"
          @action-selected=${this.handleProcessActionSelected}
          .graph=${this.graph}
          .selectedActionID=${this.selectedActionID}
          .scrollToActionId=${this.scrollToActionId}
          .displayOptions=${this.actionDisplayOptions}></process-list-pane>
      </pane-view>
    `;
  }

  private renderProcessTreePaneView() {
    return html`
      <pane-view pane-title="Process Tree" open>
        <span slot="header" class="item-count">
          ${this.graph.actions.length.toLocaleString()}
        </span>
        <process-tree-pane
          id="process-tree"
          @action-selected=${this.handleProcessActionSelected}
          .graph=${this.graph}
          .selectedActionID=${this.selectedActionID}
          .scrollToActionId=${this.scrollToActionId}
          .displayOptions=${this.actionDisplayOptions}></process-tree-pane>
      </pane-view>
    `;
  }

  private renderAncestryPaneView() {
    return html`
      <pane-view pane-title="Ancestry" open>
        <span slot="header" class="item-count">
          ${
            this.selectedAction
              ? this.graph.ancestors(this.selectedAction).length
              : 0
          }
        </span>
        <ancestry-pane
          id="ancestry"
          .actions=${
            this.selectedAction ? this.graph.ancestors(this.selectedAction) : []
          }
          .selectedActionID=${this.selectedActionID}
          .displayOptions=${this.actionDisplayOptions}></ancestry-pane>
      </pane-view>
    `;
  }

  private renderPipelinePaneView(pipelineCount: number) {
    return html`
      <pane-view pane-title="Pipeline" open>
        <span slot="header" class="item-count"> ${pipelineCount} </span>
        <pipeline-pane
          id="pipeline"
          @action-selected=${this.handleActionSelected}
          .graph=${this.graph}
          .action=${this.selectedAction}
          .selectedActionID=${this.selectedActionID}
          .displayOptions=${this.actionDisplayOptions}></pipeline-pane>
      </pane-view>
    `;
  }

  private renderInputsPaneView() {
    return html`
      <pane-view pane-title="Inputs" open>
        <span slot="header" class="item-count">
          ${this.selectedAction?.fileReadIds?.length ?? 0}
        </span>
        <file-list-pane
          id="inputs"
          .files=${
            this.selectedAction
              ? this.selectedAction.fileReadIds.map(
                  (id) => this.graph.files[id],
                )
              : []
          }></file-list-pane>
      </pane-view>
    `;
  }

  private renderOutputsPaneView() {
    return html`
      <pane-view pane-title="Outputs" open>
        <span slot="header" class="item-count">
          ${this.selectedAction?.fileWriteIds?.length ?? 0}
        </span>
        <file-list-pane
          id="outputs"
          .files=${
            this.selectedAction
              ? this.selectedAction.fileWriteIds.map(
                  (id) => this.graph.files[id],
                )
              : []
          }></file-list-pane>
      </pane-view>
    `;
  }

  private renderArgumentsPaneView() {
    return html`
      <pane-view pane-title="Arguments">
        <span slot="header" class="item-count">
          ${this.selectedAction?.args?.length ?? 0}
        </span>
        <arguments-pane
          id="arguments"
          .args=${this.selectedAction?.args || []}></arguments-pane>
      </pane-view>
    `;
  }

  private renderAnalysisPaneView(analysisCount: string) {
    return html`
      <pane-view pane-title="Analysis" open>
        <span slot="header" class="item-count"> ${analysisCount} </span>
        <analysis-pane
          id="analysis"
          @action-selected=${this.handleActionSelected}
          .graph=${this.graph}
          .selectedActionID=${this.selectedActionID}
          .displayOptions=${this.actionDisplayOptions}></analysis-pane>
      </pane-view>
    `;
  }

  private renderHistogramPaneView() {
    return html`
      <pane-view pane-title="Argv[0] Histogram" open>
        <div
          slot="header"
          class="checkbox-group proportional"
          @click=${(e: Event) => {
            e.stopPropagation();
          }}>
          <input
            type="checkbox"
            id="toggle-basename"
            ?checked=${this.histogramShowBasename}
            @change=${this.onHistogramShowBasenameChange} />
          <label for="toggle-basename">Basename</label>
        </div>
        <span slot="header" class="item-count"> ${this.histogramCount} </span>
        <histogram-pane
          id="histogram"
          .graph=${this.graph}
          .showBasename=${this.histogramShowBasename}
          @count-changed=${(e: CustomEvent) => {
            this.histogramCount = e.detail.count;
          }}
          @histogram-row-clicked=${this.onHistogramRowClicked}></histogram-pane>
      </pane-view>
    `;
  }

  private renderHeader() {
    if (!this.headerConfig.enabled) {
      return nothing;
    }

    const renderSection = (section: HeaderSection) => {
      switch (section) {
        case HeaderSection.NAV:
          return html`<div class="header-nav">
            <a class="nav-link" href="/">Sysgraph Playground</a>
          </div>`;
        case HeaderSection.SETTINGS:
          return html`<div class="header-version">
            <button
              class=${classMap({
                'control-button': true,
                'selected': this.showSettings,
              })}
              @click=${this.toggleSettings}
              >Settings</button
            >
          </div>`;
        default:
          return nothing;
      }
    };

    return html`
      <div class="header">
        ${this.headerConfig.sections.map((section) => renderSection(section))}
      </div>
    `;
  }

  private renderPane(
    paneId: PaneId,
    analysisCount: string,
    pipelineCount: number,
  ): TemplateResult {
    switch (paneId) {
      case PaneId.SEARCH:
        return this.renderSearchPaneView();
      case PaneId.PROCESS_LIST:
        return this.renderProcessListPaneView();
      case PaneId.PROCESS_TREE:
        return this.renderProcessTreePaneView();
      case PaneId.ANCESTRY:
        return this.renderAncestryPaneView();
      case PaneId.PIPELINE:
        return this.renderPipelinePaneView(pipelineCount);
      case PaneId.INPUTS:
        return this.renderInputsPaneView();
      case PaneId.OUTPUTS:
        return this.renderOutputsPaneView();
      case PaneId.ARGUMENTS:
        return this.renderArgumentsPaneView();
      case PaneId.ANALYSIS:
        return this.renderAnalysisPaneView(analysisCount);
      case PaneId.HISTOGRAM:
        return this.renderHistogramPaneView();
      default:
        return html``;
    }
  }

  override render() {
    let pipelineCount = 0;
    if (this.selectedAction) {
      const pipelineGroup = this.graph.actionIdToPipelineGroup.get(
        this.selectedAction.id,
      );
      if (pipelineGroup) {
        pipelineCount = pipelineGroup.reduce(
          (count, actions) => count + actions.length,
          0,
        );
      }
    }

    let analysisCount = '0';
    if (this.graph.analysis) {
      let numRules = 0;
      let numMatches = 0;
      if (this.graph.analysis) {
        numRules = this.graph.analysis.rules.length;
        for (const rule of this.graph.analysis.rules) {
          numMatches += rule.matches.length;
        }
      }
      if (numRules > 0) {
        analysisCount = `(${numRules} rules, ${numMatches} matches)`;
      }
    } else if (this.graph.analysisError) {
      analysisCount = '';
    }

    return html`
      ${this.renderHeader()}
      <div
        id="loading-spinner"
        class=${classMap({
          'spinner-container': true,
          'hidden': !this.loading,
        })}>
        <div class="spinner"></div>
      </div>
      <div
        id="error-message"
        class=${classMap({
          'error-container': true,
          'hidden': !this.errorMessage,
        })}
        >${this.errorMessage}</div
      >
      <div
        class=${classMap({
          'main': true,
          'hidden': this.loading || !!this.errorMessage,
        })}
        id="main">
        <settings-pane
          class=${classMap({'hidden': !this.showSettings})}
          .columns=${this.columns}
          .allPaneIds=${Object.values(PaneId)}
          .displayOptions=${this.actionDisplayOptions}
          @columns-changed=${this.onColumnsChanged}
          @display-options-changed=${this.onDisplayOptionsChanged}
          @layout-reset=${this.onLayoutReset}>
        </settings-pane>
        <split-view
          class=${classMap({'hidden': this.showSettings})}
          direction="horizontal"
          .minSize=${HORIZONTAL_SPLIT_MIN_SIZE}>
          ${this.columns.map((column) => {
            return html`
              <split-view
                direction="vertical"
                .minSize=${VERTICAL_SPLIT_MIN_SIZE}>
                ${column.map((paneId) =>
                  this.renderPane(paneId, analysisCount, pipelineCount),
                )}
              </split-view>
            `;
          })}
        </split-view>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'playground-app': PlaygroundApp;
  }
}
