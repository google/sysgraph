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

import {css, html, LitElement, nothing} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';
import {createRef, ref} from 'lit/directives/ref.js';
import {styleMap} from 'lit/directives/style-map.js';
import {PaneView, type PaneToggleEventDetail} from './pane.js';

const HEADER_SIZE = 28;

/** Epsilon used to prevent sub-pixel rounding jitter when comparing sizes. */
const JITTER_EPSILON = 0.5;

declare global {
  interface HTMLElementEventMap {
    'pane-toggle': CustomEvent<PaneToggleEventDetail>;
  }
}

/**
 * SplitView: A flexible, resizable split view container.
 * * Core Features:
 * - Proportional Sizing: Children resize based on percentages.
 * - Constraint Solving: Respects 'minSize' for open panes and fixed header size for closed panes.
 * - Drag & Drop: Allows resizing via gutters (sizers).
 * - Scroll Fallback: If the container is too small to fit all min-sized panes, it enables scrolling.
 */
@customElement('split-view')
export class SplitView extends LitElement {
  @property({type: String, reflect: true}) direction = 'horizontal';
  @property({type: Number}) minSize = 100;
  @property({
    type: Boolean,
    reflect: true,
    attribute: 'is-resizing',
  })
  isResizing = false;

  @state() private sizes: number[] = [];
  @state() private minContainerSize?: string;
  @state() private draggingIndex = -1;

  private readonly savedSizes = new Map<number, number>();
  private readonly containerRef = createRef<HTMLDivElement>();
  private readonly resizeObserver: ResizeObserver;
  private rafId?: number;
  private lastPointerPos = 0;
  private startPos = 0;
  private totalSize = 0;
  private startSizes: number[] = [];

