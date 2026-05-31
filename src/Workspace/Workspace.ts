import { Events, Time } from "@netfeez/common";
import { File, Glob, Path } from "@netfeez/common-node";
import Logger from "@netfeez/vterm";
import ts from 'typescript';

import BBClient from "../BBClient.js";
import Observer from "./Observer.js";
import Defaults from "./Default.js";
import { IS_VALID_FILENAME } from "../contract.js";
import BBApi from "../BBApi.js";
import { truncate } from "node:fs";

const logger = new Logger({ name: 'WSP' });

export class Workspace extends Events {
    public static readonly DEFAULT_TYPESCRIPT = true;
    public static readonly DEFAULT_ROOT = '.workspace';
    public static readonly DEFAULT_SHARED = 'shared';
    public static readonly DEFAULT_SERVER = 'server';
    public static readonly DEFAULT_BACKUP = 'backup';
    public static readonly DEFAULT_DOWNLOAD = 'download';

    public readonly config: Workspace.WorkspaceConfig;
    protected readonly preBind: Workspace.PreBind;
    protected readonly paths?: Workspace.ObservedPaths;

    /** Observers */
    public readonly compilerObserver: Observer;
    public readonly staticObserver: Observer;

    protected tsWatcher: ts.WatchOfConfigFile<ts.BuilderProgram> | null = null;

