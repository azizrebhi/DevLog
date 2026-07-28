import './NotebookPage.css'

const sourceCards = [
  {
    icon: 'description',
    title: 'OWASP-BLT-GSoC-Proposal.pdf',
    status: 'Ready',
  },
  {
    icon: 'article',
    title: 'BLT-MCP-Architecture.docx',
    status: 'Ready',
  },
  {
    icon: 'note',
    title: 'Security-Checklist.md',
    status: 'Ready',
  },
]

const suggestedQuestions = [
  'What are the primary goals of the BLT-MCP and BLT-CLI project?',
  'How is context window overflow handled across large responses?',
  'What are the five layers of the proposed security model?',
]

const messages = [
  {
    role: 'assistant',
    content:
      'The project aims to create a unified interface to BLT through two surfaces: a production-ready MCP server for AI agents and a developer-facing CLI. Both are backed by a shared Python client layer so implementation is reused across interfaces. [S1] [S2] [S4]',
  },
  {
    role: 'user',
    content: 'Summarize the architecture decisions in one paragraph.',
  },
  {
    role: 'assistant',
    content:
      'The design favors a no-framework Python MCP server to keep tool lifecycle control, compact serialization, and security boundaries explicit. The CLI remains a parallel interface for developers, while the shared client layer keeps parity and reduces duplication. [S2] [S3]',
  },
]

const studioCards = [
  {
    icon: 'style',
    label: 'Flashcards',
    tone: 'flashcards',
  },
  {
    icon: 'account_tree',
    label: 'Mind Map',
    tone: 'mindmap',
  },
  {
    icon: 'quiz',
    label: 'Quiz',
    tone: 'quiz',
  },
  {
    icon: 'summarize',
    label: 'Summary',
    tone: 'summary',
  },
]

const studioArtifacts = [
  {
    icon: 'summarize',
    title: 'Studio Summary',
    meta: '3 sources · 2m ago',
  },
  {
    icon: 'edit_note',
    title: 'Saved Note',
    meta: '1m ago',
  },
]

