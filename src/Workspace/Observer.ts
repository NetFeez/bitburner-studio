import { promises as fs, FSWatcher, watch } from 'node:fs';

import { Events } from '@netfeez/common';
import { File, Glob, Path } from '@netfeez/common-node';

export class Observer extends Events<Observer.EventMap> {
    private watcher: FSWatcher | null = null;
    private snapshot: Map<string, number> | null = null; // filename -> mtime
    private pollIntervalId: NodeJS.Timeout | null = null;

    private readonly globExec: RegExp;
    protected readonly glob: string;
    protected readonly debounceDelay: number;

    public constructor(
        protected vFolder: string,
        protected options: Observer.Options = {}
    ) { super();
        const { glob = '**/*', debounceDelay = 500 } = options;
        this.glob = glob;
        this.debounceDelay = debounceDelay;
        this.vFolder = Path.resolve(vFolder);
        this.globExec = Glob.globToRegex(glob);
    }

    public get observing(): boolean { return !!this.watcher; }
    public get target(): string { return this.vFolder; }
    public set target(folder: string) {
        folder = Path.resolve(folder);
        if (folder === this.vFolder) return;
        this.vFolder = folder;
        if (!this.watcher) return;
        this.stop();
    }
    /**
     * Starts the workspace observer by setting up a file system watcher on the specified workspace folder.
     * The observer will monitor the folder for any changes, such as file creations, deletions, modifications, or renames.
     * When a change is detected, the observer will trigger the appropriate events (create, delete, change, rename) with the relevant file paths.
     * The observer also builds an initial snapshot of the workspace to track the state of files and their modification times for accurate change detection.
     */
    public async start(): Promise<void> {
        if (this.watcher) return;
        const handler = Observer.debounce(this.changeHandler.bind(this), this.debounceDelay);
        this.snapshot = await this.buildSnapshot();
        try {
            this.watcher = watch(this.target, { recursive: true }, (_, filename) => handler(filename));
            this.watcher.on('error', () => {});
        } catch (err) {
            this.watcher = watch(this.target, (_, filename) => handler(filename));
            this.watcher.on('error', () => {});
            this.pollIntervalId = setInterval(() => { void this.scan(this.target).catch(() => {}); }, 2000);
        }
    }
    /**
     * Stops the workspace observer by closing the file system watcher and clearing any existing snapshots.
     * This will effectively stop monitoring the workspace folder for changes and prevent any further events from being triggered until the observer is started again.
     */
    public stop(): void {
        if (!this.watcher) return;
        this.watcher.close();
        this.watcher = null;
        this.snapshot = null;
        if (this.pollIntervalId) {
            clearInterval(this.pollIntervalId);
            this.pollIntervalId = null;
        }
    }
    /**
     * Restarts the workspace observer by first stopping it and then starting it again. This can be useful if you want to reset the observer or apply changes to the workspace folder path without creating a new instance of the observer.
     * The restart process will ensure that the observer is properly reinitialized and ready to monitor the workspace folder for changes.
     */
    public async restart(): Promise<void> {
        this.stop();
        await this.start();
    }
    /**
     * Internal method that handles file system change events triggered by the watcher.
     * This method is debounced to prevent excessive calls during rapid file changes.
     * When a change is detected, it scans the workspace folder to compare the current state of files against the previously stored snapshot.
     * It identifies added, removed, changed, and renamed files, and emits the corresponding events with the relevant file paths.
     */
    public changeHandler(filename: string | null): void {
        if (filename && !this.globExec.test(filename)) return;
        this.scan(this.target).catch(() => {});
    }
    /**
     * Scans the workspace folder to build a snapshot of the current state of files and their modification times.
     * It compares the current snapshot with the previous snapshot to identify any added, removed, changed, or renamed files.
     * Based on the comparison, it emits the appropriate events (create, delete, change, rename) with the relevant file paths.
     * @param folder - The folder to scan for files. This should be the root of the workspace being observed.
     * @returns A promise that resolves when the scan is complete and events have been emitted for any detected changes.
     */
    protected async scan(folder: string): Promise<void> {
        if (!this.snapshot) this.snapshot = await this.buildSnapshot();
        const previous = this.snapshot;
        let current: Observer.Snapshot = new Map();
        try { current = await this.buildSnapshot(); }
        catch {
            for (const file of previous.keys()) this.emit('delete', file);
            this.snapshot = new Map();
            return;
        }

        const added: string[] = [];
        const removed: string[] = [];
        const changed: string[] = [];

        for (const file of current.keys()) {
            if (!previous.has(file)) added.push(file);
            else if ((previous.get(file) ?? 0) !== (current.get(file) ?? 0)) changed.push(file);
        }
        for (const file of previous.keys()) {
            if (!current.has(file)) removed.push(file);
        }

        if (added.length === 1 && removed.length === 1) {
            const oldName = removed[0];
            const newName = added[0];
            const relativeOld = Path.diff(this.target, oldName);
            const relativeNew = Path.diff(this.target, newName);
            this.emit('rename', relativeOld, relativeNew);
        } else {
            for (const file of added) this.emit('create', Path.diff(this.target, file));
            for (const file of removed) this.emit('delete', Path.diff(this.target, file));
        }
        for (const change of changed) this.emit('change', Path.diff(this.target, change));

        this.snapshot = current;
    }
    /**
     * Utility function to build a snapshot of the current state of the workspace by recursively scanning the specified folder and recording the modification time of each file.
     * @param folder - The folder to scan for files. This should be the root of the workspace being observed.
     * @return A promise that resolves to a snapshot, which is a Map where the keys are file paths (relative to the workspace root) and the values are the modification times of those files. This snapshot can be used to compare against future scans to detect changes in the workspace.
     */
    public async buildSnapshot(): Promise<Observer.Snapshot> {
        const snapshot = new Map<string, number>();
        const target = Path.join(this.target, this.glob);

        try {
            await File.smartProcess(target, this.target, { concurrency: 16 }, async ({ src }) => {
                try {
                    const stat = await fs.stat(src);
                    snapshot.set(src, stat.mtimeMs);
                } catch { this.emit('warn', `Failed to stat file: ${src}`); }
            });
        } catch { this.emit('warn', `Failed to build snapshot for folder: ${this.target}`); }
        // console.debug({ snapshot, target, exec: this.globExec, });
        return snapshot;
    }
    /**
     * Utility function to debounce calls to a function, ensuring that it is only called once within a specified time frame, even if it is triggered multiple times. This is particularly useful for handling rapid file system events without overwhelming the system with too many calls.
     * @param action - The function to debounce.
     * @param delay - The time frame in milliseconds during which the function should only be called once.
     * @returns A debounced version of the input function.
     */
    protected static debounce<T extends Function>(action: T, delay: number): T {
        let timeout: NodeJS.Timeout | null = null;
        return function(this: any, ...args: any[]) {
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(() => {
                timeout = null;
                action.apply(this, args);
            }, delay);
        } as unknown as T;
    }
}
export namespace Observer {
    export type EventMap = {
        create: [path: string];
        delete: [path: string];
        change: [path: string];
        rename: [oldPath: string, newPath: string];
        warn: [message: string];
    }
    export interface Options {
        glob?: string;
        debounceDelay?: number;
    }
    export type Snapshot = Map<string, number>;
}
export default Observer;