import Vortez from 'vortez';
import Logger from '@netfeez/vterm';

import { API, NSInput, NSOutput } from './contract.js';

export * from './contract.js';

const logger = new Logger({ name: 'BBC' });

export class BBApi {
    protected pending: Map<number, BBApi.PendingEntry> = new Map();
    protected index = 0;

    public constructor(
        protected ws: Vortez.WebSocket.Websocket
    ) {}

    public send<M extends BBApi.Method>(method: M, params: BBApi.Request<M>): Promise<BBApi.Response<M>> {
        const id = this.index++;
        const entry = API[method];
        const processedParams = entry.input.processUnknown(params);

        return new Promise((resolve, reject) => {
            const success = (data: typeof entry.output.infer) => {
                try {
                    const parsed = entry.output.processUnknown(data);
                    resolve(parsed);
                } catch (error) {
                    throw(new Error(`Failed to parse response for method ${method}: ${error} | data: ${data}`));
                }
            };
            this.pending.set(id, { method, success, fail: reject });

            const request = NSInput.processData({ id, method, params: processedParams });
            const json = JSON.stringify(request);
            this.ws.send(json);
        });
    }

    public handleMessage(message: string) {
        let json: unknown;
        let data: BBApi.Output;
        try {
            json = JSON.parse(message);
            data = NSOutput.processUnknown(json);
        } catch (error) {
            logger.error('Failed to parse message', error);
            if (json) logger.error(json);
            logger.error(error);
            return;
        }
        const pending = this.pending.get(data.id);
        if (!pending) return logger.error('No pending request for id', data.id);
        this.pending.delete(data.id);
        try {
            if ('error' in data) throw new Error(`${typeof data.error === 'string' ? data.error : JSON.stringify(data.error)}`);
            pending.success(data.result);
        } catch (error) { pending.fail(error); }
    }

    public rejectAll(error: Error) {
        this.pending.forEach((entry) => { entry.fail(error); });
        this.pending.clear();
    }
}

export namespace BBApi {
    export type Registry = typeof API;
    export type Method = keyof Registry;
    export type Input = typeof NSInput.infer;
    export type Output = typeof NSOutput.infer;
    export type Request<M extends Method> = Registry[M]['input']['inferToProcess'];
    export type Response<M extends Method> = Registry[M]['output']['infer'];
    export type PendingEntry = {
        method: Method;
        success: (value: typeof API[Method]['output']['infer']) => void;
        fail: (reason?: unknown) => void;
    };
    export type ServerEntry = typeof API.getAllServers.output.infer[number];
    export type FileEntry = typeof API.getAllFiles.output.infer[number];
    export type FileMetadata = typeof API.getFileMetadata.output.infer;
    export type Backup = typeof API.getSaveFile.output.infer;
}

export default BBApi;