export default function NotebookPage() {
  return (
    <div className="notebook-container">
      <header className="notebook-header">
        <div className="header-left">
          <div className="notebook-icon" aria-hidden="true">
            <span className="material-symbols-outlined notebook-icon-glyph">auto_awesome</span>
          </div>
          <h1 className="notebook-title">Research Notebook</h1>
        </div>
        <div className="header-actions">
          <button type="button" className="header-btn">
            <span className="material-symbols-outlined header-btn-icon" aria-hidden="true">share</span>
            <span>Share</span>
          </button>
          <button type="button" className="header-btn">
            <span className="material-symbols-outlined header-btn-icon" aria-hidden="true">tune</span>
            <span>Personalize</span>
          </button>
        </div>
      </header>

      <div className="notebook-content">
        <aside className="sidebar-left">
          <div className="sidebar-header">
            <h2>Sources</h2>
            <button type="button" className="sidebar-collapse-btn" aria-label="Collapse sources panel">
              <span className="material-symbols-outlined" aria-hidden="true">chevron_left</span>
            </button>
          </div>

          <div className="sources-list-container">
            <div className="sidebar-pane-actions">
              <button type="button" className="add-source-btn">
                <span className="material-symbols-outlined" aria-hidden="true">add</span>
                <span>Add sources</span>
              </button>
            </div>

            <div className="select-all-row">
              <span className="select-all-label">Select all sources</span>
              <input type="checkbox" checked readOnly />
            </div>

            <div className="document-list-wrapper">
              <div className="document-list">
            {sourceCards.map((item) => (
                  <div key={item.title} className="document-item selected">
                    <div className="doc-icon-wrapper">
                      <span className="material-symbols-outlined doc-type-icon" aria-hidden="true">{item.icon}</span>
                    </div>
                    <div className="document-info">
                      <span className="doc-name">{item.title}</span>
                      <span className="doc-status">{item.status}</span>
                    </div>
                    <input type="checkbox" checked readOnly className="doc-checkbox" />
                  </div>
            ))}
              </div>
            </div>
          </div>
        </aside>

        <div className="resize-handle" aria-hidden="true"></div>

        <main className="chat-area">
          <div className="chat-header">
            <h2>Research Notebook</h2>
            <button type="button" className="nv-menu-btn" aria-label="Open notebook menu">
              <span className="material-symbols-outlined" aria-hidden="true">more_vert</span>
            </button>
          </div>

          <div className="messages-container">
            <div className="messages-scroll">
              <div className="messages-list">
                <div className="chat-empty">
                  <div className="empty-content">
                    <h2 className="empty-title">Research Notebook</h2>
                    <p className="empty-meta">{sourceCards.length} sources</p>

                    <div className="source-guide">
                      <div className="source-guide-header">
                        <span className="material-symbols-outlined" aria-hidden="true">menu_book</span>
                        <span>Source Guide</span>
                      </div>
                      <p className="source-guide-summary">
                        This notebook collects proposal material, architecture notes, and security guidance so you can query the BLT project from one grounded workspace.
                      </p>
                    </div>

                    <div className="suggested-questions">
                      <div className="question-chips">
                        {suggestedQuestions.map((question) => (
                          <button key={question} type="button" className="question-chip">
                            {question}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`message ${message.role === 'assistant' ? 'assistant-message' : 'user-message'}`}
                  >
                    <div className="message-body">
                      {message.role === 'assistant' ? (
                        <>
                          <p className="message-text">{message.content}</p>
                          <div className="message-actions">
                            <button type="button" className="mini-action">
                              <span className="material-symbols-outlined mini-action-icon" aria-hidden="true">bookmark_add</span>
                              <span>Save to note</span>
                            </button>
                            <button type="button" className="mini-action">
                              <span className="material-symbols-outlined mini-action-icon" aria-hidden="true">content_copy</span>
                              <span>Copy</span>
                            </button>
                          </div>
                        </>
                      ) : (
                        <p className="user-text">{message.content}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="chat-input-container">
            <div className="pill-input-wrapper">
              <input
                type="text"
                placeholder="Ask a question about your sources..."
                aria-label="Ask a question about your sources"
              />
              <button type="button" className="send-btn" aria-label="Send question">
                <span className="material-symbols-outlined" aria-hidden="true">send</span>
              </button>
            </div>
            <p className="disclaimer">AI may generate inaccurate info. Verify important facts.</p>
          </div>
        </main>

        <div className="resize-handle" aria-hidden="true"></div>

        <aside className="sidebar-right">
          <div className="sidebar-header">
            <h2>Studio</h2>
            <button type="button" className="sidebar-collapse-btn" aria-label="Collapse studio panel">
              <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
            </button>
          </div>

          <div className="studio-grid">
            {studioCards.map((card) => (
              <button key={card.label} type="button" className={`studio-card studio-card--${card.tone}`}>
                <span className="material-symbols-outlined studio-card-icon" aria-hidden="true">{card.icon}</span>
                <span className="studio-card-label">{card.label}</span>
                <span className="material-symbols-outlined studio-card-action" aria-hidden="true">chevron_right</span>
              </button>
            ))}
          </div>

          <p className="studio-hint">Generated tools and saved notes will appear here.</p>

          <div className="studio-output-list">
            {studioArtifacts.map((artifact) => (
              <div key={artifact.title} className="gen-card gen-card--done">
                <span className="material-symbols-outlined gen-card-icon" aria-hidden="true">{artifact.icon}</span>
                <div className="gen-card-info">
                  <span className="gen-card-title">{artifact.title}</span>
                  <span className="gen-card-meta">{artifact.meta}</span>
                </div>
                <button type="button" className="gen-card-delete" aria-label={`Delete ${artifact.title}`}>
                  <span className="material-symbols-outlined" aria-hidden="true">close</span>
                </button>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}
