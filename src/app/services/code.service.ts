import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout, catchError } from 'rxjs';

// All Code Lab data is served by the shared Procap/Loka backend.
const API_BASE_URL = 'https://api.lokaai.in';

export interface Problem {
  id: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  description: string;
  languages?: string[];
}

export interface Example {
  input: string;
  output: string;
  explanation?: string;
}

export interface ProblemDetail extends Problem {
  examples: Example[];
  constraints: string[];
  starter_code: string | Record<string, string>;
  public_test_cases: TestCase[];
  hidden_test_count: number;
  editorial?: Editorial;
  languages?: string[];
}

export interface Editorial {
  approach: string;
  time_complexity: string;
  space_complexity: string;
  solution_code: string | Record<string, string>;
}

export interface TestCase {
  input: unknown;
  expected: unknown;
}

export interface TestResult {
  test: number;
  passed: boolean;
  expected?: unknown;
  actual?: unknown;
  error?: string;
  console?: string;
}

export interface RunCodeResponse {
  passed: boolean;
  results: TestResult[];
  console_output: string;
  execution_time_ms: number;
  error?: string;
  total_tests?: number;
  public_tests?: number;
  hidden_tests?: number;
  hidden_tests_pending?: number;
  passcode?: string;  // Returned on successful submit
}

export type ProblemStatus = 'not_started' | 'attempted' | 'completed';

export interface LanguageProgress {
  code: string;
  lastUpdated: number;
}

export interface ProblemProgress {
  status: ProblemStatus;
  passcode?: string;  // Stored when problem is solved
  languages: Record<string, LanguageProgress>;  // Progress per language
  lastUpdated: number;
}

const STORAGE_KEY = 'procap_code_progress_v1';
const LANGUAGE_PREF_KEY = 'procap_code_preferred_language';

@Injectable({
  providedIn: 'root',
})
export class CodeService {
  private http = inject(HttpClient);

  private getBaseUrl(): string {
    return API_BASE_URL;
  }

  // ============== Local Storage Methods ==============

