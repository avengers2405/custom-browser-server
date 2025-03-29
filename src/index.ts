import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors())
const prisma = new PrismaClient();

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

app.listen(process.env.PORT, () => {
    console.log(`Server running on ${process.env.PORT}...`);

    main()
        .catch(async (e) => {
            console.error("ERROR: ", e);
        })
        .finally(async () => {
            await prisma.$disconnect();
        })
});