import { FileView, ItemView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import JupyterNotebookPlugin from "./jupyter-obsidian";
import { JupyterEnvironment, JupyterEnvironmentEvent, JupyterEnvironmentStatus } from "./jupyter-env";

export const JUPYTER_VIEW_TYPE = "jupyter-view";

export class EmbeddedJupyterView extends FileView {

    private readonly runningEventListener = this.onJupyterRunning.bind(this);
    private readonly exitEventListener = this.onJupyterExits.bind(this);

    private openedFile: TFile | null = null;

    private messageContainerEl: HTMLElement | null = null;
    private messageHeaderEl: HTMLElement | null = null;
    private messageTextEl: HTMLElement | null = null;
    private webviewEl: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf, private readonly plugin: JupyterNotebookPlugin) {
        super(leaf);
    }

    getViewType(): string {
        return JUPYTER_VIEW_TYPE;
    }

    getDisplayText(): string {
        return this.openedFile?.name ?? "New Jupyter tab";
    }

    private displayMessage(header: string, text: string, clear: boolean = true): void {
        if (clear) {
            this.contentEl.empty();
        }
        this.messageContainerEl = this.contentEl.createDiv();
        this.messageContainerEl.addClass("jupyter-message-container");
        this.messageHeaderEl = this.messageContainerEl.createEl("h2");
        this.messageHeaderEl.addClass("jupyter-message-header");
        this.messageHeaderEl.setText(header);
        this.messageTextEl = this.messageContainerEl.createEl("p");
        this.messageTextEl.addClass("jupyter-message-text");
        this.messageTextEl.setText(text);
    }
    
    async onLoadFile(file: TFile) {

        this.openedFile = file;

        // If the Jupyter environment is not running, we need to start it first
        switch (this.plugin.env.getStatus()) {
            case JupyterEnvironmentStatus.EXITED:

                // The user can disable Jupyter auto-start in the settings
                if (!this.plugin.settings.startJupyterAuto) {
                    this.displayMessage("No Jupyter server", "Jupyter does not seem to be running. Please make sure to start the server manually using the plugin's ribbon icon or settings. You can also enable automatic start of the Jupyter server when a document is opened in the settings.");
                    return;
                }

                // If Jupyter auto-start is enabled, start the server
                this.plugin.env.start();
                // Keep going to the STARTING instructions
            case JupyterEnvironmentStatus.STARTING:
                this.displayMessage("Jupyter is starting", "The Jupyter server is not ready yet. Your document will be opened shortly.");
                break;
            case JupyterEnvironmentStatus.RUNNING:
                await this.onJupyterRunning(this.plugin.env);
                break;
            default:
                this.displayMessage("Unknown error", "An unknown error has happened when loading the file. Please try closing and re-opening it.");
                break;
        }
    }

    async onJupyterRunning(env: JupyterEnvironment) {
        if (this.openedFile === null) {
            this.displayMessage("No opened file", "Click on a file in the explorer view to open it here.");
            return;
        }

        // Check the Jupyter environment is indeed running
        if (!env.isRunning()) {
            this.displayMessage("Unknown error", "An unknown error has happened when loading the page. Please try closing and re-opening it.");
            return;
        }

        this.contentEl.empty();

        this.displayMessage("Loading " + this.openedFile.name, "Your file will be displayed shortly.");
        
        // @ts-ignore
        this.webviewEl = this.contentEl.createEl("webview");
        this.webviewEl.setAttribute("allowpopups", "");
        // @ts-ignore
        this.webviewEl.setAttribute("partition", "persist:surfing-vault-" + this.app.appId);
        this.webviewEl.addClass("jupyter-webview", "jupyter-webview-loading");
        this.webviewEl.setAttribute("src", env.getFileUrl(this.openedFile.path) as string);
        this.webviewEl.addEventListener("dom-ready", ((_event: any) => {
            this.messageContainerEl?.remove();
            this.messageContainerEl = null;
            this.messageHeaderEl?.remove();
            this.messageHeaderEl = null;
            this.messageTextEl?.remove();
            this.messageTextEl = null;
            this.webviewEl?.removeClass("jupyter-webview-loading");
        }).bind(this));
    }

    async onJupyterExits() {
        if (this.plugin.settings.closeFilesWithServer) {
            this.displayMessage("Jupyter server exited", "The Jupyter server has exited. Please restart the server to view the file.");
        }
    }

    protected async onOpen() {
        this.plugin.env.on(JupyterEnvironmentEvent.READY, this.runningEventListener);
        this.plugin.env.on(JupyterEnvironmentEvent.EXIT, this.exitEventListener);
    }

    protected async onClose() {
        this.openedFile = null;
        this.messageContainerEl = null;
        this.messageHeaderEl = null;
        this.messageTextEl = null;
        this.webviewEl = null;

        this.plugin.env.off(JupyterEnvironmentEvent.READY, this.runningEventListener);
        this.plugin.env.off(JupyterEnvironmentEvent.EXIT, this.exitEventListener);
    }
}