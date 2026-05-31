export const TSCONFIG = {
    compilerOptions: {
        target: 'EsNext',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        outDir: './shared',
        rootDir: './server',
        types: [],
        lib: ['DOM', 'ESNext'],
        declaration: false,
        sourceMap: false
    },
    include: ['./server/**/*.ts', 'bin/**/*.d.ts']
};

export const PACKAGE = {
    name: 'bitburner-connect-workspace',
    description: 'A workspace for Bitburner Connect',
    version: '1.0.0',
    type: 'module',
    scripts: {
        start: 'cd ../; node dist/server.js',
        dev: 'npx tsc --watch',
        build: 'npx tsc'
    },
    keywords: [],
    author: '',
    license: 'ISC',
    devDependencies: {
        typescript: '^6.0.3'
    }
};
const Defaults = { TSCONFIG, PACKAGE };
export default Defaults;