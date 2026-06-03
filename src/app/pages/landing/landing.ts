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

@Component({
  selector: 'app-landing',
  imports: [CommonModule, RouterModule],
  templateUrl: './landing.html',
  styleUrl: './landing.scss'
})
export class LandingComponent implements OnInit {
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
