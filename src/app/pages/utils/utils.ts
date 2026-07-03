import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';

interface PastRun {
  jobId: string;
  mode: 'playwright' | 'mabl';
  filename: string;
  ts: number;
  route: string;
}

/**
 * Utils — the legacy test-migration converters (Selenium → Playwright,
 * Selenium/Playwright → mabl). Deliberately kept off the main app; reached via
 * the low-key "Utils" link in the Meridian sidebar.
 */
@Component({
  selector: 'app-utils',
  imports: [CommonModule, RouterModule],
  templateUrl: './utils.html',
  styleUrl: './utils.scss',
})
export class UtilsComponent implements OnInit {
  pastRuns: PastRun[] = [];

  constructor(private router: Router) {}

  ngOnInit(): void {
    try {
      const stored = localStorage.getItem('procap_past_runs');
      if (stored) this.pastRuns = JSON.parse(stored) as PastRun[];
    } catch { /* ignore */ }
  }

  navigate(path: string): void {
    void this.router.navigate([path]);
  }

  openRun(run: PastRun): void {
    void this.router.navigate([run.route]);
  }

  clearHistory(): void {
    localStorage.removeItem('procap_past_runs');
    this.pastRuns = [];
  }

  formatTime(ts: number): string {
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  modeLabel(mode: string): string {
    return mode === 'playwright' ? 'Selenium → Playwright' : 'Selenium/Playwright → mabl';
  }
}
