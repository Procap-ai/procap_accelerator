import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewInit, signal, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import loader from '@monaco-editor/loader';
import type * as Monaco from 'monaco-editor';

@Component({
  selector: 'app-code-editor',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="code-editor-container" [class.loading]="isLoading()">
      @if (isLoading()) {
        <div class="editor-loading">
          <div class="loader"></div>
          <span>Loading editor...</span>
        </div>
      }
      <div #editorContainer class="editor-container"></div>
    </div>
  `,
  styles: [`
    .code-editor-container {
      width: 100%;
      height: 100%;
      position: relative;
      background: #1e1e1e;
      border-radius: 4px;
      overflow: hidden;
    }
    
    .code-editor-container.loading .editor-container {
      opacity: 0;
    }
    
    .editor-container {
      width: 100%;
      height: 100%;
      transition: opacity 0.2s ease;
    }
    
    .editor-loading {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      color: #888;
      z-index: 10;
    }
    
    .loader {
      width: 24px;
      height: 24px;
      border: 2px solid #333;
      border-top-color: #007acc;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `]
})
export class CodeEditorComponent implements OnInit, AfterViewInit, OnDestroy, OnChanges {
  @ViewChild('editorContainer') editorContainer!: ElementRef<HTMLDivElement>;
  
  @Input() set code(value: string) {
    this._code = value;
    if (this.editor && this.editor.getValue() !== value) {
      this.editor.setValue(value);
    }
  }
  get code(): string {
    return this._code;
  }
  
  @Input() language = 'ruby';
  @Input() theme = 'vs-dark';
  @Input() readOnly = false;
  @Input() minimap = false;
  
  @Output() codeChange = new EventEmitter<string>();
  @Output() editorReady = new EventEmitter<void>();
  
  private _code = '';
  private _previousLanguage = 'ruby';
  private editor: Monaco.editor.IStandaloneCodeEditor | null = null;
  private monaco: typeof Monaco | null = null;
  
  isLoading = signal(true);
  
  ngOnInit(): void {
    this._previousLanguage = this.language;
    this.initMonaco();
  }
  
  ngAfterViewInit(): void {
    // Monaco editor creation is handled in initMonaco after loader completes
    // The container reference is needed there, so we keep this hook for future use
    if (this.monaco && !this.editor) {
      this.createEditor();
    }
  }
  
  ngOnChanges(changes: SimpleChanges): void {
    // Handle language change
    if (changes['language'] && !changes['language'].firstChange && this.editor && this.monaco) {
      const newLanguage = changes['language'].currentValue;
      if (newLanguage !== this._previousLanguage) {
        this._previousLanguage = newLanguage;
        const model = this.editor.getModel();
        if (model) {
          this.monaco.editor.setModelLanguage(model, newLanguage);
        }
      }
    }
  }
  
  ngOnDestroy(): void {
    if (this.editor) {
      this.editor.dispose();
    }
  }
  
  private async initMonaco(): Promise<void> {
    try {
      this.monaco = await loader.init();
      
      // Register Ruby language if not already registered
      this.registerRubyLanguage();
      
      // Create editor after container is ready
      setTimeout(() => this.createEditor(), 0);
    } catch {
      this.isLoading.set(false);
    }
  }
  
  private createEditor(): void {
    if (!this.monaco || !this.editorContainer) return;
    
    this.editor = this.monaco.editor.create(this.editorContainer.nativeElement, {
      value: this._code,
      language: this.language,
      theme: this.theme,
      readOnly: this.readOnly,
      minimap: { enabled: this.minimap },
      fontSize: 14,
      lineHeight: 22,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace",
      fontLigatures: true,
      tabSize: 2,
      insertSpaces: true,
      automaticLayout: true,
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      lineNumbers: 'on',
      glyphMargin: false,
      folding: true,
      lineDecorationsWidth: 10,
      lineNumbersMinChars: 3,
      renderLineHighlight: 'line',
      scrollbar: {
        vertical: 'auto',
        horizontal: 'auto',
        useShadows: false,
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
      },
      overviewRulerBorder: false,
      hideCursorInOverviewRuler: true,
      contextmenu: true,
      quickSuggestions: true,
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnEnter: 'on',
      tabCompletion: 'on',
      wordBasedSuggestions: 'currentDocument',
      parameterHints: { enabled: true },
      formatOnPaste: true,
      formatOnType: true,
    });
    
    // Listen for changes
    this.editor.onDidChangeModelContent(() => {
      const value = this.editor?.getValue() || '';
      if (value !== this._code) {
        this._code = value;
        this.codeChange.emit(value);
      }
    });
    
    this.isLoading.set(false);
    this.editorReady.emit();
  }
  
  private registerRubyLanguage(): void {
    if (!this.monaco) return;
    
    // Check if Ruby is already registered
    const languages = this.monaco.languages.getLanguages();
    if (languages.some(lang => lang.id === 'ruby')) return;
    
    // Register Ruby language
    this.monaco.languages.register({ id: 'ruby' });
    
    // Set Ruby tokenizer
    this.monaco.languages.setMonarchTokensProvider('ruby', {
      keywords: [
        'BEGIN', 'END', 'alias', 'and', 'begin', 'break', 'case', 'class',
        'def', 'defined?', 'do', 'else', 'elsif', 'end', 'ensure', 'false',
        'for', 'if', 'in', 'module', 'next', 'nil', 'not', 'or', 'redo',
        'rescue', 'retry', 'return', 'self', 'super', 'then', 'true',
        'undef', 'unless', 'until', 'when', 'while', 'yield', 'require',
        'require_relative', 'include', 'extend', 'prepend', 'attr_reader',
        'attr_writer', 'attr_accessor', 'private', 'protected', 'public',
        'raise', 'fail', 'catch', 'throw', 'proc', 'lambda'
      ],
      
      builtins: [
        'puts', 'print', 'p', 'gets', 'chomp', 'to_s', 'to_i', 'to_f', 'to_a',
        'to_h', 'length', 'size', 'count', 'empty?', 'nil?', 'is_a?', 'kind_of?',
        'instance_of?', 'respond_to?', 'send', 'method', 'methods', 'class',
        'superclass', 'ancestors', 'included_modules', 'instance_variables',
        'instance_variable_get', 'instance_variable_set', 'each', 'each_with_index',
        'map', 'select', 'reject', 'find', 'find_all', 'reduce', 'inject',
        'sort', 'sort_by', 'reverse', 'flatten', 'compact', 'uniq', 'first',
        'last', 'take', 'drop', 'zip', 'any?', 'all?', 'none?', 'one?',
        'include?', 'member?', 'min', 'max', 'minmax', 'sum', 'push', 'pop',
        'shift', 'unshift', 'insert', 'delete', 'delete_at', 'clear', 'concat',
        'join', 'split', 'strip', 'chomp', 'gsub', 'sub', 'match', 'scan',
        'upcase', 'downcase', 'capitalize', 'reverse', 'chars', 'bytes',
        'new', 'initialize', 'call', 'tap', 'then', 'yield_self'
      ],
      
      operators: [
        '=', '>', '<', '!', '~', '?', ':', '==', '<=', '>=', '!=',
        '&&', '||', '++', '--', '+', '-', '*', '/', '&', '|', '^', '%',
        '<<', '>>', '>>>', '+=', '-=', '*=', '/=', '&=', '|=', '^=',
        '%=', '<<=', '>>=', '>>>=', '<=>', '===', '=~', '!~', '**', '..', '...'
      ],
      
      symbols: /[=><!~?:&|+\-*\/\^%]+/,
      
      escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
      
      tokenizer: {
        root: [
          // Comments
          [/#.*$/, 'comment'],
          
          // Strings
          [/"([^"\\]|\\.)*$/, 'string.invalid'],
          [/'([^'\\]|\\.)*$/, 'string.invalid'],
          [/"/, 'string', '@string_double'],
          [/'/, 'string', '@string_single'],
          
          // Numbers
          [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
          [/0[xX][0-9a-fA-F]+/, 'number.hex'],
          [/0[bB][01]+/, 'number.binary'],
          [/0[oO][0-7]+/, 'number.octal'],
          [/\d+/, 'number'],
          
          // Symbols
          [/:[a-zA-Z_]\w*[?!]?/, 'string.symbol'],
          
          // Instance/class variables
          [/@{1,2}[a-zA-Z_]\w*/, 'variable.instance'],
          
          // Global variables
          [/\$[a-zA-Z_]\w*/, 'variable.global'],
          
          // Constants
          [/[A-Z][a-zA-Z0-9_]*/, 'type.identifier'],
          
          // Identifiers and keywords
          [/[a-z_]\w*[?!]?/, {
            cases: {
              '@keywords': 'keyword',
              '@builtins': 'predefined',
              '@default': 'identifier'
            }
          }],
          
          // Delimiters and operators
          [/[{}()\[\]]/, '@brackets'],
          [/@symbols/, {
            cases: {
              '@operators': 'operator',
              '@default': ''
            }
          }],
          
          // Delimiter
          [/[;,.]/, 'delimiter'],
          
          // Whitespace
          [/\s+/, 'white'],
        ],
        
        string_double: [
          [/[^\\"]+/, 'string'],
          [/@escapes/, 'string.escape'],
          [/\\./, 'string.escape.invalid'],
          [/"/, 'string', '@pop']
        ],
        
        string_single: [
          [/[^\\']+/, 'string'],
          [/@escapes/, 'string.escape'],
          [/\\./, 'string.escape.invalid'],
          [/'/, 'string', '@pop']
        ],
      }
    });
    
    // Configure Ruby language
    this.monaco.languages.setLanguageConfiguration('ruby', {
      comments: {
        lineComment: '#',
        blockComment: ['=begin', '=end']
      },
      brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')']
      ],
      autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
        { open: '|', close: '|' },
        { open: 'do', close: 'end' }
      ],
      surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
        { open: '|', close: '|' }
      ],
      indentationRules: {
        increaseIndentPattern: /^\s*(class|module|def|if|unless|case|while|until|for|begin|do)\b.*$/,
        decreaseIndentPattern: /^\s*(end|else|elsif|when|rescue|ensure)\b.*$/
      }
    });
  }
  
  // Public methods
  focus(): void {
    this.editor?.focus();
  }
  
  getValue(): string {
    return this.editor?.getValue() || this._code;
  }
  
  setValue(value: string): void {
    this._code = value;
    this.editor?.setValue(value);
  }
  
  layout(): void {
    this.editor?.layout();
  }
}
