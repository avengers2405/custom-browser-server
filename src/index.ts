import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { createServer } from 'http';
import WebSocket from 'ws';
import { createClient } from 'redis';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors())
const prisma = new PrismaClient();
const httpServer = createServer(app);
const ws = new WebSocket.Server({ server: httpServer });
const admin = new Set<WebSocket>(); // stores client_ids who have been upgraded to ADMIN role.
const redisPublisher = createClient({
    url: process.env.REDIS_URL
});
const redisSubscriber = createClient({
    url: process.env.REDIS_URL
});

ws.on('connection', (ws: WebSocket) => {
    console.log('new client connected.');
    // no need to maintain ping for connection between server and client as we get disconnected if web socket disconnects

    ws.on('message', async (message) => {
        var msg = message.toString()
        console.log('message recieved: ', msg);
        if (msg[0] == '0') {
            // contains MAC address
            var cid = (Math.random() + 1).toString(36).substring(2) + (Math.random() + 1).toString(36).substring(2) + (Math.random() + 1).toString(36).substring(2) + (Math.random() + 1).toString(36).substring(2);
            var check_unique_id = await prisma.mac.findUnique({
                where: {
                    entityId: cid,
                }
            });
            while (check_unique_id) {
                cid = (Math.random() + 1).toString(36).substring(2) + (Math.random() + 1).toString(36).substring(2) + (Math.random() + 1).toString(36).substring(2) + (Math.random() + 1).toString(36).substring(2);
                check_unique_id = await prisma.mac.findUnique({
                    where: {
                        entityId: cid,
                    }
                });
            }
            // unique cid found (client id)
            (ws as any).id = cid;
            const data = JSON.parse(msg.substring(1));
            if (!data.mac) {
                ws.send('5');
            } else {
                console.log('at mac, creating with id: ', (ws as any).id, cid);
                prisma.mac.create({
                    data: {
                        entityId: (ws as any).id,
                        mac: data.mac,
                    }
                }).then((res) => {
                    prisma.entity.create({
                        data: {
                            id: res.entityId,
                            role: "CLIENT",
                        }
                    }).then((res) => {
                        prisma.logs.create({
                            data: {
                                entityId: res.id,
                                actionType: "CLIENT_LOGIN",
                            }
                        }).then((res) => {
                            ws.send(`6`);
                        }).catch((e) => {
                            console.log('error creating logs: ', e);
                            ws.send("8unable to create logs");
                        })
                    }).catch((e) => {
                        console.log('error creating entity: ', e);
                        ws.send("8unable to create entity");
                    })
                }).catch((e) => {
                    console.log('error creating mac: ', e);
                    ws.send("8unable to create mac address");
                })
            }
            console.log('client id: ', (ws as any).id);
        } else {
            if (!(ws as any).id) {
                ws.send('5send config details first');
            } else {
                if (msg[0] == '2') {
                    ws.send('3'); // send pong
                } else if (msg[0] == '4') {
                    const data = JSON.parse(msg.substring(1));
                    if (data.action == 'log') {
                        const res = await prisma.logs.create({
                            data: {
                                entityId: (ws as any).id,
                                actionType: data.actionType,
                                description: data.description,
                                blocked: data.blocked,
                            }
                        });
                        console.log('creating log')
                        redisPublisher.publish('update-log', JSON.stringify({
                            res
                        }));
                        console.log('published log');
                    }

                    if (data.action == "admin") {
                        (ws as any).admin = true;
                        admin.add(ws);
                        console.log("made ws with client id: ", (ws as any).id, " as admin.");
                    }

                    console.log('RECIEVED MSG: ', data);
                    // process queries here for data updates / requests
                    if (data.type == 'whitelist') {
                        if ((ws as any).admin == true) {
                            console.log('processing queries: ', "whitelist");
                            const res = await prisma.settings.findUnique({
                                where: {
                                    type: "WHITELIST"
                                }
                            })
                            ws.send('4' + JSON.stringify({
                                "type": "all_data",
                                "for": "whitelist",
                                "data": res
                            }));
                        }
                    } else if (data.type == 'blacklist') {
                        console.log("--------------")
                        if ((ws as any).admin == true) {
                            console.log('processing queries: ', "blacklist");
                            const res = await prisma.settings.findUnique({
                                where: {
                                    type: "BLACKLIST"
                                }
                            })
                            ws.send('4' + JSON.stringify({
                                "type": "all_data",
                                "for": "blacklist",
                                "data": res
                            }));
                        }
                    }
                    else if (data.type == 'log') {
                        if ((ws as any).admin == true) {
                            console.log('processing queries: ', "logs");
                            const res = await prisma.logs.findMany({
                                skip: data.offset,
                                take: data.limit,
                                orderBy: {
                                    timestamp: 'desc'
                                }
                            });
                            console.log('logs ke liye response: ', res);
                            ws.send('4' + JSON.stringify({
                                "type": "all_data",
                                "for": "range_log",
                                "data": res
                            }));
                        }
                    } else if (data.type == 'update_settings') {
                        console.log("Processing request: update_settings");
                        const settingsObject = data.settings  // Type assertion

                        if (!settingsObject || !settingsObject.id) {
                            console.error("Received invalid settings object for update:", settingsObject);
                            ws.send('8Invalid settings data received for update.');
                            return;
                        }

                        // Ensure the data structure matches FilterListData
                        const settingsData = settingsObject.data as any as FilterListData;
                        if (!settingsData || !Array.isArray(settingsData.domains) || !Array.isArray(settingsData.keywords) || !settingsData.lastUpdated) {
                            console.error("Received invalid data structure within settings object:", settingsData);
                            ws.send('8Invalid data structure in settings update.');
                            return;
                        }


                        try {
                            console.log(`Updating settings for ID: ${settingsObject.id}`);
                            // Make sure lastUpdated is current
                            settingsData.lastUpdated = new Date().toISOString();

                            const updatedSettings = await prisma.settings.update({
                                where: {
                                    id: settingsObject.id // Use the ID from the incoming object
                                },
                                data: {
                                    type: settingsObject.type, // Update type (e.g., BLACKLIST)
                                    data: settingsData as any, // Update the data payload (domains, keywords, lastUpdated)
                                }
                            });
                            console.log("Settings updated successfully:", updatedSettings);
                            // Send confirmation back (optional)
                            ws.send('4' + JSON.stringify({
                                type: "update",
                                for: "settings",
                                success: true,
                                updatedData: updatedSettings // Send back the updated data
                            }));

                            // OPTIONAL: Broadcast update to other admins?
                            // Requires adding another Redis channel or iterating over 'admin' set
                            // Example (simple broadcast without Redis):
                            // admin.forEach(adminWs => {
                            //     if (adminWs !== ws && adminWs.readyState === WebSocket.OPEN) {
                            //         adminWs.send('4' + JSON.stringify({ type: "settings_updated", listType: updatedSettings.type, data: updatedSettings.data }));
                            //     }
                            // });

                        } catch (e: any) {
                            console.error(`Error updating settings (ID: ${settingsObject.id}):`, e);
                            ws.send(`8Error updating settings: ${e.message}`);
                        }
                    }
                    // ws.send(`recieved message: ${msg}`)
                } else if (msg[0] > '7') {
                    ws.send('please send message with proper code (0-7) prefixed')
                }
            }
        }
    });

    ws.on('close', () => {
        admin.delete(ws);
        console.log('client disconnected')
    })

    ws.on('error', (error) => {
        console.log('error inside connection: ', error)
    })
});

ws.on('error', (error) => {
    console.log('error inside connection: ', error)
})

interface FilterListData {
    domains: string[];
    keywords: string[];
    lastUpdated: string;
}

async function setupdRedis() {
    await redisPublisher.connect();
    await redisSubscriber.connect();

    redisSubscriber.subscribe('update-log', (message) => {
        console.log('message recived: ', message);
        try {
            admin.forEach((ws) => {
                console.log('at admin: ', (ws as any).id)
                if (ws.readyState == WebSocket.OPEN) {
                    ws.send('4' + JSON.stringify({
                        "type": "update",
                        "for": "log",
                        "data": message
                    }));
                }
            });
        } catch (error) {
            console.log('error in subscribing: ', error);
        }
    })
}

setupdRedis().then(val => {
    console.log('connection to redis done');
}).catch(e => {
    console.log('error in redis connection: ', e);
})

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
        if (prisma_req) {
            res.status(200).send('client found');
        } else {
            console.log("CHECK WHY CLIENT NOT FOUND");
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