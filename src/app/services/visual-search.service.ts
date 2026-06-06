import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout, catchError } from 'rxjs';

// Visual Search talks to the shared Procap/Loka AI image-search backend.
const API_BASE_URL = 'https://api.lokaai.in';

export interface ImageResult {
  faiss_id?: number;
  similarity_score?: number;
  metadata_url?: string;
  metadata_ts?: number;
  resolution?: { width: number; height: number };
}

export interface SearchPayload {
  prompt?: string;
  url?: string;
  file_base64?: string;
  top_k?: number;
  min_width?: number;
  min_height?: number;
}

@Injectable({ providedIn: 'root' })
export class VisualSearchService {
  private http = inject(HttpClient);

  /**
   * Run a semantic image search. Accepts a text prompt, an image URL, or a
   * base64-encoded uploaded image — the backend figures out the query type.
   */
  async search(payload: SearchPayload): Promise<ImageResult[]> {
    const res = await firstValueFrom(
      this.http.post<{ top_results?: ImageResult[] }>(`${API_BASE_URL}/search`, payload).pipe(
        timeout(30000),
        catchError((e) => {
          const detail = (e as { error?: { detail?: string } })?.error?.detail;
          throw new Error(detail || e?.message || 'Search request failed. Please try again.');
        })
      )
    );
    return res?.top_results ?? [];
  }

  /** Read a File into a base64 string (no data: prefix) plus an object URL preview. */
  async readFile(file: File): Promise<{ base64: string; preview: string }> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Could not read the image file.'));
      reader.readAsDataURL(file);
    });
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    return { base64, preview: dataUrl };
  }
}
