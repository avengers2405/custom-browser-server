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

ws.on('connection', (ws: WebSocket)=>{
    console.log('new client connected.');
    // optionally send a confguration message to client starting with '0'
    // i am planning sid to be a a fixed initial value till client is not logged in, then change it to client id / admin id once client / admin logs in 
    const config_data = `0${JSON.stringify({
        "sid": "not-logged-in",
    })}`
    // pingInterval, pingTimeout is unnecessary
    ws.send(config_data);

    // no need to maintain ping for connection between server and client as we get disconnected if web socket disconnects

    ws.on('message', (message)=>{
        var msg = message.toString()
        console.log('message recieved: ', msg);
        if (msg[0]=='2'){
            ws.send('3'); // send pong
        } else if (msg[1]=='3'){
            // ignore as it is a pong
        } else if (msg[1]=='4'){
            // message recieved
            ws.send(`recieved message: ${msg}`)
        } else {
            ws.send('please send message with proper code (0-5) prefixed')
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