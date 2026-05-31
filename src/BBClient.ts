import { File, Path } from '@netfeez/common-node';
import { stat } from 'node:fs/promises';
import { Time } from '@netfeez/common';
import Logger from '@netfeez/vterm';
import Vortez from 'vortez';

import BBApi, { ALLOWED_FILE_EXTENSIONS, IS_VALID_FILENAME } from './BBApi.js';

const logger = new Logger({ name: 'BBC' });

export class BBClient {
    public static readonly BACKUP_FORMAT = '{DD}-{MM}-{YYYY}/{HH}-{mm}-{ss}-{ms}';
    public static readonly WORKSPACE = '.workspace';
    public static readonly SHARED = '.shared';
    public static readonly BACKUP = '.backup';
    public static readonly DEFINITION_FILE = 'NetScript.d.ts';

    public readonly api: BBApi;

    protected readonly preBind: {
        message: (message: string) => void;
        close: () => void;
    };

    public constructor(
        public ws: Vortez.WebSocket.Websocket
    ) {
        this.api = new BBApi(ws);
        this.preBind = {
            message: this.api.handleMessage.bind(this.api),
            close: this.closeHandler.bind(this)
        };
        this.ws.on('close', this.preBind.close);
        this.ws.on('message:text', this.preBind.message);
    }
    public get online(): boolean { return this.ws.status === 'open'; }
    public disconnect() { this.ws.close(); }
    /**
     * Retrieves the content of a specific file on the specified server by sending a request to the client with the server name and file path, and awaiting the response, which is expected to contain the contents of the file as a string.
     * The function returns a promise that resolves to the contents of the specified file on the specified server as a string.
     * @param server - The name of the server where the file is located.
     * @param path - The path to the file on the server for which to retrieve the content.
     * @returns A promise that resolves to the contents of the specified file on the specified server as a string.
     */
    public async getFile(server: string, path: string): Promise<string> {
        return await this.api.send('getFile', { server, filename: path });
    }
    /**
     * Retrieves a list of all files on the specified server by sending a request to the client and awaiting the response, which is expected to be an array of file entries containing metadata about each file.
     * The function returns a promise that resolves to an array of file entries, which can be used to access the metadata for each file on the server.
     * @param server - The name of the server for which to retrieve the files.
     * @returns A promise that resolves to an array of file entries containing metadata about each file on the specified server.
     */
    public async getFiles(server: string): Promise<BBApi.FileEntry[]> {
        return await this.api.send('getAllFiles', { server });
    }
    /**
     * Retrieves a list of file names on the specified server by sending a request to the client and awaiting the response, which is expected to be an array of strings representing the file names on the server.
     * The function returns a promise that resolves to an array of file names on the specified server.
     * @param server - The name of the server for which to retrieve the file names.
     * @returns A promise that resolves to an array of strings representing the file names on the specified server.
     */
    public async getFileNames(server: string): Promise<string[]> {
        return await this.api.send('getFileNames', { server });
    }
    /**
     * Retrieves metadata for a specific file on the specified server by sending a request to the client with the server name and file path, and awaiting the response, which is expected to contain metadata about the file such as its size and last modified date.
     * The function returns a promise that resolves to an object containing the file metadata, which can be used to access information about the file on the server.
     * @param server - The name of the server where the file is located.
     * @param path - The path to the file on the server for which to retrieve metadata.
     * @returns A promise that resolves to an object containing metadata about the specified file on the specified server.
     */
    public async getFileMetadata(server: string, path: string): Promise<BBApi.FileMetadata> {
        return await this.api.send('getFileMetadata', { server, filename: path });
    }
    /**
     * Retrieves metadata for all files on the specified server by sending a request to the client with the server name and awaiting the response, which is expected to be an array of metadata objects for each file on the server.
     * The function returns a promise that resolves to an array of file metadata objects, which can be used to access information about all files on the specified server.
     * @param server - The name of the server for which to retrieve metadata for all files.
     * @returns A promise that resolves to an array of file metadata objects for all files on the specified server.
     */
    public async getAllFilesMetadata(server: string): Promise<BBApi.FileMetadata[]> {
        return await this.api.send('getAllFileMetadata', { server });
    }
    /**
     * Updates a file on the specified server by sending a request to the client with the server name, file path, and new content.
     * The client is expected to handle the request and update the file accordingly.
     * The function returns a boolean indicating whether the update was successful.
     * @param server - The name of the server where the file is located.
     * @param path - The path to the file on the server.
     * @param content - The new content to be written to the file.
     * @returns A promise that resolves to true if the update was successful, or false if it failed.
     */
    public async updateFile(server: string, path: string, content: string): Promise<true> {
        if (!IS_VALID_FILENAME.test(path)) throw new Error(`Invalid file name: ${path}`);
        const result =await this.api.send('pushFile', { server, filename: path, content });
        if (result !== 'OK') throw new Error(`Failed to update file ${path} on server ${server}. Server responded with: ${result}`);
        return true;
    }
    public async getAllServers(): Promise<BBApi.ServerEntry[]> {
        return await this.api.send('getAllServers', {});
    }
    /**
     * Deletes a file on the specified server by sending a request to the client with the server name and file path.
     * The client is expected to handle the request and delete the file accordingly.
     * The function returns a boolean indicating whether the deletion was successful.
     * @param server - The name of the server where the file is located.
     * @param path - The path to the file on the server that should be deleted.
     * @returns A promise that resolves to true if the deletion was successful, or false if it failed.
     */
    public async deleteFile(server: string, path: string): Promise<true> {
        const result = await this.api.send('deleteFile', { server, filename: path });
        if (result !== 'OK') throw new Error(`Failed to delete file ${path} on server ${server}. Server responded with: ${result}`);
        return true;
    }
    /**
     * Retrieves a backup of the current state of the game by sending a request to the client and awaiting the response, which is expected to contain the backup data.
     * The function returns a promise that resolves to the backup data, which can be used to restore the game state at a later time.
     */
    public async backup(): Promise<BBApi.Backup> {
        return await this.api.send('getSaveFile', {});
    }
    /**
     * Retrieves the definition file from the client by sending a request and awaiting the response, which is expected to contain the contents of the definition file as a string.
     * If the convertInGlobal parameter is set to true, the function wraps the contents of the definition file in a declare global block and adds an export statement at the end, allowing the definitions to be used in a global context.
     * The function returns a promise that resolves to the contents of the definition file as a string, either in its original form or wrapped in a global declaration depending on the value of convertInGlobal.
     * @param convertInGlobal - A boolean indicating whether to wrap the definition file contents in a declare global block for use in a global context.
     * @returns A promise that resolves to the contents of the definition file as a string, optionally wrapped in a declare global block if convertInGlobal is true.
     */
    public async getDefinitionFile(convertInGlobal: boolean = false): Promise<string> {
        const definitions = await this.api.send('getDefinitionFile', {});
        if (!convertInGlobal) return definitions;
        return [
            'declare global {',
            ...definitions.split(/[\r\n]/).map(line => `    ${line}`),
            '}',
            'export {};',
        ].join('\n')
    }
    /**
     * Handles the WebSocket connection close event.
     * Rejects all pending API requests and removes event listeners.
     */
    protected closeHandler() {
        this.api.rejectAll(new Error('WebSocket connection closed'));
        this.ws.off('message:text', this.preBind.message);
        this.ws.off('close', this.preBind.close);
    }
}
export namespace BBClient {}
export default BBClient;