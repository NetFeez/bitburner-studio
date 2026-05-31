#!/usr/bin/env node

import Vortez from 'vortez';
import Logger from '@netfeez/vterm';

import BBClient from './BBClient.js';
import Workspace from './Workspace/Workspace.js';
import Config from './Config.js';

const logger = new Logger({ name: 'BBC' });

export interface Connection {
    client: BBClient;
    workspace: Workspace;
    cnnRequest: Vortez.Request;
}

let bitburner: Connection | null = null;

function cleanup() {
    if (!bitburner) return;
    logger.log('&C6Cleaning up Bitburner connection...');
    bitburner.workspace.stop();
    bitburner.client.disconnect();
    bitburner = null;
}

async function main() {
    const config = await Config.load(Config.CONFIG_FILE);
    const port = config.get('port');
    const host = config.get('host');
    const root = config.get('workspace.root');
    const download = config.get('workspace.download');
    const typescript = config.get('workspace.typescript');
    const autoWatch = config.get('typescript.auto-watch');

    const server = new Vortez({ host, port });
    server.router.addAction('ALL', '/*', async (rq, res) => {
        if (!bitburner) return res.sendJson({ config: config.data, connected: false }, { status: 503 });
        return res.sendJson({
            config: config.data,
            connected: bitburner.client.online,
            request: bitburner.cnnRequest
        }, { status: 200 });
    });
    server.router.addWebsocket('/', async (rq, ws) => {
        console.log(rq.headers);
        logger.log('&C6Bitburner client connected!');
        ws.on('close', () => { logger.log('&C6Bitburner client disconnected!'); cleanup(); });

        const client = new BBClient(ws);
        const workspace = new Workspace(client, {
            folders: { root },
            downloads: download,
            typescript,
            autoWatch: autoWatch
        });
        if (bitburner) {
            logger.warn('&C3Another client connected, disconnecting previous client...');
            cleanup();
        }
        bitburner = { client, workspace, cnnRequest: rq };
        void workspace.start();
    });

    // logger.log(`&C6Starting Bitburner Connect on port &C3${port}&C6 with workspace &C3${root}&C6 (typescript: &C3${typescript}&C6)`);
    server.start().then(() => {
        [
            `&C7root: &C3${root}`,
            `&C7typescript: &C3${typescript}`,
            `&C7status: &C5http://${host}:${port}/`,
            `&C7download: &C3${download}`
        ].map(line => logger.log(line));
    });
}

void main().catch((error) => { logger.log('&C3Failed to start:', error); process.exit(1); });