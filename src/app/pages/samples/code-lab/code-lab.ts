import { Component, OnInit, OnDestroy, inject, signal, computed, ViewChild } from '@angular/core';
import { CommonModule, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  CodeService,
  Problem,
  ProblemDetail,
  TestResult,
  RunCodeResponse,
  ProblemStatus,
} from '../../../services/code.service';
import { MarkdownPipe } from '../../../shared/markdown.pipe';
import { CodeEditorComponent } from '../../../components/code-editor/code-editor.component';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';
import Prism from 'prismjs';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';

type ViewMode = 'list' | 'solve';
type TabMode = 'description' | 'testcases' | 'editorial';
type FilterTab = 'all' | 'completed' | 'attempted' | 'not_started';
type DifficultyFilter = 'all' | 'easy' | 'medium' | 'hard';

const CODE_TIME_LIMIT = 30 * 60; // 30 minutes in seconds
const PROBLEMS_PER_PAGE = 12;
const CODE_LAB_ROUTE = '/samples/code-lab';

interface ProblemWithStatus extends Problem {
  status: ProblemStatus;
}

@Component({
  selector: 'app-code-lab',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MarkdownPipe, CodeEditorComponent, TitleCasePipe, PaginationComponent],
  templateUrl: './code-lab.html',
  styleUrl: './code-lab.scss',
})
export class CodeLabComponent implements OnInit, OnDestroy {
  private codeService = inject(CodeService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);

  @ViewChild('codeEditor') codeEditor!: CodeEditorComponent;

  // State
  viewMode = signal<ViewMode>('list');
  activeTab = signal<TabMode>('description');
  problems = signal<ProblemWithStatus[]>([]);
  currentProblem = signal<ProblemDetail | null>(null);
  code = signal<string>('');
  consoleOutput = signal<string>('');
  testResults = signal<TestResult[]>([]);
  isRunning = signal<boolean>(false);
  isSubmitting = signal<boolean>(false);
  isLoading = signal<boolean>(false);
  executionTime = signal<number>(0);
  errorMessage = signal<string>('');
  allPassed = signal<boolean>(false);
  totalTests = signal<number>(0);
  hiddenTestCount = signal<number>(0);
  isSubmitMode = signal<boolean>(false);
  editorialUnlocked = signal<boolean>(false);
  selectedLanguage = signal<string>('ruby');
  selectedLanguageModel: string = 'ruby';  // Two-way binding model for select
  private autoSaveInterval: ReturnType<typeof setInterval> | null = null;

  // Pagination and filter state
  currentPage = signal<number>(1);
  filterTab = signal<FilterTab>('all');
  difficultyFilter = signal<DifficultyFilter>('all');
  searchQuery = signal<string>('');

  // Timer state
  timeRemaining = signal<number>(CODE_TIME_LIMIT);
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  // Popup state
  showSuccessPopup = signal<boolean>(false);
  showFailurePopup = signal<boolean>(false);
  showTimeoutPopup = signal<boolean>(false);

  // Copy state
  codeCopied = signal<boolean>(false);
  private copyTimeout: ReturnType<typeof setTimeout> | null = null;

  // Computed - supported languages
  supportedLanguages = computed(() => {
    const problem = this.currentProblem();
    return problem ? this.codeService.getSupportedLanguages(problem) : ['ruby'];
  });

  // Computed
  difficultyClass = computed(() => {
    const problem = this.currentProblem();
    if (!problem) return '';
    return `difficulty-${problem.difficulty}`;
  });

  passedCount = computed(() => {
    return this.testResults().filter((r) => r.passed).length;
  });

  // Get public test results
  publicTestResults = computed(() => {
    const problem = this.currentProblem();
    if (!problem) return [];
    return this.testResults().slice(0, problem.public_test_cases.length);
  });

  // Get hidden test results (only available after submit)
  hiddenTestResults = computed(() => {
    const problem = this.currentProblem();
    if (!problem || !this.isSubmitMode()) return [];
    return this.testResults().slice(problem.public_test_cases.length);
  });

  // Formatted time remaining
  formattedTime = computed(() => {
    const seconds = this.timeRemaining();
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  });

  // Timer status (warning when < 5 min, critical when < 1 min)
  timerStatus = computed(() => {
    const seconds = this.timeRemaining();
    if (seconds <= 60) return 'critical';
    if (seconds <= 300) return 'warning';
    return 'normal';
  });

