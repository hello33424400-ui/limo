import { GoogleGenAI, Type } from '@google/genai';
import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

// Define the new, enhanced structure for a generated application
interface Theme {
  backgroundColor: string;
  primaryColor: string;
  textColor: string;
  headerFont: string;
  bodyFont: string;
}

interface AppCode {
  html: string;
  css: string;
  javascript: string;
}

interface AppData {
  appName: string;
  theme: Theme;
  code: AppCode;
}

type ActiveTab = 'preview' | 'code';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

@customElement('limo-app')
export class LimoApp extends LitElement {
  @state()
  private prompt = '';

  @state()
  private isLoading = false;

  @state()
  private error: string | null = null;

  @state()
  private appData: AppData | null = null;

  @state()
  private activeTab: ActiveTab = 'preview';

  private handlePromptInput(e: Event) {
    const input = e.target as HTMLTextAreaElement;
    this.prompt = input.value;
  }

  private async handleGenerateClick() {
    if (!this.prompt || this.isLoading) {
      return;
    }

    this.isLoading = true;
    this.error = null;
    this.appData = null;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        appName: { type: Type.STRING, description: 'A creative name for the application, website, or game.' },
        theme: {
          type: Type.OBJECT,
          description: 'A cohesive design theme.',
          properties: {
            backgroundColor: { type: Type.STRING, description: 'A CSS background color (e.g., #FFFFFF).' },
            primaryColor: { type: Type.STRING, description: 'The main accent color for buttons and interactive elements (e.g., #4A90E2).' },
            textColor: { type: Type.STRING, description: 'The primary text color (e.g., #333333).' },
            headerFont: { type: Type.STRING, description: 'The name of a Google Font for headers (e.g., "Poppins").' },
            bodyFont: { type: Type.STRING, description: 'The name of a Google Font for body text (e.g., "Lato").' },
          },
          required: ['backgroundColor', 'primaryColor', 'textColor', 'headerFont', 'bodyFont'],
        },
        code: {
          type: Type.OBJECT,
          description: 'The complete source code for the application.',
          properties: {
            html: { type: Type.STRING, description: 'The full HTML body content.' },
            css: { type: Type.STRING, description: 'The complete CSS for styling. It should not include a body tag selector, but can style other elements.' },
            javascript: { type: Type.STRING, description: 'The complete JavaScript code for interactivity and logic.' },
          },
          required: ['html', 'css', 'javascript'],
        },
      },
      required: ['appName', 'theme', 'code'],
    };

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Generate a complete, functional, single-page application, website, or game based on the following idea. You must provide a full set of HTML, CSS, and JavaScript code. Also, create a cohesive and visually appealing design theme with modern colors and Google Fonts. Your response must be a JSON object that strictly follows the provided schema. Idea: "${this.prompt}"`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
        },
      });

      const jsonText = response.text.trim();
      this.appData = JSON.parse(jsonText);
      this.activeTab = 'preview';
    } catch (e) {
      console.error(e);
      this.error = 'Failed to generate the app. The model may have returned an unexpected format. Please try a different prompt.';
    } finally {
      this.isLoading = false;
    }
  }

  private getIframeContent() {
    if (!this.appData) return '';
    const { theme, code } = this.appData;
    const fontUrl = `https://fonts.googleapis.com/css2?family=${theme.headerFont.replace(/ /g, '+')}:wght@400;700&family=${theme.bodyFont.replace(/ /g, '+')}:wght@400;700&display=swap`;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <link rel="stylesheet" href="${fontUrl}">
          <style>
            :root {
              --website-bg-color: ${theme.backgroundColor};
              --website-primary-color: ${theme.primaryColor};
              --website-text-color: ${theme.textColor};
              --website-header-font: '${theme.headerFont}', sans-serif;
              --website-body-font: '${theme.bodyFont}', sans-serif;
            }
            body {
              background-color: var(--website-bg-color);
              color: var(--website-text-color);
              font-family: var(--website-body-font);
              margin: 0;
              padding: 1rem;
              box-sizing: border-box;
            }
            h1, h2, h3 {
              font-family: var(--website-header-font);
            }
            button, input[type="button"], input[type="submit"] {
              background-color: var(--website-primary-color);
              color: white; /* Assuming white text on primary color is best */
              border: none;
              padding: 0.75em 1.5em;
              border-radius: 6px;
              cursor: pointer;
              font-family: var(--website-body-font);
            }
            ${code.css}
          </style>
        </head>
        <body>
          ${code.html}
          <script>
            ${code.javascript}
          <\/script>
        </body>
      </html>
    `;
  }
    
  private copyCode(code: string) {
    navigator.clipboard.writeText(code);
    // Maybe add a toast notification later
  }

  private renderCodeBlock(language: string, code: string) {
    return html`
        <div class="code-block">
            <div class="code-header">
                <span>${language}</span>
                <button class="copy-button" @click=${() => this.copyCode(code)}>Copy</button>
            </div>
            <pre><code>${code}</code></pre>
        </div>
    `;
  }

  private renderOutput() {
    if (this.isLoading) {
        return html`<div class="placeholder"><div class="spinner"></div></div>`;
    }
    if (this.error) {
        return html`<div class="error-message">${this.error}</div>`;
    }
    if (!this.appData) {
        return html`
        <div class="placeholder">
            <div class="placeholder-icon">✨</div>
            <h2>Your generated app will appear here</h2>
            <p>Describe your idea for an app, game, or website on the left and click "Generate" to start.</p>
        </div>`;
    }

    return html`
      <div class="tab-bar">
        <button class="tab-button" ?active=${this.activeTab === 'preview'} @click=${() => this.activeTab = 'preview'}>Preview</button>
        <button class="tab-button" ?active=${this.activeTab === 'code'} @click=${() => this.activeTab = 'code'}>Code</button>
      </div>
      <div class="tab-content">
        ${this.activeTab === 'preview'
          ? html`<div class="preview-content"><iframe srcdoc=${this.getIframeContent()}></iframe></div>`
          : html`
            <div class="code-content">
                ${this.renderCodeBlock('HTML', this.appData.code.html)}
                ${this.renderCodeBlock('CSS', this.appData.code.css)}
                ${this.renderCodeBlock('JavaScript', this.appData.code.javascript)}
            </div>`
        }
      </div>
    `;
  }

  render() {
    return html`
      <div class="main-container">
        <div class="control-panel">
            <header>
            <h1>Limo</h1>
            <p>Describe your idea. AI will write the code for a full app, game, or website.</p>
            </header>
            <section class="input-section">
                <textarea
                    .value=${this.prompt}
                    @input=${this.handlePromptInput}
                    placeholder="e.g., A simple Tic-Tac-Toe game"
                    ?disabled=${this.isLoading}
                ></textarea>
                <button
                    class="generate-button"
                    @click=${this.handleGenerateClick}
                    ?disabled=${this.isLoading || !this.prompt}
                >
                    ${this.isLoading
                    ? html`<div class="spinner"></div> Generating...`
                    : '🚀 Generate App'}
                </button>
            </section>
        </div>
        <div class="output-panel">
            ${this.renderOutput()}
        </div>
      </div>
    `;
  }

  // All styles are now in index.css
  createRenderRoot() {
    return this;
  }
}

document.body.innerHTML = ''; // Clear previous content
document.body.appendChild(document.createElement('limo-app'));