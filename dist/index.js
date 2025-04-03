"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const client_1 = require("@prisma/client");
const http_1 = require("http");
const ws_1 = __importDefault(require("ws"));
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use((0, cors_1.default)());
const prisma = new client_1.PrismaClient();
const httpServer = (0, http_1.createServer)(app);
const ws = new ws_1.default.Server({ server: httpServer });
const adminUpdates = new Set(); // stores client_ids who have been upgraded to ADMIN role.
ws.on('connection', (ws) => {
    console.log('new client connected.');
    // no need to maintain ping for connection between server and client as we get disconnected if web socket disconnects
    ws.on('message', (message) => __awaiter(void 0, void 0, void 0, function* () {
        var msg = message.toString();
        console.log('message recieved: ', msg);
        if (msg[0] == '0') {
            // contains MAC address
            var cid = (Math.random() + 1).toString(36).substring(2) + (Math.random() + 1).toString(36).substring(2) + (Math.random() + 1).toString(36).substring(2) + (Math.random() + 1).toString(36).substring(2);
            var check_unique_id = yield prisma.mac.findUnique({
                where: {
                    entityId: cid,
                }
            });
            while (check_unique_id) {
                cid = (Math.random() + 1).toString(36).substring(2) + (Math.random() + 1).toString(36).substring(2) + (Math.random() + 1).toString(36).substring(2) + (Math.random() + 1).toString(36).substring(2);
                check_unique_id = yield prisma.mac.findUnique({
                    where: {
                        entityId: cid,
                    }
                });
            }
            // unique cid found (client id)
            ws.id = cid;
            const data = JSON.parse(msg.substring(1));
            if (!data.mac) {
                ws.send('5');
            }
            else {
                const res = yield prisma.mac.create({
                    data: {
                        entityId: ws.id,
                        mac: data.mac,
                    }
                });
                if (!res) {
                    ws.send("8unable to register client id and MAC address");
                }
                else {
                    const res = yield prisma.entity.create({
                        data: {
                            id: ws.id,
                            role: "CLIENT",
                        }
                    });
                    if (!res) {
                        ws.send("8unable to create entity");
                    }
                    else {
                        yield prisma.logs.create({
                            data: {
                                entityId: ws.id,
                                actionType: "CLIENT_LOGIN",
                            }
                        });
                        ws.send(`6`);
                    }
                }
            }
            console.log('client id: ', ws.id);
        }
        else {
            if (!ws.id) {
                ws.send('5send config details first');
            }
            else {
                if (msg[0] == '2') {
                    ws.send('3'); // send pong
                }
                else if (msg[0] == '4') {
                    const data = JSON.parse(msg.substring(1));
                    if (data.action == 'log') {
                        yield prisma.logs.create({
                            data: {
                                entityId: ws.id,
                                actionType: data.actionType,
                                description: data.description,
                                blocked: data.blocked,
                            }
                        });
                    }
                    if (data.action == "admin") {
                        ws.admin = true;
                        console.log("made ws with client id: ", ws.id, " as admin.");
                    }
                    console.log('RECIEVED MSG: ', data);
                    // process queries here for data updates / requests
                    if (data.type == 'whitelist') {
                        if (ws.admin == true || adminUpdates.has(ws.id)) {
                            adminUpdates.delete(ws.id);
                            console.log('processing queries: ', "whitelist");
                            const res = yield prisma.settings.findUnique({
                                where: {
                                    type: "WHITELIST"
                                }
                            });
                            ws.send('4' + JSON.stringify({
                                "type": "response",
                                "for": "whitelist",
                                "data": res
                            }));
                        }
                    }
                    else if (data.type == 'blacklist') {
                        if (ws.admin == true || adminUpdates.has(ws.id)) {
                            adminUpdates.delete(ws.id);
                            console.log('processing queries: ', "blacklist");
                            const res = yield prisma.settings.findUnique({
                                where: {
                                    type: "BLACKLIST"
                                }
                            });
                            ws.send('4' + JSON.stringify({
                                "type": "response",
                                "for": "blacklist",
                                "data": res
                            }));
                        }
                    }
                    else if (data.type == 'log') {
                        if (ws.admin == true || adminUpdates.has(ws.id)) {
                            adminUpdates.delete(ws.id);
                            console.log('processing queries: ', "logs");
                            const res = yield prisma.logs.findMany({
                                skip: data.offset,
                                take: data.limit
                            });
                            console.log('logs ke liye response: ', res);
                            ws.send('4' + JSON.stringify({
                                "type": "response",
                                "for": "range_log",
                                "data": res
                            }));
                        }
                    }
                    // ws.send(`recieved message: ${msg}`)
                }
                else if (msg[0] > '7') {
                    ws.send('please send message with proper code (0-7) prefixed');
                }
            }
        }
    }));
    ws.on('close', () => {
        console.log('client disconnected');
    });
    ws.on('error', (error) => {
        console.log('error inside connection: ', error);
    });
});
ws.on('error', (error) => {
    console.log('error inside connection: ', error);
});
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const res = yield prisma.settings.findUnique({
            where: {
                id: "bw_filter_list"
            }
        });
        if (!res) {
            console.log('settings not found, filling default details');
            const settingsData = {
                domains: [
                    'x.com/',
                    'facebook.com/',
                    'wikipedia.org/',
                ],
                keywords: [
                    'movies',
                    'water',
                ],
                lastUpdated: new Date().toISOString()
            };
            const res = yield prisma.settings.create({
                data: {
                    id: "bw_filter_list",
                    type: "BLACKLIST",
                    data: settingsData
                }
            });
            console.log('New settings created: ', res);
        }
        else {
            console.log("Old settings found: ", res);
        }
    });
}
app.get('/settings/bw_filter', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const dbRes = yield prisma.settings.findUnique({
        where: {
            id: "bw_filter_list"
        }
    });
    if (dbRes) {
        // const jsonRes = JSON.parse(dbRes.data as string);
        console.log('sending data: ', dbRes.data);
        if (dbRes.type == "BLACKLIST") {
            res.json({
                "blacklist": dbRes.data
            });
        }
        else {
            res.json({
                "whitelist": dbRes.data
            });
        }
    }
}));
app.post('/login/:type', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('login request: ', req.params, req.body);
    const { type } = req.params;
    if (type == "client") {
        const { id } = req.body;
        const prisma_req = yield prisma.entity.findUnique({
            where: {
                id: id
            }
        });
        if (prisma_req) {
            res.status(200).send('client found');
        }
        else {
            const prisma_req = yield prisma.entity.create({
                data: {
                    id: id,
                    role: "CLIENT"
                }
            });
            if (prisma_req) {
                res.status(200).send('client created');
            }
            else {
                res.status(500).send('client not found, and failed to create');
            }
        }
    }
    else if (type == "admin") {
        const { id, pass } = req.body;
        console.log('recieved admin: ', id, pass);
        const prisma_res = yield prisma.entity.findUnique({
            where: {
                id: id
            }
        });
        if (prisma_res && prisma_res.password == pass) {
            res.status(200).send('login successful');
        }
        else {
            res.status(401).send('no admin found');
        }
    }
    else {
        res.status(400).send("Invalid user type");
    }
}));
app.get('/clientdata', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const clientData = yield prisma.logs.findMany();
        const settings = yield prisma.settings.findMany();
        // console.log("Settings",settings);
        console.log("Clientdata", clientData);
        res.json({ clientData, settings });
    }
    catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}));
httpServer.listen(process.env.PORT, () => {
    console.log(`Server running on ${process.env.PORT}...`);
    main()
        .catch((e) => __awaiter(void 0, void 0, void 0, function* () {
        console.error("ERROR: ", e);
    }))
        .finally(() => __awaiter(void 0, void 0, void 0, function* () {
        yield prisma.$disconnect();
    }));
});
