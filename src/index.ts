import express from 'express';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();
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

    if (dbRes){
        // const jsonRes = JSON.parse(dbRes.data as string);
        console.log('sending data: ', dbRes.data);
        if (dbRes.type=="BLACKLIST"){
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