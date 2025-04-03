import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { createServer } from 'http';
import WebSocket from 'ws';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors())
const prisma = new PrismaClient();
const httpServer = createServer(app);
const ws = new WebSocket.Server({server: httpServer});
const adminUpdates = new Set<string>(); // stores client_ids who have been upgraded to ADMIN role.

ws.on('connection', (ws: WebSocket)=>{
    console.log('new client connected.');
    // no need to maintain ping for connection between server and client as we get disconnected if web socket disconnects

    ws.on('message', async (message)=>{
        var msg = message.toString()
        console.log('message recieved: ', msg);
        if (msg[0]=='0'){
            // contains MAC address
            var cid =(Math.random() + 1).toString(36).substring(2)+(Math.random() + 1).toString(36).substring(2)+(Math.random() + 1).toString(36).substring(2)+(Math.random() + 1).toString(36).substring(2);
            var check_unique_id = await prisma.mac.findUnique({
                where: {
                    entityId: cid,
                }
            });
            while (check_unique_id){
                cid =(Math.random() + 1).toString(36).substring(2)+(Math.random() + 1).toString(36).substring(2)+(Math.random() + 1).toString(36).substring(2)+(Math.random() + 1).toString(36).substring(2);
                check_unique_id = await prisma.mac.findUnique({
                    where: {
                        entityId: cid,
                    }
                });
            }
            // unique cid found (client id)
            (ws as any).id = cid;
            const data = JSON.parse(msg.substring(1));
            if (!data.mac){
                ws.send('5');
            } else {
                const res = await prisma.mac.create({
                    data: {
                        entityId: (ws as any).id,
                        mac: data.mac,
                    }
                });
                if (!res) {
                    ws.send("8unable to register client id and MAC address")
                } else {
                    const res = await prisma.entity.create({
                        data: {
                            id: (ws as any).id,
                            role: "CLIENT",
                        }
                    });
                    if (!res) {
                        ws.send("8unable to create entity");
                    } else {
                        await prisma.logs.create({
                            data: {
                                entityId: (ws as any).id,
                                actionType: "CLIENT_LOGIN",
                            }
                        });
                        ws.send(`6`);
                    }
                }
            }
            console.log('client id: ', (ws as any).id);
        } else {
            if (!(ws as any).id) {
                ws.send('5send config details first');
            } else {
                if (msg[0]=='2'){
                    ws.send('3'); // send pong
                } else if (msg[0]=='4'){
                    const data = JSON.parse(msg.substring(1));
                    if (data.action=='log'){
                        await prisma.logs.create({
                            data:{
                                entityId: (ws as any).id,
                                actionType: data.actionType,
                                description: data.description,
                                blocked : data.blocked,
                            }
                        })
                    }

                    if (data.action=="admin"){
                        (ws as any).admin = true;
                        console.log("made ws with client id: ", (ws as any).id, " as admin.");
                    }

                    console.log('RECIEVED MSG: ', data);
                    // process queries here for data updates / requests
                    if (data.type == 'whitelist'){
                        if ((ws as any).admin == true || adminUpdates.has((ws as any).id)){
                            adminUpdates.delete((ws as any).id);
                            console.log('processing queries: ', "whitelist");
                            const res = await prisma.settings.findUnique({
                                where: {
                                    type: "WHITELIST"
                                }
                            })
                            ws.send('4'+JSON.stringify({
                                "type": "response",
                                "for": "whitelist",
                                "data": res
                            }));
                        }
                    } else if (data.type == 'blacklist'){
                        if ((ws as any).admin == true || adminUpdates.has((ws as any).id)){
                            adminUpdates.delete((ws as any).id);
                            console.log('processing queries: ', "blacklist");
                            const res = await prisma.settings.findUnique({
                                where: {
                                    type: "BLACKLIST"
                                }
                            })
                            ws.send('4'+JSON.stringify({
                                "type": "response",
                                "for": "blacklist",
                                "data": res
                            }));
                        }
                    } else if (data.type == 'log'){
                        if ((ws as any).admin == true || adminUpdates.has((ws as any).id)){
                            adminUpdates.delete((ws as any).id);
                            console.log('processing queries: ', "logs");
                            const res = await prisma.logs.findMany({
                                skip: data.offset,
                                take: data.limit,
                                orderBy: {
                                    timestamp: 'desc' 
                                }
                            });
                            console.log('logs ke liye response: ', res);
                            ws.send('4'+JSON.stringify({
                                "type": "response",
                                "for": "range_log",
                                "data": res
                            }));
                        }
                    }

                    // ws.send(`recieved message: ${msg}`)
                } else if (msg[0]>'7') {
                    ws.send('please send message with proper code (0-7) prefixed')
                }
            }
        }
    });

    ws.on('close', ()=>{
        console.log('client disconnected')
    })

    ws.on('error', (error)=>{
        console.log('error inside connection: ', error)
    })
});

ws.on('error', (error)=>{
    console.log('error inside connection: ', error)
})

interface FilterListData {
    domains: string[];
    keywords: string[];
    lastUpdated: string;
}

async function main() {
    const res = await prisma.settings.findUnique({
        where: {
            id: "bw_filter_list"
        }
    });

    if (!res) {
        console.log('settings not found, filling default details');

        const settingsData: FilterListData = {
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
        }

        const res = await prisma.settings.create({
            data: {
                id: "bw_filter_list",
                type: "BLACKLIST",
                data: settingsData as any
            }
        });
        console.log('New settings created: ', res);
    } else {
        console.log("Old settings found: ", res);
    }
}

app.get('/settings/bw_filter', async (req, res) => {
    const dbRes = await prisma.settings.findUnique({
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
            })
        } else {
            res.json({
                "whitelist": dbRes.data
            })
        }
    }
})

app.post('/login/:type', async (req, res) => {
    console.log('login request: ', req.params, req.body);
    const { type } = req.params;
    if (type == "client") {
        const { id } = req.body;
        const prisma_req = await prisma.entity.findUnique({
            where: {
                id: id
            }
        })
        if (prisma_req){
            res.status(200).send('client found');
        } else {
            const prisma_req = await prisma.entity.create({
                data: {
                    id: id,
                    role: "CLIENT"
                }
            });
            if (prisma_req){
                res.status(200).send('client created');
            } else {
                res.status(500).send('client not found, and failed to create');
            }
        }
    } else if (type == "admin") {
        const { id, pass } = req.body;
        console.log('recieved admin: ', id, pass);
        const prisma_res = await prisma.entity.findUnique({
            where: {
                id: id
            }
        })
        if (prisma_res && prisma_res.password == pass) {
            res.status(200).send('login successful');
        } else {
            res.status(401).send('no admin found');
        }

    } else {
        res.status(400).send("Invalid user type");
    }
})



app.get('/clientdata', async (req, res) => {
    try {
        const clientData = await prisma.logs.findMany();  
        const settings = await prisma.settings.findMany(); 

        // console.log("Settings",settings);
        console.log("Clientdata",clientData);

        res.json({ clientData, settings });
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


httpServer.listen(process.env.PORT, () => {
    console.log(`Server running on ${process.env.PORT}...`);

    main()
        .catch(async (e) => {
            console.error("ERROR: ", e);
        })
        .finally(async () => {
            await prisma.$disconnect();
        })
});