  // Filtered problems based on status, difficulty, and search
  filteredProblems = computed(() => {
    let filtered = this.problems();

    // Filter by status tab
    const tab = this.filterTab();
    if (tab !== 'all') {
      filtered = filtered.filter(p => p.status === tab);
    }

    // Filter by difficulty
    const diff = this.difficultyFilter();
    if (diff !== 'all') {
      filtered = filtered.filter(p => p.difficulty === diff);
    }

    // Filter by search query
    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      filtered = filtered.filter(p =>
        p.title.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query)
      );
    }

    return filtered;
  });

  // Paginated problems
  paginatedProblems = computed(() => {
    const filtered = this.filteredProblems();
    const page = this.currentPage();
    const start = (page - 1) * PROBLEMS_PER_PAGE;
    return filtered.slice(start, start + PROBLEMS_PER_PAGE);
  });

  // Total pages
  totalPages = computed(() => {
    return Math.ceil(this.filteredProblems().length / PROBLEMS_PER_PAGE);
  });

  // Stats for filter tabs
  problemStats = computed(() => {
    const all = this.problems();
    return {
      all: all.length,
      completed: all.filter(p => p.status === 'completed').length,
      attempted: all.filter(p => p.status === 'attempted').length,
      not_started: all.filter(p => p.status === 'not_started').length,
    };
  });

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      const problemId = params['id'];
      if (problemId) {
        this.loadProblem(problemId);
      } else {
        this.loadProblems();
      }
    });
  }

  ngOnDestroy(): void {
    this.stopTimer();
    this.stopAutoSave();
    if (this.copyTimeout) {
      clearTimeout(this.copyTimeout);
    }
  }

  async loadProblems(): Promise<void> {
    this.viewMode.set('list');
    this.isLoading.set(true);
    this.errorMessage.set('');
    try {
      const problems = await this.codeService.getProblems();
      // Add status from local storage
      const problemsWithStatus: ProblemWithStatus[] = problems.map(p => ({
        ...p,
        status: this.codeService.getStatus(p.id),
      }));
      this.problems.set(problemsWithStatus);
    } catch {
      this.errorMessage.set('Failed to load problems. Please check your connection.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadProblem(id: string): Promise<void> {
    this.viewMode.set('solve');
    this.resetState();
    this.activeTab.set('description');
    this.stopTimer();
    this.stopAutoSave();
    this.isLoading.set(true);
    try {
      const problem = await this.codeService.getProblem(id);
      this.currentProblem.set(problem);

      // Get supported languages and determine best language to use
      const languages = this.codeService.getSupportedLanguages(problem);
      const bestLang = this.codeService.getBestLanguage(id, languages);
      this.selectedLanguage.set(bestLang);
      this.selectedLanguageModel = bestLang;  // Sync the model for select binding

      // Load saved code for this language or use starter code
      const savedCode = this.codeService.getSavedCode(id, bestLang);
      const starterCode = this.codeService.getStarterCode(problem, bestLang);
      this.code.set(savedCode || starterCode);
      this.hiddenTestCount.set(problem.hidden_test_count);

      // Editorial is unlocked if we have it in the response (passcode was valid)
      this.editorialUnlocked.set(!!problem.editorial);

      this.startTimer();
      this.startAutoSave();
    } catch {
      this.errorMessage.set('Failed to load problem');
    } finally {
      this.isLoading.set(false);
    }
  }

  selectProblem(problem: Problem): void {
    this.router.navigate([CODE_LAB_ROUTE], { queryParams: { id: problem.id } });
  }

  // Language selection
  onLanguageChange(language: string): void {
    const problem = this.currentProblem();
    if (!problem) return;

    // Save current code before switching
    this.saveCurrentProgress();

    // Save user's language preference
    this.codeService.setPreferredLanguage(language);

    this.selectedLanguage.set(language);
    this.selectedLanguageModel = language;  // Sync the model

    // Load saved code for new language or use starter code
    const savedCode = this.codeService.getSavedCode(problem.id, language);
    const starterCode = this.codeService.getStarterCode(problem, language);
    this.code.set(savedCode || starterCode);

    // Reset test results but keep editorial unlocked state
    this.testResults.set([]);
    this.consoleOutput.set('');
    this.errorMessage.set('');
    this.allPassed.set(false);
    this.executionTime.set(0);
    this.totalTests.set(0);
    this.isSubmitMode.set(false);
  }

  // Pagination methods
  onPageChange(page: number): void {
    this.currentPage.set(page);
  }

  // Filter methods
  setFilterTab(tab: FilterTab): void {
    this.filterTab.set(tab);
    this.currentPage.set(1); // Reset to first page on filter change
  }

  setDifficultyFilter(diff: DifficultyFilter): void {
    this.difficultyFilter.set(diff);
    this.currentPage.set(1);
  }

  onSearchChange(query: string): void {
    this.searchQuery.set(query);
    this.currentPage.set(1);
  }

  backToList(): void {
    this.stopTimer();
    this.stopAutoSave();
    this.saveCurrentProgress();
    this.closeAllPopups();
    this.router.navigate([CODE_LAB_ROUTE]);
  }

  // Auto-save methods
  startAutoSave(): void {
    this.autoSaveInterval = setInterval(() => {
      this.saveCurrentProgress();
    }, 10000); // Auto-save every 10 seconds
  }

  stopAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }

  saveCurrentProgress(): void {
    const problem = this.currentProblem();
    if (problem && this.code()) {
      const currentStatus = this.codeService.getStatus(problem.id);
      const language = this.selectedLanguage();
      const passcode = this.codeService.getPasscode(problem.id);

      // Save code for current language without changing status
      if (currentStatus === 'completed') {
        this.codeService.saveProgress(problem.id, this.code(), language, 'completed', passcode || undefined);
      } else if (currentStatus === 'attempted') {
        this.codeService.saveProgress(problem.id, this.code(), language, 'attempted');
      }
      // If 'not_started', don't mark as attempted - just save the code implicitly
    }
  }

  // Timer methods
  startTimer(): void {
    this.timeRemaining.set(CODE_TIME_LIMIT);
    this.timerInterval = setInterval(() => {
      const current = this.timeRemaining();
      if (current <= 1) {
        this.stopTimer();
        this.timeRemaining.set(0);
        this.showTimeoutPopup.set(true);
      } else {
        this.timeRemaining.set(current - 1);
      }
    }, 1000);
  }

  stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  // Popup methods
  closeAllPopups(): void {
    this.showSuccessPopup.set(false);
    this.showFailurePopup.set(false);
    this.showTimeoutPopup.set(false);
  }

  goToHomeFromPopup(): void {
    this.closeAllPopups();
    this.backToList();
  }

  resetState(): void {
    this.testResults.set([]);
    this.consoleOutput.set('');
    this.errorMessage.set('');
    this.allPassed.set(false);
    this.executionTime.set(0);
    this.totalTests.set(0);
    this.isSubmitMode.set(false);
    this.editorialUnlocked.set(false);
  }

  async runCode(): Promise<void> {
    const problem = this.currentProblem();
    if (!problem || this.isRunning()) return;

    this.isRunning.set(true);
    this.resetState();
    this.isSubmitMode.set(false);
    // Keep editorial unlocked if we have it (passcode stored)
    this.editorialUnlocked.set(!!this.codeService.getPasscode(problem.id));

    try {
      const result = await this.codeService.runCode(problem.id, this.code(), this.selectedLanguage());
      this.handleRunResult(result, false);
      this.activeTab.set('testcases');
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Failed to run code'
      );
      this.activeTab.set('testcases');
    } finally {
      this.isRunning.set(false);
    }
  }

  async submitCode(): Promise<void> {
    const problem = this.currentProblem();
    if (!problem || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    this.resetState();
    this.isSubmitMode.set(true);
    // Keep editorial unlocked if we have it (passcode stored)
    this.editorialUnlocked.set(!!this.codeService.getPasscode(problem.id));

    try {
      const result = await this.codeService.submitCode(
        problem.id,
        this.code(),
        this.selectedLanguage()
      );
      this.handleRunResult(result, true);
      this.activeTab.set('testcases');
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Failed to submit code'
      );
      this.activeTab.set('testcases');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private handleRunResult(result: RunCodeResponse, isSubmit: boolean): void {
    const problem = this.currentProblem();
    const language = this.selectedLanguage();

    this.testResults.set(result.results);
    this.consoleOutput.set(result.console_output || '');
    this.executionTime.set(result.execution_time_ms);
    this.allPassed.set(result.passed);
    this.totalTests.set(result.total_tests || result.results.length);
    this.isSubmitMode.set(isSubmit);

    if (result.error) {
      this.errorMessage.set(result.error);
    }

    // Mark as attempted when run or submit is executed
    if (problem) {
      const currentStatus = this.codeService.getStatus(problem.id);
      if (currentStatus !== 'completed') {
        this.codeService.markAttempted(problem.id, this.code(), language);
      }
    }

    // Show popup on submit and save progress
    if (isSubmit && problem) {
      if (result.passed) {
        this.stopTimer();
        // Save with passcode from response to unlock editorial
        this.codeService.markCompleted(problem.id, this.code(), language, result.passcode);
        this.editorialUnlocked.set(true);
        this.showSuccessPopup.set(true);

        // Re-fetch problem to get editorial (now that we have passcode)
        if (result.passcode) {
          this.refreshProblemWithEditorial(problem.id);
        }
      } else {
        this.showFailurePopup.set(true);
      }
    }
  }

  /**
   * Re-fetch problem to get editorial after solving
   */
  private async refreshProblemWithEditorial(problemId: string): Promise<void> {
    try {
      const problem = await this.codeService.getProblem(problemId);
      this.currentProblem.set(problem);
    } catch {
      // Silently handle error - problem refresh is not critical
    }
  }

  setTab(tab: TabMode): void {
    this.activeTab.set(tab);
  }

  formatInput(input: unknown): string {
    return this.codeService.formatTestInput(input);
  }

  formatOutput(output: unknown): string {
    return this.codeService.formatOutput(output);
  }

  getDifficultyLabel(difficulty: string): string {
    return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
  }

  resetCode(): void {
    const problem = this.currentProblem();
    if (problem) {
      const starterCode = this.codeService.getStarterCode(problem, this.selectedLanguage());
      this.code.set(starterCode);
      this.resetState();
      this.editorialUnlocked.set(!!this.codeService.getPasscode(problem.id));
    }
  }

  formatCode(): void {
    // Monaco editor has built-in format - we can prettify the code
    const currentCode = this.code();
    const lang = this.selectedLanguage();

    // Basic formatting for common languages
    let formatted = currentCode;

    if (lang === 'ruby') {
      // Basic Ruby formatting: fix indentation
      formatted = this.basicIndentFormat(currentCode, 2);
    } else if (lang === 'python') {
      // Basic Python formatting: fix indentation
      formatted = this.basicIndentFormat(currentCode, 4);
    } else if (lang === 'java') {
      // Basic Java formatting: fix indentation
      formatted = this.basicIndentFormat(currentCode, 4);
    }

    this.code.set(formatted);
  }

  private basicIndentFormat(code: string, indentSize: number): string {
    const lines = code.split('\n');
    const indent = ' '.repeat(indentSize);
    let level = 0;
    const result: string[] = [];

    // Keywords that increase indent
    const increaseIndent = /^\s*(def|class|module|if|elsif|else|unless|case|when|while|until|for|begin|do|loop|rescue|ensure)\b/;
    // Keywords that decrease indent
    const decreaseIndent = /^\s*(end|else|elsif|when|rescue|ensure)\b/;
    // Keywords that should be on same level as block start
    const sameLevel = /^\s*(else|elsif|when|rescue|ensure)\b/;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        result.push('');
        continue;
      }

      // Check if line should decrease indent
      if (decreaseIndent.test(trimmed) && !sameLevel.test(trimmed)) {
        level = Math.max(0, level - 1);
      } else if (sameLevel.test(trimmed)) {
        level = Math.max(0, level - 1);
      }

      result.push(indent.repeat(level) + trimmed);

      // Check if line should increase indent for next line
      if (sameLevel.test(trimmed)) {
        level++;
      } else if (increaseIndent.test(trimmed) && !trimmed.endsWith('end')) {
        level++;
      }
    }

    return result.join('\n');
  }

  onCodeChange(value: string): void {
    this.code.set(value);
  }

  // Syntax highlighting using Prism (used for editorial code display)
  highlightCode(code: string, language: string = 'ruby'): SafeHtml {
    if (!code) return '';

    try {
      // Map language to Prism language ID
      const prismLangMap: Record<string, string> = {
        'ruby': 'ruby',
        'python': 'python',
        'java': 'java'
      };
      const prismLang = prismLangMap[language] || 'ruby';
      const highlighted = Prism.highlight(code, Prism.languages[prismLang] || Prism.languages['ruby'], prismLang);
      return this.sanitizer.bypassSecurityTrustHtml(highlighted);
    } catch {
      // Fallback: escape HTML and return as-is
      const escaped = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return this.sanitizer.bypassSecurityTrustHtml(escaped);
    }
  }

  // Get solution code for current language
  getCurrentSolutionCode(): string {
    const problem = this.currentProblem();
    if (!problem) return '';
    return this.codeService.getSolutionCode(problem, this.selectedLanguage());
  }

  async copySolutionCode(): Promise<void> {
    const solutionCode = this.getCurrentSolutionCode();
    if (!solutionCode) return;

    try {
      await navigator.clipboard.writeText(solutionCode);
      this.codeCopied.set(true);

      if (this.copyTimeout) {
        clearTimeout(this.copyTimeout);
      }

      this.copyTimeout = setTimeout(() => {
        this.codeCopied.set(false);
      }, 2000);
    } catch {
      // Silently handle copy error
    }
  }
}