    public constructor(
        public readonly client: BBClient,
        config: Workspace.CreateOptions = {}
    ) { super();
        this.config = Workspace.normalizeConfig(config);
        this.compilerObserver = new Observer(this.config.folders.shared, { glob: '**/*.js', debounceDelay: 1000 });
        this.staticObserver = new Observer(this.config.folders.server, { glob: Workspace.staticGlob(this.config.typescript), debounceDelay: 1000 });
        this.preBind = {
            compiler: {
                createFile: this.UpdateFile.bind(this, this.config.folders.shared),
                updateFile: this.UpdateFile.bind(this, this.config.folders.shared),
                deleteFile: this.DeleteFile.bind(this, this.config.folders.shared)
            },
            static: {
                createFile: this.UpdateFile.bind(this, this.config.folders.server),
                updateFile: this.UpdateFile.bind(this, this.config.folders.server),
                deleteFile: this.DeleteFile.bind(this, this.config.folders.server)
            }
        };
    }
    /**
     * Starts the TypeScript watcher to monitor changes in TypeScript files within the workspace.
     * This method initializes a watch program using the TypeScript compiler API, which listens for changes to the tsconfig.json file and triggers recompilation when necessary.
     * The watcher is set up with custom diagnostic handlers to log any errors or messages that occur during the compilation process.
     * If the watcher is already running, this method will not create a new instance, ensuring that only one watcher is active at a time.
     */
    protected startTypeScriptWatcher(): void {
        if (this.tsWatcher) return;
        const configPath = Path.join(this.config.folders.root, 'tsconfig.json');
        const host = ts.createWatchCompilerHost(
            configPath,
            {
                incremental: true,
                tsBuildInfoFile: Path.join(this.config.folders.root, 'bin', '.tsbuildinfo')
            },
            ts.sys,
            ts.createEmitAndSemanticDiagnosticsBuilderProgram,
            diagnostic => logger.error('&C6' + diagnostic.messageText),
            diagnostic => logger.log('&C6' + diagnostic.messageText)
        );
        this.tsWatcher = ts.createWatchProgram(host);
    }
    /**
     * Stops the TypeScript watcher if it is currently running.
     * This method checks if the watcher instance exists and, if so, calls the close method to stop the watcher and then sets the instance to null.
     * This ensures that the watcher is properly cleaned up and that resources are released when it is no longer needed.
     */
    protected stopTypeScriptWatcher(): void {
        if (!this.tsWatcher) return;
        this.tsWatcher.close();
        this.tsWatcher = null;
    }
    /**
     * Sets up the workspace by creating necessary directories and files, and optionally creating a backup of the current workspace state.
     * This method ensures that the workspace is properly initialized with the required structure and files, allowing for seamless operation when starting the workspace.
     * The setup process includes creating directories for servers, shared files, and backups, as well as generating essential configuration files like tsconfig.json and package.json if they do not already exist.
     * Additionally, it can fetch and save the latest NetScript.d.ts definitions from the BBClient to ensure that the workspace has up-to-date type definitions for development.
     * @param options - An object containing options for setting up the workspace, including forceReset to clear existing directories, forceReloadDefinitions to fetch the latest type definitions, and backup to create a backup of the current workspace state before setup.
     */
    public async setup(options: Workspace.SetupOptions = {}): Promise<void> {
        const { forceReset = false, forceReloadDefinitions = false, backup = false } = options;
        logger.log('&C6Setting up workspace');
        if (forceReset) {
            logger.warn('&C3Force reset enabled, clearing workspace directories...');
            await File.remove(this.config.folders.root);
        }
        const dirs = [this.config.folders.server, this.config.folders.shared, this.config.folders.backup];
        // dirs.push(
        //     ... await this.client.getAllServers()
        //     .then(servers => servers
        //         .filter(server => server.hasAdminRights)
        //         .map(server => Path.join(this.config.server, server.hostname))
        //     ).catch(() => [])
        // );
        for (const dir of dirs) if (!await File.exists(dir)) {
            await File.mkdir(dir, { recursive: true });
            logger.log('&C2Created workspace directory:', dir);
        }
        const tsconfigPath = Path.join(this.config.folders.root, 'tsconfig.json');
        const packagePath = Path.join(this.config.folders.root, 'package.json');
        const gitignorePath = Path.join(this.config.folders.root, '.gitignore');
        const definitionPath = Path.join(this.config.folders.root, 'bin', 'NetScript.d.ts');
        if (!await File.exists(tsconfigPath)) {
            const tsconfig = JSON.stringify(Defaults.TSCONFIG, null, 2);
            await File.write(tsconfigPath, tsconfig, 'utf-8');
            logger.log('&C2Created workspace tsconfig.json:', tsconfigPath);
        }
        if (!await File.exists(packagePath)) {
            const pkg = JSON.stringify(Defaults.PACKAGE, null, 2);
            await File.write(packagePath, pkg, 'utf-8');
            logger.log('&C2Created workspace package.json:', packagePath);
        }
        if (!await File.exists(gitignorePath)) {
            await File.copy(Path.relativeToMe(import.meta, '../../assets', '.gitignore'), gitignorePath);
            logger.log('&C2Created workspace .gitignore:', gitignorePath);
        }
        if (!await File.exists(definitionPath) || forceReloadDefinitions) {
            const definitions = await this.client.getDefinitionFile(true);
            await File.write(definitionPath, definitions, 'utf-8');
            logger.log('&C2Created workspace NetScript.d.ts:', definitionPath);
        }
        if (backup) await this.createBackup();
        logger.log('&C2Workspace setup complete');
    }
    /**
     * Starts the workspace by setting up the necessary directories and files, binding the observers to their respective event handlers, and starting the file watching process for both the compiler and static observers.
     * This method ensures that the workspace is properly initialized and ready to monitor file changes in the specified directories, allowing for seamless updates to files on the server when changes are detected in the local workspace.
     */
    public async start(options: Workspace.SetupOptions = {}): Promise<void> {
        await this.setup(options);
        await this.sync();
        if (this.config.typescript) {
            if (this.config.autoWatch) this.startTypeScriptWatcher();
            Workspace.bindObserver(this.compilerObserver, this.preBind.compiler);
        }
        Workspace.bindObserver(this.staticObserver, this.preBind.static);
        if (this.config.typescript) await this.compilerObserver.start();
        await this.staticObserver.start();
    }
    /**
     * Stops the workspace by stopping both the compiler and static observers, and unbinding their event handlers.
     * This method ensures that all file watching activities are halted and that the observers are properly cleaned up to prevent any further events from being processed.
     * It is important to call this method when you want to shut down the workspace or when you need to reset the observers for any reason.
     */
    public async stop(): Promise<void> {
        if (this.config.typescript) {
            this.stopTypeScriptWatcher();
            this.compilerObserver.stop();
            Workspace.unbindObserver(this.compilerObserver, this.preBind.compiler);
        }
        this.staticObserver.stop();
        Workspace.unbindObserver(this.staticObserver, this.preBind.static);
    }
    /**
     * Synchronizes the workspace with the server by fetching the list of servers, synchronizing static files, and synchronizing shared files.
     * This method ensures that the local workspace is up-to-date with the server's state, allowing for seamless development and file management.
     * It retrieves the list of servers from the BBClient, then calls the syncStaticFiles and syncSharedFiles methods to synchronize the respective files between the local workspace and the server.
     * Once the synchronization process is complete, it logs a message indicating that the workspace synchronization is complete.
     */
    public async sync(): Promise<void> {
        logger.log('&C6Synchronizing workspace with server...');
        const bkPath = await this.createBackup();
        logger.log(`&C2Created backup of current workspace state at: &C3${bkPath}`);
        const servers = await this.client.getAllServers();
        await this.syncStaticFiles(...servers);
        if (this.config.typescript) await this.syncSharedFiles(...servers);
        logger.log('&C2Workspace synchronization complete');
    }
    /**
     * Synchronizes the static files between the local workspace and the server.
     * This method is used to ensure that all static files are up-to-date on the server.
     * @returns A promise that resolves when all static files have been synchronized.
     */
    protected async syncStaticFiles(...servers: BBApi.ServerEntry[]): Promise<void> {
        const regex = Glob.globToRegex(Workspace.staticGlob(this.config.typescript));
        for (const server of servers) {
            if (!server.hasAdminRights) continue;
            const remoteFiles = await this.client.getFiles(server.hostname);
            for (const { filename, content } of remoteFiles) try {
                const localPath = Path.join(this.config.folders.server, server.hostname, filename);
                if (this.config.downloads) {
                    const downloadPath = Path.join(this.config.folders.download, server.hostname, filename);
                    await File.write(downloadPath, content, 'utf-8');
                    logger.log(`&C6Downloaded file from &C3${server.hostname}&C6 -> &C3${filename}`);
                }
                if (!regex.test(filename)) continue;
                if (!await File.exists(localPath)) {
                    await File.write(localPath, content, 'utf-8');
                    logger.log(`&C6Downloaded file from &C3${server.hostname}&C6 -> &C3${filename}`);
                    continue;
                }
                const localContent = await File.read(localPath, 'utf-8');
                if (localContent === content) continue;
                const stat = await this.client.getFileMetadata(server.hostname, filename);
                const localStat = await File.stat(localPath);
                if (stat.mtime > localStat.mtime.getTime()) {
                    await File.write(localPath, content, 'utf-8');
                    logger.log(`&C6Updated local file from &C3${server.hostname}&C6 -> &C3${filename}`);
                } else if (stat.mtime < localStat.mtime.getTime()) {
                    await this.client.updateFile(server.hostname, filename, localContent);
                    logger.log(`&C6Updated server file from &C3${server.hostname}&C6 -> &C3${filename}`);
                } else { logger.warn(`&C3Conflict detected for file &C3${filename}&C3 on server &C3${server.hostname}&C3, but modification times are identical. No action taken.`); }
            } catch (err) { logger.warn(`&C3Failed to delete file on server &C3${server.hostname}&C6 -> &C3${filename}`, err); }
        }
    }
    /**
     * Synchronizes the shared files between the local workspace and the server.
     * This method is used to ensure that all shared files are up-to-date on the server.
     * @returns A promise that resolves when all shared files have been synchronized.
     */
    protected async syncSharedFiles(...servers: BBApi.ServerEntry[]): Promise<void> {
        for (const server of servers) {
            if (!server.hasAdminRights) continue;
            const files = await this.client.getFileNames(server.hostname);
            for (const file of files) try {
                const regex = Glob.globToRegex('**/*.js');
                if (!regex.test(file)) continue;
                await this.client.deleteFile(server.hostname, file);
                logger.log(`&C6Deleted file on &C3${server.hostname}&C6 -> &C3${file}`);
            } catch (err) { logger.warn(`&C3Failed to delete file on server &C3${server.hostname}&C6 -> &C3${file}`, err); }
            const searchShared = Path.join(this.config.folders.shared, server.hostname, '**/*.js');
            const localSharedFiles = await File.glob(searchShared);
            await this.loadFiles(localSharedFiles, this.config.folders.shared);
        }
    }

