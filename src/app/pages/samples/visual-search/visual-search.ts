import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VisualSearchService, ImageResult, SearchPayload } from '../../../services/visual-search.service';

type StepKind = 'text' | 'image';

interface SearchStep {
  kind: StepKind;
  label: string;        // text query, file name, or "Visual match"
  thumb?: string;       // image for image steps
  payload: SearchPayload;
}

const TOP_K = 24;

@Component({
  selector: 'app-visual-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './visual-search.html',
  styleUrl: './visual-search.scss',
})
export class VisualSearchComponent implements OnInit {
  private svc = inject(VisualSearchService);

  query = '';
  results = signal<ImageResult[]>([]);
  searching = signal(false);
  error = signal<string | null>(null);
  hasSearched = signal(false);
  dragOver = signal(false);

  // The "exploration trail" — the path of searches the user has walked.
  trail = signal<SearchStep[]>([]);
  activeStep = signal(0);

  samples = [
    'sunset over mountains',
    'neon city at night',
    'cozy coffee shop',
    'snowy forest path',
    'vintage sports car',
    'minimalist workspace',
  ];

  validResults = computed(() => this.results().filter(r => !!r.metadata_url));

  ngOnInit(): void {
    // Soft landing — show an evocative default so the page never feels empty.
    this.runText('dramatic landscape photography', { silent: true });
  }

  // ---- entry points -------------------------------------------------------

  submit(): void {
    const q = this.query.trim();
    if (q) this.runText(q);
  }

  searchSample(sample: string): void {
    this.query = sample;
    this.runText(sample);
  }

  onFileInput(ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (file) void this.runFile(file);
    (ev.target as HTMLInputElement).value = '';
  }

  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.dragOver.set(false);
    const url = ev.dataTransfer?.getData('text/uri-list') || ev.dataTransfer?.getData('text/plain');
    const file = ev.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) { void this.runFile(file); return; }
    if (url && /^https?:\/\//i.test(url.trim())) this.runImageUrl(url.trim(), 'Dropped image');
  }

  onDragOver(ev: DragEvent): void { ev.preventDefault(); this.dragOver.set(true); }
  onDragLeave(): void { this.dragOver.set(false); }

  @HostListener('window:paste', ['$event'])
  onPaste(ev: ClipboardEvent): void {
    const item = Array.from(ev.clipboardData?.items ?? []).find(i => i.type.startsWith('image/'));
    if (item) {
      const file = item.getAsFile();
      if (file) { void this.runFile(file); return; }
    }
    const text = ev.clipboardData?.getData('text')?.trim();
    if (text && /^https?:\/\/.+\.(jpe?g|png|webp|gif|avif|bmp)/i.test(text)) {
      this.runImageUrl(text, 'Pasted image');
    }
  }

  /** Dive into images visually similar to a result — the heart of the experience. */
  findSimilar(result: ImageResult): void {
    if (!result.metadata_url) return;
    this.runImageUrl(result.metadata_url, 'Visual match', result.metadata_url);
  }

  /** Jump back to any point in the exploration trail. */
  goToStep(index: number): void {
    const steps = this.trail();
    if (index < 0 || index >= steps.length) return;
    this.trail.set(steps.slice(0, index + 1));
    this.activeStep.set(index);
    void this.execute(steps[index].payload);
  }

  clearTrail(): void {
    this.trail.set([]);
    this.activeStep.set(0);
    this.results.set([]);
    this.hasSearched.set(false);
    this.error.set(null);
    this.query = '';
  }

  // ---- runners ------------------------------------------------------------

  private runText(prompt: string, opts: { silent?: boolean } = {}): void {
    this.pushStep({ kind: 'text', label: prompt, payload: { prompt, top_k: TOP_K } }, opts.silent);
  }

  private runImageUrl(url: string, label: string, thumb?: string): void {
    this.pushStep({ kind: 'image', label, thumb: thumb ?? url, payload: { url, top_k: TOP_K } });
  }

  private async runFile(file: File): Promise<void> {
    try {
      const { base64, preview } = await this.svc.readFile(file);
      this.pushStep({
        kind: 'image',
        label: file.name.length > 22 ? file.name.slice(0, 20) + '…' : file.name,
        thumb: preview,
        payload: { file_base64: base64, top_k: TOP_K },
      });
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not read that image.');
    }
  }

  private pushStep(step: SearchStep, silent = false): void {
    if (!silent) {
      this.trail.update(t => [...t, step]);
      this.activeStep.set(this.trail().length - 1);
    }
    void this.execute(step.payload);
  }

  private async execute(payload: SearchPayload): Promise<void> {
    this.searching.set(true);
    this.error.set(null);
    this.hasSearched.set(true);
    try {
      const items = await this.svc.search(payload);
      this.results.set(items);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Search failed.');
      this.results.set([]);
    } finally {
      this.searching.set(false);
    }
  }

  // ---- view helpers -------------------------------------------------------

  matchPercent(r: ImageResult): number {
    const s = r.similarity_score ?? 0;
    return Math.max(0, Math.min(100, Math.round(s * 100)));
  }

  matchTone(r: ImageResult): 'high' | 'mid' | 'low' {
    const p = this.matchPercent(r);
    if (p >= 45) return 'high';
    if (p >= 30) return 'mid';
    return 'low';
  }

  open(r: ImageResult): void {
    if (r.metadata_url) window.open(r.metadata_url, '_blank', 'noopener');
  }

  trackById = (_: number, r: ImageResult) => r.faiss_id ?? r.metadata_url;
  skeletons = Array.from({ length: 12 });
}
