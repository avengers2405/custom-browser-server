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
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use((0, cors_1.default)());
const prisma = new client_1.PrismaClient();
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
        console.log('recieved client: ', id);
        res.status(200).send('reached client');
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
            console.log('login found');
            res.status(200).send('login successful');
        }
        else {
            console.log('login not found');
            res.status(401).send('no admin found');
        }
    }
    else {
        res.status(400).send("Invalid user type");
    }
}));
app.listen(process.env.PORT, () => {
    console.log(`Server running on ${process.env.PORT}...`);
    main()
        .catch((e) => __awaiter(void 0, void 0, void 0, function* () {
        console.error("ERROR: ", e);
    }))
        .finally(() => __awaiter(void 0, void 0, void 0, function* () {
        yield prisma.$disconnect();
    }));
});