    //
    // ========== WORKSPACE OPERATIONS ==========
    //

    /**
     * Loads a list of files into the workspace by reading their content from the file system and updating them on the server using the BBClient.
     * The function takes an array of file paths and an optional base directory, reads the content of each file, retrieves the corresponding server and file information, and then sends an update request to the BBClient to update the file on the server.
     * This method is used to synchronize local files with the server when starting the workspace or when manually triggering a synchronization.
     * @param files - An array of file paths to be loaded into the workspace, which can be either absolute or relative paths.
     * @param base - An optional base directory that can be used to resolve relative file paths. If provided, the file paths will be treated as relative to this base directory; if not provided, the file paths will be treated as absolute.
     * @returns A promise that resolves when all files have been loaded and updated on the server.
     */
    protected async loadFiles(files: string[], base: string | null = null): Promise<void> {
        files = base === null ? files : files.map(file => Path.isAbsolute(file) ? Path.diff(base, file) : file);
        for (const file of files) try {
            const path = base ? Path.join(base, file) : file;
            const content = await File.read(path, 'utf-8');
            const fileInfo = Workspace.serverFileInfo(file);
            if (!fileInfo) continue;
            await this.client.updateFile(fileInfo.server, fileInfo.path, content);
            logger.log(`&C6Loaded file on &C3${fileInfo.server}&C6 -> &C3${fileInfo.path}`);
        } catch (err) { logger.warn(`&C3Failed to load file on server &C3${file}`, err); }
    }
    /**
     * Creates a backup of the current workspace.
     * @returns A promise that resolves when the backup is complete.
     */
    public async createBackup(): Promise<string> {
        const format = Time.format('{YYYY}-{MM}-{DD}/{HH}-{mm}-{ss}-{ms}');
        const backup = await this.client.backup();
        const ext = backup.binary ? 'gz' : 'json';
        const encoding: BufferEncoding = backup.binary ? 'binary' : 'utf-8';
        const path = Path.join(this.config.folders.backup, `${format}-${backup.identifier}.${ext}`);
        await File.write(path, backup.save, encoding);
        return path;
    }

