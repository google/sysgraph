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

import {css, html, LitElement} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {map} from 'lit/directives/map.js';
import './action.js';
import {defaultActionDisplayOptions} from './action.js';
import {Graph, Rule} from './graph.js';

/**
 * A pane that displays analysis results for a sysgraph.
 */
@customElement('analysis-pane')
export class AnalysisPane extends LitElement {
  static override styles = css`
    .rule:not(:last-child) {
      margin-bottom: 10px;
    }
    .rule-header {
      padding: 5px 0;
      background-color: var(--playground-header-bg-alt);
      line-height: 18px;
    }
    .rule-name {
      font-weight: bold;
    }
    .proportional {
      font-family: var(--playground-font-family);
      font-size: 12px;
      letter-spacing: 0px;
      line-height: 20px;
    }
    .no-findings {
      margin: 12px;
    }
  `;
  @property({type: Object}) graph: Graph = new Graph();
  @property({type: Number}) selectedActionID = -1;
  @property({type: Object}) displayOptions = defaultActionDisplayOptions;

  override render() {
    if (this.graph.analysisError) {
      return html` <div>${this.graph.analysisError}</div> `;
    }
    if (!this.graph.analysis || this.graph.analysis.rules.length === 0) {
      return html` <div class="no-findings">No findings.</div> `;
    }

    const ruleTemplates = map(
      this.graph.analysis.rules,
      (rule: Rule) => html`
        <div class="rule">
          <div class="rule-header proportional">
            <span class="rule-name">${rule.ruleName}</span>
            ${rule.description}
          </div>
          ${map(rule.matches, (match) => {
            if (match.processIds.length > 0) {
              const action = this.graph.actionsById.get(match.processIds[0]);
              if (action) {
                return html`<action-element
                  .action=${action}
                  .displayOptions=${this.displayOptions}
                  .isSelected=${
                    action.id === this.selectedActionID
                  }></action-element>`;
              }
            }
            return html``;
          })}
        </div>
      `,
    );

    return html` <div id="analysis-content">${ruleTemplates}</div> `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'analysis-pane': AnalysisPane;
  }
}