  /**
   * Get all problem progress from local storage
   */
  getAllProgress(): Record<string, ProblemProgress> {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  /**
   * Get progress for a specific problem
   */
  getProgress(problemId: string): ProblemProgress | null {
    const allProgress = this.getAllProgress();
    return allProgress[problemId] || null;
  }

  /**
   * Save progress for a problem and language
   */
  saveProgress(problemId: string, code: string, language: string, status: ProblemStatus, passcode?: string): void {
    const allProgress = this.getAllProgress();
    const existing = allProgress[problemId] || {
      status: 'not_started',
      languages: {},
      lastUpdated: Date.now()
    };

    // Update language-specific code
    existing.languages[language] = {
      code,
      lastUpdated: Date.now()
    };

    // Update status (only upgrade, never downgrade)
    if (status === 'completed' || existing.status !== 'completed') {
      existing.status = status;
    }

    // Store passcode if provided
    if (passcode) {
      existing.passcode = passcode;
    }

    existing.lastUpdated = Date.now();
    allProgress[problemId] = existing;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allProgress));
  }

  /**
   * Mark problem as completed with passcode
   */
  markCompleted(problemId: string, code: string, language: string, passcode?: string): void {
    this.saveProgress(problemId, code, language, 'completed', passcode);
  }

  /**
   * Mark problem as attempted (save partial progress)
   */
  markAttempted(problemId: string, code: string, language: string): void {
    const current = this.getProgress(problemId);
    if (current?.status !== 'completed') {
      this.saveProgress(problemId, code, language, 'attempted');
    } else {
      // Just save code without changing status
      this.saveProgress(problemId, code, language, 'completed', current.passcode);
    }
  }

  /**
   * Get status for a problem
   */
  getStatus(problemId: string): ProblemStatus {
    const progress = this.getProgress(problemId);
    return progress?.status || 'not_started';
  }

  /**
   * Get passcode for a problem (if solved)
   */
  getPasscode(problemId: string): string | null {
    const progress = this.getProgress(problemId);
    return progress?.passcode || null;
  }

  /**
   * Get saved code for a problem and language
   */
  getSavedCode(problemId: string, language: string): string | null {
    const progress = this.getProgress(problemId);
    return progress?.languages?.[language]?.code || null;
  }

  /**
   * Get user's preferred language
   */
  getPreferredLanguage(): string {
    return localStorage.getItem(LANGUAGE_PREF_KEY) || 'ruby';
  }

  /**
   * Set user's preferred language
   */
  setPreferredLanguage(language: string): void {
    localStorage.setItem(LANGUAGE_PREF_KEY, language);
  }

  /**
   * Get best language for a problem based on saved progress and user preference
   * Priority: 1. Language with saved code, 2. User preference, 3. Ruby (default)
   */
  getBestLanguage(problemId: string, supportedLanguages: string[]): string {
    const progress = this.getProgress(problemId);

    // If problem has saved progress, use the most recently updated language
    if (progress?.languages) {
      const langEntries = Object.entries(progress.languages);
      if (langEntries.length > 0) {
        // Sort by lastUpdated descending and return the most recent
        langEntries.sort((a, b) => (b[1].lastUpdated || 0) - (a[1].lastUpdated || 0));
        const recentLang = langEntries[0][0];
        if (supportedLanguages.includes(recentLang)) {
          return recentLang;
        }
      }
    }

    // Use user's preferred language if supported
    const preferred = this.getPreferredLanguage();
    if (supportedLanguages.includes(preferred)) {
      return preferred;
    }

    // Default to ruby if available, otherwise first supported
    return supportedLanguages.includes('ruby') ? 'ruby' : (supportedLanguages[0] || 'ruby');
  }

  // ============== API Methods ==============

  /**
   * Get list of all problems from the backend.
   */
  async getProblems(): Promise<Problem[]> {
    const url = `${this.getBaseUrl()}/challenges-list`;
    const response = await firstValueFrom(
      this.http.get<{ challenges: Problem[] } | Problem[]>(url).pipe(
        timeout(10000),
        catchError((error) => {
          throw new Error(error.message || 'Failed to fetch problems');
        })
      )
    );
    // Backend returns { challenges: [...] }; tolerate a bare array too.
    return Array.isArray(response) ? response : response.challenges;
  }

  /**
   * Get problem details by ID. When the user has solved it (passcode stored),
   * request includes the passcode so the editorial is returned.
   */
  async getProblem(id: string): Promise<ProblemDetail> {
    const passcode = this.getPasscode(id);
    let url = `${this.getBaseUrl()}/challenges-get?id=${encodeURIComponent(id)}`;
    if (passcode) {
      url += `&passcode=${encodeURIComponent(passcode)}`;
    }

    return firstValueFrom(
      this.http.get<ProblemDetail>(url).pipe(
        timeout(10000),
        catchError((error) => {
          throw new Error(error.message || 'Failed to fetch problem');
        })
      )
    );
  }

  /**
   * Run code against public test cases
   */
  async runCode(problemId: string, code: string, language: string = 'ruby'): Promise<RunCodeResponse> {
    const url = `${this.getBaseUrl()}/challenges-run`;
    // Java and C# need more time for compilation
    const timeoutMs = (language === 'java' || language === 'csharp') ? 25000 : 15000;

    return firstValueFrom(
      this.http
        .post<RunCodeResponse>(url, {
          problem_id: problemId,
          code: code,
          mode: 'test',
          language: language,
        })
        .pipe(
          timeout(timeoutMs),
          catchError((error) => {
            throw new Error(error.message || 'Failed to run code');
          })
        )
    );
  }

  /**
   * Submit code against all test cases (public + hidden)
   */
  async submitCode(problemId: string, code: string, language: string = 'ruby'): Promise<RunCodeResponse> {
    const url = `${this.getBaseUrl()}/challenges-run`;
    // Java and C# need more time for compilation
    const timeoutMs = (language === 'java' || language === 'csharp') ? 30000 : 20000;

    return firstValueFrom(
      this.http
        .post<RunCodeResponse>(url, {
          problem_id: problemId,
          code: code,
          mode: 'submit',
          language: language,
        })
        .pipe(
          timeout(timeoutMs),
          catchError((error) => {
            throw new Error(error.message || 'Failed to submit code');
          })
        )
    );
  }

  /**
   * Format test case input for display
   */
  formatTestInput(input: unknown): string {
    if (typeof input === 'object' && input !== null) {
      if ('operations' in input && 'args' in input) {
        // LRU Cache format
        const ops = input as { operations: string[]; args: unknown[][] };
        return `operations = ${JSON.stringify(ops.operations)}\nargs = ${JSON.stringify(ops.args)}`;
      }
    }
    return JSON.stringify(input, null, 2);
  }

  /**
   * Format output for display
   */
  formatOutput(output: unknown): string {
    if (output === null) return 'null';
    if (output === undefined) return 'undefined';
    return JSON.stringify(output);
  }

  /**
   * Get starter code for a specific language
   */
  getStarterCode(problem: ProblemDetail, language: string): string {
    if (typeof problem.starter_code === 'string') {
      return language === 'ruby' ? problem.starter_code : '';
    }
    return problem.starter_code[language] || '';
  }

  /**
   * Get solution code for a specific language
   */
  getSolutionCode(problem: ProblemDetail, language: string): string {
    if (!problem.editorial?.solution_code) return '';
    if (typeof problem.editorial.solution_code === 'string') {
      return language === 'ruby' ? problem.editorial.solution_code : '';
    }
    return problem.editorial.solution_code[language] || '';
  }

  /**
   * Get supported languages for a problem
   */
  getSupportedLanguages(problem: ProblemDetail): string[] {
    return problem.languages || ['ruby'];
  }
}
