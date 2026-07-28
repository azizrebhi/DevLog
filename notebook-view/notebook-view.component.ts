// frontend\src\app\features\notebook\notebook-view\notebook-view.component.ts
import { Component, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef, ChangeDetectionStrategy, NgZone, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HttpEventType, HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { DocumentService, QueryResponse } from '../../../core/services/document.service';
import { Document } from '../../../core/models/document.model';
import { AuthService } from '../../../core/services/auth.service';
import { WebsocketService } from '../../../core/services/websocket.service';
import { ConversationService, Notebook, ChatMessage as ConversationMessage } from '../../../core/services/conversation.service';
import { BreadcrumbService } from '../../../core/services/breadcrumb.service';
import { NoteService } from '../../../core/services/note.service';
import { marked } from 'marked';
import { environment } from '../../../../environments/environment';

export interface Citation {
  id: number;
  citationIndex: number;
  startOffset: number;
  endOffset: number;
  documentVersionId: string | number;  // UUID string (new) or hashed integer (legacy)
  documentName: string;
  pageNumber: number;
  excerpt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: number[];
  citations?: Citation[];
  timestamp: Date;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  type: 'study-guide' | 'briefing' | 'faq' | 'timeline' | 'custom';
  createdAt: string;
  status?: string;
}

export interface SourceChunk {
  content: string;
  chunkIndex: number;
  metadata: any;
}

export interface SourceViewerState {
  visible: boolean;
  documentId: string;
  documentName: string;
  pageNumber: number;
  chunks: SourceChunk[];
  highlightStart?: number;
  highlightEnd?: number;
  renderedHtml?: string;
}

@Component({
  selector: 'app-notebook-view',
  templateUrl: './notebook-view.component.html',
  styleUrls: [
    './notebook-view.component.scss',
    './notebook-view-mobile.scss'
  ],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotebookViewComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('messagesEnd') messagesEnd!: ElementRef;
  @ViewChild('quizActions') quizActionsEl!: ElementRef;
  
  documents: Document[] = [];
  selectedDocuments = new Set<number>();

  // Helper to count active selected documents
  get activeSelectedDocumentsCount(): number {
    return Array.from(this.selectedDocuments)
      .filter(docId => {
        const doc = this.documents.find(d => d.id === docId);
        return doc && doc.status === 'ACTIVE';
      })
      .length;
  }
  messages: ChatMessage[] = [];
  notes: Note[] = [];
  expandedNoteId: number | null = null;
  inputMessage = '';
  isLoading = false;
  isLoadingConversation = false;
  notebookName = 'My Notebook';
  currentNotebookId: number | null = null;  // The single notebook for this view
  conversationDocumentIds: number[] | null = null;  // Track documents in notebook
  notebookId: number = 1;  // Default notebook ID (TODO: fetch from backend or route params)
  activeRightTab: 'notes' | 'studio' = 'notes';  // Right panel tabs (sources moved to left)

  // Auto-summary (Source Guide)
  notebookSummary: string | null = null;
  suggestedQuestions: string[] = [];
  isGeneratingSummary = false;
  
  // Studio panel state
  activeStudioTool: 'none' | 'flashcards' | 'mindmap' | 'quiz' | 'summary' = 'none';
  
  // Flashcard state
  flashcards: Array<{question: string; answer: string; difficulty: string; pageNumber: number}> = [];
  currentFlashcardIndex = 0;
  isFlashcardFlipped = false;
  isGeneratingFlashcards = false;
  flashcardResults: {got: number; missed: number} = {got: 0, missed: 0};
  flashcardMode: 'study' | 'results' = 'study';
  flashcardDifficulty = 'medium';
  missedCards: number[] = [];
  isFlashcardModalOpen = false;
  
  // Quiz state
  quizQuestions: Array<{question: string; options: string[]; correctIndex: number; explanation: string; difficulty: string}> = [];
  currentQuizIndex = 0;
  selectedAnswer: number | null = null;
  quizAnswered = false;
  quizScore = 0;
  quizMode: 'answering' | 'results' = 'answering';
  isGeneratingQuiz = false;
  isQuizModalOpen = false;

  // Summary state
  docSummaryText = '';
  isGeneratingDocSummary = false;
  isSummaryModalOpen = false;

  // Studio output list
  generatingItems: Array<{id: string; type: string; sourceCount: number}> = [];
  studioArtifacts: Array<{id: number; type: string; title: string; createdAt: string; sourceCount?: number; data?: string}> = [];
  
  // Mind map state
  mindmapData: {
    central: string;
    nodes: Array<{id: string; label: string; parentId: string; level: number}>;
  } | null = null;
  isGeneratingMindmap = false;
  isMindmapModalOpen = false;
  expandedNodes: Set<string> = new Set();
  selectedMindmapNode: string | null = null;
  isLeftVisible  = true;  // Sources panel toggle
  isRightVisible = true;  // Studio panel toggle
  showAddSourcesModal = false;  // Add sources modal visibility
  isAddingToExistingChat = false;  // Track if modal is adding to existing chat or creating new
  private pollingInterval: any;
  private summaryPollingInterval: any;
  
  // Source Viewer State for Citations
  sourceViewerState: SourceViewerState = {
    visible: false,
    documentId: '',
    documentName: '',
    pageNumber: 0,
    chunks: []
  };
  isLoadingSource = false;
  
  // Markdown cache for instant citation navigation
  markdownCache = new Map<string, {markdown: string; filename: string}>();
  // Track in-flight markdown fetches to avoid duplicate requests
  private markdownFetchInFlight = new Map<string, Promise<{markdown: string; filename: string}>>();

  // Memoized template properties to avoid recalculating on every change detection
  filteredDocuments: Document[] = [];
  private _filteredDocsKey = '';
  private _citationsCache = new Map<number, Citation[]>();
  private _citationsCacheVersion = 0;
  private _citationsCacheBuiltFor = -1;

  // Streaming state
  private currentStreamAbort: (() => void) | null = null;
  streamingContent = '';  // Accumulated content during streaming
  streamingStatus = '';   // Current status message (latest step)
  streamingSteps: string[] = [];  // All reasoning steps emitted so far
  private streamingHtmlCache: { length: number; html: SafeHtml } = { length: 0, html: '' as unknown as SafeHtml };

  // Confirm modal state
  showConfirmModal = false;
  confirmModalTitle = '';
  confirmModalMessage = '';
  confirmModalLoading = false;
  private confirmAction: (() => void) | null = null;
  
  // Panel widths for resizable panels (as percentages)
  leftPanelWidth = 22;
  centerPanelWidth = 48;
  rightPanelWidth = 30;
  
  // Mobile-specific state
  isMobileView = false;
  activeMobilePanel: 'chat' | 'sources' | 'studio' | 'notes' | null = 'chat';
  leftPanelMobileActive = false;
  rightPanelMobileActive = false;
  
  // Resize state
  isResizing = false;
  private resizeTarget: 'left' | 'right' | null = null;
  private startX = 0;
  private startLeftWidth = 0;
  private startCenterWidth = 0;
  private startRightWidth = 0;
  private containerWidth = 0;
  
  // Cached DOM elements
  private leftPanel: HTMLElement | null = null;
  private centerPanel: HTMLElement | null = null;
  private rightPanel: HTMLElement | null = null;
  private notebookContent: HTMLElement | null = null;
  
  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private documentService: DocumentService,
    private authService: AuthService,
    private snackBar: MatSnackBar,
    private wsService: WebsocketService,
    private cdr: ChangeDetectorRef,
    private conversationService: ConversationService,
    private breadcrumbs: BreadcrumbService,
    private http: HttpClient,
    private sanitizer: DomSanitizer,
    private noteService: NoteService,
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: object
  ) {
    // Configure marked once at startup
    marked.setOptions({ breaks: true, gfm: true });
  }

  ngOnInit(): void {
    this.breadcrumbs.setBreadcrumbs([
      { label: 'Home',        url: '/home' },
      { label: 'Notebook AI', url: '/notecomlm' },
      { label: 'Chat' }
    ]);
    this.breadcrumbs.hide();
    if (isPlatformBrowser(this.platformId)) {
      document.body.classList.add('notebook-fullscreen');

      // Auto-hide navbar on mouse position
      document.addEventListener('mousemove', this.onMouseMoveNavbar);
      
      // Close notebook menu when clicking outside
      document.addEventListener('click', this.onDocumentClick);
    }
    this.loadDocuments();
    this.setupCitationClickHandler();
    
    // Defer WebSocket connection to avoid blocking Angular hydration/stabilization
    setTimeout(() => this.setupWebSocket(), 1000);

    // React to route param changes (handles both initial load AND navigation between notebooks)
    this.route.paramMap
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        const routeId = params.get('id');
        const url = this.router.url;
        console.log('[Route] Navigated - URL:', url, 'routeId:', routeId);
        
        // Handle new notebook: check URL contains '/new' since it's a separate route without params
        if (url.includes('/new') || routeId === 'new' || routeId === null) {
          console.log('[Route] New notebook detected - resetting state and opening upload modal');
          this.resetNotebookState();
          this.isAddingToExistingChat = false;
          // Open upload modal immediately for new notebooks
          this.showAddSourcesModal = true;
          this.cdr.detectChanges();
          console.log('[Route] showAddSourcesModal set to:', this.showAddSourcesModal);
          // Fallback: also trigger after delay in case first attempt fails
          setTimeout(() => {
            if (!this.showAddSourcesModal) {
              console.log('[Route] Retry opening modal after delay');
              this.showAddSourcesModal = true;
              this.cdr.detectChanges();
            }
          }, 500);
        } else if (routeId && !isNaN(+routeId)) {
          console.log('[Route] Loading existing notebook:', routeId);
          this.resetNotebookState();
          this.loadNotebook(+routeId);
        }
      });
  }

  ngAfterViewInit(): void {
    // Citation click handler and scroll setup (DOM-dependent)
    this.checkMobileView();
    if (isPlatformBrowser(this.platformId)) {
      window.addEventListener('resize', () => this.checkMobileView());
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // Mobile-Specific Methods
  // ══════════════════════════════════════════════════════════════════════════════

  checkMobileView(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.isMobileView = window.innerWidth < 768;
      if (!this.isMobileView) {
        // Reset mobile-specific states on desktop
        this.leftPanelMobileActive = false;
        this.rightPanelMobileActive = false;
      }
      this.cdr.detectChanges();
    }
  }

  switchMobilePanel(panel: 'chat' | 'sources' | 'studio' | 'notes'): void {
    if (!this.isMobileView) return;
    
    // If clicking same panel that is open, close it
    if (this.activeMobilePanel === panel && (
      (panel === 'sources' && this.leftPanelMobileActive) ||
      (panel === 'studio' && this.rightPanelMobileActive)
    )) {
      this.leftPanelMobileActive = false;
      this.rightPanelMobileActive = false;
      this.activeMobilePanel = 'chat';
      this.cdr.markForCheck();
      return;
    }
    
    // Switch to new panel
    this.activeMobilePanel = panel;
    this.leftPanelMobileActive = panel === 'sources';
    this.rightPanelMobileActive = panel === 'studio';
    this.cdr.markForCheck();
  }

  closeMobilePanel(): void {
    this.leftPanelMobileActive = false;
    this.rightPanelMobileActive = false;
    this.activeMobilePanel = 'chat';
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.breadcrumbs.show();
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    this.stopSummaryPolling();
    this.wsService.disconnect();
    this.destroy$.next();
    this.destroy$.complete();

    if (isPlatformBrowser(this.platformId)) {
      document.body.classList.remove('notebook-fullscreen');
      window.removeEventListener('resize', () => this.checkMobileView());

      // Restore navbar visibility
      const appNavbar = document.querySelector('app-navbar, .app-navbar, nav.navbar') as HTMLElement;
      if (appNavbar) {
        appNavbar.style.transform = '';
        appNavbar.style.opacity  = '';
      }
      document.removeEventListener('mousemove', this.onMouseMoveNavbar);
      document.removeEventListener('click', this.onDocumentClick);

      // Clean up global citation handler
      if ((window as any).handleCitationClick) {
        delete (window as any).handleCitationClick;
      }
      if (this.citationClickListener) {
        document.removeEventListener('click', this.citationClickListener, true);
      }

      // Clean up resize event listeners
      document.removeEventListener('mousemove', this.onMouseMove);
      document.removeEventListener('mouseup', this.onMouseUp);
    }
  }

  /**
   * Reset all notebook-specific state when navigating between notebooks.
   * Called before loading a new notebook to prevent stale data bleed.
   */
  private resetNotebookState(): void {
    // Stop any active polling
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.stopSummaryPolling();

    // Abort any active streaming
    if (this.currentStreamAbort) {
      this.currentStreamAbort();
      this.currentStreamAbort = null;
    }

    // Clear notebook identity
    this.currentNotebookId = null;
    this.notebookId = 1;
    this.notebookName = 'My Notebook';
    this.conversationDocumentIds = null;

    // Clear messages & streaming
    this.messages = [];
    this.streamingContent = '';
    this.streamingStatus = '';
    this.streamingSteps = [];

    // Clear summary
    this.notebookSummary = null;
    this.suggestedQuestions = [];
    this.isGeneratingSummary = false;

    // Clear studio artifacts
    this.flashcards = [];
    this.mindmapData = null;
    this.studioArtifacts = [];
    this.generatingItems = [];
    this.quizQuestions = [];
    this.expandedNodes = new Set();

    // Clear notes
    this.notes = [];
    this.expandedNoteId = null;

    // Clear documents selection
    this.selectedDocuments.clear();
    this.filteredDocuments = [];

    // Clear source viewer & caches
    this.sourceViewerState = { visible: false, documentId: '', documentName: '', pageNumber: 0, chunks: [] };
    this.markdownCache.clear();
    this.markdownFetchInFlight.clear();

    // Clear loading states
    this.isLoading = false;
    this.isLoadingConversation = false;

    this.cdr.markForCheck();
  }

  /**
   * Set up global citation click handler for innerHTML citations.
   * Only runs in the browser — window is not available during SSR.
   */
  private setupCitationClickHandler(): void {
    if (isPlatformBrowser(this.platformId)) {
      // Legacy global handler (keep for backward compatibility)
      (window as any).handleCitationClick = (citationId: number) => {
        this.onCitationClick(citationId);
      };

      // Native event delegation OUTSIDE Angular zone.
      // KEY: By attaching outside the zone, Angular does NOT auto-trigger
      // change detection when the user clicks. This prevents the innerHTML
      // from being re-rendered between mousedown and our handler, which
      // was causing the "need to click twice" bug.
      this.citationClickListener = (event: Event) => {
        const target = event.target as HTMLElement;
        const citationEl = target.closest?.('.citation-link');
        if (citationEl) {
          event.preventDefault();
          event.stopPropagation();
          const citationId = citationEl.getAttribute('data-citation-id');
          if (citationId) {
            const id = parseInt(citationId, 10);
            this.onCitationClick(id);
          } else {
            // Fallback: find citation by citationIndex when data-citation-id is missing
            const citationIndex = citationEl.getAttribute('data-citation-index');
            if (citationIndex) {
              this.onCitationClickByIndex(parseInt(citationIndex, 10));
            }
          }
        }
      };
      // Attach outside Angular zone — critical for preventing double-click
      this.ngZone.runOutsideAngular(() => {
        document.addEventListener('click', this.citationClickListener!, true);
      });
    }
  }

  private citationClickListener: ((event: Event) => void) | null = null;

  loadDocuments(): void {
    const docs$ = this.currentNotebookId
      ? this.documentService.getNotebookDocuments(this.currentNotebookId)
      : this.documentService.getDocuments();

    docs$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (docs: Document[]) => {
          console.log('[loadDocuments] Received documents:', docs.map(d => ({ id: d.id, name: d.fileName, status: d.status })));
          this.documents = docs;
          this.refreshFilteredDocuments();
          // selectedDocuments will be populated when a conversation is loaded/created
          
          // Check if any notebook documents are still processing
          const notebookDocIds = this.conversationDocumentIds || [];
          const hasProcessingDocs = notebookDocIds.length > 0
            ? notebookDocIds.some(docId => {
                const d = docs.find(x => x.id === docId);
                return d && d.status === 'PROCESSING';
              })
            : docs.some(d => d.status === 'PROCESSING');

          if (hasProcessingDocs && !this.pollingInterval) {
            console.log('[loadDocuments] Starting polling - found processing documents');
            this.startPolling();
          } else if (!hasProcessingDocs && this.pollingInterval) {
            console.log('[loadDocuments] Stopping polling - no processing documents');
            this.stopPolling();
          }
          
          // Always check if summary should be generated when notebook docs are done
          if (!hasProcessingDocs && !this.notebookSummary) {
            this.checkAndShowSummaryLoading();
          }
          
          // Auto-open upload modal if notebook has no documents
          if (this.currentNotebookId && docs.length === 0 && !this.showAddSourcesModal) {
            console.log('[loadDocuments] No documents in notebook - opening upload modal');
            setTimeout(() => {
              this.showAddSourcesModal = true;
              this.cdr.detectChanges();
            }, 500);
          }
          
          // Trigger change detection - use markForCheck for consistency
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          console.log('Documents not yet available - this is normal for a new notebook');
          this.documents = [];
          this.selectedDocuments = new Set();
          this.refreshFilteredDocuments();
          
          // Auto-open upload modal if notebook has no documents (error means empty)
          if (this.currentNotebookId && !this.showAddSourcesModal) {
            console.log('[loadDocuments error] Opening upload modal for empty notebook');
            setTimeout(() => {
              this.showAddSourcesModal = true;
              this.cdr.detectChanges();
            }, 500);
          }
          
          this.cdr.detectChanges();
        }
      });
  }

  loadStudioArtifacts(): void {
    // Clear previous notebook's studio state
    this.flashcards = [];
    this.mindmapData = null;
    this.studioArtifacts = [];
    this.generatingItems = [];
    this.expandedNodes = new Set();

    // Load saved flashcards
    this.documentService.getStudioArtifact(this.notebookId, 'flashcards')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result: any) => {
          if (result?.data) {
            try {
              this.flashcards = JSON.parse(result.data);
            } catch (e) { /* ignore parse errors */ }
          }
          this.cdr.markForCheck();
        },
        error: () => {}
      });

    // Load saved mind map
    this.documentService.getStudioArtifact(this.notebookId, 'mindmap')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result: any) => {
          if (result?.data) {
            try {
              this.mindmapData = JSON.parse(result.data);
              this.expandedNodes = new Set();
            } catch (e) { /* ignore parse errors */ }
          }
          this.cdr.markForCheck();
        },
        error: () => {}
      });

    // Load all artifacts list
    this.loadArtifactsList();
  }

  loadArtifactsList(): void {
    this.documentService.listStudioArtifacts(this.notebookId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (artifacts: any[]) => {
          this.studioArtifacts = artifacts || [];
          this.cdr.markForCheck();
        },
        error: () => {}
      });
  }

  loadNotebook(notebookId: number): void {
    if (this.isLoadingConversation) {
      console.log('Already loading a notebook, skipping...');
      return;
    }
    
    console.log('Loading notebook:', notebookId);
    this.isLoadingConversation = true;
    
    this.conversationService.getNotebook(notebookId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (notebook) => {
          console.log('Notebook fetched:', notebook);
          
          this.currentNotebookId = notebook.id;
          this.notebookId = notebook.id;
          this.notebookName = notebook.title || 'My Notebook';
          this.conversationDocumentIds = notebook.documentIds || [];

          // Load auto-summary if available
          this.notebookSummary = notebook.summary || null;
          this.suggestedQuestions = notebook.suggestedQuestions || [];
          
          // Auto-select all documents in this notebook
          this.selectedDocuments.clear();
          this.conversationDocumentIds.forEach(docId => this.selectedDocuments.add(docId));
          
          // Convert backend messages to frontend format
          const backendMessages = notebook.messages || [];
          this.messages = backendMessages.map(msg => ({
            id: msg.id?.toString() || Date.now().toString(),
            role: msg.role.toLowerCase() as 'user' | 'assistant',
            content: msg.content,
            sources: msg.metadata?.sources || [],
            citations: msg.metadata?.citations || [],
            timestamp: new Date(msg.messageDate || Date.now())
          }));
          
          console.log('Loaded notebook:', notebook.id, 'with', this.messages.length, 'messages');
          
          this.isLoadingConversation = false;
          this.loadDocuments();
          this.refreshFilteredDocuments();
          this.loadNotesFromBackend();
          this.loadStudioArtifacts();  // Load artifacts for THIS notebook
          this.invalidateCitationsCache();
          
          // Check if summary needs to be generated (docs may already be ACTIVE)
          if (!this.notebookSummary) {
            this.checkAndShowSummaryLoading();
          }
          
          this.cdr.markForCheck();
          setTimeout(() => this.scrollToBottom(), 100);
        },
        error: (err) => {
          console.error('Failed to load notebook:', err);
          this.isLoadingConversation = false;
          this.messages = [];
          this.refreshFilteredDocuments();
          this.invalidateCitationsCache();
          this.cdr.markForCheck();
          this.snackBar.open('Failed to load notebook', 'Close', { duration: 3000 });
        }
      });
  }

  startNewChat(): void {
    // Open the "Add Sources" modal to add documents to the notebook
    this.isAddingToExistingChat = this.currentNotebookId !== null;
    this.showAddSourcesModal = true;
  }

  /**
   * Handle modal confirmation - create new conversation with selected documents
   */
  onAddSourcesConfirmed(documentIds: number[]): void {
    this.showAddSourcesModal = false;
    
    if (documentIds.length === 0) {
      this.snackBar.open('Please select at least one document', 'Close', { duration: 3000 });
      return;
    }

    // Reload documents first to get any newly uploaded files
    this.documentService.getDocuments()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (docs) => {
          this.documents = docs;
          this.refreshFilteredDocuments();
          
          // Check if any selected documents are still PROCESSING
          const selectedDocs = this.documents.filter(doc => documentIds.includes(doc.id));
          const processingDocs = selectedDocs.filter(doc => doc.status === 'PROCESSING');
          
          // Start polling if any documents are processing
          if (processingDocs.length > 0 && !this.pollingInterval) {
            console.log(`Starting polling for ${processingDocs.length} processing document(s)`);
            this.startPolling();
          }
          
          // Choose action based on mode
          if (this.isAddingToExistingChat && this.currentNotebookId) {
            // Add to existing conversation
            this.addDocumentsToCurrentChat(documentIds, processingDocs);
          } else {
            // Create new conversation
            this.createNewChatWithDocuments(documentIds, processingDocs);
          }
        },
        error: (err) => {
          console.error('Failed to reload documents:', err);
          this.snackBar.open('Failed to load documents. Please try again.', 'Close', { duration: 4000 });
        }
      });
  }

  /**
   * Create a new chat with selected documents
   */
  private createNewChatWithDocuments(documentIds: number[], processingDocs: Document[]): void {
    if (processingDocs.length > 0) {
      this.snackBar.open(
        `Creating notebook... ${processingDocs.length} document(s) still processing.`, 
        'Close', { duration: 8000 }
      );
    } else {
      this.snackBar.open(`Creating notebook with ${documentIds.length} source(s)...`, 'Close', { duration: 3000 });
    }
    
    this.conversationService.createNotebook('Untitled Notebook', documentIds)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (notebook) => {
          console.log('Notebook created:', notebook);
          
          this.currentNotebookId = notebook.id;
          this.notebookId = notebook.id;
          this.notebookName = notebook.title || 'My Notebook';
          this.conversationDocumentIds = documentIds;
          this.messages = [];
          this.selectedDocuments.clear();
          
          documentIds.forEach(id => this.selectedDocuments.add(id));
          
          // Navigate to the new notebook URL
          this.router.navigate(['/notecomlm/view', notebook.id], { replaceUrl: true });
          
          this.snackBar.open(`Notebook created!`, 'Close', { duration: 2000 });
          this.refreshFilteredDocuments();
          this.loadStudioArtifacts();  // Load artifacts for new notebook
          this.checkAndShowSummaryLoading();
          this.invalidateCitationsCache();
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Failed to create notebook:', err);
          this.snackBar.open('Failed to create notebook. Please try again.', 'Close', { duration: 4000 });
        }
      });
  }

  /**
   * Add documents to existing chat
   */
  private addDocumentsToCurrentChat(documentIds: number[], processingDocs: Document[]): void {
    if (!this.currentNotebookId) {
      this.snackBar.open('No active notebook', 'Close', { duration: 3000 });
      return;
    }

    if (processingDocs.length > 0) {
      this.snackBar.open(
        `Adding sources... ${processingDocs.length} document(s) still processing.`, 
        'Close', { duration: 8000 }
      );
    } else {
      this.snackBar.open(`Adding ${documentIds.length} source(s)...`, 'Close', { duration: 3000 });
    }

    this.conversationService.addDocuments(this.currentNotebookId, documentIds)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (notebook) => {
          console.log('Documents added to notebook:', notebook);
          
          this.conversationDocumentIds = notebook.documentIds || [];
          documentIds.forEach(id => this.selectedDocuments.add(id));
          
          this.refreshFilteredDocuments();
          this.checkAndShowSummaryLoading();
          this.snackBar.open(`Sources added!`, 'Close', { duration: 2000 });
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Failed to add documents to notebook:', err);
          this.snackBar.open('Failed to add sources. Please try again.', 'Close', { duration: 4000 });
        }
      });
  }

  /**
   * Handle modal cancellation
   */
  onAddSourcesCancelled(): void {
    this.showAddSourcesModal = false;
  }

  onConfirmModalConfirmed(): void {
    if (this.confirmAction) {
      this.confirmAction();
    }
  }

  closeConfirmModal(): void {
    this.showConfirmModal = false;
    this.confirmModalLoading = false;
    this.confirmAction = null;
    this.cdr.detectChanges();
  }

  /**
   * Recompute the filtered documents list (call after documents/conversation change).
   * Result is stored in `filteredDocuments` for binding in the template.
   */
  refreshFilteredDocuments(): void {
    if (this.conversationDocumentIds === null || this.conversationDocumentIds.length === 0) {
      this.filteredDocuments = [];
      return;
    }
    this.filteredDocuments = this.documents.filter(doc =>
      this.conversationDocumentIds!.includes(doc.id)
    );
  }

  deleteConversation(notebookId: number, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    
    this.confirmModalTitle = 'Delete Notebook';
    this.confirmModalMessage = 'Are you sure you want to delete this notebook? This action cannot be undone.';
    this.confirmAction = () => {
      this.confirmModalLoading = true;
      this.cdr.detectChanges();
      this.conversationService.deleteNotebook(notebookId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.ngZone.run(() => {
              this.showConfirmModal = false;
              this.confirmModalLoading = false;
              this.confirmAction = null;
              this.cdr.detectChanges();
              this.snackBar.open('Notebook deleted', 'Close', { duration: 2000 });
              this.router.navigate(['/notecomlm']);
            });
          },
          error: (err) => {
            console.error('Failed to delete notebook:', err);
            this.ngZone.run(() => {
              this.showConfirmModal = false;
              this.confirmModalLoading = false;
              this.confirmAction = null;
              this.cdr.detectChanges();
              this.snackBar.open('Failed to delete notebook', 'Close', { duration: 3000 });
            });
          }
        });
    };
    this.showConfirmModal = true;
  }

  startPolling(): void {
    console.log('[startPolling] Starting document status polling (every 2 seconds)');
    // Wrap in NgZone to ensure change detection triggers
    this.pollingInterval = setInterval(() => {
      console.log('[startPolling] Polling tick - loading documents...');
      this.ngZone.run(() => {
        this.loadDocuments();
      });
    }, 2000); // Poll every 2 seconds
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      console.log('[stopPolling] Stopping document status polling');
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Check if all notebook documents are ACTIVE and no summary exists yet.
   * If so, show the "Generating summary..." loading indicator.
   */
  private checkAndShowSummaryLoading(): void {
    if (this.notebookSummary || this.isGeneratingSummary) return;
    if (!this.conversationDocumentIds || this.conversationDocumentIds.length === 0) return;

    const allActive = this.conversationDocumentIds.every(docId => {
      const doc = this.documents.find(d => d.id === docId);
      return doc && doc.status === 'ACTIVE';
    });

    console.log('[checkAndShowSummaryLoading] allActive:', allActive,
      'docIds:', this.conversationDocumentIds,
      'docs:', this.documents.map(d => ({id: d.id, status: d.status})));

    if (allActive) {
      this.isGeneratingSummary = true;
      this.startSummaryPolling();
      this.cdr.markForCheck();
    }
  }

  private startSummaryPolling(): void {
    if (this.summaryPollingInterval || !this.currentNotebookId) return;
    console.log('[startSummaryPolling] Starting summary polling for notebook', this.currentNotebookId);
    this.summaryPollingInterval = setInterval(() => {
      this.ngZone.run(() => {
        this.conversationService.getNotebook(this.currentNotebookId!)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (notebook) => {
              if (notebook.summary) {
                console.log('[startSummaryPolling] Summary received!');
                this.notebookSummary = notebook.summary;
                this.suggestedQuestions = notebook.suggestedQuestions || [];
                this.isGeneratingSummary = false;
                this.stopSummaryPolling();
                this.generateTitleFromSummary(notebook.summary);
                this.cdr.markForCheck();
              }
            },
            error: () => {}
          });
      });
    }, 3000);
  }

  private stopSummaryPolling(): void {
    if (this.summaryPollingInterval) {
      clearInterval(this.summaryPollingInterval);
      this.summaryPollingInterval = null;
    }
  }

  setupWebSocket(): void {
    // Connect even without token for development (authentication disabled)
    const token = this.authService.getToken() || 'dev-token';
    this.wsService.connect(token);
    
    this.wsService.statusUpdates$
      .pipe(takeUntil(this.destroy$))
      .subscribe((update: any) => {
        this.ngZone.run(() => {
          // Handle notebook summary notification
          if (update.type === 'notebook_summary' && update.notebookId === this.currentNotebookId) {
            this.notebookSummary = update.summary;
            this.suggestedQuestions = update.suggestedQuestions || [];
            this.isGeneratingSummary = false;
            this.stopSummaryPolling();
            this.generateTitleFromSummary(update.summary);
            this.snackBar.open('Notebook summary ready!', 'Close', { duration: 3000 });
            this.cdr.detectChanges();
            return;
          }

          const doc = this.documents.find(d => d.id === update.documentId);
          if (doc) {
            doc.status = update.status;
            
            // Stop polling when we receive WebSocket updates
            if (this.pollingInterval) {
              this.stopPolling();
            }
            
            this.snackBar.open(
              `Document "${doc.fileName}" is now ${update.status}`,
              'Close',
              { duration: 3000 }
            );

            // When a doc goes ACTIVE, check if ALL notebook docs are now ACTIVE
            // → show "generating summary" loading state and start polling for it
            if (update.status === 'ACTIVE' && !this.notebookSummary && this.conversationDocumentIds?.length) {
              const allActive = this.conversationDocumentIds.every(docId => {
                const d = this.documents.find(x => x.id === docId);
                return d && d.status === 'ACTIVE';
              });
              if (allActive) {
                this.isGeneratingSummary = true;
                this.startSummaryPolling();
              }
            }
            
            // Trigger change detection
            this.cdr.detectChanges();
          }
        });
      });
  }

  openUploadDialog(): void {
    this.isAddingToExistingChat = this.currentNotebookId !== null;
    this.showAddSourcesModal = true;
  }

  private uploadFileDirectly(file: File): void {
    // Validate file type
    const allowedExtensions = ['.pdf', '.docx', '.txt', '.csv', '.ppt', '.pptx', '.md', '.png', '.jpg', '.jpeg'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!allowedExtensions.includes(fileExtension)) {
      this.snackBar.open('Only PDF, Word, TXT, CSV, PowerPoint, MD, and image files are supported', 'Close', {
        duration: 3000
      });
      return;
    }

    // Show progress
    this.snackBar.open(`Uploading ${file.name}...`, '', { duration: 0 });

    // Upload the file with title and visibility parameters, track progress
    this.documentService.uploadDocument(file, file.name, 'ENTERPRISE').subscribe({
      next: (event: any) => {
        if (event.type === HttpEventType.UploadProgress) {
          // Handle progress if needed
        } else if (event.type === HttpEventType.Response) {
          this.ngZone.run(() => {
            // Extract document from ApiResponse wrapper
            const doc = event.body;
            if (!doc) return;
            
            this.snackBar.dismiss();
            this.snackBar.open(`${file.name} uploaded! Processing...`, 'Close', {
              duration: 3000
            });
            
            // Add document immediately to list with PROCESSING status
            const newDoc: Document = {
              id: doc.id,
              title: doc.title,
              fileName: doc.fileName,
              fileSize: doc.fileSize,
              visibility: doc.visibility,
              status: doc.status,
              createdAt: doc.createdAt
            };
            
            console.log('Adding document to list:', newDoc);
            
            // Create new array reference to trigger change detection
            this.documents = [newDoc, ...this.documents];
            this.selectedDocuments.add(newDoc.id); // Auto-select
            this.refreshFilteredDocuments();
            
            console.log('Documents array now has', this.documents.length, 'items');
            
            // Start polling since we have a PROCESSING document
            if (doc.status === 'PROCESSING' && !this.pollingInterval) {
              this.startPolling();
            }
            
            this.cdr.detectChanges();
          });
        }
      },
      error: (error) => {
        this.ngZone.run(() => {
          this.snackBar.dismiss();
          console.error('Upload error:', error);
          this.snackBar.open(`Failed to upload ${file.name}`, 'Close', {
            duration: 3000
          });
        });
      }
    });
  }

  private uploadMultipleFiles(files: File[]): void {
    const allowedExtensions = ['.pdf', '.docx', '.txt', '.csv', '.ppt', '.pptx', '.md', '.png', '.jpg', '.jpeg'];
    
    // Filter valid files
    const validFiles = files.filter(file => {
      const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      return allowedExtensions.includes(fileExtension);
    });

    const invalidCount = files.length - validFiles.length;
    if (invalidCount > 0) {
      this.snackBar.open(
        `${invalidCount} file(s) skipped (unsupported format). Only PDF, Word, TXT, CSV, PowerPoint, MD, and images are supported.`,
        'Close',
        { duration: 5000 }
      );
    }

    if (validFiles.length === 0) {
      return;
    }

    // Show initial progress
    this.snackBar.open(
      `Uploading ${validFiles.length} file(s)...`,
      '',
      { duration: 0 }
    );

    let successCount = 0;
    let failureCount = 0;
    let processedCount = 0;

    // Upload files sequentially to avoid overwhelming the server
    const uploadNext = (index: number) => {
      if (index >= validFiles.length) {
        // All uploads complete - show summary
        this.ngZone.run(() => {
          this.snackBar.dismiss();
          
          if (successCount > 0 && failureCount === 0) {
            this.snackBar.open(
              `✅ ${successCount} file(s) uploaded successfully! Processing...`,
              'Close',
              { duration: 4000 }
            );
          } else if (successCount > 0 && failureCount > 0) {
            this.snackBar.open(
              `⚠️ ${successCount} succeeded, ${failureCount} failed`,
              'Close',
              { duration: 5000 }
            );
          } else {
            this.snackBar.open(
              `❌ All uploads failed`,
              'Close',
              { duration: 4000 }
            );
          }
        });
        return;
      }

      const file = validFiles[index];
      const currentNumber = index + 1;

      console.log(`Uploading file ${currentNumber}/${validFiles.length}: ${file.name}`);

      // Update progress in snackbar
      this.ngZone.run(() => {
        this.snackBar.dismiss();
        this.snackBar.open(
          `Uploading ${currentNumber}/${validFiles.length}: ${file.name}`,
          '',
          { duration: 0 }
        );
      });

      this.documentService.uploadDocument(file, file.name, 'ENTERPRISE').subscribe({
        next: (event: any) => {
          if (event.type === HttpEventType.Response) {
            const doc = event.body;
            if (!doc) return;

            // Run inside Angular zone to ensure change detection triggers
            this.ngZone.run(() => {
              successCount++;
              processedCount++;

              // Add document to list
              const newDoc: Document = {
                id: doc.id,
                title: doc.title,
                fileName: doc.fileName,
                fileSize: doc.fileSize,
                visibility: doc.visibility,
                status: doc.status,
                createdAt: doc.createdAt
              };

              console.log(`Adding document ${currentNumber}/${validFiles.length}:`, newDoc);

              this.documents = [newDoc, ...this.documents];
              this.selectedDocuments.add(newDoc.id);
              this.refreshFilteredDocuments();

              console.log(`Documents array now has ${this.documents.length} items`);

              // Start polling if processing
              if (doc.status === 'PROCESSING' && !this.pollingInterval) {
                console.log('Starting polling for PROCESSING documents');
                this.startPolling();
              }

              this.cdr.detectChanges();
            });

            // Upload next file after a brief delay (outside ngZone.run to avoid nesting issues)
            setTimeout(() => uploadNext(index + 1), 300);
          }
        },
        error: (error) => {
          console.error(`Failed to upload ${file.name}:`, error);
          this.ngZone.run(() => {
            failureCount++;
            processedCount++;
          });

          // Continue with next file (outside ngZone.run to avoid nesting issues)
          setTimeout(() => uploadNext(index + 1), 300);
        }
      });
    };

    // Start uploading from the first file
    uploadNext(0);
  }

  toggleDocumentSelection(docId: number): void {
    if (this.selectedDocuments.has(docId)) {
      this.selectedDocuments.delete(docId);
    } else {
      this.selectedDocuments.add(docId);
    }
  }

  toggleAllDocuments(): void {
    if (this.selectedDocuments.size === this.documents.length) {
      this.selectedDocuments.clear();
    } else {
      this.selectedDocuments = new Set(this.documents.map(d => d.id));
    }
  }

  toggleSelectAll(): void {
    this.toggleAllDocuments();
  }

  getDocIcon(fileName: string): string {
    if (!fileName) return 'description';
    const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
    if (ext === '.pdf') return 'picture_as_pdf';
    if (ext === '.docx' || ext === '.doc') return 'article';
    if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') return 'image';
    if (ext === '.csv') return 'table_chart';
    if (ext === '.pptx' || ext === '.ppt') return 'slideshow';
    if (ext === '.md' || ext === '.txt') return 'text_snippet';
    return 'description';
  }

  removeDocument(docId: number): void {
    this.confirmModalTitle = 'Delete Document';
    this.confirmModalMessage = 'Are you sure you want to delete this document? This action cannot be undone.';
    this.confirmAction = () => {
      this.confirmModalLoading = true;
      this.documentService.deleteDocument(docId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.documents = this.documents.filter(d => d.id !== docId);
            this.selectedDocuments.delete(docId);
            this.refreshFilteredDocuments();
            this.closeConfirmModal();
            this.cdr.detectChanges();
            this.snackBar.open('Document deleted', 'Close', { duration: 3000 });
          },
          error: (err: any) => {
            console.error('Delete error:', err);
            this.closeConfirmModal();
            this.cdr.detectChanges();
            const errorMsg = err?.error?.message || err?.message || 'Failed to delete document';
            this.snackBar.open(errorMsg, 'Close', { duration: 5000 });
          }
        });
    };
    this.showConfirmModal = true;
  }

  onEnterKey(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === 'Enter' && !keyboardEvent.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  askSuggestedQuestion(question: string): void {
    this.inputMessage = question;
    this.sendMessage();
  }

  sendMessage(): void {
    // Validate: message not empty, not already loading
    if (!this.inputMessage.trim() || this.isLoading) {
      return;
    }
    
    // Check if we have a notebook
    if (this.currentNotebookId === null) {
      this.snackBar.open('Please add sources first to create a notebook', 'Close', { duration: 3000 });
      return;
    }
    
    // Check if notebook has documents
    if (!this.conversationDocumentIds || this.conversationDocumentIds.length === 0) {
      this.snackBar.open('This notebook has no sources. Please add documents first.', 'Close', { duration: 4000 });
      return;
    }

    // Check if at least one document is selected
    if (this.selectedDocuments.size === 0) {
      this.snackBar.open('Please select at least one source to query', 'Close', { duration: 3000 });
      return;
    }

    const userMessage = this.inputMessage.trim();
    this.inputMessage = '';
    
    // Convert selected documents to array
    const selectedDocIds = Array.from(this.selectedDocuments);
    
    // Add user message immediately
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    };
    this.messages.push(userMsg);

    // Add a placeholder assistant message for streaming
    const aiMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      timestamp: new Date()
    };
    this.messages.push(aiMsg);
    this.streamingContent = '';
    this.streamingStatus = '';
    this.streamingSteps = [];
    this.streamingHtmlCache = { length: 0, html: '' as unknown as SafeHtml };

    this.isLoading = true;
    this.scrollToBottom();
    this.cdr.markForCheck();

    // Build chat history (exclude the user message just pushed + the placeholder)
    const historyMessages = this.messages.slice(0, -2).slice(-20);
    const chatHistory = historyMessages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }));

    // Start streaming query
    const stream = this.documentService.queryDocumentStream({
      question: userMessage,
      documentIds: selectedDocIds,
      conversationId: this.currentNotebookId!,
      chatHistory: chatHistory.length > 0 ? chatHistory : undefined
    });

    this.currentStreamAbort = stream.abort;

    // Show agentic reasoning steps during retrieval phase
    stream.status$.subscribe({
      next: (message: string) => {
        this.streamingStatus = message;
        this.streamingSteps.push(message);
        this.scrollToBottom();
        this.cdr.markForCheck();
      },
      complete: () => {
        this.streamingStatus = '';
        this.cdr.markForCheck();
      }
    });

    // Accumulate tokens into the placeholder message
    stream.tokens$.subscribe({
      next: (token: string) => {
        this.streamingStatus = '';  // Clear status once tokens start
        this.streamingSteps = [];   // Clear reasoning steps once answer starts
        this.streamingContent += token;
        aiMsg.content = this.streamingContent;
        this.scrollToBottom();
        this.cdr.markForCheck();
      },
      complete: () => {
        // tokens stream finished — done event will follow
      }
    });

    // Handle completion with citations
    stream.done$.subscribe({
      next: (result) => {
        // Update the placeholder message with final data
        aiMsg.content = result.answer || this.streamingContent;
        aiMsg.citations = result.citations || [];
        aiMsg.sources = result.sources || [];
        
        this.isLoading = false;
        this.streamingContent = '';
        this.streamingStatus = '';
        this.streamingSteps = [];
        this.currentStreamAbort = null;
        this.scrollToBottom();
        this.invalidateCitationsCache();
        this.cdr.markForCheck();
        
        // Prefetch markdown for citation navigation
        this.prefetchCitedDocumentMarkdown(result.citations || []);
        
        // Save messages to notebook via Spring Boot
        if (this.currentNotebookId) {
          const metadata: any = {};
          if (result.citations?.length) metadata.citations = result.citations;
          if (result.sources?.length) metadata.sources = result.sources;
          
          // Check if this is the first message exchange
          const isFirstMessage = this.messages.length <= 2;
          
          this.conversationService.saveMessages(
            this.currentNotebookId,
            userMessage,
            aiMsg.content,
            Object.keys(metadata).length > 0 ? metadata : null
          ).pipe(takeUntil(this.destroy$)).subscribe({
            next: () => {
              console.log('Messages saved to notebook');
              
              // Generate a smart title after the first message (only if still default)
              if (isFirstMessage && this.currentNotebookId &&
                  (!this.notebookName || this.notebookName === 'My Notebook' || this.notebookName === 'Untitled Notebook')) {
                this.generateSmartTopic(this.currentNotebookId, userMessage);
              }
            },
            error: (err: any) => console.warn('Failed to save messages:', err)
          });
        }
      }
    });

    // Handle errors
    stream.error$.subscribe({
      next: (errorMsg: string) => {
        aiMsg.content = `⚠️ ${errorMsg || 'Failed to get response'}`;
        this.isLoading = false;
        this.streamingContent = '';
        this.streamingStatus = '';
        this.streamingSteps = [];
        this.currentStreamAbort = null;
        this.snackBar.open(errorMsg || 'Query failed', 'Close', { duration: 5000 });
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * Generate a smart conversation title from the first user message (like ChatGPT/Claude)
   * and update the conversation topic via the backend.
   */
  private generateSmartTopic(notebookId: number, firstMessage: string): void {
    this.documentService.generateTitle(firstMessage)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (title: string) => {
          console.log(`Generated smart title: "${title}"`);
          this.conversationService.personalizeNotebook(notebookId, { notebookTitle: title })
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: () => {
                this.notebookName = title;
                this.cdr.markForCheck();
              },
              error: (err) => console.warn('Failed to update title:', err)
            });
        },
        error: (err) => console.warn('Failed to generate title:', err)
      });
  }

  /**
   * Generate a notebook title from the summary text when the notebook still has a default name.
   */
  private generateTitleFromSummary(summary: string): void {
    if (!this.currentNotebookId) return;
    // Only auto-generate if still using the default name
    if (this.notebookName && this.notebookName !== 'My Notebook' && this.notebookName !== 'Untitled Notebook') return;
    // Use the first 200 chars of summary as context for title generation
    const context = summary.substring(0, 200);
    this.generateSmartTopic(this.currentNotebookId, context);
  }

  /**
   * Prefetch markdown for all cited documents for instant citation navigation
   */
  private prefetchCitedDocumentMarkdown(citations: any[]): void {
    if (!citations || citations.length === 0) return;
    
    // Get unique document IDs
    const uniqueDocIds = [...new Set(citations.map(c => String(c.documentVersionId)))];
    
    // Fetch all markdowns in parallel, sharing in-flight promises
    uniqueDocIds.forEach(docId => {
      // Skip if already cached or already in-flight
      if (this.markdownCache.has(docId) || this.markdownFetchInFlight.has(docId)) return;
      
      const fetchPromise = new Promise<{markdown: string; filename: string}>((resolve, reject) => {
        this.documentService.getDocumentMarkdown(docId)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (result) => {
              this.markdownCache.set(docId, { markdown: result.markdown, filename: result.filename });
              this.markdownFetchInFlight.delete(docId);
              resolve(result);
            },
            error: (err) => {
              this.markdownFetchInFlight.delete(docId);
              reject(err);
            }
          });
      });
      
      this.markdownFetchInFlight.set(docId, fetchPromise);
    });
  }

  saveToNote(content: string): void {
    const body = {
      title: 'Saved from Chat',
      content: content,
      status: 'DRAFT'
    };
    const notebookParam = this.currentNotebookId ? `?notebookId=${this.currentNotebookId}` : '';
    this.http.post<any>(`${environment.apiUrl}/api/v1/notes/standalone${notebookParam}`, body)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const saved = res.data;
          this.notes.unshift({
            id: saved.id,
            title: saved.title || 'Saved from Chat',
            content: saved.content,
            type: 'custom',
            createdAt: saved.createdAt,
            status: saved.status
          });
          this.snackBar.open('Note saved', 'Close', { duration: 2000 });
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Failed to save note:', err);
          this.snackBar.open('Failed to save note', 'Close', { duration: 3000 });
        }
      });
  }

  loadNotesFromBackend(): void {
    const notebookParam = this.currentNotebookId ? `&notebookId=${this.currentNotebookId}` : '';
    this.http.get<any>(`${environment.apiUrl}/api/v1/notes/standalone?size=50&sort=createdAt,desc${notebookParam}`)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const page = res.data;
          this.notes = (page.content || []).map((n: any) => ({
            id: n.id,
            title: n.title || 'Untitled',
            content: n.content,
            type: 'custom' as const,
            createdAt: n.createdAt,
            status: n.status
          }));
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Failed to load notes:', err);
          this.notes = [];
        }
      });
  }

  generateNote(type: 'study-guide' | 'briefing' | 'faq' | 'timeline' | 'custom'): void {
    const titles = {
      'study-guide': 'Study Guide',
      'briefing': 'Briefing Document',
      'faq': 'Frequently Asked Questions',
      'timeline': 'Timeline',
      'custom': 'Custom Note'
    };

    const body = {
      title: titles[type],
      content: `Generated ${titles[type]} based on your documents...`,
      status: 'DRAFT'
    };

    this.http.post<any>(`${environment.apiUrl}/api/v1/notes/standalone`, body)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const saved = res.data;
          this.notes.unshift({
            id: saved.id,
            title: saved.title || titles[type],
            content: saved.content,
            type: type,
            createdAt: saved.createdAt,
            status: saved.status
          });
          this.snackBar.open(`${titles[type]} created`, 'Close', { duration: 2000 });
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Failed to create note:', err);
          this.snackBar.open('Failed to create note', 'Close', { duration: 3000 });
        }
      });
  }

  toggleNoteExpand(noteId: number): void {
    this.expandedNoteId = this.expandedNoteId === noteId ? null : noteId;
  }

  deleteNote(noteId: number, event: Event): void {
    event.stopPropagation();
    this.http.delete<any>(`${environment.apiUrl}/api/v1/notes/written/${noteId}`)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.notes = this.notes.filter(n => n.id !== noteId);
          if (this.expandedNoteId === noteId) this.expandedNoteId = null;
          this.snackBar.open('Note deleted', 'Close', { duration: 2000 });
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Failed to delete note:', err);
          this.snackBar.open('Failed to delete note', 'Close', { duration: 3000 });
        }
      });
  }

  // ── Flashcard Methods ──

  openFlashcardsTool(): void {
    this.generateFlashcards();
  }

  generateFlashcards(): void {
    if (this.selectedDocuments.size === 0) {
      this.snackBar.open('Select at least one document first', 'Close', { duration: 3000 });
      return;
    }
    const genId = 'fc_' + Date.now();
    const sourceCount = this.selectedDocuments.size;
    this.generatingItems.unshift({ id: genId, type: 'flashcards', sourceCount });
    this.cdr.markForCheck();

    const docIds = Array.from(this.selectedDocuments);
    this.documentService.generateFlashcards(docIds, 15, this.flashcardDifficulty)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result: any) => {
          this.generatingItems = this.generatingItems.filter(i => i.id !== genId);
          const cards = result.flashcards || [];
          const title = `${cards.length} Flashcards`;
          this.documentService.saveStudioArtifact(this.notebookId, 'flashcards', JSON.stringify(cards), title)
            .pipe(takeUntil(this.destroy$))
            .subscribe(() => this.loadArtifactsList());
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          this.generatingItems = this.generatingItems.filter(i => i.id !== genId);
          this.snackBar.open('Failed to generate flashcards', 'Close', { duration: 3000 });
          this.cdr.markForCheck();
        }
      });
  }

  flipFlashcard(): void {
    this.isFlashcardFlipped = !this.isFlashcardFlipped;
  }

  nextFlashcard(): void {
    if (this.currentFlashcardIndex < this.flashcards.length - 1) {
      this.currentFlashcardIndex++;
      this.isFlashcardFlipped = false;
    } else {
      // End of deck → show results
      this.flashcardMode = 'results';
    }
  }

  prevFlashcard(): void {
    if (this.currentFlashcardIndex > 0) {
      this.currentFlashcardIndex--;
      this.isFlashcardFlipped = false;
    }
  }

  markFlashcard(got: boolean): void {
    if (got) {
      this.flashcardResults.got++;
    } else {
      this.flashcardResults.missed++;
      this.missedCards.push(this.currentFlashcardIndex);
    }
    this.nextFlashcard();
  }

  restartFlashcards(mode: 'all' | 'missed'): void {
    if (mode === 'missed' && this.missedCards.length > 0) {
      this.flashcards = this.missedCards.map(i => this.flashcards[i]);
    }
    this.currentFlashcardIndex = 0;
    this.isFlashcardFlipped = false;
    this.flashcardMode = 'study';
    this.flashcardResults = { got: 0, missed: 0 };
    this.missedCards = [];
  }

  shuffleFlashcards(): void {
    for (let i = this.flashcards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.flashcards[i], this.flashcards[j]] = [this.flashcards[j], this.flashcards[i]];
    }
    this.currentFlashcardIndex = 0;
    this.isFlashcardFlipped = false;
  }

  openFlashcardModal(): void {
    this.isFlashcardModalOpen = true;
    this.currentFlashcardIndex = 0;
    this.isFlashcardFlipped = false;
    this.flashcardMode = 'study';
    this.flashcardResults = { got: 0, missed: 0 };
    this.missedCards = [];
  }

  closeFlashcardModal(): void {
    this.isFlashcardModalOpen = false;
  }

  closeStudioTool(): void {
    this.activeStudioTool = 'none';
  }

  // ── Mind Map Methods ──

  openMindmapTool(): void {
    this.generateMindMap();
  }

  generateMindMap(): void {
    if (this.selectedDocuments.size === 0) {
      this.snackBar.open('Select at least one document first', 'Close', { duration: 3000 });
      return;
    }
    const genId = 'mm_' + Date.now();
    const sourceCount = this.selectedDocuments.size;
    this.generatingItems.unshift({ id: genId, type: 'mind map', sourceCount });
    this.cdr.markForCheck();

    const docIds = Array.from(this.selectedDocuments);
    this.documentService.generateMindMap(docIds, 20)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result: any) => {
          this.generatingItems = this.generatingItems.filter(i => i.id !== genId);
          const raw = result.mindmap || null;
          let mindmapResult: any = null;
          if (raw) {
            const nodes = (raw.nodes || []).map((n: any) => ({
              id: n.id,
              label: n.label,
              parentId: n.parentId || 'central',
              level: n.level || 1
            }));
            mindmapResult = { central: raw.central, nodes };
          }
          if (mindmapResult) {
            const title = `Mind Map: ${mindmapResult.central}`;
            this.documentService.saveStudioArtifact(this.notebookId, 'mindmap', JSON.stringify(mindmapResult), title)
              .pipe(takeUntil(this.destroy$))
              .subscribe(() => this.loadArtifactsList());
          }
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          this.generatingItems = this.generatingItems.filter(i => i.id !== genId);
          this.snackBar.open('Failed to generate mind map', 'Close', { duration: 3000 });
          this.cdr.markForCheck();
        }
      });
  }

  openMindmapModal(): void {
    this.isMindmapModalOpen = true;
    // Start collapsed — only central node visible, click to expand
    this.expandedNodes = new Set();
    this.selectedMindmapNode = null;
  }

  closeMindmapModal(): void {
    this.isMindmapModalOpen = false;
  }

  toggleMindmapNode(nodeId: string): void {
    if (this.expandedNodes.has(nodeId)) {
      this.collapseNodeAndChildren(nodeId);
    } else {
      this.expandedNodes.add(nodeId);
    }
    this.selectedMindmapNode = nodeId;
    this.cdr.markForCheck();
  }

  private collapseNodeAndChildren(nodeId: string): void {
    this.expandedNodes.delete(nodeId);
    const children = this.getChildrenOf(nodeId);
    children.forEach(c => this.collapseNodeAndChildren(c.id));
  }

  toggleCentralNode(): void {
    if (this.expandedNodes.has('__central__')) {
      this.expandedNodes.clear();
      this.selectedMindmapNode = null;
    } else {
      this.expandedNodes.add('__central__');
      this.selectedMindmapNode = null;
    }
    this.cdr.markForCheck();
  }

  isCentralExpanded(): boolean {
    return this.expandedNodes.has('__central__');
  }

  isNodeExpanded(nodeId: string): boolean {
    return this.expandedNodes.has(nodeId);
  }

  isNodeVisible(nodeId: string): boolean {
    const node = this.mindmapData?.nodes?.find(n => n.id === nodeId);
    if (!node) return false;
    if (node.parentId === 'central') return this.isCentralExpanded();
    return this.expandedNodes.has(node.parentId);
  }

  getChildrenOf(parentId: string): Array<{id: string; label: string; parentId: string; level: number}> {
    if (!this.mindmapData) return [];
    return this.mindmapData.nodes.filter(n => n.parentId === parentId);
  }

  getLevel1Nodes(): Array<{id: string; label: string; parentId: string; level: number}> {
    return this.getChildrenOf('central');
  }

  copyMessage(content: string): void {
    navigator.clipboard.writeText(content).then(() => {
      this.snackBar.open('Copied to clipboard', 'Close', { duration: 2000 });
    });
  }

  // ── Quiz Methods ──

  openQuizTool(): void {
    this.generateQuiz();
  }

  generateQuiz(): void {
    if (this.selectedDocuments.size === 0) {
      this.snackBar.open('Select at least one document first', 'Close', { duration: 3000 });
      return;
    }
    const genId = 'qz_' + Date.now();
    const sourceCount = this.selectedDocuments.size;
    this.generatingItems.unshift({ id: genId, type: 'quiz', sourceCount });
    this.cdr.markForCheck();

    const docIds = Array.from(this.selectedDocuments);
    this.documentService.generateQuiz(docIds, 10, 'medium')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result: any) => {
          this.generatingItems = this.generatingItems.filter(i => i.id !== genId);
          const questions = result.questions || [];
          const title = `Quiz — ${questions.length} Questions`;
          this.documentService.saveStudioArtifact(this.notebookId, 'quiz', JSON.stringify(questions), title)
            .pipe(takeUntil(this.destroy$))
            .subscribe(() => this.loadArtifactsList());
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          this.generatingItems = this.generatingItems.filter(i => i.id !== genId);
          this.snackBar.open('Failed to generate quiz', 'Close', { duration: 3000 });
          this.cdr.markForCheck();
        }
      });
  }

  openQuizModal(): void {
    this.isQuizModalOpen = true;
    this.currentQuizIndex = 0;
    this.selectedAnswer = null;
    this.quizAnswered = false;
    this.quizScore = 0;
    this.quizMode = 'answering';
  }

  closeQuizModal(): void {
    this.isQuizModalOpen = false;
  }

  selectQuizAnswer(index: number): void {
    if (this.quizAnswered) return;
    this.selectedAnswer = index;
    this.cdr.markForCheck();
  }

  submitQuizAnswer(): void {
    if (this.selectedAnswer === null) return;
    this.quizAnswered = true;
    if (this.selectedAnswer === this.quizQuestions[this.currentQuizIndex].correctIndex) {
      this.quizScore++;
    }
    this.cdr.markForCheck();
    setTimeout(() => {
      if (this.quizActionsEl?.nativeElement) {
        this.quizActionsEl.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 50);
  }

  nextQuizQuestion(): void {
    if (this.currentQuizIndex < this.quizQuestions.length - 1) {
      this.currentQuizIndex++;
      this.selectedAnswer = null;
      this.quizAnswered = false;
    } else {
      this.quizMode = 'results';
    }
  }

  // ── Summary Methods ──

  openSummaryTool(): void {
    this.generateDocSummary();
  }

  generateDocSummary(): void {
    if (this.selectedDocuments.size === 0) {
      this.snackBar.open('Select at least one document first', 'Close', { duration: 3000 });
      return;
    }
    const genId = 'sum_' + Date.now();
    const sourceCount = this.selectedDocuments.size;
    this.generatingItems.unshift({ id: genId, type: 'summary', sourceCount });
    this.cdr.markForCheck();

    const docIds = Array.from(this.selectedDocuments);
    this.documentService.generateDocSummary(docIds)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result: any) => {
          this.generatingItems = this.generatingItems.filter(i => i.id !== genId);
          const summaryText = result.summary || '';
          const title = `Summary — ${new Date().toLocaleDateString()}`;
          this.documentService.saveStudioArtifact(this.notebookId, 'summary', summaryText, title)
            .pipe(takeUntil(this.destroy$))
            .subscribe(() => this.loadArtifactsList());
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          this.generatingItems = this.generatingItems.filter(i => i.id !== genId);
          this.snackBar.open('Failed to generate summary', 'Close', { duration: 3000 });
          this.cdr.markForCheck();
        }
      });
  }

  closeSummaryModal(): void {
    this.isSummaryModalOpen = false;
  }

  /**
   * Download the current summary as a styled HTML file (opens as printable page).
   * Uses Blob + anchor click — no pop-up permission required.
   */
  downloadSummaryAsPdf(): void {
    if (!this.docSummaryText) return;

    const title = `Summary — ${this.notebookName}`;
    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>${title}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
  body { font-family: 'Inter', sans-serif; max-width: 760px; margin: 48px auto; padding: 0 24px;
         color: #1a1a2e; line-height: 1.75; background: #fff; }
  h1 { font-size: 1.7rem; font-weight: 700; color: #1a1a2e; border-bottom: 2px solid #e0e0e0;
       padding-bottom: 12px; margin-bottom: 24px; }
  h2 { font-size: 1.25rem; font-weight: 600; margin-top: 2rem; color: #2d2d44; }
  h3 { font-size: 1.05rem; font-weight: 600; margin-top: 1.5rem; color: #3d3d55; }
  p { margin: 0.75rem 0; }
  ul, ol { padding-left: 1.6rem; }
  li { margin: 0.35rem 0; }
  code { background: #f0f0f5; padding: 2px 6px; border-radius: 4px; font-size: 0.88em; }
  blockquote { border-left: 4px solid #7c3aed; margin: 1.2rem 0; padding: 8px 16px;
               background: #f5f3ff; border-radius: 0 6px 6px 0; color: #4c1d95; }
  table { border-collapse: collapse; width: 100%; margin: 1.2rem 0; }
  th, td { border: 1px solid #e5e7eb; padding: 10px 14px; text-align: left; }
  th { background: #f9fafb; font-weight: 600; }
  .footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e0e0e0;
            font-size: 0.8rem; color: #9ca3af; }
</style></head><body>
<h1>${title}</h1>
${this.docSummaryText}
<div class="footer">Generated by NotebookLM · ${new Date().toLocaleDateString()}</div>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.notebookName.replace(/[^a-z0-9]/gi, '_')}_summary.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ── Artifacts List Methods ──

  getArtifactIcon(type: string): string {
    switch (type.toUpperCase()) {
      case 'FLASHCARDS': return 'style';
      case 'MINDMAP': return 'account_tree';
      case 'QUIZ': return 'quiz';
      case 'SUMMARY': return 'summarize';
      default: return 'description';
    }
  }

  getStudioLabel(type: string): string {
    switch (type.toUpperCase()) {
      case 'FLASHCARDS': return 'Flashcards';
      case 'MINDMAP': return 'Mind Map';
      case 'QUIZ': return 'Quiz';
      case 'SUMMARY': return 'Summary';
      default: return type;
    }
  }

  timeAgo(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = now - then;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  openArtifact(artifact: {id: number; type: string; title: string; createdAt: string; data?: string}): void {
    if (!artifact.data) return;
    const type = artifact.type.toUpperCase();
    if (type === 'FLASHCARDS') {
      this.flashcards = JSON.parse(artifact.data);
      this.currentFlashcardIndex = 0;
      this.isFlashcardFlipped = false;
      this.flashcardMode = 'study';
      this.flashcardResults = { got: 0, missed: 0 };
      this.missedCards = [];
      this.isFlashcardModalOpen = true;
    } else if (type === 'MINDMAP') {
      this.mindmapData = JSON.parse(artifact.data);
      this.expandedNodes = new Set();
      this.isMindmapModalOpen = true;
    } else if (type === 'QUIZ') {
      this.quizQuestions = JSON.parse(artifact.data);
      this.openQuizModal();
    } else if (type === 'SUMMARY') {
      this.docSummaryText = marked.parse(artifact.data, { async: false }) as string;
      this.isSummaryModalOpen = true;
    }
    this.cdr.markForCheck();
  }

  deleteArtifact(artifactId: number, event: Event): void {
    event.stopPropagation();
    this.documentService.deleteStudioArtifact(this.notebookId, artifactId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.studioArtifacts = this.studioArtifacts.filter(a => a.id !== artifactId);
        this.cdr.markForCheck();
      });
  }

  goBack(): void {
    this.router.navigate(['/notecomlm']);
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.messagesEnd) {
        // Scroll only within the messages container, not the entire page
        this.messagesEnd.nativeElement.scrollIntoView({ 
          behavior: 'smooth',
          block: 'end',
          inline: 'nearest'
        });
      }
    }, 100);
  }

  trackByDocId(index: number, doc: Document): number {
    return doc.id;
  }

  trackByMessageId(index: number, msg: ChatMessage): string {
    return msg.id;
  }

  trackByNoteId(index: number, note: Note): number {
    return note.id;
  }

  /**
   * Get a human-friendly relative time string like "Just now", "2h ago", "Yesterday"
   */
  getRelativeTime(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  /**
   * Strip UUID prefix from filenames.
   * Converts 'b4da21cc-2e0f-4dd0-b63c-64fb34891398-proposal.md' → 'proposal.md'
   */
  cleanFileName(name: string): string {
    if (!name) return name;
    // Remove UUID prefix and .md extension
    return name
      .replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[-_]/i, '')
      .replace(/\.md$/i, '');
  }

  trackByNodeId(index: number, node: {id: string; label: string; group: string}): string {
    return node.id;
  }

  /**
   * Format message content with clickable citations
   * Converts [1], [2], etc. into clickable superscript elements
   */
  /**
   * Render markdown during streaming (no citation processing).
   * Throttled: only re-parses when content grows by 10+ chars.
   */
  formatStreamingContent(content: string): SafeHtml {
    if (!content) return this.sanitizer.bypassSecurityTrustHtml('');
    // Throttle: only re-parse when content has grown enough to avoid excessive DOM updates
    if (Math.abs(content.length - this.streamingHtmlCache.length) < 10) {
      return this.streamingHtmlCache.html;
    }
    let html = marked.parse(content, { async: false }) as string;
    // Strip <a> tags — keep text content only (no blue clickable links)
    html = html.replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1');
    const result = this.sanitizer.bypassSecurityTrustHtml(html);
    this.streamingHtmlCache = { length: content.length, html: result };
    return result;
  }

  // Cache for formatted citation HTML to avoid re-rendering on every change detection
  private formattedMessageCache = new Map<string, SafeHtml>();

  formatMessageWithCitations(message: ChatMessage): SafeHtml {
    // Return cached version if content + citations haven't changed
    const cacheKey = message.id + '_' + (message.citations?.length || 0) + '_' + message.content.length;
    const cached = this.formattedMessageCache.get(cacheKey);
    if (cached) return cached;

    // Ensure citations array always exists (for backward compatibility with old messages)
    if (!message.citations) {
      message.citations = [];
    }
    
    let formattedContent = message.content;

    // Protect citation markers [N] from being parsed as markdown links
    // Replace them with unique placeholders before markdown rendering
    const citationPlaceholders: Map<string, string> = new Map();
    formattedContent = formattedContent.replace(/\[(\d+)\]/g, (match, num) => {
      const placeholder = `%%CITE_${num}%%`;
      citationPlaceholders.set(placeholder, num);
      return placeholder;
    });

    // Render markdown to HTML using marked
    formattedContent = marked.parse(formattedContent, { async: false }) as string;

    // Strip <a> tags from markdown output — keep text content only
    // This prevents blue clickable links in the chat messages
    formattedContent = formattedContent.replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1');

    // Restore citation placeholders with clickable citation elements
    if (message.citations && message.citations.length > 0) {
      const citationMap = new Map<number, any>();
      message.citations.forEach(citation => {
        citationMap.set(citation.citationIndex, citation);
      });

      citationPlaceholders.forEach((num, placeholder) => {
        const citationIndex = parseInt(num, 10);
        const citation = citationMap.get(citationIndex);
        let replacement: string;
        if (citation) {
          replacement = `<span class="citation-link" data-citation-id="${citation.id}" data-citation-index="${citation.citationIndex}" data-document-id="${citation.documentVersionId}" data-page="${citation.pageNumber}" title="Click to view source: ${citation.documentName}, Page ${citation.pageNumber + 1}">[${num}]</span>`;
        } else {
          replacement = `<span class="citation-link" data-citation-index="${citationIndex}">[${num}]</span>`;
        }
        formattedContent = formattedContent.replace(new RegExp(placeholder, 'g'), replacement);
      });
    } else {
      citationPlaceholders.forEach((num, placeholder) => {
        formattedContent = formattedContent.replace(
          new RegExp(placeholder, 'g'),
          `<span class="citation-link" data-citation-index="${parseInt(num, 10)}">[${num}]</span>`
        );
      });
    }

    // Cache and return (cap at 100 entries to prevent unbounded growth)
    const result = this.sanitizer.bypassSecurityTrustHtml(formattedContent);
    if (this.formattedMessageCache.size > 100) {
      const firstKey = this.formattedMessageCache.keys().next().value;
      if (firstKey !== undefined) this.formattedMessageCache.delete(firstKey);
    }
    this.formattedMessageCache.set(cacheKey, result);
    return result;
  }

  /**
   * Handle citation click - loads source document markdown content
   */
  onCitationClick(citationId: number): void {
    
    const citation = this.findCitationById(citationId);
    if (!citation) {
      this.snackBar.open('Citation not found', 'Close', { duration: 3000 });
      return;
    }
    
    // Validate citation has required fields
    if (!citation.documentVersionId) {
      this.snackBar.open('Citation data incomplete', 'Close', { duration: 3000 });
      return;
    }
    
    // Run inside zone so Angular picks up the state changes
    this.ngZone.run(() => {
      // Show source viewer in left panel (sources are on the left now)
      this.loadSourceDocument(citation);
    });
  }

  /**
   * Fallback citation click handler: find citation by its [N] index
   * when the unique ID is not available (e.g., old messages or LLM cited
   * a number not in the filtered set).
   */
  onCitationClickByIndex(citationIndex: number): void {
    // Search the most recent assistant message first (most likely source)
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const message = this.messages[i];
      if (message.role === 'assistant' && message.citations?.length) {
        const citation = message.citations.find(c => c.citationIndex === citationIndex);
        if (citation) {
          if (!citation.documentVersionId) {
            this.snackBar.open('Citation data incomplete', 'Close', { duration: 3000 });
            return;
          }
          this.ngZone.run(() => this.loadSourceDocument(citation));
          return;
        }
      }
    }
    this.snackBar.open('Citation source not available', 'Close', { duration: 3000 });
  }

  /**
   * Load document markdown (instant if cached, otherwise fetch)
   */
  loadSourceDocument(citation: Citation): void {
    const docId = String(citation.documentVersionId);
    
    // Check cache first — instant response
    const cached = this.markdownCache.get(docId);
    if (cached) {
      this.displayMarkdownWithHighlight(cached.markdown, cached.filename, citation);
      return;
    }
    
    // Check if a fetch is already in-flight (from prefetch or prior click)
    const inflight = this.markdownFetchInFlight.get(docId);
    if (inflight) {
      this.isLoadingSource = true;
      this.cdr.detectChanges();
      inflight.then(result => {
        this.ngZone.run(() => {
          this.displayMarkdownWithHighlight(result.markdown, result.filename, citation);
          this.isLoadingSource = false;
          this.cdr.detectChanges();
        });
      }).catch(() => {
        this.ngZone.run(() => {
          this.isLoadingSource = false;
          this.snackBar.open('Failed to load source document', 'Close', { duration: 3000 });
          this.cdr.detectChanges();
        });
      });
      return;
    }
    
    // Not cached, not in-flight — start new fetch
    this.isLoadingSource = true;
    this.cdr.detectChanges();
    
    const fetchPromise = new Promise<{markdown: string; filename: string}>((resolve, reject) => {
      this.documentService.getDocumentMarkdown(docId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (result) => {
            this.markdownCache.set(docId, { markdown: result.markdown, filename: result.filename });
            this.markdownFetchInFlight.delete(docId);
            resolve(result);
          },
          error: (err) => {
            this.markdownFetchInFlight.delete(docId);
            reject(err);
          }
        });
    });
    
    this.markdownFetchInFlight.set(docId, fetchPromise);
    
    fetchPromise.then(result => {
      this.ngZone.run(() => {
        this.displayMarkdownWithHighlight(result.markdown, result.filename, citation);
        this.isLoadingSource = false;
        this.cdr.detectChanges();
      });
    }).catch(err => {
      this.ngZone.run(() => {
        console.error(`Failed to load markdown for doc ${docId}:`, err);
        this.snackBar.open('Failed to load source document', 'Close', { duration: 3000 });
        this.isLoadingSource = false;
        this.cdr.detectChanges();
      });
    });
  }

  /**
   * Display markdown with citation excerpt highlighted
   */
  private displayMarkdownWithHighlight(markdown: string, filename: string, citation: Citation): void {
    // Try to inject a <mark> highlight directly into the raw markdown.
    // We build a mapping from normalized→original positions so the index is correct.
    let displayMarkdown = markdown;
    const excerpt = citation.excerpt || '';
    
    if (excerpt.length > 20) {
      const highlighted = this.injectMarkHighlight(markdown, excerpt);
      if (highlighted) {
        displayMarkdown = highlighted;
      }
    }
    
    // Update source viewer state
    this.sourceViewerState = {
      visible: true,
      documentId: String(citation.documentVersionId),
      documentName: this.cleanFileName(filename),
      pageNumber: citation.pageNumber,
      chunks: [{ content: displayMarkdown, chunkIndex: 0, metadata: {} }]
    };
    
    // Render the markdown into HTML for the template
    // Pass excerpt so renderSourceContent can also do block-level highlighting as fallback
    this.renderSourceContent(displayMarkdown, citation.excerpt);
    
    this.cdr.detectChanges();
    
    // Scroll to highlight after render
    setTimeout(() => this.scrollToHighlight(), 150);
  }

  /**
   * Inject <mark> tag into raw markdown at the correct position.
   * Builds a position map from normalized text back to original offsets
   * so whitespace differences don't break the index.
   */
  private injectMarkHighlight(markdown: string, excerpt: string): string | null {
    // Build normalized version WITH a map from normalized index → original index
    const origPositions: number[] = [];  // origPositions[normIdx] = originalIdx
    let norm = '';
    let lastWasSpace = false;
    
    for (let i = 0; i < markdown.length; i++) {
      const ch = markdown[i];
      const isWs = /\s/.test(ch);
      
      if (isWs) {
        if (!lastWasSpace) {
          norm += ' ';
          origPositions.push(i);
          lastWasSpace = true;
        }
      } else {
        norm += ch.toLowerCase();
        origPositions.push(i);
        lastWasSpace = false;
      }
    }
    
    // Normalize excerpt the same way
    const excerptNorm = excerpt
      .replace(/<!--.*?-->/gs, '')
      .replace(/==>.*?<==/gs, '')
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .trim();
    
    if (excerptNorm.length < 20) return null;
    
    const matchIdx = norm.indexOf(excerptNorm);
    if (matchIdx === -1) return null;
    
    // Map back to original positions
    const origStart = origPositions[matchIdx];
    const origEndNormIdx = matchIdx + excerptNorm.length - 1;
    const origEnd = origEndNormIdx < origPositions.length
      ? origPositions[origEndNormIdx] + 1
      : markdown.length;
    
    const actualExcerpt = markdown.substring(origStart, origEnd);
    return markdown.substring(0, origStart) +
      `<mark class="citation-highlight">${actualExcerpt}</mark>` +
      markdown.substring(origEnd);
  }

  /**
   * Load full document markdown (for view button click)
   */
  viewDocumentMarkdown(docId: number): void {
    const docIdStr = String(docId);
    const cached = this.markdownCache.get(docIdStr);
    
    if (cached) {
      this.sourceViewerState = {
        visible: true,
        documentId: docIdStr,
        documentName: this.cleanFileName(cached.filename),
        pageNumber: 0,
        chunks: [{ content: cached.markdown, chunkIndex: 0, metadata: {} }]
      };
      this.renderSourceContent(cached.markdown);
      this.cdr.detectChanges();
      return;
    }
    
    // Not cached - fetch it
    this.isLoadingSource = true;
    this.documentService.getDocumentMarkdown(docIdStr)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.markdownCache.set(docIdStr, {
            markdown: result.markdown,
            filename: result.filename
          });
          
          this.sourceViewerState = {
            visible: true,
            documentId: docIdStr,
            documentName: this.cleanFileName(result.filename),
            pageNumber: 0,
            chunks: [{ content: result.markdown, chunkIndex: 0, metadata: {} }]
          };
          this.renderSourceContent(result.markdown);
          this.isLoadingSource = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Failed to load markdown:', err);
          this.snackBar.open('Failed to load document', 'Close', { duration: 3000 });
          this.isLoadingSource = false;
        }
      });
  }

  /**
   * Render markdown content and apply highlighting
   */
  renderSourceContent(markdownText: string, excerpt?: string): void {
    try {
      // Clean the markdown before rendering
      let cleanedText = markdownText
        .replace(/<!--\s*PAGE\s+\d+\s*-->/gi, '')
        .replace(/==>.*?intentionally omitted.*?<==/gi, '')
        .replace(/\n{4,}/g, '\n\n\n');

      // Preserve any existing <mark> tags by replacing them with placeholders
      // Use special characters that markdown won't interpret
      const markPlaceholderOpen = '⟨⟨⟨CITATION_MARK_START⟩⟩⟩';
      const markPlaceholderClose = '⟨⟨⟨CITATION_MARK_END⟩⟩⟩';
      cleanedText = cleanedText
        .replace(/<mark class="citation-highlight">/g, markPlaceholderOpen)
        .replace(/<\/mark>/g, markPlaceholderClose);

      // Parse markdown to HTML
      let html = marked.parse(cleanedText) as string;
      
      // Strip <a> tags — keep text only, no blue links in source viewer
      html = html.replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1');
      
      // Restore <mark> tags from placeholders (use global string replace to ensure all are replaced)
      html = html.split(markPlaceholderOpen).join('<mark class="citation-highlight">');
      html = html.split(markPlaceholderClose).join('</mark>');

      // If no existing highlight and we have an excerpt, try to inject one into the HTML
      if (excerpt && excerpt.length > 20 && !html.includes('citation-highlight')) {
        const excerptClean = excerpt
          .replace(/<!--.*?-->/gs, '')
          .replace(/==>.*?<==/gs, '')
          .replace(/\s+/g, ' ')
          .trim();
        
        const plainText = html.replace(/<[^>]+>/g, '');
        const plainNorm = plainText.replace(/\s+/g, ' ').toLowerCase();
        const excerptNorm = excerptClean.replace(/\s+/g, ' ').toLowerCase();
        
        // Try progressively shorter search phrases until we find a match
        let found = false;
        for (const len of [80, 50, 30]) {
          if (found || excerptNorm.length < len) continue;
          const search = excerptNorm.substring(0, len).trim();
          if (plainNorm.includes(search)) {
            html = this.addHighlightToNearestBlock(html, search);
            found = true;
          }
        }
        
        // Last resort: use first 3+ significant words
        if (!found) {
          const words = excerptNorm.split(/\s+/).filter(w => w.length > 4).slice(0, 4);
          if (words.length >= 2) {
            html = this.addHighlightToNearestBlock(html, words.join(' '));
          }
        }
      }
      
      html = `<div class="source-content">${html}</div>`;
      this.sourceViewerState.renderedHtml = html;
    } catch (err) {
      console.error('Markdown parsing error:', err);
      const cleaned = markdownText
        .replace(/<!--\s*PAGE\s+\d+\s*-->/gi, '')
        .replace(/==>.*?intentionally omitted.*?<==/gi, '');
      this.sourceViewerState.renderedHtml = `<pre class="source-content">${cleaned}</pre>`;
    }
  }

  /**
   * Add highlight class to the block-level element that contains the search text.
   */
  private addHighlightToNearestBlock(html: string, searchText: string): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
    const blocks = doc.querySelectorAll('p, li, td, blockquote, h1, h2, h3, h4, h5, h6');
    
    // First pass: exact substring match
    for (const block of Array.from(blocks)) {
      const text = (block.textContent || '').replace(/\s+/g, ' ').toLowerCase();
      if (text.includes(searchText)) {
        block.classList.add('citation-highlight-block');
        return doc.querySelector('div')?.innerHTML || html;
      }
    }
    
    // Second pass: word-overlap match (>60% of search words found in block)
    const searchWords = searchText.split(/\s+/).filter(w => w.length > 3);
    if (searchWords.length >= 2) {
      let bestBlock: Element | null = null;
      let bestScore = 0;
      for (const block of Array.from(blocks)) {
        const text = (block.textContent || '').replace(/\s+/g, ' ').toLowerCase();
        let matched = 0;
        for (const w of searchWords) {
          if (text.includes(w)) matched++;
        }
        const score = matched / searchWords.length;
        if (score > bestScore && score >= 0.6) {
          bestScore = score;
          bestBlock = block;
        }
      }
      if (bestBlock) {
        bestBlock.classList.add('citation-highlight-block');
        return doc.querySelector('div')?.innerHTML || html;
      }
    }
    
    return html;
  }

  /**
   * Scroll to highlighted text in source viewer
   */
  scrollToHighlight(): void {
    const highlightElement = document.querySelector('.citation-highlight, .citation-highlight-block');
    if (highlightElement) {
      highlightElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  /**
   * Go back to sources list from source viewer
   */
  backToSourcesList(): void {
    this.sourceViewerState.visible = false;
    this.cdr.detectChanges();
  }

  /**
   * Sanitize HTML for safe rendering
   */
  getSanitizedHtml(html: string | undefined): SafeHtml {
    if (!html) return '';
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  /**
   * Find citation by ID across all messages
   */
  private findCitationById(citationId: number): Citation | undefined {
    for (const message of this.messages) {
      if (message.citations && message.citations.length > 0) {
        const citation = message.citations.find(c => c.id === citationId);
        if (citation) return citation;
      }
    }
    return undefined;
  }

  /**
   * Get all citations for a specific document (memoized per change)
   */
  getCitationsForDocument(documentId: number): Citation[] {
    if (this._citationsCacheBuiltFor !== this._citationsCacheVersion) {
      // Rebuild the full map once per version bump
      this._citationsCache.clear();
      this.messages.forEach(message => {
        if (message.role === 'assistant' && message.citations) {
          message.citations.forEach(c => {
            const docId = c.documentVersionId;
            const arr = this._citationsCache.get(docId as number) || [];
            arr.push(c);
            this._citationsCache.set(docId as number, arr);
          });
        }
      });
      this._citationsCacheBuiltFor = this._citationsCacheVersion;
    }
    return this._citationsCache.get(documentId) || [];
  }

  /** Invalidate citations cache (call after messages/citations change) */
  private invalidateCitationsCache(): void {
    this._citationsCacheVersion++;
  }

  /**
   * Highlight a specific document (for citation click)
   */
  private highlightedDocumentId: number | null = null;
  
  private highlightDocumentVersion(documentVersionId: number): void {
    // For now, just store it - in a full implementation, 
    // you'd match this to a Document ID
    this.highlightedDocumentId = documentVersionId;
    
    // Clear highlight after 3 seconds
    setTimeout(() => {
      this.highlightedDocumentId = null;
      this.cdr.detectChanges();
    }, 3000);
  }

  /**
   * Check if a document is currently highlighted
   */
  isDocumentHighlighted(documentId: number): boolean {
    return this.highlightedDocumentId === documentId;
  }

  /**
   * Start resizing panels
   */
  startResize(event: MouseEvent, target: 'left' | 'right'): void {
    event.preventDefault();
    event.stopPropagation();
    
    // Cache DOM elements
    this.leftPanel = document.querySelector('.sidebar-left') as HTMLElement;
    this.centerPanel = document.querySelector('.chat-area') as HTMLElement;
    this.rightPanel = document.querySelector('.sidebar-right') as HTMLElement;
    this.notebookContent = document.querySelector('.notebook-content') as HTMLElement;
    
    if (!this.notebookContent || !this.leftPanel || !this.centerPanel || !this.rightPanel) return;
    
    this.isResizing = true;
    this.resizeTarget = target;
    this.startX = event.clientX;
    this.startLeftWidth = this.leftPanel.offsetWidth;
    this.startCenterWidth = this.centerPanel.offsetWidth;
    this.startRightWidth = this.rightPanel.offsetWidth;
    
    // Get container width
    this.containerWidth = this.notebookContent.offsetWidth - 48 - 24; // padding + gaps
    
    // Disable transitions during drag
    this.leftPanel.style.transition = 'none';
    this.centerPanel.style.transition = 'none';
    this.rightPanel.style.transition = 'none';
    
    // Add resizing class
    const handle = event.target as HTMLElement;
    if (handle && handle.classList.contains('resize-handle')) {
      handle.classList.add('resizing');
    }
    
    // Add event listeners
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
    
    // Set cursor and prevent text selection
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  private onMouseMove = (event: MouseEvent): void => {
    if (!this.isResizing || !this.resizeTarget) return;
    if (!this.leftPanel || !this.centerPanel || !this.rightPanel) return;
    
    const deltaX = event.clientX - this.startX;
    
    if (this.resizeTarget === 'left') {
      // Resizing left panel
      const newLeftWidth = Math.max(this.containerWidth * 0.2, Math.min(this.containerWidth * 0.4, this.startLeftWidth + deltaX));
      const newCenterWidth = this.startCenterWidth - deltaX;
      
      if (newCenterWidth >= this.containerWidth * 0.3) {
        this.leftPanel.style.flexBasis = `${newLeftWidth}px`;
        this.centerPanel.style.flexBasis = `${newCenterWidth}px`;
        
        // Update percentage values for Angular
        this.leftPanelWidth = (newLeftWidth / this.containerWidth) * 100;
        this.centerPanelWidth = (newCenterWidth / this.containerWidth) * 100;
      }
    } else if (this.resizeTarget === 'right') {
      // Resizing right panel
      const newRightWidth = Math.max(this.containerWidth * 0.2, Math.min(this.containerWidth * 0.5, this.startRightWidth - deltaX));
      const newCenterWidth = this.startCenterWidth + deltaX;
      
      if (newCenterWidth >= this.containerWidth * 0.3) {
        this.rightPanel.style.flexBasis = `${newRightWidth}px`;
        this.centerPanel.style.flexBasis = `${newCenterWidth}px`;
        
        // Update percentage values for Angular
        this.rightPanelWidth = (newRightWidth / this.containerWidth) * 100;
        this.centerPanelWidth = (newCenterWidth / this.containerWidth) * 100;
      }
    }
  };

  private onMouseUp = (): void => {
    if (!this.isResizing) return;
    
    this.isResizing = false;
    this.resizeTarget = null;
    
    // Clear inline styles and let Angular bindings take over
    if (this.leftPanel) {
      this.leftPanel.style.transition = '';
      this.leftPanel.style.flexBasis = '';
    }
    if (this.centerPanel) {
      this.centerPanel.style.transition = '';
      this.centerPanel.style.flexBasis = '';
    }
    if (this.rightPanel) {
      this.rightPanel.style.transition = '';
      this.rightPanel.style.flexBasis = '';
    }
    
    // Remove resizing class
    document.querySelectorAll('.resize-handle.resizing').forEach(handle => {
      handle.classList.remove('resizing');
    });
    
    // Remove event listeners
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
    
    // Reset cursor and user-select
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    
    // Trigger change detection to apply percentage values
    this.cdr.detectChanges();
  };

  // ── Auto-hide navbar ────────────────────────────────────────────
  private navbarZone = 64;

  private onMouseMoveNavbar = (event: MouseEvent): void => {
    const appNavbar = document.querySelector('app-navbar, .app-navbar, nav.navbar') as HTMLElement;
    if (!appNavbar) return;
    if (event.clientY <= this.navbarZone) {
      appNavbar.style.transform = 'translateY(0)';
      appNavbar.style.opacity = '1';
    } else {
      appNavbar.style.transform = 'translateY(-100%)';
      appNavbar.style.opacity = '0';
    }
  };

  private onDocumentClick = (): void => {
    if (this.notebookMenuOpen) {
      this.notebookMenuOpen = false;
      this.cdr.detectChanges();
    }
  };

  // ── Three-dot notebook menu ─────────────────────────────────────
  notebookMenuOpen = false;
  showPersonalizeModal = false;
  personalizeTitle = '';
  personalizeThumbnailUrl = '';
  
  // Share modal state
  showShareModal = false;
  shareVisibility = 'PRIVATE';
  shareEmails = '';

  toggleNotebookMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.notebookMenuOpen = !this.notebookMenuOpen;
  }

  openPersonalizeModal(): void {
    console.log('[Personalize] Opening modal');
    console.log('[Personalize] Current notebook name:', this.notebookName);
    console.log('[Personalize] Current notebook ID:', this.currentNotebookId);
    
    this.notebookMenuOpen = false;
    this.personalizeTitle = this.notebookName || '';
    this.personalizeThumbnailUrl = '';
    this.showPersonalizeModal = true;
    this.cdr.markForCheck();
    
    console.log('[Personalize] Modal state:', {
      showPersonalizeModal: this.showPersonalizeModal,
      personalizeTitle: this.personalizeTitle
    });
  }

  onPersonalizeThumbnailSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.personalizeThumbnailUrl = reader.result as string;
      this.cdr.markForCheck();
    };
    reader.readAsDataURL(file);
  }

  savePersonalizeFromModal(): void {
    console.log('[Personalize] Button clicked');
    console.log('[Personalize] currentNotebookId:', this.currentNotebookId);
    console.log('[Personalize] personalizeTitle:', this.personalizeTitle);
    
    if (!this.currentNotebookId) {
      console.error('[Personalize] No notebook ID');
      this.snackBar.open('No active notebook', 'Close', { duration: 3000 });
      return;
    }
    
    // Validate title
    const trimmedTitle = this.personalizeTitle?.trim();
    console.log('[Personalize] trimmedTitle:', trimmedTitle);
    
    if (!trimmedTitle) {
      this.snackBar.open('Notebook title cannot be empty', 'Close', { duration: 3000 });
      return;
    }
    
    console.log('[Personalize] Sending request to backend...');
    
    this.conversationService.personalizeNotebook(this.currentNotebookId, {
      notebookTitle: trimmedTitle,
      thumbnailUrl: this.personalizeThumbnailUrl || undefined
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (updated) => {
        console.log('[Personalize] Success! Updated notebook:', updated);
        this.notebookName = updated.title || trimmedTitle;
        this.showPersonalizeModal = false;
        this.snackBar.open('Notebook personalised ✓', 'Close', { duration: 2000 });
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('[Personalize] Error:', err);
        this.snackBar.open('Failed to personalise notebook', 'Close', { duration: 3000 });
      }
    });
  }

  openShareModal(): void {
    this.notebookMenuOpen = false;
    this.shareEmails = '';
    this.shareVisibility = 'PRIVATE';
    this.showShareModal = true;
    this.cdr.markForCheck();
  }

  saveShare(): void {
    if (!this.currentNotebookId) return;
    
    const emails = this.shareEmails.split(',')
      .map(e => e.trim())
      .filter(Boolean);
    
    this.conversationService.shareNotebook(this.currentNotebookId, {
      visibility: this.shareVisibility,
      emailList: emails.length ? emails : undefined
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.showShareModal = false;
        this.snackBar.open('Notebook shared successfully ✓', 'Close', { duration: 2000 });
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Failed to share notebook:', err);
        this.snackBar.open('Failed to share notebook', 'Close', { duration: 3000 });
      }
    });
  }

  deleteHistory(): void {
    this.notebookMenuOpen = false;
    if (this.currentNotebookId) {
      this.confirmModalTitle   = 'Delete Notebook';
      this.confirmModalMessage = 'This will permanently delete this notebook. Cannot be undone.';
      this.confirmAction = () => {
        this.conversationService.deleteNotebook(this.currentNotebookId!)
          .subscribe(() => {
            this.router.navigate(['/notecomlm']);
            this.closeConfirmModal();
          });
      };
      this.showConfirmModal = true;
    }
  }
}