    //
    // ========== FILE EVENT HANDLERS ==========
    //

    /**
     * Handles the update of a file in the workspace.
     * This method is triggered when a file is changed or created in the observed directories.
     * It validates the file path, retrieves the corresponding server and file information, reads the updated content from the file system, and then sends an update request to the BBClient to update the file on the server.
     * If the file path is invalid or if there is an issue with retrieving the file information, it logs a warning message and does not proceed with the update.
     * @param base - The base directory where the file is located (either the shared or server directory).
     * @param path - The relative path of the file that was changed or created, which includes the server name and the file path on that server.
     * @returns A promise that resolves when the file update process is complete.
     */
    public async UpdateFile(base: string, path: string): Promise<void> {
        if (!IS_VALID_FILENAME.test(path)) return void logger.warn('&C3Attempted to update file with invalid path:', path);
        const file = Workspace.serverFileInfo(path);
        if (!file) return void logger.warn('&C3Attempted to update file with invalid path:', path);
        const content = await File.read(Path.join(base, path), 'utf-8');
        logger.log(`&C6Updating file on &C3${file.server}&C6 -> &C3${file.path}`);
        return void await this.client.updateFile(file.server, file.path, content);
    }
    /**
     * Handles the deletion of a file in the workspace.
     * This method is triggered when a file is deleted in the observed directories.
     * It validates the file path, retrieves the corresponding server and file information, and then sends a delete request to the BBClient to remove the file from the server.
     * If the file path is invalid or if there is an issue with retrieving the file information, it logs a warning message and does not proceed with the deletion.
     * @param base - The base directory where the file was located (either the shared or server directory).
     * @param path - The relative path of the file that was deleted, which includes the server name and the file path on that server.
     * @returns A promise that resolves when the file deletion process is complete.
     */
    public async DeleteFile(base: string, path: string): Promise<void> {
        if (!IS_VALID_FILENAME.test(path)) return void logger.warn('&C3Attempted to delete file with invalid path:', path);
        const file = Workspace.serverFileInfo(path);
        if (!file) return void logger.warn('&C3Attempted to delete file with invalid path:', path);
        logger.log(`&C6Deleting file on &C3${file.server}&C6 -> &C3${file.path}`);
        return void await this.client.deleteFile(file.server, file.path);
    }

    //
    // ========== HELPER METHODS ==========
    //

