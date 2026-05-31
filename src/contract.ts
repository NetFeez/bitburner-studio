import { Schema } from '@netfeez/common';

export const ALLOWED_FILE_EXTENSIONS = [
    'js', 'mjs', 'cjs', 'jsx',
    'ts', 'mts', 'cts', 'tsx',
    'txt', 'css', 'html', 'json',
    'script', 'ns'
] as const;

export const IS_VALID_FILENAME = new RegExp(`^.+\\.(${ALLOWED_FILE_EXTENSIONS.join('|')})$`);

export const Empty = new Schema({ type: 'object', properties: {}, default: {} });
export const FileMetadata = new Schema({
    type: 'object',
    properties: {
        filename: { type: 'string', required: true },
        atime: { type: 'number', required: true },
        btime: { type: 'number', required: true },
        mtime: { type: 'number', required: true }
    }
});
export const API = {
    pushFile: {
        input: new Schema({
            type: 'object',
            properties: {
                filename: { type: 'string', required: true, pattern: IS_VALID_FILENAME },
                content: { type: 'string', required: true },
                server: { type: 'string', required: true }
            }
        }),
        output: new Schema({ type: 'string', required: true, enum: ['OK'] })
    },

    getFile: {
        input: new Schema({
            type: 'object',
            properties: {
                filename: { type: 'string', required: true },
                server: { type: 'string', required: true }
            }
        }),
        output: new Schema({ type: 'string', required: true })
    },

    getFileMetadata: {
        input: new Schema({
            type: 'object',
            properties: {
                filename: { type: 'string', required: true },
                server: { type: 'string', required: true }
            }
        }),

        output: FileMetadata
    },

    deleteFile: {
        input: new Schema({
            type: 'object',
            properties: {
                filename: { type: 'string', required: true },
                server: { type: 'string', required: true }
            }
        }),
        output: new Schema({ type: 'string', required: true, enum: ['OK'] })
    },

    getFileNames: {
        input: new Schema({
            type: 'object',
            properties: { server: { type: 'string', required: true } }
        }),
        output: new Schema({ type: 'array', items: { type: 'string' }, required: true })
    },

    getAllFiles: {
        input: new Schema({
            type: 'object',
            properties: { server: { type: 'string', required: true } }
        }),

        output: new Schema({
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    filename: { type: 'string', required: true },
                    content: { type: 'string', required: true }
                }
            },
            required: true
        })
    },
    getAllFileMetadata: {
        input: new Schema({
            type: 'object',
            properties: { server: { type: 'string', required: true } }
        }),
        output: new Schema({
            type: 'array',
            items: FileMetadata.root,
            required: true
        })
    },

    calculateRam: {
        input: new Schema({
            type: 'object',
            properties: {
                filename: { type: 'string', required: true },
                server: { type: 'string', required: true }
            }
        }),
        output: new Schema({ type: 'number', required: true })
    },

    getDefinitionFile: {
        input: Empty,
        output: new Schema({ type: 'string', required: true })
    },
    getSaveFile: {
        input: Empty,
        output: new Schema({
            type: 'object',
            properties: {
                identifier: { type: 'string', required: true },
                binary: { type: 'boolean', required: true },
                save: { type: 'string', required: true }
            }
        })
    },

    getAllServers: {
        input: Empty,
        output: new Schema({
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    hostname: { type: 'string', required: true },
                    hasAdminRights: { type: 'boolean', required: true },
                    purchasedByPlayer: { type: 'boolean', required: true }
                }
            },
            required: true
        })
    }
} as const;
export type API = typeof API;
export type Method = keyof API;

export const Methods = Object.keys(API) as Method[];
export type Request<M extends Method> = API[M]['input']['infer'];
export type Response<M extends Method> = API[M]['output']['infer'];

const InputUnion = Object.values(API).map((entry) => entry.input.root);
const OutputUnion = Object.values(API).map((entry) => entry.output.root);

export const NSInput = new Schema({
    type: 'object',
    properties: {
        jsonrpc: { type: 'string', default: '2.0' },
        id: { type: 'number', required: true },
        method: { type: 'string', required: true, enum: Methods },
        params: { type: 'union', union: InputUnion }
    }
});

export const NSOutputSuccess = new Schema({
    type: 'object',
    required: true,
    allowAdditionalProperties: false,
    properties: {
        jsonrpc: { type: 'string', default: '2.0' },
        id: { type: 'number', required: true },
        result: { type: 'union', required: true, union: OutputUnion }
    }
});
export const NSOutputError = new Schema({
    type: 'object',
    required: true,
    allowAdditionalProperties: false,
    properties: {
        jsonrpc: { type: 'string', default: '2.0' },
        id: { type: 'number', required: true },
        error: { type: 'union', default: 'unknown error', union: [
            { type: 'object', allowAdditionalProperties: true, default: {} },
            { type: 'string', default: 'unknown error' }
        ]}
    }
});

export const NSOutput = new Schema({ type: 'union', required: true, union: [NSOutputSuccess.root, NSOutputError.root] });