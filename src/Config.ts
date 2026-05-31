import { Flatten, Schema } from "@netfeez/common";
import { File, Path } from "@netfeez/common-node";

export const workspaceSchema = new Schema({
    type: 'object',
    properties: {
        download: { type: 'boolean', default: true },
        typescript: { type: 'boolean', default: true },
        root: { type: 'string', default: '.' }
    },
    additionalProperties: false,
});
export const typescriptSchema = new Schema({
    type: 'object',
    properties: {
        "auto-watch": { type: 'boolean', default: true }
    },
    additionalProperties: false,
});

export const schema = new Schema({
    type: 'object',
    properties: {
        host: { type: 'string', default: 'localhost' },
        port: { type: 'number', default: 3000 },
        workspace: workspaceSchema.root,
        typescript: typescriptSchema.root
    },
    additionalProperties: false,
});

export class Config {
    public static readonly CONFIG_FILE = 'bb-connect.config.json';
    protected vData: Config.Data;
    protected vPlainData: Config.PlainData;
    protected debouncedSave: () => void;
    protected path: string;

    public constructor(data: typeof schema.inferToProcess, path: string = Config.CONFIG_FILE) {
        this.path = Path.resolve(path);
        this.vData = schema.processData(data);
        this.vPlainData = Flatten.object(this.vData);
        this.debouncedSave = Config.debounce(this.save.bind(this), 1000);
    }
    /**
     * Gets the configuration data.
     * The data is returned in its processed form, with any transformations defined in the schema applied.
     * @returns The configuration data.
     */
    public get data() { return this.vData; }
    /**
     * Sets the configuration data and saves it to the file.
     * The data is processed through the schema before being saved.
     * @param value The configuration data to set.
     * @remarks This method is debounced, so it will delay saving the configuration until after 1 second has elapsed since the last time it was called. This is to prevent excessive file writes when multiple values are set in quick succession.
     */
    public set data(value: Config.Data) {
        this.vData = schema.processData(value);
        this.vPlainData = Flatten.object(this.vData);
        this.debouncedSave();
    }
    /**
     * Gets a value from the configuration. The value is returned in its plain form, without any processing from the schema.
     * @param key The key of the value to get.
     * @returns The value associated with the given key.
     */
    public get<path extends keyof Config.PlainData>(key: path): Config.PlainData[path] { return this.vPlainData[key]; }
    /**
     * Sets a value in the configuration and saves it to the file.
     * The value is processed through the schema before being saved.
     * @param key The key of the value to set.
     * @param value The value to set.
     */
    public set<path extends keyof Config.PlainData>(key: path, value: Config.PlainData[path]) {
        const old = this.vPlainData[key]
        try {
            this.vPlainData[key] = value;
            this.vData = schema.processData(this.vPlainData);
        } catch (error) {
            this.vPlainData[key] = old;
            throw error;
        }
        this.debouncedSave();
    }
    /**
     * Saves the current configuration to the specified path.
     * If no path is provided, it will save to the path specified in the constructor.
     * @param path The path to save the configuration to.
     */
    public async save(path: string = this.path): Promise<void> {
        const processed = schema.processData(this.vData);
        const json = JSON.stringify(processed, null, 4);
        await File.write(path, json, 'utf-8');
    }
    /**
     * Saves the current configuration to the specified path.
     * @param data The configuration data to save.
     * @param path The path to save the configuration to.
     */
    public static async save(data: Config.Data, path: string): Promise<void> {
        path = Path.resolve(path);
        const processed = schema.processData(data);
        const json = JSON.stringify(processed, null, 4);
        await File.write(path, json, 'utf-8');
    }
    /**
     * Loads the configuration from the specified path. If the file does not exist, a new configuration will be created with default values and saved to the path.
     * @param path The path to load the configuration from.
     * @returns The loaded configuration.
     */
    public static async load(path: string): Promise<Config> {
        path = Path.resolve(path);
        if (!await File.exists(path)) {
            const config = new Config(schema.processData({}), path);
            await config.save();
            return config;
        }
        const json = await File.read(path, 'utf-8');
        const data = JSON.parse(json);
        return new Config(data, path);
    }
    public toJSON() { return this.vData; }
    /**
     * Creates a debounced version of the given function that delays invoking the function until after wait milliseconds have elapsed since the last time the debounced function was invoked.
     * @param func The function to debounce.
     * @param wait The number of milliseconds to delay.
     * @returns A debounced version of the given function.
     */
    protected static debounce<T extends (...args: any[]) => void>(func: T, wait: number): T {
        let timeout: NodeJS.Timeout | null = null;
        return function(this: any, ...args: Parameters<T>) {
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(() => {
                func.apply(this, args);
                timeout = null;
            }, wait);
        } as T;
    }
}
export namespace Config {
    export type Data = typeof schema.infer;
    export type PlainData = Flatten.Object<Data>;
}
export default Config;