    /**
     * Binds the provided observer to the specified event handlers defined in the ObserverBind object.
     * This method sets up listeners for the 'change', 'create', and 'delete' events emitted by the observer, associating each event with its corresponding handler function from the ObserverBind object.
     * By calling this method, you can ensure that the observer will trigger the appropriate actions when files are changed, created, or deleted within the workspace.
     * @param observer - The Observer instance to bind event handlers to.
     * @param bind - An object containing the event handler functions for 'change', 'create', and 'delete' events.
     */
    public static bindObserver(observer: Observer, bind: Workspace.ObserverBind): void {
        observer.on('change', bind.updateFile);
        observer.on('create', bind.createFile);
        observer.on('delete', bind.deleteFile);
    }
    /**
     * Unbinds the provided observer from the specified event handlers defined in the ObserverBind object.
     * This method removes the listeners for the 'change', 'create', and 'delete' events emitted by the observer, disassociating each event from its corresponding handler function from the ObserverBind object.
     * By calling this method, you can ensure that the observer will no longer trigger the associated actions when files are changed, created, or deleted within the workspace.
     * @param observer - The Observer instance to unbind event handlers from.
     * @param bind - An object containing the event handler functions for 'change', 'create', and 'delete' events that were previously bound to the observer.
     */
    public static unbindObserver(observer: Observer, bind: Workspace.ObserverBind): void {
        observer.off('change', bind.updateFile);
        observer.off('create', bind.createFile);
        observer.off('delete', bind.deleteFile);
    }
    /**
     * Parses a relative file path to extract the server name and the file path on that server.
     * The function takes a relative path string as input, splits it into parts, and identifies the first part as the server name and the remaining parts as the file path.
     * If the input path is valid and contains both a server name and a file path, it returns an object containing the server name and the file path.
     * If the input path is invalid (e.g., missing server name or file path), it returns null.
     * @param relative - A relative file path string that includes the server name and the file path, separated by slashes (e.g., "server1/path/to/file.txt").
     * @returns An object containing the server name and the file path if the input is valid, or null if the input is invalid.
     */
    public static serverFileInfo(relative: string): Workspace.serverFileInfo | null {
        const parts = relative.split(/[\\/]/).filter(Boolean);
        const [server, ...rest] = parts;
        if (!server) return null;
        if (rest.length === 0) return null;
        return { server, path: rest.join('/') };
    }
    /**
     * Normalizes the provided workspace configuration by applying default values for any missing properties and resolving the root path to an absolute path. The function takes a partial workspace configuration object as input and returns a complete workspace configuration object with all properties defined, ensuring that the workspace is set up with consistent and valid paths for its various directories.
     * @param config - A partial workspace configuration object that may contain some or all of the properties needed to define the workspace configuration.
     * @returns A complete workspace configuration object with all properties defined, including default values for any missing properties and an absolute path for the root directory.
     */
    public static normalizeConfig(config: Workspace.CreateOptions): Workspace.WorkspaceConfig {
        const {
            typescript = Workspace.DEFAULT_TYPESCRIPT,
            downloads = truncate,
            autoWatch = true,
            folders = {}
        } = config as any;
        const {
            root = Workspace.DEFAULT_ROOT,
            server = Workspace.DEFAULT_SERVER,
            shared = Workspace.DEFAULT_SHARED,
            backup = Workspace.DEFAULT_BACKUP,
            download = Workspace.DEFAULT_DOWNLOAD
        } = folders as any;
        const realRoot = Path.isAbsolute(root) ? root : Path.root(root);
        return {
            downloads,
            typescript,
            autoWatch,
            folders: {
                root: realRoot,
                server: Path.isAbsolute(server) ? server : Path.join(realRoot, server),
                shared: Path.isAbsolute(shared) ? shared : Path.join(realRoot, shared),
                backup: Path.isAbsolute(backup) ? backup : Path.join(realRoot, backup),
                download: Path.isAbsolute(download) ? download : Path.join(realRoot, download)
            }
        };
    }

    protected static staticGlob(typescript: boolean): string {
        return typescript
            ? '**/*.{script,ns,txt,css,json}'
            : '**/*.{script,ns,txt,css,json,js}';
    }
}
export namespace Workspace {
    export interface ObservedPaths {
        shared?: string;
        servers?: string;
    }
    export interface WorkspaceConfig {
        readonly typescript: boolean;
        readonly downloads: boolean;
        readonly autoWatch: boolean;
        readonly folders: {
            readonly root: string;
            readonly server: string;
            readonly shared: string;
            readonly backup: string;
            readonly download: string;
        };
    }
    export interface serverFileInfo {
        server: string;
        path: string;
    }
    export interface ObserverBind {
        createFile: (path: string) => Promise<void>;
        updateFile: (path: string) => Promise<void>;
        deleteFile: (path: string) => Promise<void>;
    }
    export interface PreBind {
        compiler: ObserverBind;
        static: ObserverBind;
    }
    export interface SetupOptions {
        forceReset?: boolean;
        forceReloadDefinitions?: boolean;
        backup?: boolean;
    }
    export interface CreateOptions {
        typescript?: boolean;
        downloads?: boolean;
        autoWatch?: boolean;
        folders?: Partial<WorkspaceConfig['folders']>;
    }
}
export default Workspace;