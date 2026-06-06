import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-pagination',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (totalPages > 1) {
      <div class="pagination-container">
        <div class="pagination">
          <!-- First & Previous -->
          <button class="pagination-btn" (click)="goFirst()" [disabled]="currentPage === 1" title="First page">«</button>
          <button class="pagination-btn" (click)="goPrev()" [disabled]="currentPage === 1" title="Previous page">‹</button>

          <!-- Page Numbers -->
          <div class="pagination-pages">
            @for (page of visiblePages; track $index) {
              @if (page === '...') {
                <span class="pagination-ellipsis">…</span>
              } @else {
                <button class="pagination-page" [class.active]="page === currentPage" (click)="goTo(+page)">{{ page }}</button>
              }
            }
          </div>

          <!-- Next & Last -->
          <button class="pagination-btn" (click)="goNext()" [disabled]="currentPage === totalPages" title="Next page">›</button>
          <button class="pagination-btn" (click)="goLast()" [disabled]="currentPage === totalPages" title="Last page">»</button>

          <!-- Jump to Page -->
          @if (showJumpTo && totalPages > 7) {
            <div class="pagination-jump">
              <span>Go to</span>
              <input
                type="number"
                [min]="1"
                [max]="totalPages"
                [(ngModel)]="jumpPage"
                (keydown.enter)="jumpToPage()"
                class="jump-input"
              />
              <button class="jump-btn" (click)="jumpToPage()" [disabled]="!isValidJump">Go</button>
            </div>
          }
        </div>

        <!-- Info text -->
        @if (showInfo && totalCount > 0) {
          <div class="pagination-info">
            Showing {{ startItem }}-{{ endItem }} of {{ totalCount }}
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .pagination-container { margin-top: 1.5rem; }
    .pagination {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.35rem;
      flex-wrap: wrap;
    }
    .pagination-pages { display: flex; gap: 0.35rem; }
    .pagination-btn, .pagination-page {
      min-width: 36px;
      height: 36px;
      padding: 0 0.5rem;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      background: var(--surface);
      color: var(--text-secondary);
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .pagination-btn:hover:not(:disabled), .pagination-page:hover:not(.active) {
      border-color: var(--color-primary);
      color: var(--color-primary);
    }
    .pagination-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .pagination-page.active {
      background: var(--color-primary);
      border-color: var(--color-primary);
      color: #fff;
    }
    .pagination-info {
      text-align: center;
      font-size: 0.85rem;
      color: var(--text-secondary);
      margin-top: 0.75rem;
    }
    .pagination-jump {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-left: 1rem;
      padding-left: 1rem;
      border-left: 1px solid var(--border-color);
      font-size: 0.85rem;
      color: var(--text-secondary);
    }
    .jump-input {
      width: 60px;
      padding: 0.4rem 0.5rem;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--bg-secondary);
      color: var(--text-primary);
      font-size: 0.85rem;
      text-align: center;
      &:focus { outline: none; border-color: var(--color-primary); }
      &::-webkit-inner-spin-button, &::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
      -moz-appearance: textfield;
    }
    .jump-btn {
      padding: 0.4rem 0.75rem;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--bg-secondary);
      color: var(--color-primary);
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      &:hover:not(:disabled) { background: var(--color-primary); color: white; }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
    .pagination-ellipsis { color: var(--text-secondary); padding: 0 0.25rem; }
  `]
})
export class PaginationComponent implements OnChanges {
  @Input() currentPage = 1;
  @Input() totalPages = 1;
  @Input() totalCount = 0;
  @Input() perPage = 10;
  @Input() showJumpTo = true;
  @Input() showInfo = true;
  @Input() siblingCount = 1; // Pages to show on each side of current

  @Output() pageChange = new EventEmitter<number>();

  jumpPage: number | null = null;
  visiblePages: (number | string)[] = [];

  get startItem(): number { return (this.currentPage - 1) * this.perPage + 1; }
  get endItem(): number { return Math.min(this.currentPage * this.perPage, this.totalCount); }
  get isValidJump(): boolean { return this.jumpPage !== null && this.jumpPage >= 1 && this.jumpPage <= this.totalPages && this.jumpPage !== this.currentPage; }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['currentPage'] || changes['totalPages'] || changes['siblingCount']) {
      this.calculateVisiblePages();
    }
  }

  private calculateVisiblePages() {
    const total = this.totalPages;
    const current = this.currentPage;
    const siblings = this.siblingCount;

    // If total pages is small, show all
    if (total <= 7) {
      this.visiblePages = Array.from({ length: total }, (_, i) => i + 1);
      return;
    }

    const pages: (number | string)[] = [];
    const leftSiblingIndex = Math.max(current - siblings, 1);
    const rightSiblingIndex = Math.min(current + siblings, total);

    const showLeftEllipsis = leftSiblingIndex > 2;
    const showRightEllipsis = rightSiblingIndex < total - 1;

    // Always show first page
    pages.push(1);

    // Left ellipsis or page 2
    if (showLeftEllipsis) {
      pages.push('...');
    } else if (leftSiblingIndex > 1) {
      for (let i = 2; i < leftSiblingIndex; i++) pages.push(i);
    }

    // Sibling pages and current
    for (let i = leftSiblingIndex; i <= rightSiblingIndex; i++) {
      if (i !== 1 && i !== total) pages.push(i);
    }

    // Right ellipsis or remaining pages
    if (showRightEllipsis) {
      pages.push('...');
    } else if (rightSiblingIndex < total) {
      for (let i = rightSiblingIndex + 1; i < total; i++) pages.push(i);
    }

    // Always show last page
    if (total > 1) pages.push(total);

    this.visiblePages = pages;
  }

  goTo(page: number) { if (page >= 1 && page <= this.totalPages && page !== this.currentPage) this.pageChange.emit(page); }
  goFirst() { this.goTo(1); }
  goLast() { this.goTo(this.totalPages); }
  goPrev() { this.goTo(this.currentPage - 1); }
  goNext() { this.goTo(this.currentPage + 1); }

  jumpToPage() {
    if (this.isValidJump && this.jumpPage) {
      this.goTo(this.jumpPage);
      this.jumpPage = null;
    }
  }
}