  static override styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      overflow: auto;
    }

    .container {
      display: flex;
      width: 100%;
      height: 100%;
    }

    :host([direction='vertical']) .container {
      flex-direction: column;
    }

    .panel-wrapper {
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      min-height: 28px; /* Protect headers from being crushed visually */
    }

    /* Disable transitions during drag for high-performance updates */
    :host([is-resizing]) .panel-wrapper {
      transition: none !important;
    }

    /* Gutter: The resize handle. */
    /* It has flex: 0 0 0 to take up ZERO logical space in the flex layout. */
    /* We draw the visible border and hit area using overflow: visible. */
    /* This prevents calculation errors where (100% panels + 5px gutter) > 100% container. */
    .gutter {
      flex: 0 0 0;
      position: relative;
      z-index: 50;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: visible;
      touch-action: none;
    }

    /* The 1px visible divider line */
    .gutter::before {
      content: '';
      position: absolute;
      background-color: var(--playground-split-view-gutter-color);
      z-index: 1;
    }

    /* The 5px invisible hit area for easier grabbing */
    .gutter::after {
      content: '';
      position: absolute;
      background-color: var(--playground-split-view-hover-color);
      opacity: 0;
      z-index: 2;
      transition: opacity 0.3s linear;
      pointer-events: auto;
    }

    :host(:not([is-resizing])) .gutter:hover::after,
    .gutter.dragging::after {
      opacity: 1;
    }

    /* Interaction States */
    .gutter.disabled {
      pointer-events: none;
    }
    .gutter.disabled::after {
      display: none;
    }

    /* Horizontal Layout Gutter Positioning */
    :host(:not([direction='vertical'])) .gutter {
      width: 0;
    }
    :host(:not([direction='vertical'])) .gutter::before {
      width: 1px;
      height: 100%;
      left: 0;
    }
    :host(:not([direction='vertical'])) .gutter::after {
      width: 5px;
      height: 100%;
      left: -2px;
      cursor: col-resize;
    }

    /* Vertical Layout Gutter Positioning */
    :host([direction='vertical']) .gutter {
      height: 0;
    }
    :host([direction='vertical']) .gutter::before {
      height: 1px;
      width: 100%;
      top: 0;
    }
    :host([direction='vertical']) .gutter::after {
      height: 5px;
      width: 100%;
      top: -2px;
      cursor: row-resize;
    }

    /* Drag Mask: A full-screen invisible overlay displayed ONLY during dragging. */
    /* It has z-index 9999 to capture all pointer events, ensuring the cursor */
    /* doesn't flicker or change if the mouse moves over other elements (like headers). */
    .drag-mask {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 9999;
      display: none;
    }
    :host([is-resizing]) .drag-mask {
      display: block;
    }
    :host([direction='horizontal']) .drag-mask {
      cursor: col-resize;
    }
    :host([direction='vertical']) .drag-mask {
      cursor: row-resize;
    }
  `;

  constructor() {
    super();
    this.resizeObserver = new ResizeObserver((entries) => {
      this.throttle(() => {
        this.handleResize(entries);
      });
    });
  }

  override connectedCallback() {
    super.connectedCallback();
    this.resizeObserver.observe(this);
    this.addEventListener('pane-toggle', this.handlePaneToggle);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.resizeObserver.disconnect();
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.removeEventListener('pane-toggle', this.handlePaneToggle);
    this.cleanupDragListeners();
  }

  private get container() {
    return this.containerRef.value;
  }

  // --- Internal Logic Helpers ---

  /** Throttles high-frequency updates (drag/resize) to the animation frame rate */
  private throttle(callback: () => void) {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(() => {
      this.rafId = undefined;
      callback();
    });
  }

  private cleanupDragListeners() {
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
  }

  private isPanelOpen(index: number) {
    const child = this.children[index];
    if (!child) return false;
    return child instanceof PaneView ? child.open : true;
  }

  private getOpenIndices() {
    return Array.from(this.children, (_, i) =>
      this.isPanelOpen(i) ? i : -1,
    ).filter((i) => i !== -1);
  }

  /** Returns current size (if closed) or proportional min size (if open) */
  private getMinSize(index: number, totalSize: number) {
    if (!this.isPanelOpen(index)) return this.sizes[index];
    return (this.minSize / totalSize) * 100;
  }

  /** Checks if any subsequent panes are open (used for gutter visibility logic) */
  private hasOpenPanesAfter(index: number) {
    for (let j = index + 1; j < this.sizes.length; j++) {
      if (this.isPanelOpen(j)) return true;
    }
    return false;
  }

  /**
   * Calculates the required container size based on:
   * (Number of Open Panes * MinSize) + (Number of Closed Panes * HeaderSize)
   * If the viewport is smaller than this sum, scrolling is enabled via minContainerSize.
   */
  private calculateEffectiveSize(viewportSize: number) {
    const openIndices = this.getOpenIndices();
    const closedCount = this.sizes.length - openIndices.length;
    const totalMinPx =
      openIndices.length * this.minSize + closedCount * HEADER_SIZE;

    if (viewportSize < totalMinPx - JITTER_EPSILON) {
      this.minContainerSize = `${totalMinPx}px`;
      return totalMinPx;
    } else {
      this.minContainerSize = undefined;
      return viewportSize;
    }
  }

  /**
   * Constraint Solver:
   * This function ensures that:
   * 1. Closed panes are exactly HEADER_SIZE pixels (converted to %).
   * 2. Open panes respect minSize (converted to %).
   * 3. Available space is distributed proportionally among open panes.
   * 4. The final sum is exactly 100%.
   */
  private validateAndFixSizes(sizes: number[], totalSize: number) {
    const newSizes = [...sizes];
    const openIndices: number[] = [];

    // Step 1: Assign fixed percentages to closed panes
    newSizes.forEach((_, i) => {
      if (this.isPanelOpen(i)) {
        openIndices.push(i);
      } else {
        const size = (HEADER_SIZE / totalSize) * 100;
        newSizes[i] = size;
      }
    });

    if (openIndices.length === 0) return newSizes;

    // Step 2: Calculate remaining space for open panes
    const availablePixels =
      totalSize - (newSizes.length - openIndices.length) * HEADER_SIZE;
    let totalOpenWeight = openIndices.reduce((sum, i) => sum + newSizes[i], 0);

    // Handle edge case where weights are 0 (e.g., initial load)
    if (totalOpenWeight === 0) {
      openIndices.forEach((i) => {
        newSizes[i] = 1;
      });
      totalOpenWeight = openIndices.length;
    }

    // Step 3: Iterative Constraint Solving
    // We attempt to distribute space proportionally. If any pane drops below minSize,
    // we lock it to minSize and redistribute the remaining space among the others.
    const pixels: {[key: number]: number} = {};
    let remainingPixels = availablePixels;
    let remainingWeight = totalOpenWeight;
    const unresolved = [...openIndices];
    let changed = true;

    while (changed && unresolved.length > 0) {
      changed = false;
      for (let k = 0; k < unresolved.length; k++) {
        const idx = unresolved[k];
        const weight = newSizes[idx];
        const share = (weight / remainingWeight) * remainingPixels;

        // Check constraint
        if (share < this.minSize - 0.1) {
          pixels[idx] = this.minSize;
          remainingPixels -= this.minSize;
          remainingWeight -= weight;
          unresolved.splice(k, 1);
          changed = true;
          k--;
        }
      }
    }

    // Assign remaining space to valid (unresolved) panes
    unresolved.forEach((idx) => {
      const weight = newSizes[idx];
      const share =
        remainingWeight > 0 ? (weight / remainingWeight) * remainingPixels : 0;
      pixels[idx] = share;
    });

    // Convert back to percentages
    openIndices.forEach((i) => {
      newSizes[i] = (pixels[i] / totalSize) * 100;
    });

    // Step 4: Rounding Fix
    // Add any tiny rounding error to the last open pane to ensure exact 100% sum
    const currentSum = newSizes.reduce((a, b) => a + b, 0);
    const lastIndex = openIndices[openIndices.length - 1];
    newSizes[lastIndex] += 100 - currentSum;

    return newSizes;
  }

  /**
   * Distributes a space 'deficit' (shrinkage required) among a list of indices.
   * It respects minSize, only taking what is available above the minimum.
   */
  private distributeDeficit(
    sizes: number[],
    indices: number[],
    amountNeeded: number,
    totalSize: number,
  ) {
    let remaining = amountNeeded;
    for (const i of indices) {
      if (remaining <= 0.0001) break;
      if (!this.isPanelOpen(i)) continue;

      const available = sizes[i] - this.getMinSize(i, totalSize);
      const take = Math.min(available, remaining);
      sizes[i] -= take;
      remaining -= take;
    }
    return amountNeeded - remaining;
  }

  // --- Event Handlers ---

  private readonly handlePaneToggle = (
    e: CustomEvent<PaneToggleEventDetail>,
  ) => {
    const index = Array.from(this.children).indexOf(e.detail.element);
    if (index === -1) return;

    const isOpen = e.detail.open;
    const containerEl = this.container;
    if (!containerEl) return;
    // Use current container offset for immediate percentage calculations
    const totalSize =
      this.direction === 'horizontal'
        ? containerEl.offsetWidth
        : containerEl.offsetHeight;

    const newSizes = [...this.sizes];

    if (!isOpen) {
      // === CLOSING ===
      // Collapse to header size, save previous size state
      const collapsedSizePx = HEADER_SIZE;
      const collapsedPercent = (collapsedSizePx / totalSize) * 100;

      this.savedSizes.set(index, newSizes[index]);

      // Free up space
      const releasedSpace = newSizes[index] - collapsedPercent;
      newSizes[index] = collapsedPercent;

      // Donate released space to neighbors (try below, then above)
      const openIndices = this.getOpenIndices().filter((i) => i !== index);
      if (openIndices.length > 0) {
        // Simplified strategy: give to the last open pane
        newSizes[openIndices[openIndices.length - 1]] += releasedSpace;
      }
    } else {
      // === OPENING ===
      const minPercent = (this.minSize / totalSize) * 100;

      // Determine target size: saved value or minSize
      let targetSize = this.savedSizes.get(index);
      if (targetSize === undefined || targetSize < minPercent) {
        targetSize = minPercent;
      }

      // Logic: If opening the ONLY pane, maximize it
      const openIndices = this.getOpenIndices();
      if (openIndices.length === 1 && openIndices[0] === index) {
        const othersSize = newSizes.reduce(
          (sum, size, i) => (i === index ? sum : sum + size),
          0,
        );
        targetSize = 100 - othersSize;
      }

      let needed = targetSize - newSizes[index];

      // 1. Take unallocated space (if coming from all-closed state)
      const currentTotal = newSizes.reduce((sum, s) => sum + s, 0);
      const unallocated = 100 - currentTotal;
      if (unallocated > 0.01) {
        const take = Math.min(needed, unallocated);
        newSizes[index] += take;
        needed -= take;
      }

      // 2. Steal space from neighbors if needed
      if (needed > 0.01) {
        const indicesBelow: number[] = [];
        for (let i = newSizes.length - 1; i > index; i--) indicesBelow.push(i);

        const indicesAbove: number[] = [];
        for (let i = index - 1; i >= 0; i--) indicesAbove.push(i);

        // Try taking from below first, then above
        let gathered = this.distributeDeficit(
          newSizes,
          indicesBelow,
          needed,
          totalSize,
        );
        if (gathered < needed) {
          gathered += this.distributeDeficit(
            newSizes,
            indicesAbove,
            needed - gathered,
            totalSize,
          );
        }

        newSizes[index] += gathered;
      }
    }

    // Final check: Recalculate container constraints based on new state
    const viewportSize =
      this.direction === 'horizontal'
        ? containerEl.offsetWidth
        : containerEl.offsetHeight;
    const newEffectiveSize = this.calculateEffectiveSize(viewportSize);

    this.sizes = this.validateAndFixSizes(newSizes, newEffectiveSize);
  };

  private readonly handleResize = (entries: ResizeObserverEntry[]) => {
    if (!this.sizes.length) return;
    const rect = entries[0].contentRect;
    const size = this.direction === 'horizontal' ? rect.width : rect.height;
    if (size <= 0) return;

    // On resize, we recalculate effective size (checking for scrollbar need)
    const effectiveSize = this.calculateEffectiveSize(size);
    // Then redistribute percentages based on this new effective size
    this.sizes = this.validateAndFixSizes([...this.sizes], effectiveSize);
  };

  protected handleSlotChange() {
    // Initialize internal state when children are added/removed
    const children = Array.from(this.children).filter(
      (n) => n.nodeType === Node.ELEMENT_NODE,
    );
    if (children.length === 0) return;

    if (children.length !== this.sizes.length) {
      const percent = 100 / children.length;
      this.sizes = new Array(children.length).fill(percent);
    }

    children.forEach((node, index) => {
      node.setAttribute('slot', `panel-${index}`);
    });
  }

  // --- Drag Handlers (using Pointer Events for Touch/Mouse) ---

  protected startDrag(e: PointerEvent, index: number) {
    e.preventDefault();
    this.isResizing = true;
    this.draggingIndex = index;

    const container = this.container;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    this.totalSize = this.direction === 'horizontal' ? rect.width : rect.height;

    const clientPos = this.direction === 'horizontal' ? e.clientX : e.clientY;
    this.startPos = clientPos;
    this.lastPointerPos = clientPos;
    this.startSizes = [...this.sizes];

    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);

    document.body.style.userSelect = 'none';
  }

  private readonly handlePointerMove = (e: PointerEvent) => {
    if (this.draggingIndex === -1) return;
    this.lastPointerPos =
      this.direction === 'horizontal' ? e.clientX : e.clientY;
    // Throttled update to prevent layout thrashing
    this.throttle(() => {
      this.performDragUpdate();
    });
  };

  private performDragUpdate() {
    if (this.draggingIndex === -1) return;

    const deltaPx = this.lastPointerPos - this.startPos;
    const deltaPercent = (deltaPx / this.totalSize) * 100;

    const newSizes = [...this.startSizes];
    const index = this.draggingIndex;

    const findGrowTarget = (start: number, step: number) => {
      for (let i = start; i >= 0 && i < newSizes.length; i += step) {
        if (this.isPanelOpen(i)) return i;
      }
      return -1;
    };

    // Drag logic: Grow/shrink neighboring panes to absorb the deficit.
    if (deltaPercent > 0) {
      // Dragging Right/Down: Expand Left, Shrink Right
      const growIdx = findGrowTarget(index, -1);
      if (growIdx !== -1) {
        const indicesRight: number[] = [];
        for (let i = index + 1; i < newSizes.length; i++) indicesRight.push(i);

        const shrunk = this.distributeDeficit(
          newSizes,
          indicesRight,
          deltaPercent,
          this.totalSize,
        );
        newSizes[growIdx] += shrunk;
      }
    } else {
      // Dragging Left/Up: Expand Right, Shrink Left
      const growIdx = findGrowTarget(index + 1, 1);
      if (growIdx !== -1) {
        const indicesLeft: number[] = [];
        for (let i = index; i >= 0; i--) indicesLeft.push(i);

        const shrunk = this.distributeDeficit(
          newSizes,
          indicesLeft,
          -deltaPercent,
          this.totalSize,
        );
        newSizes[growIdx] += shrunk;
      }
    }

    // Final validation to ensure strict 100% alignment
    this.sizes = this.validateAndFixSizes(newSizes, this.totalSize);
  }

  private readonly handlePointerUp = () => {
    this.isResizing = false;
    this.draggingIndex = -1;
    this.cleanupDragListeners();
    document.body.style.userSelect = '';
  };

  override render() {
    const containerStyles = {
      'minWidth':
        this.direction === 'horizontal' ? this.minContainerSize : undefined,
      'minHeight':
        this.direction !== 'horizontal' ? this.minContainerSize : undefined,
    };

    return html`
      <div class="drag-mask"></div>
      <div
        class="container"
        ${ref(this.containerRef)}
        style=${styleMap(containerStyles)}>
        <div style="display:none;">
          <slot @slotchange=${this.handleSlotChange}></slot>
        </div>

        ${this.sizes.map((size, i) => {
          const showGutter = i < this.sizes.length - 1 && this.isPanelOpen(i);
          const isResizable = this.hasOpenPanesAfter(i);
          const gutterClass = {
            'gutter': true,
            'dragging': i === this.draggingIndex,
            'disabled': !isResizable,
          };

          return html`
            <div
              class="panel-wrapper"
              style=${styleMap({
                'flexBasis': `${size}%`,
                'flexGrow': '0',
                'flexShrink': '0',
              })}>
              <slot name="panel-${i}"></slot>
            </div>
            ${
              showGutter
                ? html`
                  <div
                    class=${classMap(gutterClass)}
                    @pointerdown=${(e: PointerEvent) =>
                      !isResizable ? null : this.startDrag(e, i)}
                    title="${isResizable ? 'Drag to resize' : ''}">
                  </div>
                `
                : nothing
            }
          `;
        })}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'split-view': SplitView;
  }
}
