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

import {css, html, LitElement, TemplateResult} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import './action.js';
import {defaultActionDisplayOptions} from './action.js';
import {type Action, Graph} from './graph.js';

/**
 * A pane that displays pipeline of actions related to the selected action.
 */
@customElement('pipeline-pane')
export class PipelinePane extends LitElement {
  static override styles = css`
    .no-pipes {
      margin: 12px;
    }
    action-element {
      cursor: pointer;
    }
  `;
  @property({type: Object}) action: Action | null = null;
  @property({type: Object}) graph: Graph = new Graph();
  @property({type: Number}) selectedActionID = -1;
  @property({type: Object}) displayOptions = defaultActionDisplayOptions;

  override render() {
    if (!this.action) {
      return html`
        <div>
          <p class="no-pipes">None</p>
        </div>
      `;
    }

    const pipelineGroup = this.graph.actionIdToPipelineGroup.get(
      this.action.id,
    );
    if (!pipelineGroup) {
      return html`
        <div>
          <p class="no-pipes">None</p>
        </div>
      `;
    }

    const templates: TemplateResult[] = [];

    // Render PIDs based on pipe sequence order
    pipelineGroup.forEach((actions, index) => {
      // Add a pipe indicator/edge between groups.
      if (index > 0) {
        templates.push(html`<div class="pipe-separator">⬇</div>`);
      }
      for (const action of actions) {
        templates.push(
          html`<action-element
            .action=${action}
            .displayOptions=${this.displayOptions}
            .isSelected=${
              action.id === this.selectedActionID
            }></action-element>`,
        );
      }
    });

    return html`<div>${templates}</div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pipeline-pane': PipelinePane;
  }
}
