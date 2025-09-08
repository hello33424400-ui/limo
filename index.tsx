
import { GoogleGenAI, Type } from '@google/genai';
import { LitElement, html, css, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

const BUILD_PROPOSAL_TOKEN = '[PROPOSE_BUILD]';

// FIX: Define interfaces for complex data structures to provide strong typing throughout the component.
interface AppData {
  appName: string;
  theme: {
    backgroundColor: string;
    primaryColor: string;
    textColor: string;
    headerFont: string;
    bodyFont: string;
  };
  code: {
    html: string;
    css: string;
    javascript: string;
  };
}

interface Attachment {
  file: File;
  dataUrl: string;
  type: 'image' | 'audio';
}

interface DisplayMessage {
  author: 'limo' | 'user';
  text: string;
  attachment?: { url: string; type: 'image' | 'audio' };
  proposeBuild?: boolean;
  buildCompleted?: boolean;
}

interface HistoryPart {
    text?: string;
    inlineData?: {
        mimeType: string;
        data: string;
    };
}

interface HistoryContent {
    role: 'user' | 'model';
    parts: HistoryPart[];
}

export class LimoApp extends LitElement {
  // FIX: Declare class properties with their types to resolve "Property does not exist" TypeScript errors.
  apiKeyMissing: boolean;
  ai: GoogleGenAI | null;
  currentPrompt: string;
  isLoading: boolean;
  error: string | null;
  appData: AppData | null;
  activeTab: 'preview' | 'code';
  history: HistoryContent[];
  displayHistory: DisplayMessage[];
  isFullscreen: boolean;
  attachment: Attachment | null;

  // Define reactive properties using the static properties field
  static get properties() {
    return {
      apiKeyMissing: { state: true },
      currentPrompt: { state: true },
      isLoading: { state: true },
      error: { state: true },
      appData: { state: true },
      activeTab: { state: true },
      history: { state: true },
      displayHistory: { state: true },
      isFullscreen: { state: true },
      attachment: { state: true },
    };
  }

  constructor() {
    super();
    // Initialize properties
    this.apiKeyMissing = false;
    this.ai = null;
    this.currentPrompt = '';
    this.isLoading = false;
    this.error = null;
    this.appData = null;
    this.activeTab = 'preview';
    this.history = [];
    this.displayHistory = [{
      author: 'limo',
      text: "Hello! I'm Limo, now upgraded with advanced capabilities. I can help you design and build complex web applications, interactive 3D experiences, data visualizations, and more. Describe your most ambitious idea, and let's build it together."
    }];
    this.isFullscreen = false;
    this.attachment = null;

    // API Key setup
    // This safely checks for the API key. In a browser environment without a build tool
    // to replace process.env, 'process' will be undefined, and apiKey will be null.
    const apiKey = typeof process !== 'undefined' && process.env ? process.env.API_KEY : undefined;

    if (!apiKey) {
      this.apiKeyMissing = true;
      console.error("Limo app critical error: API_KEY environment variable is not set.");
    } else {
      this.ai = new GoogleGenAI({ apiKey: apiKey });
    }
  }

  handlePromptInput(e: Event) {
    const input = e.target as HTMLInputElement;
    this.currentPrompt = input.value;
  }

  handlePromptKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.handleSendMessage();
    }
  }

  async handleFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/') && !file.type.startsWith('audio/')) {
      this.error = 'Unsupported file type. Please select an image or audio file.';
      input.value = '';
      return;
    }

    this.error = null;
    const reader = new FileReader();
    reader.onload = () => {
      const type = file.type.startsWith('image/') ? 'image' : 'audio';
      this.attachment = { file, dataUrl: reader.result as string, type };
    };
    reader.readAsDataURL(file);
    input.value = ''; // Allow re-selecting the same file
  }

  removeAttachment() {
    this.attachment = null;
  }

  // Handles sending a message. Routes to modification or initial chat flow.
  async handleSendMessage() {
    const userText = this.currentPrompt.trim();
    if ((!userText && !this.attachment) || this.isLoading) {
      return;
    }

    // If an app already exists, treat the message as a modification request.
    if (this.appData) {
      this.handleModificationRequest(userText);
      return;
    }

    this.isLoading = true;
    this.error = null;
    this.currentPrompt = ''; // Clear input immediately

    // FIX: Explicitly type displayMessage to allow adding the 'attachment' property conditionally.
    const displayMessage: DisplayMessage = { author: 'user', text: userText };
    const userParts: HistoryPart[] = [];

    if (this.attachment) {
      displayMessage.attachment = { url: this.attachment.dataUrl, type: this.attachment.type };
      const [header, base64Data] = this.attachment.dataUrl.split(',');
      const mimeType = header.match(/:(.*?);/)?.[1] || this.attachment.file.type;
      userParts.push({ inlineData: { mimeType, data: base64Data } });
    }

    if (userText) {
      userParts.push({ text: userText });
    }
    
    this.displayHistory = [...this.displayHistory, displayMessage];
    const newUserContent: HistoryContent = { role: 'user', parts: userParts };
    const currentHistory = [...this.history, newUserContent];
    this.attachment = null; // Clear attachment after preparing it for send

    try {
      const chatSystemInstruction = `You are Limo, a master AI software architect and developer. Your goal is to have a detailed conversation with the user to help them specify their idea for any web-based project, from a simple website to a complex, interactive 3D application. You are an expert in modern web technologies, including HTML, CSS, JavaScript, and advanced libraries like Three.js for 3D graphics, D3.js for data visualization, and more. Ask clarifying questions about features, design, user interaction, and technical requirements. Guide them towards a complete plan. Do NOT output JSON or code. When you believe you have a clear and complete specification from the conversation, end your response with the exact token "${BUILD_PROPOSAL_TOKEN}" and nothing else after it.`;

      const response = await this.ai!.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: currentHistory,
        config: {
          systemInstruction: chatSystemInstruction
        }
      });

      let aiText = response.text.trim();
      const proposeBuild = aiText.endsWith(BUILD_PROPOSAL_TOKEN);
      if (proposeBuild) {
        aiText = aiText.replace(BUILD_PROPOSAL_TOKEN, '').trim();
      }

      const aiMessage: DisplayMessage = { author: 'limo', text: aiText, proposeBuild };
      this.displayHistory = [...this.displayHistory, aiMessage];
      this.history = [...currentHistory, { role: 'model', parts: [{ text: aiText }] }]; // Save cleaned text to history

    } catch (e) {
      this.error = this.handleApiError(e);
      this.displayHistory.pop(); // Remove the user's message that failed
    } finally {
      this.isLoading = false;
    }
  }

  // Handles modification of an existing app
  async handleModificationRequest(modificationPrompt: string) {
    if (!this.appData) return;

    this.isLoading = true;
    this.error = null;

    // 1. Prepare user content for display and for history
    // FIX: Explicitly type displayMessage to allow adding the 'attachment' property conditionally.
    const displayMessage: DisplayMessage = { author: 'user', text: modificationPrompt };
    const historyUserParts: HistoryPart[] = [];

    if (this.attachment) {
      displayMessage.attachment = { url: this.attachment.dataUrl, type: this.attachment.type };
      const [header, base64Data] = this.attachment.dataUrl.split(',');
      const mimeType = header.match(/:(.*?);/)?.[1] || this.attachment.file.type;
      historyUserParts.push({ inlineData: { mimeType, data: base64Data } });
    }
    if (modificationPrompt) {
        historyUserParts.push({ text: modificationPrompt });
    }

    // Update UI
    this.displayHistory = [...this.displayHistory, displayMessage];
    this.displayHistory = [...this.displayHistory, { author: 'limo', text: "Okay, I'm updating the app with your changes..." }];
    this.currentPrompt = '';
    this.attachment = null;

    // 2. Prepare the full prompt for the API call
    const apiCallParts: HistoryPart[] = [];
    const imagePart = historyUserParts.find(p => 'inlineData' in p);
    if(imagePart) {
      apiCallParts.push(imagePart);
    }
    
    const textContent = `You are an expert AI web developer with advanced capabilities, including using libraries like Three.js for 3D graphics. The user wants to modify the existing application.
        
        Here is the current, complete code for the app:
        
        **HTML:**
        \`\`\`html
        ${this.appData.code.html}
        \`\`\`
        
        **CSS:**
        \`\`\`css
        ${this.appData.code.css}
        \`\`\`
        
        **JavaScript:**
        \`\`\`javascript
        ${this.appData.code.javascript}
        \`\`\`
        
        Here is the user's modification request: "${modificationPrompt}"

        **IMPORTANT INSTRUCTIONS:**
        1.  If the user's request requires a new library (e.g., adding 3D to a 2D site with Three.js), you MUST add the library's CDN script tag to the HTML.
        2.  If the request involves images, you MUST find a suitable, high-quality, royalty-free image URL from a stock photo service like Unsplash or Pexels and embed it. Do not use placeholder images.
        
        Your task is to apply the user's requested changes to the code. You must return the COMPLETE, updated code for the entire application.
        Do not just return snippets. Your response MUST be a single JSON object that strictly follows the provided schema. 
        Do not add any conversational text or explanations outside of the JSON object.`;
    apiCallParts.push({ text: textContent });

    const modificationInstruction: HistoryContent = {
      role: 'user',
      parts: apiCallParts
    };
    
    const contents = [modificationInstruction];

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        appName: { type: Type.STRING, description: 'The name of the application, updated if necessary based on the request.' },
        theme: {
          type: Type.OBJECT,
          description: 'A cohesive design theme, updated if necessary.',
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
          description: 'The complete and updated source code for the application.',
          properties: {
            html: { type: Type.STRING, description: 'The full, updated HTML body content.' },
            css: { type: Type.STRING, description: 'The complete, updated CSS for styling.' },
            javascript: { type: Type.STRING, description: 'The complete, updated JavaScript code for interactivity and logic.' },
          },
          required: ['html', 'css', 'javascript'],
        },
      },
      required: ['appName', 'theme', 'code'],
    };

    try {
      const response = await this.ai!.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: contents,
        config: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
        },
      });

      this.displayHistory.pop(); // Remove the "updating..." message
      const jsonText = response.text.trim();
      const updatedAppData = JSON.parse(jsonText);
      this.appData = updatedAppData; // Overwrite the old app data with the new version
      this.displayHistory = [...this.displayHistory, { author: 'limo', text: `I've updated **${updatedAppData.appName}** with your changes! Check it out in the preview.` }];

      this.history = [...this.history, 
        { role: 'user', parts: historyUserParts },
        { role: 'model', parts: [{ text: `Okay, I have updated the code for ${updatedAppData.appName} based on your request.` }] }
      ];

    } catch (e) {
      this.error = this.handleApiError(e);
      this.displayHistory.pop(); // Remove "updating..." message on error
    } finally {
      this.isLoading = false;
    }
  }

  // Handles the explicit "Build App" action for the initial build
  async handleBuildApp(messageIndex: number) {
    this.isLoading = true;
    this.error = null;
    
    this.displayHistory = this.displayHistory.map((msg, index) => 
        index === messageIndex ? { ...msg, buildCompleted: true } : msg
    );
    this.displayHistory = [...this.displayHistory, { author: 'limo', text: "Okay, I'm building that for you now. This might take a moment..." }];

    const buildInstruction: HistoryContent = {
      role: 'user',
      parts: [{
        text: `Based on our entire conversation, generate a complete, self-contained, and functional application. You are a master developer. Your capabilities include, but are not limited to:
    1.  **Standard Websites:** Create rich, responsive websites using HTML, CSS, and JavaScript.
    2.  **3D Experiences:** For 3D requests, you MUST use the Three.js library. Include it from a CDN (e.g., 'https://cdn.jsdelivr.net/npm/three@latest/build/three.module.js'). Generate all necessary boilerplate: scene, camera, renderer, lighting, and the 3D objects themselves. Add controls like OrbitControls if the user wants to interact with the scene.
    3.  **Advanced Libraries:** Use other libraries from CDNs as needed (e.g., D3.js for charts, Socket.io for real-time chat, etc.).
    4.  **External Assets:** If the user's idea requires images (e.g., a "cat gallery" or a texture for a 3D model), you MUST find suitable, high-quality, royalty-free image URLs from a stock photo service like Unsplash or Pexels. Then, embed these images directly into the HTML code or use them in your JavaScript (e.g., as textures). Do not use placeholder images.
    
    Your response MUST be a single JSON object that strictly follows the provided schema. Do not add any conversational text or explanations outside of the JSON object. Synthesize all requirements discussed to produce a fully working initial version.`
      }]
    };
    
    const currentHistory = [...this.history, buildInstruction];

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
            html: { type: Type.STRING, description: 'The full HTML body content. This can include script tags for external libraries like Three.js.' },
            css: { type: Type.STRING, description: 'The complete CSS for styling. It should not include a body tag selector, but can style other elements.' },
            javascript: { type: Type.STRING, description: 'The complete JavaScript code for interactivity and logic. This code should be a module if it uses imports from a library like Three.js.' },
          },
          required: ['html', 'css', 'javascript'],
        },
      },
      required: ['appName', 'theme', 'code'],
    };

    try {
      const response = await this.ai!.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: currentHistory,
        config: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
        },
      });

      this.displayHistory.pop(); 
      const jsonText = response.text.trim();
      const newAppData = JSON.parse(jsonText);
      this.appData = newAppData;
      this.history = [...this.history, { role: 'model', parts: [{ text: `Okay, I have built the first version of ${newAppData.appName}.`}]}]
      this.displayHistory = [...this.displayHistory, { author: 'limo', text: `I've created the first version of **${newAppData.appName}**! You can see it in the preview. Let me know what you'd like to change or add.` }];
      this.activeTab = 'preview';
    } catch (e) {
      this.error = this.handleApiError(e);
      this.displayHistory.pop(); // Remove "building..." message on error
    } finally {
      this.isLoading = false;
    }
  }

  handleApiError(error: unknown) {
    console.error("An API error occurred:", error);

    if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        if (errorMessage.includes('429') || errorMessage.includes('resource_exhausted') || errorMessage.includes('quota')) {
            return 'The service is currently experiencing high demand. Please wait a moment before trying again.';
        }
        if (errorMessage.includes('api key not valid')) {
            return 'There is a configuration issue with the AI service. Please notify the administrator.';
        }
        if (errorMessage.includes('deadline exceeded')) {
            return 'The request timed out. This may be due to high server load. Please try again.';
        }
    }
    
    return 'Sorry, an unexpected error occurred while communicating with the AI. Please check the console for details and try again.';
  }

  getIframeContent() {
    if (!this.appData) return '';
    const { theme, code } = this.appData;
    const fontUrl = `https://fonts.googleapis.com/css2?family=${theme.headerFont.replace(/ /g, '+')}:wght@400;700&family=${theme.bodyFont.replace(/ /g, '+')}:wght@400;700&display=swap`;

    const isModule = code.javascript.includes('import ');
    const scriptTag = isModule
      ? `<script type="module">${code.javascript}<\/script>`
      : `<script>${code.javascript}<\/script>`;

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
              overflow: hidden;
            }
            canvas {
              display: block;
              width: 100%;
              height: 100%;
            }
            h1, h2, h3 {
              font-family: var(--website-header-font);
              padding: 0 1rem;
            }
            button, input[type="button"], input[type="submit"] {
              background-color: var(--website-primary-color);
              color: white;
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
          ${scriptTag}
        </body>
      </html>
    `;
  }
    
  copyCode(code: string) {
    navigator.clipboard.writeText(code);
  }

  renderCodeBlock(language: string, code: string) {
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

  toggleFullscreen() {
    this.isFullscreen = !this.isFullscreen;
  }

  renderInputAttachmentPreview() {
    if (!this.attachment) {
        return nothing;
    }
    return html`
        <div class="attachment-preview">
            ${this.attachment.type === 'image' 
                ? html`<img class="attachment-thumb" src=${this.attachment.dataUrl} alt="Image Preview">` 
                : html`<div class="attachment-thumb audio">🎵</div>`
            }
            <span class="attachment-name">${this.attachment.file.name}</span>
            <button class="remove-attachment-button" @click=${this.removeAttachment} title="Remove attachment">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
        </div>
    `;
  }

  renderOutput() {
    if (!this.appData && !this.isLoading && !this.error) {
        return html`
        <div class="placeholder">
            <div class="placeholder-icon">🚀</div>
            <h2>Let's build something incredible</h2>
            <p>Describe your idea for an advanced app, 3D scene, or interactive website to get started.</p>
        </div>`;
    }
    if (this.isLoading && !this.appData) {
        return html`<div class="placeholder"><div class="spinner"></div><h2>Building your vision...</h2></div>`;
    }
     if (this.error && !this.appData) {
        return html`<div class="error-message">${this.error}</div>`;
    }
    if (!this.appData) {
        return html``;
    }

    return html`
      <div class="tab-bar">
        <button class="tab-button" ?active=${this.activeTab === 'preview'} @click=${() => this.activeTab = 'preview'}>Preview</button>
        <button class="tab-button" ?active=${this.activeTab === 'code'} @click=${() => this.activeTab = 'code'}>Code</button>
        <button class="fullscreen-toggle" @click=${this.toggleFullscreen} title=${this.isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}>
            ${this.isFullscreen 
                ? html`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>`
                : html`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>`
            }
        </button>
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
    if (this.apiKeyMissing) {
      return html`
        <div class="main-container">
          <div class="api-key-error-overlay">
            <h1>Configuration Error</h1>
            <p>This application requires an API key to connect to the AI service, but it has not been configured.</p>
            <p>If you are the developer, please set the <code>API_KEY</code> environment variable in your deployment settings.</p>
          </div>
        </div>
      `;
    }

    return html`
      <div class="main-container">
        <div class="control-panel">
            <header>
            <h1>Limo</h1>
            <p>Your AI partner for creating apps, games, and websites.</p>
            </header>
            <div class="chat-history">
              ${this.displayHistory.map((msg, index) => html`
                <div class="message-bubble-wrapper ${msg.author}">
                  <div class="message-bubble">
                    ${msg.attachment 
                      ? (msg.attachment.type === 'image' 
                        ? html`<img class="chat-attachment" src=${msg.attachment.url} alt="User attachment">` 
                        : html`<audio class="chat-attachment" controls src=${msg.attachment.url}></audio>`)
                      : nothing
                    }
                    ${unsafeHTML(msg.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'))}
                  </div>
                  ${msg.proposeBuild && !msg.buildCompleted ? html`
                    <button class="build-button" @click=${() => this.handleBuildApp(index)} ?disabled=${this.isLoading}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>
                      Build App
                    </button>
                  ` : nothing}
                </div>
              `)}
              ${this.isLoading ? html`
                <div class="message-bubble-wrapper limo">
                  <div class="message-bubble">
                    <div class="typing-indicator">
                      <span></span><span></span><span></span>
                    </div>
                  </div>
                </div>
              ` : nothing}
              ${this.error ? html`<div class="error-message chat-error">${this.error}</div>` : nothing}
            </div>
            <section class="input-section">
                <input id="file-input" type="file" @change=${this.handleFileSelected} accept="image/*,audio/*" style="display:none;" />
                <button 
                  class="attachment-button" 
                  @click=${() => this.renderRoot.querySelector<HTMLElement>('#file-input')?.click()} 
                  title="Attach file"
                  ?disabled=${this.isLoading}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/></svg>
                </button>
                <div class="textarea-wrapper">
                  ${this.renderInputAttachmentPreview()}
                  <textarea
                      .value=${this.currentPrompt}
                      @input=${this.handlePromptInput}
                      @keydown=${this.handlePromptKeydown}
                      placeholder="e.g., 'Create a 3D solar system' or 'Build a real-time chat app'"
                      ?disabled=${this.isLoading}
                  ></textarea>
                </div>
                <button
                    class="send-button"
                    @click=${this.handleSendMessage}
                    ?disabled=${this.isLoading || (!this.currentPrompt.trim() && !this.attachment)}
                    title="Send Message"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>
                </button>
            </section>
        </div>
        <div class="output-panel ${this.isFullscreen ? 'fullscreen' : ''}">
            ${this.renderOutput()}
        </div>
      </div>
    `;
  }

  createRenderRoot() {
    return this;
  }
}

// Register the custom element with the browser
customElements.define('limo-app', LimoApp);

document.body.innerHTML = '';
document.body.appendChild(document.createElement('limo-app'));